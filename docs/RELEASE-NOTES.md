# Lanu Lens 2.0.10 — Faz 1 / güvenlik ve şifreli veri dayanıklılığı

- **PIN + AES-256-GCM veri kasası:** v1 kayıt formatı ve PBKDF2 310.000 SHA-256 iterasyonları korunur; mevcut kullanıcı PIN/şifreli rehber kayıtları otomatik sıfırlanmaz veya dönüştürülmez.
- AES-GCM zarfının boyutu, salt (16 bayt), IV (12 bayt), şifreli yük sınırları ve base64 biçimi kontrol edilir. 128 KiB üzeri şifreli veri içeriği ve 256 KiB üzeri dış zarf güvenli biçimde reddedilir; eski şifreli kayıt silinmez.
- Şifresi çözülen rehberde boolean ayarlar, en fazla 200 kayıt, 6 haneli geçerli görüşme kodu ve 40 karakterlik kişi adı sınırı doğrulanır. Kullanıcıdan veya bozuk kayıttan gelen geçersiz veri, sağlam kayıt üzerine yazılmaz.
- Yanlış PIN ile unlock denemesinde bellekte önceki oturumdan kalmış key/salt/rehber referansları temizlenir. Yeni PIN sırasında iptal/Quota durumunda eski şifreli kayıt korunur.
- Yeni Node birim testleri: yanlış PIN sonrası bellek temizliği, şifreli kayıt bozulması, geçersiz kişi alanları, 201+ kayıt, şifrelenmiş v1 kayıtların geriye dönük okunması.
- Android/WebRTC/OTA mevcut uygulama davranışı korunur. Bu paket mevcut sahte PIN yerine gerçek sunucu kimlik doğrulaması **eklemez**.

**Üretim sınırları:** gerçek arka plan çağrısı (FCM) henüz yok; üretim APK'sı için kalıcı imza + public binary-only OTA deposu + iki gerçek telefon testi gereklidir. Debug-signed test APK'ları imza uyuşmazlığında eskisinin üzerine kurulamaz. Veri varsa kaldırıp yeniden yükleme önermeyin.
