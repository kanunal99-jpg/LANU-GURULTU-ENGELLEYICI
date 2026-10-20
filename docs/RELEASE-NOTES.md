# Lanu Lens 2.0.8 — profesyonel OTA sertleştirme

- Uygulama içi güncelleme menüsü yalnızca **PIN doğrulandıktan sonra** kullanılabilir. Android tarafı da kullanıcı PIN ile girdiğinde özel alanın kilidinin açık olduğunu doğrular. WebView başka sayfaya geçtiğinde, uygulama kilitlendiğinde veya arka plana alındığında native OTA yetkisi anında geçersizleşir.
- **Kritik yarış durumu düzeltildi:** İndirme ve SHA-256/paket/imza doğrulaması tamamlandığında kullanıcı özel alanı kilitlediyse, Android sistem kurulum ekranı veya bilinmeyen kaynak izni ekranı artık kendiliğinden başlatılmaz. Doğrulanmış dosya saklanabilir; kuruluma ancak PIN ile yeniden girişten sonra kullanıcı eylemiyle devam edilir.
- Sürüm manifesti HTTP önbelleğinden değil yenilenmiş HTTPS isteğinden okunur (`Cache-Control: no-cache, no-store`). Yanlış ve bozuk manifest/indirilen APK önceki sürümü değiştiremez.
- Public OTA yayın aracı **403/500/API kesintisi** durumlarını ilk yayın sanıp manifesti ilerletmez; yalnızca gerçek 404 ilk dağıtıma izin verir. Yayıncı, APK sertifikasını ve uzak indirilen APK SHA-256'yı doğrulamadan `latest.json` güncellemez.
- Regresyon testleri: PIN ve native OTA durum geçişi, WebView navigasyon kilidi, public manifest hata matrisi 403/404/500, Android 15 emülatörde gerçek PIN/screen gate ve bozulmuş APK denetimi. JavaScript, WebRTC ve Android lint/derleme kontrolleri korunur.
- Arka plandayken çağrı teslimi hâlâ ayrıca yetkili arka uç+FCM gerektirir; OTA değişikliği bu fonksiyonu varmış gibi göstermez.

**Üretim etkinleştirme bekliyor:** Ayrı public binary-only `LANU-LENS-OTA` deposu, yedekli kalıcı production keystore, GitHub Actions Secrets/Variables ve gerçek iki Android cihazda ardışık yerinde kurulum doğrulaması. Bu bilgiler yoksa yalnızca debug-signed APK yayımlanır; önceki debug paketin üzerine yüklenmeyebilir. Android kullanıcı onayı olmadan sessiz kurulum yapılmaz.
