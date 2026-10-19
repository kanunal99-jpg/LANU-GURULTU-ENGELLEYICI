const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const EventEmitter = require('node:events');
const source = fs.readFileSync('app/src/main/assets/app.js', 'utf8');

function harness(options = {}) {
  const elements = {}, events = {}, timers = new Map(), peers = [], native = [], ringing = [], ringback = [];
  let timerId = 0, requested = 0, resolveMedia, rejectMedia;
  class Element {
    constructor(id) { this.id = id; this.checked = true; this.hidden = false; this.value = ''; this.textContent = ''; this.events = {}; }
    addEventListener(event, fn) { this.events[event] = fn; }
    setAttribute(key, value) { this[key] = value; }
    pause() { if (options.pauseThrows) throw new Error('WebViewMediaDisposed'); }
    play() { this.playCount = (this.playCount || 0) + 1; if (options.playThrows) throw new Error('WebViewNotAllowed'); return options.playFails ? Promise.reject(new Error('Autoplay')) : Promise.resolve(); }
  }
  const document = {
    hidden: false,
    getElementById(id) { return elements[id] || (elements[id] = new Element(id)); },
    addEventListener(event, fn) { events['document:' + event] = fn; }
  };
  const track = { stopped: 0, enabled: true, stop() { this.stopped++; }, addEventListener() {},
    getSettings: () => ({noiseSuppression: true, echoCancellation: true, autoGainControl: false}),
    applyConstraints: async () => {} };
  const stream = {getTracks: () => [track], getAudioTracks: () => [track]};
  const media = {
    getSupportedConstraints: () => ({noiseSuppression: true, echoCancellation: true, autoGainControl: true}),
    getUserMedia() { requested++; return new Promise((resolve, reject) => { resolveMedia = resolve; rejectMedia = reject; }); }
  };
  class Connection extends EventEmitter {
    constructor(remote = 'lanu-sesli-654321') { super(); this.peer = remote; this.connectionId = 'call-1'; this.closed = 0; this.answered = 0; this.pcEvents = {}; this.peerConnection = {connectionState:'connected', addEventListener:(event,fn)=>{this.pcEvents[event]=fn;}}; }
    close() { this.closed++; if (this.closed > 5) throw Error('recursive close'); this.emit('close'); }
    answer() { this.answered++; }
  }
  class Peer extends EventEmitter {
    constructor(id) { super(); this.id = id; this.destroyed = false; this.disconnected = false; this.calls = []; this.channels = []; peers.push(this); }
    call(id) { const connection = new Connection(id); this.calls.push(connection); return connection; }
    connect(remote, config) { const channel = new Connection(remote); Object.assign(channel, config); channel.send = data => { channel.sent = data; }; this.channels.push(channel); return channel; }
    destroy() { this.destroyed = true; this.emit('disconnected'); }
    reconnect() { this.disconnected = false; this.reconnected = true; }
  }
  const storage = options.storage || new Map([['lanuId', '123456']]);
  const context = {document, navigator: {onLine: options.online !== false, mediaDevices: media},
    localStorage: {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)},
    Peer, Uint32Array, console: {warn() {}}, Math, Promise,
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, {fn, delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(event, fn) { events[event] = fn; },
    LanuAudio: {setRinging:value=>ringing.push(value),setRingback:value=>ringback.push(value),setCallActive: value => native.push(value), setSpeaker() {}, requestBluetooth() {}} };
  if(options.lens) context.LanuLens={canReceive:()=>options.lensListen===true,isOpen:()=>options.lensOpen!==false,callState(){},pairStatus(){},clearPair(){}};
  context.window = context;
  vm.runInNewContext(source, context);
  const get = id => document.getElementById(id);
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const open = () => { peers.at(-1).emit('open'); };
  return {get, peers, track, stream, events, timers, context, native, ringing, ringback, open, flush, requested: () => requested,
    resolve: (providedStream = stream) => resolveMedia(providedStream), reject: name => rejectMedia({name}),
    Connection, click: id => get(id).events.click(),
    deadline: () => { for (const [id, timer] of timers) if (timer.delay === 45000) { timers.delete(id); timer.fn(); } }
  };
}

