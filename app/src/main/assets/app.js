(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const PREFIX = 'lanu-sesli-';
  const DEADLINE = 45000;
  let peer = null, call = null, stream = null, state = 'idle', ready = false;
  let epoch = 0, timeout = null, retry = null, connectTimeout = null, attempts = 0;
  let muted = false, paused = false, myId = '', collisions = 0;

  function say(message) { $('status').textContent = message; }
  function log(message) { console.warn('LANU: ' + message); } // No peer IDs or audio in logs.
  function safeGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function safeSet(key, value) { try { localStorage.setItem(key, value); } catch (_) { log('Settings storage unavailable'); } }
  function newId() {
    if (window.crypto && window.crypto.getRandomValues) {
      const numbers = new Uint32Array(1); window.crypto.getRandomValues(numbers);
      return String(100000 + (numbers[0] % 900000));
    }
    return String(Math.floor(100000 + Math.random() * 900000));
  }
  function native(method, value) {
    try { if (window.LanuAudio) window.LanuAudio[method](value); }
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
    epoch++; clearTimeout(timeout); timeout = null;
    const oldCall = call, oldStream = stream;
    // Clear references BEFORE close(): PeerJS can synchronously emit close.
    call = null; stream = null; state = 'idle'; muted = false;
    if (notify && oldCall) control(oldCall, 'hangup');
    if (oldCall) { try { oldCall.close(); } catch (_) { log('Call close failed'); } }
    if (oldStream) oldStream.getTracks().forEach(track => track.stop());
    $('remote').pause(); $('remote').srcObject = null; $('playBtn').hidden = true;
    native('setCallActive', false); ui(); say(message || 'Hazır.');
  }
  function deadline(token, message) {
    clearTimeout(timeout);
    timeout = setTimeout(() => { if (token === epoch) endCall(message); }, DEADLINE);
  }
  function playRemote() {
    const token = epoch;
    const playing = $('remote').play();
    if (playing && playing.catch) playing.catch(() => {
      if (token === epoch && state === 'connected') {
        $('playBtn').hidden = false; say('Görüşme bağlı. Sesi açmak için aşağıdaki düğmeye bas.');
      }
    });
  }
  function attach(connection, token) {
    if (!connection) throw new Error('ConnectionUnavailable');
    call = connection;
    let boundPc = null;
    function watchConnection() {
      if (call !== connection || token !== epoch) return;
      const pc = connection.peerConnection;
      if (!pc) return;
      if (boundPc !== pc && pc.addEventListener) {
        boundPc = pc;
        pc.addEventListener('connectionstatechange', watchConnection);
        pc.addEventListener('iceconnectionstatechange', watchConnection);
      }
      if (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed') {
        endCall('Ağ ses bağlantısını engelledi. Wi-Fi / mobil veri arasında geçiş deneyin.');
        return;
      }
      const connected = pc.connectionState === 'connected'
        || (pc.connectionState === undefined && ['connected', 'completed'].includes(pc.iceConnectionState));
      if (connected && $('remote').srcObject) {
        clearTimeout(timeout); state = 'connected'; ui(); say('Görüşme sürüyor.'); playRemote();
      }
    }
    connection.on('stream', remote => {
      if (call !== connection || token !== epoch) return;
      $('remote').srcObject = remote;
      // A received stream can disappear without a PeerJS close callback.
      // Never report an active call after its remote audio has ended.
      const remoteEnded = () => {
        if (call === connection && token === epoch && $('remote').srcObject === remote) {
          endCall('Karşı tarafın ses bağlantısı kesildi.', false);
        }
      };
      if (remote.getAudioTracks) {
        remote.getAudioTracks().forEach(track => {
          if (track.addEventListener) track.addEventListener('ended', remoteEnded);
        });
      }
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
      NotAllowedError: 'Mikrofon izni verilmedi. Telefon ayarlarından LANU Sesli için mikrofonu açıp tekrar deneyin.',
      NotFoundError: 'Mikrofon bulunamadı. Kulaklığınızı kontrol edin.',
      NotReadableError: 'Mikrofon başka uygulamada kullanılıyor veya açılamadı.'
    };
    endCall(messages[error.name] || 'Görüşme başlatılamadı. Bağlantıyı ve mikrofonu kontrol edin.');
  }
  async function dial() {
    if (state !== 'idle' || !ready || !peer || paused) return;
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
    if (state !== 'ringing' || !call || paused) return;
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
      } else start(myId);
    }, Math.min(1000 * Math.pow(2, attempts), 8000));
  }
  function watchConnection(current) {
    clearTimeout(connectTimeout);
    connectTimeout = setTimeout(() => {
      if (peer !== current || ready) return;
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
    if (paused) { say('Uygulamaya dönüp yeniden bağlan.'); return; }
    if (typeof Peer === 'undefined') { say('Görüşme bileşeni açılamadı. Uygulamayı yeniden başlatın.'); return; }
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
      ready = true; attempts = 0; collisions = 0; myId = id;
      $('myid').textContent = id; safeSet('lanuId', id); ui();
      if (state === 'idle') say('Hazır. Karşı tarafın kodunu yazarak arayabilirsin.');
    });
    current.on('error', error => {
      if (peer !== current) return;
      log('Signaling error: ' + error.type);
      if (error.type === 'unavailable-id') {
        if (++collisions <= 5) start(newId());
        else { ready = false; say('Kod ayrılamadı. Yeniden bağlanmayı dene.'); ui(); }
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
      if (peer !== current || paused || state !== 'idle' || !/^lanu-sesli-[1-9]\d{5}$/.test(connection.peer)) {
        control(connection, 'busy'); connection.close(); return;
      }
      const token = ++epoch; state = 'ringing'; attach(connection, token);
      deadline(token, 'Gelen arama zaman aşımına uğradı.'); ui(); say('Gelen arama: ' + connection.peer.slice(PREFIX.length));
    });
    current.on('connection', channel => {
      if (channel.label !== 'lanu-control' || !channel.metadata || channel.metadata.lanuControl !== 1) { channel.close(); return; }
      const timer = setTimeout(() => channel.close(), 5000);
      channel.on('close', () => clearTimeout(timer));
      channel.on('error', () => { clearTimeout(timer); channel.close(); });
      channel.on('data', data => {
        if (data && call && channel.peer === call.peer && data.id === call.connectionId
            && (data.type === 'hangup' || data.type === 'busy')) {
          endCall(data.type === 'busy' ? 'Karşı taraf başka bir görüşmede.' : 'Karşı taraf aramayı kapattı.', false);
        }
        channel.close();
      });
    });
  }
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
    paused = false; attempts = 0; collisions = 0; start(myId || newId());
  });
  window.lanuPause = message => {
    paused = true;
    clearTimeout(retry); retry = null;
    endCall(message || 'Görüşme kapatıldı.');
  };
  window.lanuResume = () => { paused = false; ui(); if (!ready) { attempts = 0; start(myId || newId()); } };
  window.addEventListener('offline', () => { ready = false; clearTimeout(retry); retry = null; endCall('İnternet bağlantısı kesildi.'); });
  window.addEventListener('online', () => { attempts = 0; if (state === 'idle') start(myId || newId()); });
  window.addEventListener('pagehide', () => { paused = true; endCall('Görüşme kapatıldı.'); if (peer) peer.destroy(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) window.lanuPause('Uygulama arka plana alındı; görüşme kapatıldı.'); else window.lanuResume(); });
  const storedId = safeGet('lanuId');
  myId = /^[1-9]\d{5}$/.test(storedId || '') ? storedId : newId();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    say('Mikrofon desteği yok. Android System WebView bileşenini güncelleyin.'); ui();
  } else start(myId);
})();
