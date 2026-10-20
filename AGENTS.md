# Proje anayasası

- İşleri dört faza ayır: araştırma, düzeltme/uygulama, derleme/test, yayın/doğrulama.
- Kritik zincirlerde ana yol, gerçek alternatif/fallback, hata yönetimi, güvenli varsayılan, özel verileri içermeyen log ve smoke test uygula.
- Ücretsiz/açık kaynak çözümleri öncele. Maliyet doğuracak servis veya plan değişikliği için kullanıcının açık onayını al.
- Gelen verileri doğrula; izin reddi, ağ kesintisi ve iptal durumlarını işle.
- Her yayınlanabilir Android sürümünde APK'yı Releases'a ekle ve erişimini doğrula.
- Ana dalda riskli geliştirme yapma. Ayrı dalda geliştir; kontroller geçince yayınla.
- Derlendi diye gerçek cihaz ses kalitesi ve iki telefon testi yapılmış sayma; kanıt sınırını açık yaz.


## LANU Premium Professional Android standardı (20.10.2026)

- Kaynak kural belgesi: `docs/PREMIUM-ANDROID-STANDARD-2026-10-20.md`. Gerçek test kanıtı olmayan entegrasyonları, özellikle Crashlytics/FCM, Hilt/Compose, data migration ve OTA'yı tamamlanmış gösterme.
- Yeni native modüller Kotlin + MVVM/MVI + Clean Architecture + gerektiğinde Hilt, Coroutines/Flow ve Compose/Material 3 standardına göre tasarlanır. Mevcut çalışan Java/WebView uygulaması veri kaybı yaratacak büyük yeniden yazıma zorlanmaz; geçiş kademeli ve ölçülebilir olmalıdır.
- Üretim varyantı R8 optimized + resource shrinking; `@JavascriptInterface` entrypoint isimlerini koru ve Android smoke ile kanıtla. R8 mapping dosyasını sadece güvenli, private CI artifact'ında tut.
- Kamera, mikrofon ve gizli alan izinleri en az yetkiyle verilir. Android resmi kurulum onayı atlatılmaz, yedekli/sabit imza olmadan debug → release verili üstüne OTA iddia edilmez.
- Firebase Crashlytics ve Play yayınlama için dış proje erişimi gerekecektir; Firebase yapılandırması olmadan sahte `google-services.json` oluşturma, müşteri verisini loglama ve Google Play'de yayınlama.
- Test zorunlulukları: JS/regression, iki WebRTC istemcisi, Android debug/release build/lint, PIN/kamera/WebView/OTA emülatör smoke, GitHub Releases APK varlık+SHA doğrulama ve gerçek cihazla doğrulanmayan kısımları raporlama.
