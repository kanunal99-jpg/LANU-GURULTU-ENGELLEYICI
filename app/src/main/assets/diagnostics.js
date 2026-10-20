(function (root) {
  'use strict';
  // Pure local capability checks. No microphone permission request, no network
  // calls, storage writes, crash identifiers, peer IDs or personal information.
  const STATUSES = Object.freeze({
    online: ['İnternet bağlantısı', 'İnternet yok: görüşme kurulamaz.'],
    secure: ['Güvenli bağlantı', 'Güvenli bağlam kullanılamıyor.'],
    crypto: ['Şifreleme desteği', 'Cihazın Web Crypto desteği bulunamadı.'],
    webrtc: ['WebRTC desteği', 'WebRTC desteği bulunamadı.'],
    microphone: ['Mikrofon API desteği', 'Mikrofon API desteği bulunamadı.'],
    android: ['Android köprüsü', 'Native ses köprüsü bulunamadı.']
  });
  const bool = value => value === true;
  function snapshot(env) {
    const nav = env.navigator || {};
    const crypto = env.crypto || {};
    return {
      online: nav.onLine !== false,
      secure: bool(env.isSecureContext),
      crypto: typeof crypto.subtle?.deriveKey === 'function',
      webrtc: typeof env.RTCPeerConnection === 'function',
      microphone: typeof nav.mediaDevices?.getUserMedia === 'function',
      android: typeof env.LanuAudio?.setCallActive === 'function'
    };
  }
  function render(doc, env) {
    const pane = doc.getElementById('diagnosticsPane');
    if (!pane || pane.hidden || doc.getElementById('privateView')?.hidden) return false;
    const results = snapshot(env), container = doc.getElementById('diagnosticsResults');
    if (!container) return false;
    container.replaceChildren();
    for (const [key, labels] of Object.entries(STATUSES)) {
      const line = doc.createElement('li');
      line.className = 'diagnostic-row';
      const label = doc.createElement('span'), value = doc.createElement('strong');
      label.textContent = labels[0];
      const ok = results[key];
      value.textContent = ok ? 'Destekleniyor' : (key === 'online' ? 'Çevrimdışı' : 'Kullanılamıyor');
      value.dataset.ok = String(ok);
      line.append(label,value);
      container.append(line);
    }
    const problems = Object.keys(results).filter(key => !results[key]);
    doc.getElementById('diagnosticsSummary').textContent = problems.length === 0
      ? 'Temel cihaz ve tarayıcı özellikleri kullanılabilir. Bu ekran canlı çağrı bağlantısını doğrulamaz.'
      : 'Bazı özellikler kullanılamıyor. İletişim sorunu yaşarsan ağ veya Android System WebView ayarlarını kontrol et.';
    return true;
  }
  const api = Object.freeze({snapshot,render});
  root.LanuDiagnostics = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
