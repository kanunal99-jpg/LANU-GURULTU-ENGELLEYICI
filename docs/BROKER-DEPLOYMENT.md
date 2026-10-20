# LANU Lens — Kimlik Broker Başlatma ve Üretim Kabul Rehberi

Bu klasör **telefon uygulamasına bağlı olmayan**, henüz dağıtılmamış bir kimlik servisi çekirdeğidir. `6 haneli PeerJS kodu` güvenli oturum değildir. Sunucu kimlik ve çağrı yetkisi kullanılmadan **14/15 üretim puanı verilmez**.

## Mevcut teknik parçalar

- `identity-broker.cjs`: P-256 cihaz kayıt/giriş challenge imzası, 15 dk bearer token, explicit karşılıklı pairing, TTL, anti-replay, cihaz iptali.
- `broker-sqlite-store.cjs`: Node 22 `node:sqlite` üzerinde durabilen kayıtlı **açık anahtarlar**, iptal kayıtları, pairing ve kullanılmış davet nonce'ları; PII/PIN/özel cihaz anahtarı yok. Yalnız **tek makine/tek örnek** için.
- `broker-http.cjs`: 12 JSON API eylemi, 16 KiB body limiti, origin allowlist, kimlik header'ı, no-store, hata sızıntısı koruması.
- `start-broker.cjs`: doğrudan public TCP **açmayan**, 0600 izinli Unix socket + SQLite servisi.

## Yetkili sunucu üstünde (henüz yapılmadı)

1. TLS sertifikalı alan adını oluştur ve güvenilir reverse proxy kur. Uygulama IP veya self-signed sertifikaya güvensiz fallback yapmamalı. Uygulamaya hostname ancak servis ve güvenlik testleri bittikten sonra eklenmeli.
2. Sunucuda ayrı sistem kullanıcısı, 0700 özel dizin ve güvenli yedekleme konumu oluştur. Broker ve proxy socket için aynı yetkili UID altında çalışmalı (socket 0600).
3. Node 22+ kur; uzun süreli üretim için `node:sqlite` deneysel API durumunu ayrıca değerlendir. Çok sunuculu dağıtımda paylaşılan transactional DB, idempotent replay, taşıma/test gerekir.
4. Gizli bilgileri **GitHub / uygulama kaynak kodu / Android APK içine koyma**. Örnek çevre:
   ```sh
   export LANU_BROKER_SQLITE=/srv/lanu-private/broker.sqlite
   export LANU_BROKER_SOCKET=/srv/lanu-private/broker.sock
   node server/start-broker.cjs
   ```
5. Proxy socket'e sadece HTTPS 443 üzerinden eriştirsin. HTTPS → socket dışında backend'e doğrudan erişim olmasın. Kenarda IP rate-limit/DoS koruması, TLS 1.2+, token/nonce/kimlik gövdesini loglamama, healthz dışında kimlik anonim keşfi kapalı olmalı.
6. Broker oturumları/challenge ve çağrı kuyrukları **yeniden başlatılınca silinir** (fail-closed); eski token geçmez. FCM/push henüz uygulanmadı; sahte sunucu ve anti-replay testleri ayrıca yapılmalı.
7. Pairing için kullanıcının doğruladığı **açık anahtar parmak izi veya QR** gerekir. Telefon UI sunucuya bağlanana kadar mevcut altı haneli PeerJS çağrısı bu auth protokolünü kullanmaz.

## API (gövde yalnız JSON, çağrılar POST)

`/v1/enroll/challenge`, `/v1/enroll/complete`, `/v1/session/challenge`, `/v1/session/complete` ve bearer auth ile `/v1/pairs/request`, `/v1/pairs/pending`, `/v1/pairs/approve`, `/v1/pairs/reject`, `/v1/pairs/remove`, `/v1/calls/invite`, `/v1/calls/pending`, `/v1/devices/revoke`. Sağlık uç noktası: GET `/healthz`. JSON yanıtlarda `Cache-Control: no-store`. Doğrudan TCP bind yoktur.

## Gerçek 14/15 kabul engelleri

- [ ] Gerçek yetkili TLS alan adı ve güvenli yayın/izleme
- [ ] Yedeklenen/veri bütünlüğü sınanan kalıcı çok-örnekli transaction store
- [ ] Android PIN/cihaz `CryptoKey` ile gerçek login, fingerprint eşleştirmesi, cihaz devir/iptali
- [ ] Yetki verilmiş FCM yüksek öncelik kısa TTL arka plan çağrı bildirimleri, Google servisleri olmayan cihazlarda fallback stratejisi
- [ ] Samsung/Xiaomi/Huawei dahil en az iki fiziksel Android ve farklı ağ/Doze/test
- [ ] Penetrasyon, replay/rate limit, kopma, recovery, verisiz fail-closed ve güvenli rollback kanıtı
