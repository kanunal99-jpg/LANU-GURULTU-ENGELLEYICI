# Lanu Lens 2.0.7 — güvenli OTA sertleştirmesi

- **Güncelleme Kontrol** sekmesi PIN arkasında kalır. Her PIN açılışından sonra sürüm denetimi yapılır; güncelleme varsa kullanıcı, indirme/doğrulama ve Android kurulumunu tek düğmeyle başlatabilir.
- **Güvenlik iyileştirmesi:** Kurulum düğmesine her basıldığında APK diskte SHA-256, boyut, paket adı, imzacı sertifikası ve daha yüksek versionCode açısından tekrar doğrulanır. Kurulum izinleri ekranından geri dönülürken değiştirilmiş veya eksik APK, kurulum ekranına yönlendirilmez.
- **Dayanıklılık:** Farklı versionCode'lar ayrı APK/geçici dosya adlarıyla tutulur; ağ kesintisi önceki doğrulanmış APK'yı silmez. Tekrar indirme gereksizse mevcut doğrulanmış APK kullanılır; indirme esnasında iptal/hatalar güvenle ele alınır.
- **Kurulum öncesi kilit:** Kurulum esnasında rakip güncelleme/denetleme düğmeleri geçici devre dışı kalır, çift tıklamalar seri hale getirilir.
- **OTA URL'si:** `https://raw.githubusercontent.com/kanunal99-jpg/LANU-LENS-OTA/main/latest.json` varsayılan sabit HTTPS adresi olarak yeni APK'ya gömülür. Henüz public yayın yokken durumu doğru bildirir; public yayın daha sonra sağlandığında uygulamanın ayrıca güncelleme URL'si yüklemesi gerekmez. URL'nin başka bir kaynağa çevrilmesi derleme aşamasında reddedilir.
- **Yayın:** GitHub Actions, kullanıcıya ait production keystore ve sadece-public-binary dağıtım token'ı sağlandığında değişmeyen imzayı doğrular, APK'yı yeniden indirerek SHA-256 karşılaştırması yapar ve ancak sonra public `latest.json` günceller. Eksik secrets durumunda debug-imzalı private ön sürüm üretir; public OTA'yı aktif göstermez.
- Android 8-15 SDK ve Android 15 CI emülatör testleri hedeflenmektedir; gerçek cihazda iki ardışık production APK kurulumu **henüz doğrulanmış değildir**.

**Kurulum koşulu:** Kullanıcı hesabında henüz `LANU-LENS-OTA` adlı public sadece-binary depo, kalıcı yedekli Android imza anahtarı ve `LANU_OTA_PUBLISH_TOKEN`/Actions Secrets/Variables kurulmamıştır. Bunlar sağlanmadan Android'den veri kaybetmeden art arda OTA **çalışıyor denemez**. Android onayı olmadan sessiz APK kurulumu yoktur.