test('dial stays disabled before signaling is ready', () => {
  const h = harness(); assert.equal(h.get('callBtn').disabled, true); h.open(); assert.equal(h.get('callBtn').disabled, false);
});
test('invalid and self codes never request a microphone', () => {
  const h = harness(); h.open(); for (const id of ['abc', '12345', '000000', '123456']) { h.get('partner').value = id; h.click('callBtn'); }
  assert.equal(h.requested(), 0);
});
test('rapid taps only request one microphone', () => {
  const h = harness(); h.open(); h.get('partner').value = '654321'; h.click('callBtn'); h.click('callBtn'); assert.equal(h.requested(), 1);
});
test('cancel during permission prompt stops late microphone and never dials', async () => {
  const h = harness(); h.open(); h.get('partner').value = '654321'; h.click('callBtn'); h.click('hangBtn'); h.resolve(); await h.flush();
  assert.equal(h.track.stopped, 1); assert.equal(h.peers[0].calls.length, 0);
});
test('closing an active call is nonrecursive and restores microphone/audio', async () => {
  const h = harness(); h.open(); h.get('partner').value = '654321'; h.click('callBtn'); h.resolve(); await h.flush();
  const call = h.peers[0].calls[0]; call.emit('stream', h.stream); h.click('hangBtn');
  assert.equal(call.closed, 1); assert.equal(h.track.stopped, 1); assert.equal(h.native.at(-1), false); assert.equal(h.get('callBtn').hidden, false);
});
test('call cleanup restores the UI if WebView media pause throws', async () => {
  const h = harness({pauseThrows: true});
  h.open();
  h.get('partner').value = '654321';
  h.click('callBtn');
  h.resolve();
  await h.flush();
  const active = h.peers[0].calls[0];
  active.emit('stream', h.stream);
  assert.doesNotThrow(() => h.click('hangBtn'));
  assert.equal(h.track.stopped, 1);
  assert.equal(h.get('remote').srcObject, null);
  assert.equal(h.get('callBtn').hidden, false);
  assert.equal(h.get('playBtn').hidden, true);
  assert.equal(h.native.at(-1), false);
  assert.equal(active.closed, 1);
});

test('offline cleanup remains safe when WebView media has been disposed', async () => {
  const h = harness({pauseThrows: true});
  h.open();
  h.get('partner').value = '654321';
  h.click('callBtn');
  h.resolve();
  await h.flush();
  h.context.navigator.onLine = false;
  assert.doesNotThrow(() => h.events.offline());
  assert.equal(h.track.stopped, 1);
  assert.equal(h.get('callBtn').disabled, true);
  assert.equal(h.native.at(-1), false);
});

test('remote closes incoming call while microphone prompt is pending', async () => {
  const h = harness(); h.open(); const incoming = new h.Connection(); h.peers[0].emit('call', incoming); h.click('answerBtn'); incoming.emit('close'); h.resolve(); await h.flush();
  assert.equal(incoming.answered, 0); assert.equal(h.track.stopped, 1);
});
test('incoming call does not open mic until answered', async () => {
  const h = harness(); h.open(); const incoming = new h.Connection(); h.peers[0].emit('call', incoming);
  assert.equal(h.requested(), 0); assert.equal(h.get('answerBtn').hidden, false); h.click('answerBtn'); h.resolve(); await h.flush(); assert.equal(incoming.answered, 1);
});
test('permission denied restores idle with useful message', async () => {
  const h = harness(); h.open(); h.get('partner').value = '654321'; h.click('callBtn'); h.reject('NotAllowedError'); await h.flush();
  assert.match(h.get('status').textContent, /Mikrofon izni/); assert.equal(h.get('callBtn').hidden, false);
});
test('empty microphone stream fails before calling remote peer', async () => {
  const h = harness(); h.open();
  h.get('partner').value = '654321'; h.click('callBtn');
  const emptyAudio = {getTracks: () => [], getAudioTracks: () => []};
  h.resolve(emptyAudio); await h.flush();
  assert.equal(h.peers[0].calls.length, 0);
  assert.match(h.get('status').textContent, /Mikrofon bulunamadı/);
  assert.equal(h.get('callBtn').hidden, false);
  assert.equal(h.native.at(-1), false);
});

