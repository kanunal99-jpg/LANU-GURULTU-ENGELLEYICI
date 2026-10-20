# Lanu Lens — Android

Gerçek kamera ön yüzü: fotoğraf, ön/arka kamera, desteklenen cihazlarda flaş, 3/10 saniye zamanlayıcı, ızgara, dijital yakınlaştırma ve JPEG kaydetme. Android 8.0 ve üzeri.

[Son APK sürümü ve indirme dosyaları](https://github.com/kanunal99-jpg/LANU-GURULTU-ENGELLEYICI/releases). Özel depoda indirmek için GitHub hesabıyla giriş gerekir. Yeni paket adı **Lanu-Lens-2.0.10.apk**; SHA256SUMS.txt aynı sürümdedir.

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


## Uygulama içi OTA güncelleme — 2.0.4

PIN ile özel alana gir → **Güncelleme Kontrol** → **Güncelleme denetle**. Yeni sürüm varsa **Yeni sürümü indir ve doğrula** → **Güncellemeyi kur** düğmelerini kullan. Android'in "Bu kaynaktan izin ver" ve APK kurulum onayları gereklidir. Kullanıcının bilgisi olmadan otomatik/sessiz kurulum yoktur. PIN, görüşme kodu ve şifreli rehber yerinde kalır; fakat **farklı imzalı APK, Android tarafından üstüne yüklenemez**.

### OTA dağıtımının tamamlanması için

Kaynak kodları ve tüm kişisel verileri içeren **özel repo kesinlikle herkese açılmamalı**. Sadece APK + `latest.json` içeren, herkese okunabilir bir **LANU-LENS-OTA** dağıtım deposu kullanılır; dosya adı `Lanu-Lens-2.0.8.apk`, release etiketi `v2.0.8-buildN`; JSON şu şemada: `{"schema":1,"versionCode":N,"versionName":"2.0.8","apkUrl":"https://github.com/kanunal99-jpg/LANU-LENS-OTA/releases/download/v2.0.8-buildN/Lanu-Lens-2.0.8.apk","sha256":"64-küçük-harf-hex","sizeBytes":123456}`.

GitHub Actions, üretim anahtarı sağlandığında **yalnızca özel workflow artifact'ı** olarak `dist/latest.json` hazırlar; APK ve JSON'u halka açık ikili dağıtım reposuna göndermek henüz otomatik değildir. Bu adım için depo ve yetkili yayın mekanizması kurulmalı; yayınlanan JSON'daki APK URL'si gerçekten indirilebilir olmalıdır. Android'e gömülen URL, yeni APK üretildiği güncel kamuya açık `latest.json` adresi olmalıdır.

Github Actions deposunda `LANU_OTA_MANIFEST_URL` isimli **Actions variable** ekleyin (örnek: `https://raw.githubusercontent.com/kanunal99-jpg/LANU-LENS-OTA/main/latest.json`). Aynı **kalıcı üretim keystore** ve sırları `LANU_RELEASE_KEYSTORE_B64`, `LANU_RELEASE_STORE_PASSWORD`, `LANU_RELEASE_KEY_ALIAS`, `LANU_RELEASE_KEY_PASSWORD` isimli GitHub Actions Secrets'a güvenli şekilde girilmelidir. Keystore kaybedilmemeli ve kaynak depoya işlenmemelidir. Bu anahtarla dağıtılan APK, farklı geçmiş debug anahtarından otomatik olarak verileri koruyarak yükseltilemez. Kurulumdan önce PIN/rehber veri yedeği ve güvenli geçiş planı oluşturulmalıdır.

**Henüz yapılandırılmamış kurulumda** denetim düğmesi durumu doğru bildirir, otomatik güncelleme varmış gibi göstermez. Uygulama APK URL'sini veya gizli anahtarları JavaScript'ten kabul etmez; yalnızca build sırasında tanımlı doğrulanmış HTTPS kaynağını kullanır. İzin reddi, internet kesintisi ve imza uyumsuzluğunda güvenli şekilde durur.


### OTA yayın otomasyonu (1. paket)

`scripts/publish-ota.sh` sadece **production keystore ile imzalanmış**, gerçek Android imza sertifikası `LANU_RELEASE_CERT_SHA256` ile eşleşen APK'yı herkese açık **yalnızca binary** `kanunal99-jpg/LANU-LENS-OTA` deposuna yollar. Önce public release'e APK ve SHA256SUMS.txt yüklenir, public dosya geri indirilip aynı SHA ile doğrulanır. **Ancak bundan sonra** `latest.json` main dalında güncellenir; eski build yeni sürümün üzerine yazılamaz. Token yoksa otomatik yayın yapılmaz, private repo sürümü normal yayımlanır.

Telefonla tek seferlik kurulum: GitHub'da yeni `LANU-LENS-OTA` deposunu **Public**, README ile oluştur (kaynak repo özel kalacak). Güvenli ve yedekli kalıcı keystore oluştur. Özel kaynak reposunun Settings → Secrets and variables → Actions bölümünde 4 kalıcı anahtar secret'ını `LANU_RELEASE_KEYSTORE_B64`, `LANU_RELEASE_STORE_PASSWORD`, `LANU_RELEASE_KEY_ALIAS`, `LANU_RELEASE_KEY_PASSWORD` adıyla gir. `LANU_OTA_PUBLISH_TOKEN` için yalnızca OTA public deposuna **Contents: Read and write** izni olan fine-grained GitHub token kullan; bu token'ı APK, latest.json, commit veya sohbete yapıştırma. `LANU_RELEASE_CERT_SHA256` Actions variable'ına keytool/apksigner'dan alınan imza sertifika özetini (64 hex), `LANU_OTA_MANIFEST_URL` Actions variable'ına `https://raw.githubusercontent.com/kanunal99-jpg/LANU-LENS-OTA/main/latest.json` yaz. Sonraki main CI, imzalı APK'yı doğrulayarak public depoya gönderir. **İlk stable sürümü kurmadan önce** keystore'un güvenli, ayrı yedeğini al; her sonraki sürümde aynısını kullan.

Uygulama içinde sürüm kontrolü HTTPS, SHA ve imza kontrollerine bağlıdır; Android onayı olmadan arka planda sessiz kurulum yapılamaz.


### OTA 2. Paket — tek dokunuş, izin akışı

Her PIN girişinin ardından uygulama yalnızca özel alanda arka plandan sürüm denetimi yapar; yeni sürüm bulunursa **Güncelleme var** sekmesi belirir. Sekmedeki **Yeni sürümü indir ve güncelle** tek düğmesi, indirmeyi ve SHA-256 + Android paket adı + imza kontrolünü çalıştırır; doğrulama sonrasında Android kurulum arayüzü otomatik açılır. **Kurulum için Android'in kullanıcı onayı gerekir; sessiz kurulum yapılamaz.**

Kurulum için bilinmeyen uygulama kaynaklarına izin vermek gerekirse Android Ayarları açılır ve özel alan otomatik kilitlenir. İzin verip uygulamaya döndükten sonra PIN ile giriş yapıp **Güncelleme Kontrol** sekmesinde **Güncellemeyi kur** tuşuna bas: önceden doğrulanmış dosya korunur ve tekrar indirme zorunlu değildir. Android işlemi uygulamayı tamamen sonlandırmış veya cache'i silmişse indirmenin güvenle tekrarlanması gerekir.

Yeni 2.0.8 debug test APK'sı da, daha önce yüklenmiş debug APK ile farklı imza kullanıyorsa sistem tarafından reddedilir. Henüz PIN/rehber/şifreli veri yoksa eski APK'yı kaldırıp yeni APK'yı kurabilirsin; bu eski görüşme kodunu/PIN'i sıfırlar. Sürekli yerinde OTA için kurulumda kalıcı **production** imza kullanılmalıdır.


## Premium Android geliştirme standardı (2.0.9)

Kullanıcının **LANU Premium Professional — Android Yazılım Geliştirme Master Prompt** gereksinimleri `docs/PREMIUM-ANDROID-STANDARD-2026-10-20.md` dosyasında kapsamlı denetlendi. Yeni release varyantında **R8 optimizasyonu/resource shrinking**, dar kapsamlı WebView JavaScript bridge keep kuralları, merkezi **Gradle Version Catalog**, fail-closed yerel asset istekleri, Safe Browsing ve özel alana bağlı mikrofon izni bulunmaktadır. CI'da ayrıca **R8 mapping + kritik JS arayüzlerinin release DEX'te korunması**, debug/release Android derleme/lint, WebRTC ve emülatör testleri çalışır. Release mapping özel GitHub Actions artifact'ındadır, public APK dağıtımına konulmaz.

**Açık kalan aşamalı modernizasyon:** Kotlin + MVVM/MVI + Compose/Material 3 + Hilt + Coroutines/Flow ve Firebase Crashlytics bugün uygulamaya entegre değildir. Kapsamlı bir yeniden yazım PIN/rehber verilerini, kamera ve WebRTC'yı riske atacağından adım adım planlandı; dış Firebase uygulama yapılandırması olmadan Crashlytics etkinmiş gibi gösterilmez. Üretim OTA için public binary-only depo, stabil release keystore ve ilk gerçek cihaz güncelleme kabul testi hâlâ gereklidir.

### OTA 2.0.8 güvenlik ve dayanıklılık

Android APK, public APK dağıtım deposunun sabit `https://raw.githubusercontent.com/kanunal99-jpg/LANU-LENS-OTA/main/latest.json` adresini artık varsayılan olarak bilir. Böylece kullanıcı hesabındaki public binary-only depo ve manifest **sonradan** kurulduğunda APK yalnızca sunucu adresini öğrenmek için yeni sürüm yüklemeyi gerektirmez. Depo henüz yoksa uygulama hatalı "güncel" demek yerine "yayın adresi henüz hazırlanmadı" mesajı gösterir.

İndirilen APK, **kurulum tuşuna her basıldığında** yeniden SHA-256, boyut, Android paket adı, imza sertifikası ve artan versionCode kontrolünden geçer. Eski/geçersiz/bozuk APK kuruluma gönderilmez. Ayrı sürümlerin cache dosyaları birbirini bozmaz; bir indirme başarısız olursa doğrulanmış önceki APK silinmez. Android Ayarlar'dan izin verip PIN kilidini tekrar açtığında varsa indirilmiş paket yine kurulum öncesi doğrulanır.

**Hâlâ bir kerelik hesap kurulumu gerekir:** public binary-only repo `LANU-LENS-OTA`; yedekli sabit Android keystore; GitHub Actions secrets `LANU_RELEASE_KEYSTORE_B64`, `LANU_RELEASE_STORE_PASSWORD`, `LANU_RELEASE_KEY_ALIAS`, `LANU_RELEASE_KEY_PASSWORD`, `LANU_OTA_PUBLISH_TOKEN`; variables `LANU_RELEASE_CERT_SHA256`, isteğe bağlı artık sabit `LANU_OTA_MANIFEST_URL`. Hazır repo, izinli yayın token'ı ve production keystore sağlanmadan kayıtsız/debug APK'dan veri kaybetmeden OTA garanti edilemez; kurulumdan sonra bir **sonraki** daha yüksek versionCode ile fiziksel telefonda yükseltme testi yapılmalıdır.


### 2.0.8 — profesyonel OTA güvenliği

Native Android OTA köprüsü artık yalnızca **PIN doğrulanmış ve ekranda aktif** olan özel alanda çalışabilir. Kamera/decoy ekranında veya arka plandayken başlayan ya da biten indirme/kurulum, kullanıcıyı Android APK kurucusuna veya bilinmeyen kaynak izinlerine **otomatik götürmez**. Önceden doğrulanmış APK mevcutsa kullanıcı tekrar PIN ile giriş yapıp **Güncelleme Kontrol → Güncellemeyi kur** adımıyla devam edebilir.

Sürüm manifesti HTTPS önbellek kullanmadan denetlenir; public OTA yayıncısı GitHub API 403/500 ve ağ kesintisinde ilk yayın moduna sessiz geçmez. Android 15 emülatör smoke ve yayıncı negatif senaryo testleri bu sınırları doğrular.

Üretim OTA ancak `LANU-LENS-OTA` adlı **ayrı public binary-only** depo + uzun ömürlü yedekli keystore + ayrı least-privilege yayın token'ı ile etkinleşir. Gereken GitHub secrets/variables `docs/RELEASE-NOTES.md` ve OTA takip issue #23'tedir. Debug-signed APK'lar arasında imza uyuşmayabileceğinden mevcut uygulama üzerine kurulum garanti değildir.

## Premium iki faz — Faz 1 (2.0.10)

PIN ile açılan AES-GCM şifreli rehberin v1 formatı korunarak bozuk kayıt/şifre sınırları ve veri alan doğrulaması güçlendirildi. Eski PIN/rehber otomatik silinmez. Bu geliştirme kimlik doğrulamalı çağrı sunucusu, arka planda FCM çağrısı veya kalıcı üretim OTA'sını tek başına etkinleştirmez. Faz 2 ayrı PR'da özel tanılama ve erişilebilir arayüzle ilerlemektedir.
