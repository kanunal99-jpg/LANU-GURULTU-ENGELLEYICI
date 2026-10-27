(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const PREFIX = 'lanu-sesli-';
  const PROVISIONAL_ROUTING = 'lens-routing-provisional-v1';
  const DEADLINE = 45000;
  let peer = null, call = null, stream = null, state = 'idle', ready = false;
  let epoch = 0, timeout = null, retry = null, connectTimeout = null, transportTimeout = null, attempts = 0;
  let muted = false, paused = false, myId = '';
  const pairs = new Set();
  let ringback = false;

  function available() {return !window.LanuLens || window.LanuLens.isOpen() || (typeof window.LanuLens.canReceive==='function' && window.LanuLens.canReceive());}
  function say(message) { $('status').textContent = message; }
  function log(message) { console.warn('LANU: ' + message); } // No peer IDs or audio in logs.
  function safeGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function safeSet(key, value) { try { localStorage.setItem(key, value); return localStorage.getItem(key) === value; } catch (_) { log('Settings storage unavailable'); return false; } }
  function newId() {
    // Six-digit routing codes are NOT authentication. Never use weak PRNG.
    if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') return null;
    const numbers = new Uint32Array(1), bound = Math.floor(0x100000000 / 900000) * 900000;
    for (let i = 0; i < 8; i++) {
      window.crypto.getRandomValues(numbers);
      if (numbers[0] < bound) return String(100000 + (numbers[0] % 900000));
    }
    return null;
  }
  const inboundAttempts = new Map();
  function allowInbound(sender, kind) {
    // Device-local spam defense; secure server auth/rate limits remain P0.
    const now = Date.now(), key = kind + ':' + sender;
    const recent = (inboundAttempts.get(key) || []).filter(t => now - t < 60000);
    if (recent.length >= (kind === 'call' ? 4 : 3)) return false;
    recent.push(now); inboundAttempts.set(key, recent);
    if (inboundAttempts.size > 128) {
      for (const [id, values] of inboundAttempts) {
        if (!values.some(t => now - t < 60000)) inboundAttempts.delete(id);
      }
      while (inboundAttempts.size > 128) inboundAttempts.delete(inboundAttempts.keys().next().value);
    }
    return true;
  }
  function native(method, value) {
    try { if (window.LanuAudio && typeof window.LanuAudio[method] === 'function') window.LanuAudio[method](value); }
    catch (_) { log('Native audio route unavailable; system route retained'); }
  }
  function ui() {
    $('callBtn').hidden = state !== 'idle';
    $('callBtn').disabled = !ready || paused;
    $('partner').disabled = state !== 'idle';
    $('answerBtn').hidden = state !== 'ringing';
    $('hangBtn').hidden = state === 'idle';
    $('muteBtn').hidden = state !== 'connected';
    $('retryBtn').hidden = ready && !paused;
    native('setRinging', state === 'ringing' && !paused);
    native('setIncomingNotification', state === 'ringing' && !paused);
    if (state !== 'dialing') { ringback = false; native('setRingback', false); }
    if (window.LanuLens) window.LanuLens.callState(state);
  }
  function constraints() {
    const supported = navigator.mediaDevices.getSupportedConstraints
      ? navigator.mediaDevices.getSupportedConstraints() : {};
    const audio = {};
    [['ns', 'noiseSuppression'], ['ec', 'echoCancellation'], ['agc', 'autoGainControl']].forEach(([id, key]) => {
      if (supported[key]) audio[key] = $(id).checked;
    });
    return { audio: Object.keys(audio).length ? audio : true, video: false };
  }
  function filters() {
    const track = stream && stream.getAudioTracks()[0];
    if (!track) return;
    const settings = track.getSettings ? track.getSettings() : {};
    const text = [['Gürültü', 'noiseSuppression'], ['Yankı', 'echoCancellation'], ['Denge', 'autoGainControl']]
      .map(([label, key]) => label + ': ' + (settings[key] === true ? 'açık' : settings[key] === false ? 'kapalı' : 'destek bildirilmedi'));
    $('filterStatus').textContent = text.join(' · ');
  }
  async function getStream(token) {
    let result;
    try { result = await navigator.mediaDevices.getUserMedia(constraints()); }
    catch (error) {
      if (error.name !== 'OverconstrainedError') throw error;
      if (token !== epoch || paused) return null;
      // Unsupported filter constraints: retain a usable microphone, report actual support.
      log('Filtered capture unavailable; retrying plain audio');
      result = await navigator.mediaDevices.getUserMedia({audio: true, video: false});
    }
    if (token !== epoch || state === 'idle' || paused) {
      result.getTracks().forEach(track => track.stop());
      return null;
    }
    const audioTracks = typeof result.getAudioTracks === 'function'
      ? result.getAudioTracks() : [];
    if (!audioTracks.length || audioTracks.every(track => track.readyState === 'ended')) {
      // Some buggy devices return a MediaStream but no usable microphone.
      // Do not dial a silent call or leave any captured tracks running.
      result.getTracks().forEach(track => track.stop());
      const noMic = new Error('Microphone stream has no live audio tracks');
      noMic.name = 'NotFoundError';
      throw noMic;
    }
    stream = result; muted = false;
    $('muteBtn').textContent = 'Mikrofonu kapat'; $('muteBtn').setAttribute('aria-pressed', 'false');
    result.getTracks().forEach(track => track.addEventListener('ended', () => {
      if (stream === result) endCall('Mikrofon bağlantısı kesildi.');
    }));
    native('setCallActive', true); filters();
    return result;
  }
  function control(connection, reason) {
    if (!peer || !ready || !connection) return;
    try {
      const channel = peer.connect(connection.peer, {reliable: true, label: 'lanu-control', metadata: {lanuControl: 1}});
      const timer = setTimeout(() => channel.close(), 5000);
      channel.on('open', () => { channel.send({type: reason, id: connection.connectionId}); });
      channel.on('close', () => clearTimeout(timer));
      channel.on('error', () => { clearTimeout(timer); channel.close(); });
    } catch (_) { log('Call notification failed; connection timeout remains available'); }
  }
  function endCall(message, notify = true) {
    ringback = false; native('setRinging', false); native('setRingback', false);
    epoch++; clearTimeout(timeout); timeout = null;
    clearTimeout(transportTimeout); transportTimeout = null;
    const oldCall = call, oldStream = stream;
    // Clear references BEFORE close(): PeerJS can synchronously emit close.
    call = null; stream = null; state = 'idle'; muted = false;
    if (notify && oldCall) control(oldCall, 'hangup');
    if (oldCall) { try { oldCall.close(); } catch (_) { log('Call close failed'); } }
    if (oldStream) oldStream.getTracks().forEach(track => track.stop());
    // A WebView media element can throw during teardown after its backing
    // playback component is disposed. Always finish releasing the call UI.
    try { $('remote').pause(); } catch (_) { log('Remote media pause failed during cleanup'); }
    try { $('remote').srcObject = null; } catch (_) { log('Remote media detach failed during cleanup'); }
    $('playBtn').hidden = true;
    native('setCallActive', false); ui(); say(message || 'Hazır.');
  }
  function deadline(token, message) {
    clearTimeout(timeout);
    timeout = setTimeout(() => { if (token === epoch) endCall(message); }, DEADLINE);
  }
  function playRemote() {
    const token = epoch;
    const offerManualPlayback = () => {
      // Late media playback failures from an already ended call must not
      // resurrect a play button or override the newer call's status.
      if (token === epoch && state === 'connected') {
        $('playBtn').hidden = false;
        say('Görüşme bağlı. Sesi açmak için aşağıdaki düğmeye bas.');
      }
    };
    try {
      const playing = $('remote').play();
      if (playing && playing.catch) playing.catch(offerManualPlayback);
    } catch (_) {
      // Some Android WebView implementations throw synchronously instead
      // of returning a rejected Promise for media playback restrictions.
      offerManualPlayback();
    }
  }
  function attach(connection, token) {
    if (!connection) throw new Error('ConnectionUnavailable');
    call = connection;
    let boundPc = null;
    let transportWasConnected = false;
    function watchConnection() {
      if (call !== connection || token !== epoch) return;
      const pc = connection.peerConnection;
      if (!pc) return;
      if (boundPc !== pc && pc.addEventListener) {
        boundPc = pc;
        pc.addEventListener('connectionstatechange', watchConnection);
        pc.addEventListener('iceconnectionstatechange', watchConnection);
      }
      if (pc.connectionState === 'closed' || pc.iceConnectionState === 'closed') {
        // A WebRTC transport can close without PeerJS emitting call.close.
        // Release the microphone rather than leaving a false connected UI.
        endCall('Ses bağlantısı kapandı. Yeniden aramayı deneyin.', false);
        return;
      }
      if (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed') {
        endCall('Ağ ses bağlantısını engelledi. Wi-Fi / mobil veri arasında geçiş deneyin.');
        return;
      }
      const transportInterrupted = pc.connectionState === 'disconnected'
        || pc.iceConnectionState === 'disconnected';
      if (transportInterrupted && transportWasConnected) {
        if (!transportTimeout) {
          transportTimeout = setTimeout(() => {
            transportTimeout = null;
            // A previously canceled timeout must never terminate a resumed call.
            if (call === connection && token === epoch &&
                (pc.connectionState === 'disconnected' || pc.iceConnectionState === 'disconnected')) {
              endCall('Ses bağlantısı geri gelmedi. Görüşme kapatıldı; yeniden deneyin.', false);
            }
          }, 12000);
        }
        if (state === 'connected') {
          state = 'dialing'; ui();
          say('Ses bağlantısı geçici olarak kesildi. Yeniden bağlanıyor…');
        }
        return;
      }
      const connected = pc.connectionState === 'connected'
        || (pc.connectionState === undefined && ['connected', 'completed'].includes(pc.iceConnectionState));
      if (connected && transportTimeout) { clearTimeout(transportTimeout); transportTimeout = null; }
      if (connected && $('remote').srcObject && state !== 'connected') {
        // PeerConnection may emit several connected/ICE events for the same
        // stream; only the state transition should initiate audio playback.
        // Repeated play() requests can race with WebView autoplay prompts.
        transportWasConnected = true;
        clearTimeout(timeout); state = 'connected'; ui(); say('Görüşme sürüyor.'); playRemote();
      }
    }
    connection.on('stream', remote => {
      if (call !== connection || token !== epoch) return;
      // A transport-connected PeerJS stream with no audio tracks is NOT an
      // audible conversation; fail closed rather than showing "connected".
      const audioTracks = remote && typeof remote.getAudioTracks === 'function'
        ? remote.getAudioTracks() : [];
      if (!audioTracks || audioTracks.length === 0 || audioTracks.every(track => track.readyState === 'ended')) {
        endCall('Karşı taraftan ses akışı alınamadı. Görüşmeyi yeniden deneyin.', false);
        return;
      }
      $('remote').srcObject = remote;
      // A received stream can disappear without a PeerJS close callback.
      // Never report an active call after its remote audio has ended.
      const remoteEnded = () => {
        if (call === connection && token === epoch && $('remote').srcObject === remote) {
          endCall('Karşı tarafın ses bağlantısı kesildi.', false);
        }
      };
      audioTracks.forEach(track => {
        if (track.addEventListener) track.addEventListener('ended', remoteEnded);
      });
      if (remote.addEventListener) remote.addEventListener('inactive', remoteEnded);
      state = 'dialing'; ui(); say('Ses bağlantısı kuruluyor…');
      watchConnection();
    });
    connection.on('close', () => { if (call === connection) endCall('Görüşme bitti.', false); });
    connection.on('error', () => { if (call === connection) endCall('Ses bağlantısı kurulamadı. Farklı bir ağda tekrar deneyin.', false); });
    watchConnection();
  }
  function mediaError(error, token) {
    if (token !== epoch) return;
    log('Microphone or call setup failed: ' + (error.name || 'unknown'));
    const messages = {
      NotAllowedError: 'Mikrofon izni verilmedi. Telefon ayarlarından Lanu Lens için mikrofonu açıp tekrar deneyin.',
      NotFoundError: 'Mikrofon bulunamadı. Kulaklığınızı kontrol edin.',
      NotReadableError: 'Mikrofon başka uygulamada kullanılıyor veya açılamadı.'
    };
    endCall(messages[error.name] || 'Görüşme başlatılamadı. Bağlantıyı ve mikrofonu kontrol edin.');
  }
  async function dial() {
    if (state !== 'idle' || !ready || !peer || paused || (window.LanuLens && !window.LanuLens.isOpen())) return;
    const id = $('partner').value.trim();
    if (!/^[1-9]\d{5}$/.test(id)) { say('6 haneli geçerli kodu yaz.'); return; }
    if (id === myId) { say('Kendi kodunu arayamazsın.'); return; }
    const token = ++epoch;
    state = 'preparing'; ui(); say('Mikrofon açılıyor…');
    deadline(token, 'Arama zaman aşımına uğradı. Karşı tarafın uygulaması açık olmalı.');
    try {
      const local = await getStream(token);
      if (!local || token !== epoch) return;
      attach(peer.call(PREFIX + id, local), token);
      state = 'dialing'; ui(); say('Aranıyor…');
    } catch (error) { mediaError(error, token); }
  }
  async function answer() {
    if (state !== 'ringing' || !call || paused || (window.LanuLens && !window.LanuLens.isOpen())) return;
    const connection = call, token = epoch;
    state = 'preparing'; ui(); say('Mikrofon açılıyor…');
    try {
      const local = await getStream(token);
      if (!local || call !== connection || token !== epoch) return;
      connection.answer(local); state = 'dialing'; ui(); say('Ses bağlantısı kuruluyor…');
    } catch (error) { mediaError(error, token); }
  }
  function reconnectSoon() {
    if (retry || paused || navigator.onLine === false || attempts >= 4) { ui(); return; }
    retry = setTimeout(() => {
      retry = null;
      // The app may have gone to the background or offline since scheduling.
      if (paused || navigator.onLine === false) { ui(); return; }
      attempts++;
      if (peer && !peer.destroyed && peer.disconnected) {
        try { peer.reconnect(); watchConnection(peer); } catch (_) { start(myId); }
      } else if (available()) start(myId);
  else ui();
    }, Math.min(1000 * Math.pow(2, attempts), 8000));
  }
  function watchConnection(current) {
    clearTimeout(connectTimeout);
    connectTimeout = setTimeout(() => {
      // A delayed signaling timeout is stale once app is hidden or offline.
      if (peer !== current || ready || paused || navigator.onLine === false) return;
      say('Görüşme sunucusuna ulaşılamadı. Bağlantını kontrol edip yeniden dene.');
      if (!current.destroyed) current.destroy();
      reconnectSoon(); ui();
    }, 15000);
  }
  function start(id) {
    clearTimeout(retry); retry = null; clearTimeout(connectTimeout);
    if (peer) { const old = peer; peer = null; try { old.destroy(); } catch (_) { } }
    ready = false; ui();
    if (navigator.onLine === false) { say('İnternet bağlantısı yok. Bağlanınca yeniden denenecek.'); return; }
    if (paused || !available()) { say('Uygulamaya dönüp yeniden bağlan.'); return; }
    if (typeof Peer === 'undefined') { say('Görüşme bileşeni açılamadı. Uygulamayı yeniden başlatın.'); return; }
    if (!id || !/^[1-9][0-9]{5}$/.test(id)) { say('Güvenli görüşme kodu oluşturulamadı. Android System WebView bileşenini kontrol et.'); return; }
    const current = new Peer(PREFIX + id, {
      secure: true, debug: 0,
      config: {iceServers: [
        {urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']},
        {urls: 'stun:stun.cloudflare.com:3478'}
      ]}
    });
    peer = current; watchConnection(current);
    current.on('open', () => {
      if (peer !== current) return;
      clearTimeout(connectTimeout); clearTimeout(retry); retry = null;
      ready = true; attempts = 0; myId = id;
      $('myid').textContent = id; safeSet('lanuId', id); ui();
      if (state === 'idle') say('Hazır. Karşı tarafın kodunu yazarak arayabilirsin.');
    });
    current.on('error', error => {
      if (peer !== current) return;
      log('Signaling error: ' + error.type);
      if (error.type === 'unavailable-id') {
        // A shared six-digit code is a user identity, not a disposable connection ID.
        // A collision must never silently rotate it (or overwrite the saved code).
        ready = false;
        peer = null;
        clearTimeout(connectTimeout); connectTimeout = null;
        try { current.destroy(); } catch (_) { log('Conflicting signaling session could not be closed'); }
        ui();
        say('Görüşme kodun şu anda başka bir bağlantıda kullanılıyor. Kodun değiştirilmedi. Diğer oturumu kapatıp Yeniden bağlan düğmesine bas.');
      } else if (error.type === 'peer-unavailable') {
        if (state !== 'idle') endCall('Karşı taraf bulunamadı. Kodu ve uygulamasının açık olduğunu kontrol et.', false);
      } else {
        ready = false;
        if (state !== 'connected') endCall('Görüşme sunucusu bağlantısı kesildi.', false);
        else say('Ses devam ediyor; görüşme sunucusuna yeniden bağlanılıyor.');
        reconnectSoon(); ui();
      }
    });
    current.on('disconnected', () => {
      if (peer !== current) return;
      ready = false; ui();
      if (state === 'idle') say('Bağlantı kesildi. Yeniden bağlanılıyor…');
      reconnectSoon();
    });
    current.on('call', connection => {
      if (peer !== current || paused || !available() || state !== 'idle' || !/^lanu-sesli-[1-9]\d{5}$/.test(connection.peer)) {
        control(connection, 'busy'); connection.close(); return;
      }
      if (!allowInbound(connection.peer,'call')) { connection.close(); return; }
      const token = ++epoch; state = 'ringing'; attach(connection, token);
      control(connection, 'ringing');
      deadline(token, 'Gelen arama zaman aşımına uğradı.'); ui(); say('Gelen arama: ' + connection.peer.slice(PREFIX.length));
    });
    current.on('connection', channel => {
      if (channel.label === 'lanu-pair-v1') { receivePair(channel); return; }
      if (channel.label !== 'lanu-control' || !channel.metadata || channel.metadata.lanuControl !== 1) { channel.close(); return; }
      const timer = setTimeout(() => channel.close(), 5000);
      channel.on('close', () => clearTimeout(timer));
      channel.on('error', () => { clearTimeout(timer); channel.close(); });
      channel.on('data', data => {
        if (data && call && channel.peer === call.peer && data.id === call.connectionId && data.type === 'ringing' && state === 'dialing') {
          ringback = true; native('setRingback', true);
        }
        if (data && call && channel.peer === call.peer && data.id === call.connectionId
            && (data.type === 'hangup' || data.type === 'busy')) {
          endCall(data.type === 'busy' ? 'Karşı taraf başka bir görüşmede.' : 'Karşı taraf aramayı kapattı.', false);
        }
        channel.close();
      });
    });
  }
  function pairStatus(text) { if (window.LanuLens) window.LanuLens.pairStatus(text); }
  function pairSession(channel, receiver) {
    const session = {channel, finished:false}; pairs.add(session);
    session.close = () => {
      if(session.finished)return; session.finished=true; clearTimeout(session.timer); pairs.delete(session);
      if(receiver && window.LanuLens) window.LanuLens.clearPair();
      try { channel.close(); } catch (_) { }
    };
    session.timer=setTimeout(()=>{pairStatus('Eşleştirme zaman aşımına uğradı.');session.close();},45000);
    channel.on('close',()=>{if(!session.finished){if(!session.replied)pairStatus('Eşleştirme bağlantısı kapandı.');session.close();}});
    channel.on('error',()=>{pairStatus('Eşleştirme bağlantısı kurulamadı.');session.close();});
    return session;
  }
  function pair(code) {
    if(!window.LanuLens || !window.LanuLens.isOpen() || !ready || paused || state!=='idle') {pairStatus('Önce bağlantının hazır olmasını bekle.');return;}
    if(!/^[1-9]\d{5}$/.test(code)||code===myId){pairStatus('Karşı tarafın geçerli 6 haneli kodunu yaz.');return;}
    if(pairs.size){pairStatus('Mevcut eşleştirme isteğinin sonuçlanmasını bekle.');return;}
    try {
      const nonce=Array.from(window.crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
      const channel=peer.connect(PREFIX+code,{reliable:true,label:'lanu-pair-v1'}), session=pairSession(channel,false);
      pairStatus('Karşı tarafın onayı bekleniyor…');
      channel.on('open',()=>{if(!session.finished)channel.send({type:'request',nonce});});
      channel.on('data',data=>{
        if(session.finished||!data||data.nonce!==nonce)return;
        if(data.type==='accepted') { pairStatus('İki tarafın eşleşmesi onaylandı.');window.LanuLens.paired(code); }
        else if(data.type==='rejected') pairStatus('Eşleştirme isteği reddedildi.');
        else return;
        session.close();
      });
    }catch(_){pairStatus('Eşleştirme başlatılamadı. Yeniden dene.');}
  }
  function receivePair(channel) {
    if(!window.LanuLens || !window.LanuLens.isOpen() || paused || state!=='idle' || pairs.size || !/^lanu-sesli-[1-9]\d{5}$/.test(channel.peer)){channel.close();return;}
    if (!allowInbound(channel.peer,'pair')) { channel.close(); return; }
    const session=pairSession(channel,true);let requested=false;
    channel.on('data',data=>{
      if(session.finished||requested||!data||data.type!=='request'||!/^[a-f0-9]{32}$/.test(data.nonce||'')){session.close();return;}
      requested=true;
      window.LanuLens.pairRequest(channel.peer.slice(PREFIX.length),accepted=>{
        if(session.finished)return;
        try {channel.send({type:accepted?'accepted':'rejected',nonce:data.nonce});}
        catch(_){pairStatus('Eşleştirme yanıtı gönderilemedi.');session.close();return;}
        session.replied=true;pairStatus(accepted?'Eşleştirme onaylandı.':'Eşleştirme reddedildi.');
        // Let the reliable data channel deliver the response before closing.
        clearTimeout(session.timer);session.timer=setTimeout(session.close,1000);
      });
    });
  }
  window.LanuCalls = {
    activate() { window.lanuResume(); $('myid').textContent=myId; },
    deactivate(listen = false) {
      window.lanuPause('Alan kilitlendi.'); pairs.forEach(session=>session.close());
      if(!listen){if(peer){const old=peer;peer=null;old.destroy();} ready=false;ui();}
      else {paused=false;if(!peer||peer.destroyed||peer.disconnected||!ready)start(myId||newId());else ui();}
    },
    dial(code) { if(window.LanuLens && window.LanuLens.isOpen()){$('partner').value=code;dial();} },
    pair,
    rotateCode() {
      if (!window.LanuLens || !window.LanuLens.isOpen() || state !== 'idle') {
        say('Kod değişimi için özel alan açık ve görüşme kapalı olmalı.');
        return false;
      }
      let next = newId();
      for (let attempts = 0; next === myId && attempts < 8; attempts++) next = newId();
      if (!next || next === myId) { say('Güvenli yeni kod oluşturulamadı. Tekrar dene.'); return false; }
      // Explicit user action only: persist before retiring the old ID.
      // A storage failure must not silently change the displayed identity.
      if (!safeSet('lanuId', next)) { say('Kod kaydedilemedi. Telefon depolamasını kontrol et.'); return false; }
      // A manually selected ID is now owned, never replace it during restore.
      try { localStorage.removeItem(PROVISIONAL_ROUTING); } catch (_) {}
      myId = next;
      $('myid').textContent = next;
      pairs.forEach(session => session.close());
      paused = false; attempts = 0;
      start(next);
      say(navigator.onLine === false ? 'Yeni kod kaydedildi. İnternet gelince bağlan.' : 'Yeni kod kaydedildi. Bağlanıyor…');
      return true;
    },
    state:()=>state
  };
  ['ns', 'ec', 'agc'].forEach(id => {
    const saved = safeGet('lanu-' + id); if (saved !== null) $(id).checked = saved === 'true';
    $(id).addEventListener('change', async () => {
      safeSet('lanu-' + id, String($(id).checked));
      const track = stream && stream.getAudioTracks()[0], token = epoch;
      if (!track) return;
      try { await track.applyConstraints(constraints().audio); if (token === epoch) filters(); }
      catch (_) { if (token === epoch) say('Bu cihaz ayarı canlı değiştiremiyor. Değişiklik sonraki aramada denenecek.'); }
    });
  });
  $('callBtn').addEventListener('click', dial);
  $('answerBtn').addEventListener('click', answer);
  $('hangBtn').addEventListener('click', () => endCall('Arama kapatıldı.'));
  $('partner').addEventListener('input', () => { $('partner').value = $('partner').value.replace(/\D/g, '').slice(0, 6); });
  $('muteBtn').addEventListener('click', () => {
    if (!stream) return; muted = !muted;
    stream.getAudioTracks().forEach(track => { track.enabled = !muted; });
    $('muteBtn').textContent = muted ? 'Mikrofonu aç' : 'Mikrofonu kapat';
    $('muteBtn').setAttribute('aria-pressed', String(muted));
  });
  $('speaker').addEventListener('change', () => native('setSpeaker', $('speaker').checked));
  $('btBtn').addEventListener('click', () => {
    native('requestBluetooth', true);
    say('Kulaklık bağlıysa ve izin verildiyse ses ona yönlendirilir. İzin reddedilirse telefon sesi kullanılır.');
  });
  $('playBtn').addEventListener('click', () => { $('playBtn').hidden = true; playRemote(); });
  $('retryBtn').addEventListener('click', () => {
    if (state !== 'idle') endCall('Yeniden bağlanılıyor.');
    paused = false; attempts = 0; start(myId || newId());
  });
  window.lanuPause = message => {
    paused = true;
    clearTimeout(retry); retry = null;
    clearTimeout(connectTimeout); connectTimeout = null;
    endCall(message || 'Görüşme kapatıldı.');
  };
  window.lanuResume = () => {
    if (!available()) return;
    paused = false;
    // WebView can suspend a PeerJS socket while the page is hidden without
    // delivering the disconnected event. Never let stale ready=true enable
    // outgoing calls after resume.
    if (!peer || peer.destroyed || peer.disconnected || peer.open === false) {
      ready = false;
    }
    ui();
    if (!ready) { attempts = 0; start(myId || newId()); }
  };
  window.addEventListener('offline', () => {
    ready = false;
    clearTimeout(retry); retry = null;
    clearTimeout(connectTimeout); connectTimeout = null;
    endCall('İnternet bağlantısı kesildi.');
  });
  window.addEventListener('online', () => { attempts = 0; if (state === 'idle') start(myId || newId()); });
  window.addEventListener('pagehide', () => {
    paused = true;
    clearTimeout(retry); retry = null;
    clearTimeout(connectTimeout); connectTimeout = null;
    endCall('Görüşme kapatıldı.');
    if (peer) peer.destroy();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) window.lanuPause('Uygulama arka plana alındı; görüşme kapatıldı.'); else window.lanuResume(); });
  const storedId = safeGet('lanuId');
  myId = /^[1-9]\d{5}$/.test(storedId || '') ? storedId : newId();
  if (myId && !/^[1-9][0-9]{5}$/.test(storedId || '')) {
    // Only a first-run automatically allocated code may be replaced by a
    // confirmed encrypted backup. Existing persisted codes are never assumed
    // to be disposable, even on an empty vault.
    if (safeSet('lanuId', myId)) safeSet(PROVISIONAL_ROUTING, myId);
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    say('Mikrofon desteği yok. Android System WebView bileşenini güncelleyin.'); ui();
  } else if (available()) start(myId);
  else ui();
})();