test('all ended microphone tracks are released and cannot start silent call', async () => {
  const h = harness(); h.open();
  h.get('partner').value = '654321'; h.click('callBtn');
  h.track.readyState = 'ended';
  h.resolve(); await h.flush();
  assert.equal(h.track.stopped, 1);
  assert.equal(h.peers[0].calls.length, 0);
  assert.match(h.get('status').textContent, /Mikrofon bulunamadı/);
  assert.equal(h.native.at(-1), false);
});

test('a stream with at least one live microphone track can dial', async () => {
  const h = harness(); h.open();
  h.get('partner').value = '654321'; h.click('callBtn');
  h.track.readyState = 'live';
  h.resolve(); await h.flush();
  assert.equal(h.peers[0].calls.length, 1);
  assert.equal(h.track.stopped, 0);
});

test('unsupported filters fall back to plain audio', async () => {
  const h = harness(); h.open(); h.get('partner').value = '654321'; h.click('callBtn'); h.reject('OverconstrainedError'); await h.flush();
  assert.equal(h.requested(), 2); h.resolve(); await h.flush(); assert.equal(h.peers[0].calls.length, 1);
});
test('timeout releases mic, and stale stream cannot reopen call', async () => {
  const h = harness(); h.open(); h.get('partner').value = '654321'; h.click('callBtn'); h.resolve(); await h.flush();
  const call = h.peers[0].calls[0]; h.deadline(); call.emit('stream', h.stream);
  assert.equal(h.track.stopped, 1); assert.equal(h.get('remote').srcObject, null);
});
test('offline event ends call, online event rebuilds signaling', async () => {
  const h = harness(); h.open(); h.get('partner').value = '654321'; h.click('callBtn'); h.resolve(); await h.flush();
  h.context.navigator.onLine = false; h.events.offline(); assert.equal(h.track.stopped, 1); assert.equal(h.get('callBtn').disabled, true);
  h.context.navigator.onLine = true; h.events.online(); assert.equal(h.peers.length, 2); h.open(); assert.equal(h.get('callBtn').disabled, false);
});
test('backgrounding stops capture and blocks further dialing until resumed', async () => {
  const h = harness(); h.open(); h.get('partner').value = '654321'; h.click('callBtn'); h.resolve(); await h.flush(); h.context.lanuPause('Arka plan');
  assert.equal(h.track.stopped, 1); assert.equal(h.get('callBtn').disabled, true); h.context.lanuResume(); assert.equal(h.get('callBtn').disabled, false);
});
test('resume rebuilds a PeerJS socket that silently died in the background', () => {
  const h = harness(); h.open();
  const old = h.peers[0];
  h.context.lanuPause('Arka plan');
  old.disconnected = true; // The WebView did not receive an event.
  h.context.lanuResume();
  assert.equal(h.peers.length, 2);
  assert.equal(old.destroyed, true);
  assert.equal(h.get('callBtn').disabled, true);
  h.open();
  assert.equal(h.get('callBtn').disabled, false);
});

test('resume retains a healthy signaling connection without reconnecting', () => {
  const h = harness(); h.open();
  h.context.lanuPause('Arka plan');
  h.context.lanuResume();
  assert.equal(h.peers.length, 1);
  assert.equal(h.get('callBtn').disabled, false);
});

test('resume detects a destroyed PeerJS socket with stale ready flag', () => {
  const h = harness(); h.open();
  h.context.lanuPause('Arka plan');
  h.peers[0].destroyed = true;
  h.context.lanuResume();
  assert.equal(h.peers.length, 2);
  assert.equal(h.get('callBtn').disabled, true);
});

