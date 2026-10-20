# Lanu Lens 2.0.5 — PIN korumalı Güncelleme Kontrol

- Özel alanda **Görüşmeler / Güncelleme Kontrol** sekmeleri eklendi. Kamera ana ekranında güncelleme veya görüşme bilgisi gösterilmez.
- Kurulu uygulama sürümü ve versionCode, yeni sürümü HTTPS ile denetleme, APK indirme/doğrulama ve Android kurulum ekranını açma özellikleri eklendi.
- APK yalnızca izinli GitHub dağıtım kaynağından HTTPS ile indirilir; manifest sürüm numarası, dosya boyutu ve SHA-256 kontrol edilir. Dosyanın Android paket adı, imza sertifikası ve daha yüksek versionCode koşulları doğrulanır. Kötü imza/eski sürüm/hatalı dosya reddedilir.
- APK, yalnızca uygulamanın private cache/updates klasöründe tutulur; Android FileProvider tek dosyaya geçici okuma izni verir.
- Android 8+ uygulama dışı yükleme izni ve sistemin kurulum onayı şarttır. **Sessiz, izinsiz kurulum yapılmaz.** PIN ve şifreli rehbere dokunulmaz.
- Devam eden gelen arama ekrandaysa görüşme sekmesi öncelikli gösterilir; kilitleme güncelleme sekmesini kapatır.

**Dağıtım ön koşulu:** Kaynak GitHub deposu özel olduğundan uygulama, özel Releases dosyalarını anonim indiremez. Resmî OTA'nın etkinleşmesi için yalnızca **derlenmiş APK ve latest.json içeren ayrı erişilebilir dağıtım deposu**, GitHub Actions `LANU_OTA_MANIFEST_URL` değişkeni ve **kalıcı üretim imzalama anahtarı** gereklidir. Bu bilgiler henüz kurulu değilse uygulama güvenli biçimde "OTA dağıtım adresi henüz kurulmadı" mesajı verir ve GitHub sürümleri bağlantısını sunar. Üretim anahtarı sırları olmadan CI yalnızca debug-imzalı test APK üretir; farklı debug anahtarıyla yerel verileri koruyarak üstüne güncelleme garanti edilemez.

Arka planda/kapalıyken çağrı alma hâlâ ayrı bir FCM + yetkilendirilmiş sunucu görevidir. Fiziksel cihazda güncelleme ve gerçek iki telefon testi yapılmış sayılmaz.


### 1. Paket — imzalı APK yayın hattı

- `scripts/publish-ota.sh` yalnızca ayrılmış **public binary-only** OTA deposuna, **sabit imza sertifikası** doğrulanmış release APK'sı yükler.
- Uzak sürüm dosyası tekrar indirilip SHA-256 ile doğrulanmadan `latest.json` yükseltilmez. Geriye dönük versionCode ve mevcut public release etiketi üzerine yazma engellenir.
- Public token, keystore, imza parolaları eksikse kaynak depo sadece private debug test sürümü üretir; OTA dağıtılıyor izlenimi vermez.
- Üretim sırları ve tokenlar Android APK, kaynak kod veya herkese açık sitede bulunmaz.
- Uçtan uca ilk OTA yükleme testi için user-owned public `LANU-LENS-OTA` deposu, sabit imza ve yetkilendirilmiş dağıtım token'ı gereklidir.
