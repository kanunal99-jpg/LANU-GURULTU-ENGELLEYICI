const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { WebSocketServer } = require('ws');
const { chromium } = require('playwright');
const assets = path.resolve(__dirname, '../app/src/main/assets');
const clients = new Map();
let port;
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.join(assets, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!file.startsWith(assets + '/') || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  let text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('index.html')) text = text.replace('connect-src ', `connect-src http://127.0.0.1:${port} ws://127.0.0.1:${port} `);
  if (file.endsWith('app.js')) text = `
  const RealPeer = window.Peer;
  window.Peer = function(id, options) {
    const p = new RealPeer(id, {...options, host:'127.0.0.1', port:${port}, path:'/', secure:false, config:{iceServers:[]}});
    window.__qaPeer = p; return p;
  };
  window.__qaTracks = [];
  const realCapture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async options => {
    const stream = await realCapture(options); window.__qaTracks.push(...stream.getAudioTracks()); return stream;
  };
  ` + text;
  res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'application/javascript');
  res.end(text);
});
const ws = new WebSocketServer({server});
ws.on('connection', (socket, request) => {
  const id = new URL(request.url, 'http://localhost').searchParams.get('id');
  if (!id || clients.has(id)) { socket.send(JSON.stringify({type:'ID-TAKEN'})); socket.close(); return; }
  clients.set(id, socket); socket.send(JSON.stringify({type:'OPEN'}));
  socket.on('message', raw => {
    const data = JSON.parse(raw.toString());
    if (data.type === 'HEARTBEAT') return;
    const receiver = clients.get(data.dst);
    if (receiver) receiver.send(JSON.stringify({...data, src:id}));
    else socket.send(JSON.stringify({...data, type:'EXPIRE', src:data.dst}));
  });
  socket.on('close', () => {
    if (clients.get(id) !== socket) return;
    clients.delete(id);
    for (const client of clients.values()) client.send(JSON.stringify({type:'LEAVE', src:id}));
  });
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); port = server.address().port;
  const browser = await chromium.launch({executablePath: process.env.LANU_CHROME_EXECUTABLE || '/usr/bin/google-chrome', headless:true,
    args:['--no-sandbox', '--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required']});
  try {
    const contexts = await Promise.all([browser.newContext({viewport:{width:390,height:844}}), browser.newContext({viewport:{width:390,height:844}})]);
    const [a,b] = await Promise.all(contexts.map(c=>c.newPage()));
    const errors=[];
    for(const page of [a,b]) page.on('pageerror',e=>errors.push(String(e)));
    await Promise.all([a.goto(`http://127.0.0.1:${port}`),b.goto(`http://127.0.0.1:${port}`)]);
    await Promise.all([a,b].map(p=>p.waitForFunction(()=>!document.getElementById('callBtn').disabled)));
    const code = await b.locator('#myid').innerText();
    await a.locator('#partner').fill(code); await a.locator('#callBtn').click();
    await b.locator('#answerBtn').waitFor({state:'visible'});
    assert.equal(await b.evaluate(()=>window.__qaTracks.length),0);
    await b.locator('#answerBtn').click();
    await Promise.all([a,b].map(p=>p.waitForFunction(()=>document.getElementById('status').textContent==='Görüşme sürüyor.',{},{timeout:20000})));
    // Explicitly await async getStats results; a pending Promise is never proof of packets.
    await Promise.all([a,b].map(async page => {
      const limit=Date.now()+20000;
      while(Date.now()<limit) {
        const evidence=await page.evaluate(async()=>{
          const pc=[...window.__qaPeer._connections.values()].flat().find(x=>x.type==='media').peerConnection;
          const stats=await pc.getStats();
          return {state:pc.connectionState,ice:pc.iceConnectionState,packets:[...stats.values()].filter(x=>x.type==='inbound-rtp').reduce((n,x)=>n+Number(x.packetsReceived||0),0)};
        });
        if(evidence.state==='connected' && evidence.packets>0) return;
        if(Date.now()+250>=limit) throw new Error('RTP did not flow: '+JSON.stringify(evidence));
        await new Promise(resolve=>setTimeout(resolve,250));
      }
      throw new Error('RTP packet deadline');
    }));
    const rtc = await Promise.all([a,b].map(p=>p.evaluate(async()=>{
      const pc=[...window.__qaPeer._connections.values()].flat().find(x=>x.type==='media').peerConnection;
      const stats=await pc.getStats();
      return {state:pc.connectionState, packetsReceived:[...stats.values()].filter(x=>x.type==='inbound-rtp').reduce((n,x)=>n+Number(x.packetsReceived || 0),0), remoteTracks:document.getElementById('remote').srcObject.getAudioTracks().length, filter:document.getElementById('filterStatus').textContent};
    })));
    console.log('WebRTC evidence:', JSON.stringify(rtc));
    assert.ok(rtc.every(x=>x.state==='connected'&&x.remoteTracks===1&&x.packetsReceived>0), JSON.stringify(rtc));
    await a.locator('#muteBtn').click(); assert.equal(await a.evaluate(()=>window.__qaTracks.at(-1).enabled),false);
    await a.locator('#muteBtn').click();
    await a.locator('#hangBtn').click();
    await b.waitForFunction(()=>!document.getElementById('callBtn').hidden,{},{timeout:10000});
    assert.equal(await a.evaluate(()=>window.__qaTracks.at(-1).readyState),'ended');
    assert.equal(await b.evaluate(()=>window.__qaTracks.at(-1).readyState),'ended');
    // Reject before answering: control channel must notify the caller promptly.
    await a.locator('#callBtn').click(); await b.locator('#answerBtn').waitFor({state:'visible'});
    await b.locator('#hangBtn').click();
    await a.waitForFunction(()=>!document.getElementById('callBtn').hidden,{},{timeout:10000});
    assert.equal(await a.evaluate(()=>window.__qaTracks.at(-1).readyState),'ended');
    // Reuse both peers for another call and release capture on native pause.
    await a.locator('#callBtn').click(); await b.locator('#answerBtn').waitFor({state:'visible'}); await b.locator('#answerBtn').click();
    await a.waitForFunction(()=>document.getElementById('status').textContent==='Görüşme sürüyor.');
    await a.evaluate(()=>window.lanuPause('QA pause'));
    assert.equal(await a.evaluate(()=>window.__qaTracks.at(-1).readyState),'ended');
    assert.equal(await a.locator('#callBtn').isDisabled(),true);
    await b.waitForFunction(()=>!document.getElementById('callBtn').hidden);
    assert.deepEqual(errors,[]);
    fs.mkdirSync('test-results', {recursive:true});
    await a.screenshot({path:'test-results/lanu-ui.png',fullPage:true});
    console.log(JSON.stringify({result:'PASS',checks:['real PeerJS/RTC two-way audio track','no mic before answer','mute','hangup cleans both microphones','reject before answer','call again','native pause releases mic'],rtc,errors},null,2));
  } finally {
    await browser.close(); ws.close(); server.close();
  }
})().catch(e=>{console.error(e);process.exit(1);});
