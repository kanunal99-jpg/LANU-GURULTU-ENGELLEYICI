# Lanu Lens 2.0.9 — LANU Premium Professional güvenlik / üretim kalite paketi

## Uygulanan ve regresyon testine alınan değişiklikler

- **R8/ProGuard üretim optimizasyonu:** release build'inde sınıf/metot küçültme/obfuscation ve Android resource shrinking etkin. Dar kapsamlı `@JavascriptInterface` keep kuralları PIN, kamera, WebRTC, OTA, fotoğraf ve izin köprülerinin R8 sonrasında da bulunmasını hedefler.
- **Çalıştırılabilir yayın doğrulaması:** CI artık release APK DEX içinde kritik Android/JavaScript yöntem adlarını doğrular; release `mapping.txt` private workflow artifact'ına eklenir. Debug ve optimize release Android derlemesi/lint kontrolleriyle birlikte WebRTC ve gerçek Android 15 emülatör testi korunmuştur.
- **Gradle Version Catalog:** Android Gradle Plugin, AndroidX Core ve AndroidX WebKit sürümleri tek TOML'da. Yeni gereksiz SDK eklenmedi.
- **WebView güvenliği:** indirilebilir debug APK'da bile Chrome WebView debugging kapalı. Android Safe Browsing etkin, çoklu pencere, geolocation, üçüncü taraf cookie ve file:// erişimleri kapalı. Eksik yerel asset URL'si artık uzaktaki host'a fall back olmadan 404 döner.
- **İzin ayrımı:** Kamera kamuya açık kamera ekranında çalışmayı sürdürür; WebRTC mikrofon isteği ve geciken Android mikrofon onayı yalnızca PIN doğrulanmış özel alanda geçerli olur.
- **Bağımlılık güvenliği:** GitHub Actions üzerinde Node paketleri high/critical vulnerability audit kontrolü.
- **Proje yönetimi:** `docs/PREMIUM-ANDROID-STANDARD-2026-10-20.md`, kullanıcı master promptuna karşı gerçek uyumluluk ve aşamalı dönüşüm önceliklerini; `AGENTS.md` korumalı yayın standardını kaydeder.

## Geriye uyumluluk / uyarılar

- Android paket kimliği `com.lanu.sesli` değişmedi; mevcut Java/WebView, şifreli PIN vault, PeerJS/WebRTC, fotoğraf ve OTA kullanıcı akışları korunmaktadır.
- **Bu sürüm tam Compose/Hilt/Kotlin/MVVM veya Crashlytics uygulaması değildir.** Bunlar parçalı modernizasyon ve Firebase proje yetkisi gerektirir. Sahte yapılandırma yapılmadı.
- **Üretim OTA hâlâ etkin değil:** kullanıcı tarafından yedeklenmiş uzun ömürlü signing key, public binary-only `LANU-LENS-OTA` deposu, secrets/vars ve iki üretim APK'sıyla gerçek cihaz üstüne güncelleme doğrulaması gerekli. İmza farklıysa debug APK üzerine veri koruyarak yüklemek mümkün değildir.
- Uygulama kapalıyken gerçek çağrı almak, Firebase push/kimlik doğrulanmış sunucu entegrasyonu tamamlanana kadar desteklenmez.
- Android APK kurulumunda sistem kullanıcı onayı zorunludur; Play'de yayımlanmadı.

**Kanıt standardı:** yalnızca PR + main CI testleri başarılı, release asset yüklendi ve SHA-256 doğrulandıktan sonra APK yayımlandı sayılacaktır.