test('a code collision never silently replaces the saved code or accepts a stale peer', () => {
  const h = harness(); h.open();
  const old = h.peers[0]; old.emit('error', {type: 'unavailable-id'});
  assert.equal(h.peers.length, 1);
  assert.equal(old.destroyed, true);
  assert.equal(h.context.localStorage.getItem('lanuId'), '123456');
  assert.equal(h.get('myid').textContent, '123456');
  assert.match(h.get('status').textContent, /Kodun değiştirilmedi/);
  old.emit('open'); assert.equal(h.get('callBtn').disabled, true);
  h.click('retryBtn');
  assert.equal(h.peers.length, 2);
  assert.equal(h.peers[1].id, 'lanu-sesli-123456');
  h.open(); old.emit('error', {type: 'network'});
  assert.equal(h.get('callBtn').disabled, false);
});
test('code rotation is an explicit unlocked user action and persists for later reconnects', () => {
  const h = harness({lens:true}); h.open();
  h.context.crypto = {getRandomValues(values) { values[0] = 500000; return values; }};
  assert.equal(h.context.localStorage.getItem('lanuId'), '123456');
  assert.equal(h.context.LanuCalls.rotateCode(), true);
  assert.equal(h.context.localStorage.getItem('lanuId'), '600000');
  assert.equal(h.get('myid').textContent, '600000');
  assert.equal(h.peers.at(-1).id, 'lanu-sesli-600000');
  h.open();
  h.click('retryBtn');
  assert.equal(h.peers.at(-1).id, 'lanu-sesli-600000');
});
test('locked or busy sessions cannot rotate the user identity', () => {
  const h = harness({lens:true}); h.open();
  h.context.crypto = {getRandomValues(values) { values[0] = 500000; return values; }};
  h.context.LanuLens.isOpen = () => false;
  assert.equal(h.context.LanuCalls.rotateCode(), false);
  h.context.LanuLens.isOpen = () => true;
  h.get('partner').value = '654321'; h.click('callBtn');
  assert.equal(h.context.LanuCalls.rotateCode(), false);
  assert.equal(h.context.localStorage.getItem('lanuId'), '123456');
});
test('a failed storage write never changes the active identity', () => {
  const h = harness({lens:true}); h.open();
  h.context.crypto = {getRandomValues(values) { values[0] = 500000; return values; }};
  h.context.localStorage.setItem = () => { throw Error('QuotaExceeded'); };
  assert.equal(h.context.LanuCalls.rotateCode(), false);
  assert.equal(h.get('myid').textContent, '123456');
  assert.equal(h.peers.length, 1);
  assert.match(h.get('status').textContent, /kaydedilemedi/);
});
test('invalid stored ID is replaced and persisted even when the initial connection is offline', () => {
  const storage = new Map([['lanuId', 'bad']]);
  const h = harness({storage,online:false});
  const id = storage.get('lanuId');
  assert.match(id, /^[1-9]\d{5}$/);
  assert.equal(h.peers.length, 0);
  h.events.online(); assert.equal(h.peers[0].id, 'lanu-sesli-' + id);
});
test('invalid persisted ID is replaced', () => {
  const storage = new Map([['lanuId','bad']]),h = harness({storage}); h.open();
  assert.match(h.get('myid').textContent, /^[1-9]\d{5}$/);
  assert.equal(storage.get('lanuId'), h.get('myid').textContent);
});
test('peer unavailable closes outgoing call and microphone', async () => {
  const h = harness(); h.open(); h.get('partner').value = '654321'; h.click('callBtn'); h.resolve(); await h.flush(); h.peers[0].emit('error', {type: 'peer-unavailable'});
  assert.equal(h.track.stopped, 1); assert.match(h.get('status').textContent, /bulunamadı/);
});
test('mute toggles outgoing audio track without closing call', async () => {
  const h = harness(); h.open(); h.get('partner').value = '654321'; h.click('callBtn'); h.resolve(); await h.flush(); h.peers[0].calls[0].emit('stream', h.stream);
  h.click('muteBtn'); assert.equal(h.track.enabled, false); h.click('muteBtn'); assert.equal(h.track.enabled, true); assert.equal(h.track.stopped, 0);
});
test('autoplay failure offers a playback button', async () => {
  const h = harness({playFails: true}); h.open(); h.get('partner').value = '654321'; h.click('callBtn'); h.resolve(); await h.flush(); h.peers[0].calls[0].emit('stream', h.stream); await h.flush();
  assert.equal(h.get('playBtn').hidden, false);
});
test('synchronous Android WebView playback failure offers manual play without losing the call', async () => {
  const h = harness({playThrows: true}); h.open();
  h.get('partner').value = '654321'; h.click('callBtn'); h.resolve(); await h.flush();
  const active = h.peers[0].calls[0];
  assert.doesNotThrow(() => active.emit('stream', h.stream));
  assert.equal(h.get('playBtn').hidden, false);
  assert.match(h.get('status').textContent, /Görüşme bağlı/);
  assert.equal(active.closed, 0);
});

