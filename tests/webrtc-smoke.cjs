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
  window.__qaRingEvents=[]; window.LanuAudio={setRinging:v=>window.__qaRingEvents.push(v),setRingback:v=>{window.__qaRingback=v;},setCallActive(){},setSpeaker(){},requestBluetooth(){}};
  const RealPeer = window.Peer;
  window.Peer = function(id, options) {
    const p = new RealPeer(id, {...options, host:'127.0.0.1', port:${port}, path:'/', secure:false, config:{iceServers:[]}});
    window.__qaPeer = p; return p;
  };
  window.__qaTracks = []; window.__qaVideoTracks = [];
  const realCapture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async options => {
    const stream = await realCapture(options); window.__qaTracks.push(...stream.getAudioTracks()); window.__qaVideoTracks.push(...stream.getVideoTracks()); return stream;
  };
  ` + text;
  res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/javascript');
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
  const browser = await chromium.launch({executablePath: process.env.LANU_CHROME_EXECUTABLE || undefined, headless:true,
    args:['--no-sandbox', '--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required']});
  try {
    const contexts = await Promise.all([browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}), browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true})]);
    const [a,b] = await Promise.all(contexts.map(c=>c.newPage()));
    const errors=[];
    for(const page of [a,b]) page.on('pageerror',e=>errors.push(String(e)));
    await Promise.all([a.goto(`http://127.0.0.1:${port}`),b.goto(`http://127.0.0.1:${port}`)]);
    // The camera page must not start signaling, reveal calls or request a microphone.
    for(const page of [a,b]) {
      assert.equal(await page.locator('#privateView').isVisible(),false);
      assert.equal(await page.evaluate(()=>!!window.__qaPeer),false);
      const publicText=await page.locator('body').innerText();
      assert.ok(!/görüşme|rehber|eşleştirme|gizli|PIN/i.test(publicText));
    }
    await a.locator('#startCamera').click();
    await a.waitForFunction(()=>document.getElementById('preview').videoWidth>0);
    await a.locator('#gridBtn').click();await a.locator('#zoom').evaluate(el=>{el.value='1.5';el.dispatchEvent(new Event('input'));});
    await a.locator('#shutter').click();await a.locator('#photoView').waitFor({state:'visible'});
    assert.match(await a.locator('#photoPreview').getAttribute('src'),/^data:image\/jpeg;base64,/);
    await a.locator('#closePhoto').click();
    async function unlock(page,first=true) {
      const target=first?'#lensEmblem':'#lensLogo';
      const box=await page.locator(target).boundingBox();
      const touch=await page.context().newCDPSession(page);
      await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2,id:1}]});
      await page.locator('#gate').waitFor({state:'visible'});
      await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await touch.detach();
      await page.locator('#pin').fill('741963');
      if(first) await page.locator('#pinConfirm').fill('741963');
      await page.locator('#pinSubmit').click();
      await page.locator('#privateView').waitFor({state:'visible'});
    }
    await Promise.all([unlock(a),unlock(b)]);
    assert.equal(await a.evaluate(()=>window.__qaVideoTracks.every(t=>t.readyState==='ended')),true);
    await Promise.all([a,b].map(p=>p.waitForFunction(()=>!document.getElementById('callBtn').disabled)));
    await a.locator('#contactsEnabled').check();await b.locator('#contactsEnabled').check();
    await a.locator('#contactName').fill('Arkadaşım');
    const pairingCode=await b.locator('#myid').innerText();
    await a.locator('#pairCode').fill(pairingCode);await a.locator('#pairBtn').click();
    await b.locator('#pairRequest').waitFor({state:'visible'});await b.locator('#pairAccept').click();
    await a.locator('#contactList .contact').waitFor({state:'visible'});
    await b.locator('#contactList .contact').waitFor({state:'visible'});
    assert.equal(await a.evaluate(()=>window.__qaTracks.length),0);
    const code = await b.locator('#myid').innerText();
    const callerCode = await a.locator('#myid').innerText();
    await a.locator('#contactList .contact button').first().click();
    await b.locator('#answerBtn').waitFor({state:'visible'});
    assert.equal(await b.evaluate(()=>window.__qaTracks.length),0);
    assert.equal(await b.evaluate(()=>window.__qaRingEvents.at(-1)),true);
    await a.waitForFunction(()=>window.__qaRingback===true);
    await b.locator('#answerBtn').click();
    await Promise.all([a,b].map(p=>p.waitForFunction(()=>document.getElementById('status').textContent==='Görüşme sürüyor.',{},{timeout:20000})));
    assert.equal(await b.evaluate(()=>window.__qaRingEvents.at(-1)),false);
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
    assert.equal(await b.evaluate(()=>window.__qaRingEvents.at(-1)),false);
    await a.locator('#lockBtn').click();
    assert.equal(await a.locator('#privateView').isVisible(),false);
    assert.equal(await a.evaluate(()=>window.__qaPeer.destroyed),false);
    // A locked camera can ring without exposing any call UI or opening the microphone.
    await b.locator('#partner').fill(callerCode);await b.locator('#callBtn').click();
    await a.waitForFunction(()=>window.__qaRingEvents.at(-1)===true);
    assert.equal(await a.locator('#privateView').isVisible(),false);
    assert.ok(!/görüşme|rehber|eşleştirme|gizli|PIN/i.test(await a.locator('body').innerText()));
    const microphoneCount=await a.evaluate(()=>window.__qaTracks.length);
    await unlock(a,false);
    await a.locator('#answerBtn').click();
    await a.waitForFunction(()=>document.getElementById('status').textContent==='Görüşme sürüyor.');
    assert.equal(await a.evaluate(()=>window.__qaTracks.length),microphoneCount+1);
    assert.equal(await a.evaluate(()=>window.__qaRingEvents.at(-1)),false);
    await b.locator('#hangBtn').click();
    await a.waitForFunction(()=>!document.getElementById('callBtn').hidden);
    await a.locator('#contactList .contact').waitFor({state:'visible'});
    await a.locator('#lockBtn').click();
    assert.deepEqual(errors,[]);
    fs.mkdirSync('test-results', {recursive:true});
    await a.screenshot({path:'test-results/lanu-ui.png',fullPage:true});
    console.log(JSON.stringify({result:'PASS',checks:['real PeerJS/RTC two-way audio track','no mic before answer','mute','hangup cleans both microphones','reject before answer','call again','native pause releases mic'],rtc,errors},null,2));
  } finally {
    await browser.close(); ws.close(); server.close();
  }
})().catch(e=>{console.error(e);process.exit(1);});
