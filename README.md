# Lanu Lens — Android

Gerçek kamera ön yüzü: fotoğraf, ön/arka kamera, desteklenen cihazlarda flaş, 3/10 saniye zamanlayıcı, ızgara, dijital yakınlaştırma ve JPEG kaydetme. Android 8.0 ve üzeri.

[Son APK sürümü ve indirme dosyaları](https://github.com/kanunal99-jpg/LANU-GURULTU-ENGELLEYICI/releases). Özel depoda indirmek için GitHub hesabıyla giriş gerekir. Yeni paket adı **Lanu-Lens-2.0.3.apk**; SHA256SUMS.txt aynı sürümdedir.

## Kullanım

İlk ekran yalnızca kamera özelliklerini gösterir. Özel alanın adı, rehber, görüşme kodu, giriş ipucu veya arama düğmesi bu ekranda gösterilmez. Üstteki küçük veya ortadaki büyük objektif amblemine üç saniye basılı tutunca PIN ekranı açılır. İlk kullanımda kişisel 6–12 haneli PIN oluşturulur. Hazır/sabit PIN yoktur. Sonraki girişler aynı PIN ile yapılır. Parmak izi bu sürümde eklenmemiştir.

Özel alanda iki kullanıcı görüşme kodlarını paylaşır. Kod eşleştirme isteğini karşı taraf açıkça onaylar. Uygulama içi rehber varsayılan olarak kapalıdır; her kullanıcı kendisi açabilir. Açıkken onaylanan eşleşmeler takma adla saklanır; kaydedilmiş kişinin Ara düğmesi kodu yeniden yazmadan arar. Kapalıyken kodla tek görüşme yapılabilir. Rehberi kapatmak mevcut şifreli kayıtları silmez; kişi satırındaki Sil düğmesi siler. Telefon rehberine erişim izni istenmez.

Gelen görüşme, uygulama açıkken özel alan veya kamera ekranında sistem zil sesi ve titreşimle haber verir. Sessiz/titreşim modu korunur. Cevapla, reddet, karşı tarafın kapatması, ağ kaybı ve 45 saniye zaman aşımında zil durur. Arayan taraf, alıcıya ulaşıldığında çalma tonu duyar. Mikrofon yalnızca arayan aramayı başlatınca ve alıcı Cevapla seçince açılır. Gelen çağrı kameraya veya ilk ekrana kişi/kod taşımaz. Kamera ekranında çalan çağrıyı cevaplamak için PIN ile giriş gerekir. Bu alma seçeneği özel alandaki ayardan kapatılabilir.

Kilitle, geri tuşu, üç dakika hareketsizlik (aktif görüşme dışında) ve arka plana geçiş özel alanı kilitler. Görüşme biter, mikrofon/kamera bırakılır. Kamera ekranında çağrı alma açıksa yalnızca uygulama ön plandayken sinyalleşme sürer; arka planda tamamen bırakılır. Android ekran görüntüsü/son uygulamalar önizlemesi FLAG_SECURE ile korunur. Kullanıcı fotoğrafları yalnızca Kaydet seçildiğinde sistem dosya seçicisiyle dışarı aktarılır.

## Android çağrı bildirimi (2.0.3)

Uygulama **ön planda açık** ve gelen arama için sinyalleşme etkin olduğunda Android bildirim alanında anonim, kilit ekranında gizli gelen çağrı bildirimi gösterilir. Bildirimi açmak PIN kontrolünü atlamaz. Android 13+ cihazda **özel alan → Çağrı bildirimi izni ver** adımından bildirim iznini kullanıcı onaylamalıdır. İzin reddedilirse uygulama içi zil, titreşim ve PIN ile cevaplama akışı korunur.

**Henüz arka planda veya tamamen kapalı uygulamaya çağrı bildirimi ulaştırılamaz.** Bu, ayrı bir sunucu tarafı push ve çağrı teslim altyapısı gerektirir. Sadece bildirim oluşturulmuş olması arka plan çağrı alımının çalıştığı anlamına gelmez.

## Kalıcı görüşme kodu (2.0.2)

İlk oluşturulan altı haneli görüşme kodu **internet olmasa bile** cihazda kalıcı tutulur. Aynı kod başka cihazda kullanılıyorsa kod sessizce değiştirilmez; diğer oturumu kapatıp **Yeniden bağlan** düğmesini kullan. Kullanıcı kendi isteğiyle değiştirmek isterse PIN ile özel alanı açıp **Güvenlik → Görüşme kodunu değiştir → Onayla ve yeni kod oluştur** akışını tamamlar. Kilitli alandan veya görüşme sırasında kod değiştirilemez. Depolama hatasında eski kod korunur.

Kod değişince karşı tarafların rehberinde eski kod kalabilir; yeni kodunu paylaşman gerekir. Kodlar kişiye ait kriptografik kanıt sunmaz ve tek başına güvenlik mekanizması değildir.

## Gizlilik ve teknik sınırlar

- PIN'den PBKDF2-SHA256 (310.000 tur) ile anahtar türetilir; rehber AES-256-GCM ile rastgele salt/IV kullanılarak cihazda şifrelenir. Anahtar kilitlemede bellekten bırakılır. PIN kurtarma servisi yoktur; PIN unutulursa uygulama verilerini temizlemek tüm kayıtları siler. PIN'e beş başarısız denemeden sonra bir dakika bekleme uygulanır. Bu cihaz içi sınır, cihazın sahibi tarafından depolamanın değiştirilmesine karşı sunucu koruması değildir.
- Altı haneli görüşme kodu kimlik doğrulaması değildir. Kod eşleştirme karşılıklı kullanıcı onayı sağlar; kişi kimliğini kriptografik olarak doğrulamaz. Sonraki her çağrı alıcının cevaplamasını gerektirir. Kodu yalnızca güvendiğin kişiyle paylaş.
- **İki uygulama ön planda açık olmalıdır.** Kamera ekranındaki kilitli alan, çağrı alma açıksa zil çalar; PIN ile girilmeden mikrofon açılmaz. Tamamen kapalı uygulamaya veya arka plana gelen arama bu sürümde desteklenmez. FCM/push, kalıcı arka plan çağrı servisi ve operatör araması yoktur. Normal çağrıya benzer zil, mevcut uygulama içi görüşme içindir.
- Mikrofon/kamera kullanımının Android göstergeleri sistemde görünür. Kamera yalnızca kamerayı açma eyleminde izin ister; açılışta mikrofon izni veya görüşme sunucusu bağlantısı kurulmaz.
- PeerJS Cloud ile sinyalleşme, Google/Cloudflare STUN alternatifleri kullanılır. TURN aktarma sunucusu yoktur; simetrik NAT/kurumsal ağlarda bağlantı kurulamayabilir. Ağ kesintisinde sınırlı yeniden deneme, açık hata ve zaman aşımı uygulanır. Ücretli servis açılmamıştır.
- Ses kaydı tutulmaz. Gürültü/yankı azaltma ve otomatik seviye dengelemesi cihazın WebRTC desteğine bağlıdır. Kod ve filtre tercihleri yerelde, rehber şifreli saklanır. Loglar kişi adlarını, kodları ve sesi içermez.
- İç paket kimliği `com.lanu.sesli` güncelleme uyumu için korunur. Ekrandaki ad ve simge Lanu Lens'tir. Dağıtım debug imzalı test APK'sıdır. Farklı CI derlemeleri farklı debug anahtarı kullanabilir; imza uyuşmazsa eski kurulum kaldırılır ve yerel veriler kaybolur.

## Geliştirme ve test

Java 17, SDK 35, AGP 8.9.2, Gradle 8.11.1; PeerJS 1.5.4 yerel ve MIT lisanslıdır. İnternetten çalıştırılabilir script yüklenmez. WebView yalnızca güvenilir HTTPS yerel varlık kökeninden kamera/mikrofon ister.

```sh
npm ci --ignore-scripts
npm test
LANU_CHROME_EXECUTABLE=/usr/bin/google-chrome npm run test:webrtc
sh gradlew assembleDebug assembleDebugAndroidTest lintDebug
sh gradlew connectedDebugAndroidTest
```

GitHub Actions testleri, yerel PeerJS bütünlüğünü, iki Chrome oturumunda gerçek WebRTC/RTP akışını, kamera/PIN/rehber/görünürlük akışını, Android derlemesini, lint ve API 35 WebView smoke testini doğrular. Ana dalda tüm adımlar başarılı olursa imzası doğrulanmış APK, SHA-256 ve APK bilgileri otomatik Releases'a eklenir. Gerçek iki Android telefonda işitilen zil, farklı ağlarda ses kalitesi, Bluetooth ve fiziksel kamera/flâş ayrıca cihaz testi gerektirir; emülatör bunları kanıtlamaz.

## 2.0.1 giriş düzeltmesi

Önceki sürümde ortadaki büyük amblem girişe bağlanmamıştı. Her iki amblem artık aynı üç saniyelik tutma hareketini destekler. Touch Events ve mouse/klavye olayları ayrı işlenir; WebView uyumluluk pointercancel/pointerleave olayları kesilmemiş bir parmak basışının sayacını bozmaz. Gerçek touchcancel, kaydırma, çoklu dokunma ve arka plan olayı hareketi iptal eder. İlk ekrana gizli alanı anlatan yazı eklenmemiştir.

Android smoke testi artık DOM'a PointerEvent göndermek yerine Instrumentation üzerinden gerçek işletim sistemi touchscreen MotionEvent girişleri kullanır: kısa dokunuş, ortadaki amblem, üstteki amblem, küçük parmak hareketi ve kilitlemeden sonra yeniden giriş doğrulanır. Chrome testi de CDP touchscreen girişleri kullanır. Bu testler fiziksel Samsung cihazının birebir doğrulaması olarak sunulmaz.