test('a playback failure cannot revive a call already hung up', async () => {
  const h = harness({playFails: true}); h.open();
  h.get('partner').value = '654321'; h.click('callBtn'); h.resolve(); await h.flush();
  const active = h.peers[0].calls[0]; active.emit('stream', h.stream);
  h.click('hangBtn');
  await h.flush();
  assert.equal(h.get('playBtn').hidden, true);
  assert.equal(h.get('status').textContent, 'Arama kapatıldı.');
});

test('unknown callers and concurrent incoming calls are closed', () => {
  const h = harness(); h.open(); const invalid = new h.Connection('bad'); h.peers[0].emit('call', invalid); assert.equal(invalid.closed, 1);
  const first = new h.Connection(); h.peers[0].emit('call', first); const second = new h.Connection(); h.peers[0].emit('call', second); assert.equal(second.closed, 1); assert.equal(first.closed, 0);
});
test('matching control hangup ends ringing and forged call ID is ignored', () => {
  const h = harness(); h.open(); const call = new h.Connection(); h.peers[0].emit('call', call);
  const channel = new h.Connection(); channel.label = 'lanu-control'; channel.metadata = {lanuControl: 1}; h.peers[0].emit('connection', channel);
  channel.emit('data', {type: 'hangup', id: 'wrong'}); assert.equal(h.get('answerBtn').hidden, false);
  const second = new h.Connection(); second.label = 'lanu-control'; second.metadata = {lanuControl: 1}; h.peers[0].emit('connection', second);
  second.emit('data', {type: 'hangup', id: call.connectionId}); assert.equal(h.get('answerBtn').hidden, true);
});
test('initial offline state never constructs signaling client', () => {
  const h = harness({online: false}); assert.equal(h.peers.length, 0); assert.equal(h.get('callBtn').disabled, true); assert.match(h.get('status').textContent, /İnternet/);
});
test('cancelled constrained capture does not retry and reopen microphone', async () => {
  const h = harness(); h.open(); h.get('partner').value = '654321'; h.click('callBtn'); h.click('hangBtn');
  h.reject('OverconstrainedError'); await h.flush(); assert.equal(h.requested(), 1); assert.equal(h.peers[0].calls.length, 0);
});
test('signaling disconnect uses reconnect on the existing peer', () => {
  const h = harness(); h.open(); h.peers[0].disconnected = true; h.peers[0].emit('disconnected');
  const reconnect = [...h.timers.values()].find(timer => timer.delay === 1000); assert.ok(reconnect); reconnect.fn();
  assert.equal(h.peers[0].reconnected, true); h.open(); assert.equal(h.get('callBtn').disabled, false);
});
test('transient ICE disconnection retries and restores remote playback before timeout', async () => {
  const h = harness(); h.open();
  h.get('partner').value = '654321'; h.click('callBtn'); h.resolve(); await h.flush();
  const active = h.peers[0].calls[0];
  active.emit('stream', h.stream);
  assert.equal(h.get('remote').playCount, 1);
  active.peerConnection.iceConnectionState = 'disconnected';
  active.pcEvents.iceconnectionstatechange();
  assert.match(h.get('status').textContent, /Yeniden bağlanıyor/);
  assert.equal(h.get('muteBtn').hidden, true);
  const pending = [...h.timers.values()].find(t => t.delay === 12000);
  assert.ok(pending, 'a bounded reconnect grace period should be armed');
  active.peerConnection.iceConnectionState = 'connected';
  active.pcEvents.iceconnectionstatechange();
  assert.equal(h.get('status').textContent, 'Görüşme sürüyor.');
  assert.equal(h.get('muteBtn').hidden, false);
  assert.equal(h.get('remote').playCount, 2);
  assert.equal([...h.timers.values()].includes(pending), false);
  // Already queued callbacks must not close a recovered connection.
  pending.fn();
  assert.equal(h.track.stopped, 0);
});

