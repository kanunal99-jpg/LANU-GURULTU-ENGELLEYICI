# LANU Premium Professional — Lanu Lens uygunluk ve modernizasyon planı

Kaynak: kullanıcı tarafından sağlanan **LANU PREMIUM PROFESSIONAL — ANDROID YAZILIM GELİŞTİRME MASTER PROMPT** (20.10.2026). Bu belge yalnızca Lanu Lens'te gerçek repo denetimiyle kanıtlanan durumu ve adımları listeler. Başka LANU projelerinin uygulandığı anlamına gelmez.

## Temel kural

Mevcut PIN, şifreli rehber, kamera, fotoğraf kaydı, eşleştirme ve WebRTC görüşmelerini koruyarak `araştır → test → uygulama → build → smoke → yayın → doğrula`. Kullanıcı verilerini silen/geriye uyumsuz migration veya debug → release imza değişimi otomatik yapılamaz.

## 2.0.9 ile uygulananlar (CI ve APK doğrulamasından sonra nihai durum güncellenecek)

- **R8/ProGuard:** release kod küçültme ve kaynak küçültme etkin. Resmi optimize proguard konfigürasyonu ve yalnızca `@JavascriptInterface` yöntemlerini koruyan kural kullanılır; toptan keep/dontobfuscate yok. Sadece özel repo CI artifact'ında R8 `mapping.txt` saklanır, açık APK dağıtımına konmaz.
- **Gradle Version Catalog:** mevcut kararlı AGP/AndroidX sürümleri merkezî TOML'da tutulur; gereksiz yeni bağımlılık eklenmez.
- **WebView gizliliği:** WebView debugging indirilebilir debug test APK'larında bile kapalı, Safe Browsing açık, üçüncü taraf çerezleri ve harici dosya erişimi kapalı. Bulunamayan `appassets.androidplatform.net/assets` varlıkları dış HTTPS'e düşmeden yerel 404 döner. Mikrofon kullanımı kilitli kamera ekranında reddedilir; kamera uygulamanın kamuya açık işlevi olarak çalışmaya devam eder. Kullanıcı izin ekranında uygulamayı kilitlerse mikrofon isteği onaylanmaz.
- **Release CI kalite kapıları:** release ve debug build/lint, WebRTC, Android 15 cihaz emülasyonu; release DEX içinde WebView bridge isimleri korunmalı, deobfuscation haritası oluşmalı. Güncellemeler başarısız testte ana dala alınmaz.
- **Mevcut güvenlik:** AES-GCM + PBKDF2 PIN vault; ekran görüntüsü için FLAG_SECURE, `allowBackup=false`, WebView CSP, PIN-on-foreground OTA, SHA-256+Android imza ile APK kontrolü. Bunlar PIN'i uzaktan kimlik doğrulamasına veya iki taraflı sohbet E2EE ispatına dönüştürmez.

## Tamamlanmamış teknik hedefler — öncelik sırası

| Öncelik | Master prompt standardı | Bu projedeki gerçek durum | Uygulanacak güvenli adım |
|---|---|---|---|
| P0 | Android production signing + OTA | Ayrı public binary-only OTA deposu/kalıcı ve yedekli release key/sınırlı token tanımlı değil. Debug APK'lar farklı imza taşıyabilir. | Kullanıcı kontrolündeki keystore ve Github Secrets, public yalnızca APK deposu; iki ardışık signed sürümle aynı cihazda güncelleme ve veri korunma testi |
| P0 | Arka planda çağrı alımı | Yalnızca uygulama ön plandayken PeerJS sinyalleşmesi çalışıyor. | Uygulamaya özel kimliği doğrulanan servis, FCM, callId TTL, push ve PIN sonrası cevap; iki gerçek telefonda test; issue #21 |
| P0 | Firebase Crashlytics | Firebase projesi, `google-services.json` ve entegrasyon yetkisi bu repoda bulunmuyor. | Kullanıcı Firebase erişimi sağlandıktan sonra uygulamaya özel proje/app ID, Gradle eklentileri ve güvenli/PII'siz crash kaydı; üretim release smoke |
| P1 | Kotlin + MVVM/MVI, Clean Architecture | Şu an Android Java `MainActivity` + `LanuUpdater`, UI WebView/JavaScript. | Önce OTA ve ses/izin köprülerini arayüzlerle ayrıştır; Kotlin domain + repository + ViewModel ile modüler geçişi test et. Şifreli veriyi taşıyan migration ayrı inceleme |
| P1 | Jetpack Compose / Material 3 / tema | Yeni native Compose UI henüz yok; mevcut kamera/çağrılar web UI kullanıyor. | Yeni native ayarlar/diagnostik ekranlarını kademeli Compose + Material3 ile geliştir; WebRTC ve kamera bileşenlerini bir anda yeniden yazma |
| P1 | Hilt + Coroutines + Flow | Uygulama şu an Java ExecutorService + Handler kullanıyor. | Kotlin katmanı geçince Application/Hilt, bağımlılık sağlama ve lifecycle-aware Flow/Coroutines; mevcut kritik iş zincirleri testleri korunur |
| P1 | Global exception handling | Lokal hata yakalama var; bütünleşik Crashlytics ve coroutine handler yok. | Yalnızca hassas veri içermeyen diagnostik ID ve kategoriler; kontrolsüz exception yutulmaz, var olan sistem crash handler'ı bozulmaz |
| P1 | Yerelleştirme / erişilebilirlik | Web UI ağırlıklı Türkçe; Android strings.xml sınırlı; otomatik Türkçe/İngilizce çeviri yok. | Web erişilebilirlik taraması, Türkçe/İngilizce kaynak kataloğu, küçük ekran/font ölçeği, kontrast ve ekran okuyucu testi |
| P2 | Room / migration / offline-first | Şifreli vault Indexed Web Storage'da. Room henüz kullanılmıyor. | Room yalnızca somut ihtiyaçta; önce PIN vault dışa aktarma/yedek ve atomik migration planını hazırla; veri kaybı testleri |
| P2 | WorkManager | Uzun süreli arka plan OTA kontrolü bilinçli etkin değil; foreground/on-PIN check. | Kaynak gereksinimi ve Android platform kısıtları sonrası uygun ise, gizliliği bozmayacak WorkManager |
| P2 | Google Play / AAB | Ürün Play'de yayımlanmıyor. | Opsiyonel AAB, izin/SDK/politika gözden geçirmesi; mevcut GitHub APK akışı korunur |

## Güvenli yayın için kabul ölçütleri

- `npm ci`, Node unit/regression, iki Chromium WebRTC istemcisi, debug/release Android build+lint ve Android 15 WebView smoke başarılı.
- Release R8 mapping mevcut, bütün JS `@JavascriptInterface` metod adları DEX'te korunmuş.
- APK dosyası GitHub Releases içinde, SHA-256 ve imza/packagename ile doğrulanmış; yalnızca debug imzalıysa net biçimde **deneme sürümü**.
- Cihazda eski APK üzerine kurulum ile PIN/kod/şifreli rehberin korunması **fiziksel test edilmediyse** tamamlandı deneme.
- Firebase/Crashlytics, Hilt, Compose, Coroutine veya Room henüz kodlanmadıysa asla etkin/production-ready yazma.
