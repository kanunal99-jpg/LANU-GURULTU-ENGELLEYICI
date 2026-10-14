# İnceleme — 14 Ekim 2026

## Faz 1 — araştırma

Hedef repo başlangıçta boştu. Kullanıcının altı dosyası incelendi. Build workflow'u bütün kaynak kodunu heredoc içinde tekrar üretiyor; Android proje dosyaları doğrudan repoda bulunmuyordu. Ana kaynaklar ve workflow içindeki kopyalar zamanla ayrışabilirdi.

## Faz 2 — uygulanan düzeltmeler

| Bulgu | Düzeltme |
| --- | --- |
| Çağrı nesnesi temizlenmeden `close()` çağrılıyor; yeniden giriş/döngü riski | Önce durum/referansları temizle, sonra kapat; eski olayları kimlik ve oturum sayacıyla ele |
| İzin penceresi açıkken iptal edilirse geç gelen stream aramayı başlatabiliyor | Oturum sayacı; geç gelen mikrofonu anında durdur |
| Hızlı çift tıklama çoklu mikrofon/arama açabiliyor | Mikrofon isteğinden önce hazırlık durumuna geç |
| Gelen arama cevaplamadan kapanırsa dinleyici yok | Gelen bağlantıya anında close/error dinleyicisi ekle |
| Reddetme/beklerken iptal uzakta anlaşılmayabiliyor | Bağlantı kimliği ve karşı taraf denetimli kısa kontrol kanalı; 45 sn güvenli zaman aşımı |
| Hatalı/kendi kodunu arama, bozuk kayıtlı kod | Altı haneli doğrulama, kendi kodunu engelleme, bozuk saklanan kodu yenileme |
| Peer açılmadan arama ve ağ kesilmesi | Hazır olmadan düğme kapalı; sınırlı geri çekilerek yeniden bağlantı, elle tekrar, offline/online olayları |
| Harici CDN yüklenmezse uygulama başlatılamıyor | PeerJS'i bütünlük kontrolüyle APK içine paketle |
| WebView tüm istenen kaynakları her kökene verebiliyor | Sadece güvenilir yerel HTTPS kökenine AUDIO_CAPTURE; kamera ve diğer kaynakları verme |
| Android izin cevabı sayfayı yeniden yükleyip çağrıyı bozuyor | Bekleyen WebView izin isteğini sakla; izin sonucunda yalnızca onu sonuçlandır |
| Uygulama açıkken daima iletişim modu | Sadece görüşmede ses odağı ve iletişim modu; kapatırken önceki durumu geri al |
| Android 8–11 Bluetooth yolu eksik | Legacy SCO yolu; Android 12+ iletişim cihazı seçimi; telefon/kablolu/system rota fallback |
| Kulaklık değişimi ve arka plan mikrofonu | AudioDeviceCallback; arka planda görüşmeyi/mikrofonu bitir |
| Filtrelerin cihazda uygulanıp uygulanmadığı görünmüyor | Desteklenen constraint'ler, hata durumunda plain-audio fallback ve gerçek getSettings durumu |
| Autoplay hatası sessizce yutuluyor | Kullanıcının sesi yeniden açabileceği düğme |
| APK/test sonucu başarılı olmadan yayın riski | Kaynak checkout, JS test, lint, Android smoke ve APK doğrulaması başarılı olmadan Releases adımını çalıştırma |

## Faz 3 — kanıt

`node --test tests/*.test.cjs`: 24/24 geçti. Bunlar fake medya/Peer nesneleriyle çağrı yaşam döngüsü regresyon testleridir; gerçek bağlantı/işitme kalite testleri değildir.

GitHub Actions, Android kaynak/test APK derlemesini ve lint'i; API 35 emülatörde yerel asset, güvenli köken, mikrofon API'si, native bridge ve pause/resume smoke testini yürütür. Gerçek çalışmanın sonucu Actions kaydında esas alınır. APK üretilmeden veya Actions tamamlanmadan başarılı yayın varmış gibi yorumlanmamalıdır.

İki istemci testi `tests/webrtc-smoke.cjs`: gerçek paketlenmiş PeerJS ve RTCPeerConnection; izole Chrome oturumları, yerel sinyalleşme, sentetik mikrofon. İki yönlü RTP paketleri, cevap öncesi mikrofonun kapalı kalması, mute, iki tarafta kapatma temizliği, cevap öncesi reddetme, tekrar arama ve native pause kontrol edilir. Fiziksel Android veya üretim sunucusu testi değildir.

## Faz 4 — yayın ve kalanlar

Başarılı ana dal workflow'u test APK'sını, APK bilgi dosyasını ve SHA-256 dosyasını özel reponun Releases bölümüne ekler. İndirmek için repo erişimi olan GitHub oturumu gerekir.

Kalan işlevler/sınırlar: TURN aktarma ve bağımsız yedek sinyalleşme hizmeti; arka plan foreground-service görüşme/push; zil sesi; çağrı geçmişi; karşı taraf kimlik doğrulaması; kalıcı üretim imzalama; gerçek iki telefon ve farklı kulaklıklarla akustik kalite/ağ testi. Ücretli servis kurulmadı. Proje, sistem telefon görüşmesi gürültü engelleyicisi değildir.

Teknik referanslar:
- https://developer.android.com/reference/android/webkit/PermissionRequest
- https://developer.android.com/reference/android/media/AudioManager
- https://developer.android.com/build/releases/agp-8-9-0-release-notes
- https://peerjs.com/client/api/peer
- https://peerjs.com/client/api/media-connection