test('unrecovered transport interruption closes call and releases microphone', async () => {
  const h = harness(); h.open();
  h.get('partner').value = '654321'; h.click('callBtn'); h.resolve(); await h.flush();
  const active = h.peers[0].calls[0]; active.emit('stream', h.stream);
  active.peerConnection.connectionState = 'disconnected';
  active.pcEvents.connectionstatechange();
  const pending = [...h.timers.values()].find(t => t.delay === 12000);
  assert.ok(pending);
  pending.fn();
  assert.equal(h.track.stopped, 1);
  assert.equal(active.closed, 1);
  assert.match(h.get('status').textContent, /Ses bağlantısı geri gelmedi/);
  assert.equal(h.get('callBtn').hidden, false);
});

test('initial negotiation keeps original deadline instead of ICE recovery timer', async () => {
  const h = harness(); h.open();
  h.get('partner').value = '654321'; h.click('callBtn'); h.resolve(); await h.flush();
  const active = h.peers[0].calls[0];
  active.peerConnection.connectionState = 'disconnected';
  active.emit('stream', h.stream);
  assert.equal([...h.timers.values()].some(t => t.delay === 12000), false);
  assert.equal([...h.timers.values()].some(t => t.delay === 45000), true);
});

test('repeated connected and ICE events do not replay the same remote audio', async () => {
  const h = harness(); h.open(); h.get('partner').value = '654321';
  h.click('callBtn'); h.resolve(); await h.flush();
  const active = h.peers[0].calls[0]; active.emit('stream', h.stream);
  assert.equal(h.get('remote').playCount, 1);
  active.pcEvents.connectionstatechange();
  active.pcEvents.iceconnectionstatechange();
  assert.equal(h.get('remote').playCount, 1);
  assert.equal(h.get('status').textContent, 'Görüşme sürüyor.');
});

test('a replacement remote stream triggers playback once for the new stream', async () => {
  const h = harness(); h.open(); h.get('partner').value = '654321';
  h.click('callBtn'); h.resolve(); await h.flush();
  const active = h.peers[0].calls[0]; active.emit('stream', h.stream);
  const replacement = { getAudioTracks: () => [{ readyState: 'live', addEventListener() {} }] };
  active.emit('stream', replacement);
  assert.equal(h.get('remote').playCount, 2);
  active.pcEvents.connectionstatechange();
  assert.equal(h.get('remote').playCount, 2);
});

test('remote stream alone does not report a connected call or clear timeout', async () => {
  const h = harness(); h.open(); h.get('partner').value = '654321'; h.click('callBtn'); h.resolve(); await h.flush();
  const call = h.peers[0].calls[0]; call.peerConnection.connectionState = 'connecting'; call.emit('stream',h.stream);
  assert.match(h.get('status').textContent,/kuruluyor/); assert.equal(h.get('muteBtn').hidden,true);
  call.peerConnection.connectionState = 'connected'; call.pcEvents.connectionstatechange();
  assert.equal(h.get('status').textContent,'Görüşme sürüyor.'); assert.equal(h.get('muteBtn').hidden,false);
});
test('negotiating stream still times out and releases microphone', async () => {
  const h = harness(); h.open(); h.get('partner').value = '654321'; h.click('callBtn'); h.resolve(); await h.flush();
  const call = h.peers[0].calls[0]; call.peerConnection.connectionState = 'connecting'; call.emit('stream',h.stream); h.deadline();
  assert.equal(h.track.stopped,1); assert.equal(h.get('remote').srcObject,null);
});

test('queued signaling retry never resumes while the app is backgrounded', () => {
  const h = harness(); h.open();
  const peer = h.peers[0]; peer.disconnected = true; peer.emit('disconnected');
  const pending = [...h.timers.values()].find(t => t.delay === 1000);
  assert.ok(pending, 'a reconnect must have been scheduled');
  h.context.lanuPause('Arka plan');
  assert.equal([...h.timers.values()].some(t => t === pending), false);
  // Even if a callback was already on the event queue, it must remain inert.
  pending.fn();
  assert.equal(peer.reconnected, undefined);
  assert.equal(h.peers.length, 1);
  assert.equal(h.get('callBtn').disabled, true);
});

