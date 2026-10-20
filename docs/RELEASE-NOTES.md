# Lanu Lens 2.0.6 — PIN korumalı Güncelleme Kontrol

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


### 2. Paket — gerçek cihaz için uygulama içi güncelleme akışı

- PIN doğrulandıktan sonra sürüm denetimi sessizce tetiklenir; yeni sürüm varsa yalnızca özel alanda **Güncelleme var** sekme etiketi görünür.
- Kullanıcı **Yeni sürümü indir ve güncelle** dediğinde Android HTTPS indirme, maksimum boyut/uzunluk ve SHA-256 denetimi, paket adı ve mevcut APK imzasıyla sertifika eşleşmesi sonrasında doğrudan Android kurulum onayı ekranını açar.
- Android 9+ `GET_SIGNING_CERTIFICATES` ile güncel APK içerik imzalayıcıları karşılaştırılır, Android 8'de legacy signature API kullanılır. Beklenmeyen imza ve düşük/eşit versionCode reddedilir.
- Cihaz bilinmeyen kaynak izni istemek için ayarlara geçtiğinde PIN alanı kilitlenir; daha önce doğrulanmış APK korunur, uygulama geri açılıp PIN girilince tekrar indirmeden kurmaya devam edilebilir.
- Ağ kontrolü başarısızsa ve önceden indirilen doğrulanmış APK varsa kurulum işlemi korunur. İndirme yüzdesi ve ağ/izni geri çevirme durumları kullanıcıya bildirilir.
- Gerçek **kullanıcı onayı** olmadan Android'de sessiz kurulum yapılmaz.

**Dağıtımın son etkinleştirilmesi:** Github `LANU-LENS-OTA` public sadece-binary deposu, kalıcı/backup release keystore, repo-scoped yayın token'ı, OTA manifest adresi ve sabit sertifika SHA-256 hâlâ kullanıcı hesabında yapılandırılmalıdır. Bunlar sağlanmadan bu sürüm test APK'sı olarak yayınlanır; başka debug anahtarı üzerinde veri koruyan update garantisi verilmez.