test('queued signaling retry never resumes after network goes offline', () => {
  const h = harness(); h.open();
  const peer = h.peers[0]; peer.disconnected = true; peer.emit('disconnected');
  const pending = [...h.timers.values()].find(t => t.delay === 1000);
  assert.ok(pending);
  h.context.navigator.onLine = false;
  pending.fn();
  assert.equal(peer.reconnected, undefined);
  assert.equal(h.peers.length, 1);
});

test('remote audio track ending closes the call and releases local microphone', async () => {
  const h = harness(); h.open();
  h.get('partner').value = '654321'; h.click('callBtn');
  h.resolve(); await h.flush();
  const connection = h.peers[0].calls[0];
  const listeners = {};
  const remote = { getAudioTracks: () => [{
    addEventListener(event, cb) { listeners[event] = cb; }
  }] };
  connection.emit('stream', remote);
  assert.match(h.get('status').textContent, /Görüşme sürüyor/);
  listeners.ended();
  assert.equal(h.track.stopped, 1);
  assert.equal(h.get('remote').srcObject, null);
  assert.match(h.get('status').textContent, /Karşı tarafın ses bağlantısı kesildi/);
  assert.equal(h.get('callBtn').hidden, false);
});

test('stale remote audio event cannot terminate a newer call', async () => {
  const h = harness(); h.open();
  h.get('partner').value = '654321'; h.click('callBtn');
  h.resolve(); await h.flush();
  const old = h.peers[0].calls[0], listeners = {};
  const remote = { getAudioTracks: () => [{
    addEventListener(event, cb) { listeners[event] = cb; }
  }] };
  old.emit('stream', remote);
  h.click('hangBtn');
  const closedBefore = old.closed;
  listeners.ended();
  assert.equal(old.closed, closedBefore);
  assert.equal(h.get('status').textContent, 'Arama kapatıldı.');
});

test('backgrounding cancels initial signaling timeout and stale callback is inert', () => {
  const h = harness();
  const peer = h.peers[0];
  const pending = [...h.timers.values()].find(t => t.delay === 15000);
  assert.ok(pending, 'initial signaling timeout should exist');
  h.context.lanuPause('Arka plan');
  assert.equal([...h.timers.values()].includes(pending), false);
  const status = h.get('status').textContent;
  pending.fn();
  assert.equal(peer.destroyed, false);
  assert.equal(h.get('status').textContent, status);
  assert.equal(h.get('callBtn').disabled, true);
});

test('offline transition cancels initial signaling timeout', () => {
  const h = harness();
  const peer = h.peers[0];
  const pending = [...h.timers.values()].find(t => t.delay === 15000);
  assert.ok(pending);
  h.context.navigator.onLine = false;
  h.events.offline();
  assert.equal([...h.timers.values()].includes(pending), false);
  const status = h.get('status').textContent;
  pending.fn();
  assert.equal(peer.destroyed, false);
  assert.equal(h.get('status').textContent, status);
});

test('pagehide cancels startup deadline even when signaling is pending', () => {
  const h = harness();
  const pending = [...h.timers.values()].find(t => t.delay === 15000);
  assert.ok(pending);
  h.events.pagehide();
  assert.equal([...h.timers.values()].includes(pending), false);
  const status = h.get('status').textContent;
  pending.fn();
  assert.equal(h.get('status').textContent, status);
  assert.equal(h.peers[0].destroyed, true);
});

test('an empty remote media stream cannot be reported as an active audio call', async () => {
  const h = harness(); h.open(); h.get('partner').value = '654321';
  h.click('callBtn'); h.resolve(); await h.flush();
  const active = h.peers[0].calls[0];
  active.emit('stream', { getAudioTracks: () => [] });
  assert.equal(active.closed, 1);
  assert.equal(h.track.stopped, 1);
  assert.equal(h.get('remote').srcObject, null);
  assert.match(h.get('status').textContent, /ses akışı alınamadı/);
  assert.equal(h.get('muteBtn').hidden, true);
});

test('already ended remote audio track is rejected', async () => {
  const h = harness(); h.open(); h.get('partner').value = '654321';
  h.click('callBtn'); h.resolve(); await h.flush();
  const active = h.peers[0].calls[0];
  active.emit('stream', { getAudioTracks: () => [{ readyState: 'ended', addEventListener() {} }] });
  assert.equal(active.closed, 1);
  assert.equal(h.track.stopped, 1);
  assert.equal(h.get('callBtn').hidden, false);
});

test('a live remote audio track still connects normally', async () => {
  const h = harness(); h.open(); h.get('partner').value = '654321';
  h.click('callBtn'); h.resolve(); await h.flush();
  const active = h.peers[0].calls[0];
  active.emit('stream', { getAudioTracks: () => [{ readyState: 'live', addEventListener() {} }] });
  assert.equal(active.closed, 0);
  assert.equal(h.track.stopped, 0);
  assert.match(h.get('status').textContent, /Görüşme sürüyor/);
});

test('terminal closed PeerConnection releases microphone without PeerJS close event', async () => {
  const h = harness(); h.open();
  h.get('partner').value = '654321'; h.click('callBtn'); h.resolve(); await h.flush();
  const active = h.peers[0].calls[0];
  active.emit('stream', h.stream);
  active.peerConnection.connectionState = 'closed';
  active.pcEvents.connectionstatechange();
  assert.equal(active.closed, 1);
  assert.equal(h.track.stopped, 1);
  assert.equal(h.get('remote').srcObject, null);
  assert.match(h.get('status').textContent, /Ses bağlantısı kapandı/);
});

test('terminal ICE closed state closes the active call, stale callback does not', async () => {
  const h = harness(); h.open();
  h.get('partner').value = '654321'; h.click('callBtn'); h.resolve(); await h.flush();
  const first = h.peers[0].calls[0];
  first.emit('stream', h.stream);
  first.peerConnection.iceConnectionState = 'closed';
  first.pcEvents.iceconnectionstatechange();
  assert.equal(h.track.stopped, 1);
  assert.equal(first.closed, 1);
  first.pcEvents.iceconnectionstatechange(); // closed call callback arrives late
  assert.equal(first.closed, 1);
});

test('Lens camera mode never starts signaling and resume cannot bypass PIN',()=>{
 const h=harness({lens:true,lensOpen:false});assert.equal(h.peers.length,0);h.context.lanuResume();assert.equal(h.peers.length,0);assert.equal(h.get('callBtn').disabled,true);
 h.get('partner').value='654321';h.click('callBtn');assert.equal(h.requested(),0);
});
test('incoming ring starts without microphone and stops on rejection, timeout, offline and background',()=>{
 for(const end of ['reject','timeout','offline','background']){
  const h=harness();h.open();h.peers[0].emit('call',new h.Connection());assert.equal(h.ringing.at(-1),true);assert.equal(h.requested(),0);
  if(end==='reject')h.click('hangBtn');else if(end==='timeout')h.deadline();else if(end==='offline')h.events.offline();else h.context.lanuPause();
  assert.equal(h.ringing.at(-1),false);assert.equal(h.get('answerBtn').hidden,true);
 }
});
test('answering stops ringtone before microphone permission resolves',()=>{
 const h=harness();h.open();h.peers[0].emit('call',new h.Connection());h.click('answerBtn');assert.equal(h.ringing.at(-1),false);assert.equal(h.requested(),1);
});
test('locking Lens destroys signaling and releases active audio',async()=>{
 const h=harness({lens:true,lensOpen:true});h.open();h.get('partner').value='654321';h.click('callBtn');h.resolve();await h.flush();
 h.context.LanuCalls.deactivate();assert.equal(h.track.stopped,1);assert.equal(h.peers[0].destroyed,true);assert.equal(h.ringing.at(-1),false);assert.equal(h.ringback.at(-1),false);
});

test('camera standby rings with PIN locked but cannot answer or capture audio before unlock',()=>{
 const h=harness({lens:true,lensOpen:false,lensListen:true});h.open();const call=new h.Connection();h.peers[0].emit('call',call);
 assert.equal(h.ringing.at(-1),true);assert.equal(h.requested(),0);h.click('answerBtn');assert.equal(h.requested(),0);assert.equal(call.answered,0);
 h.context.LanuCalls.deactivate(false);assert.equal(h.ringing.at(-1),false);assert.equal(h.peers[0].destroyed,true);
});
