# LANU Sesli — Android

İki uygulama arasında internet üzerinden sesli görüşme. Mikrofonun sesine WebRTC gürültü azaltma, yankı önleme ve otomatik ses dengeleme uygulanır. Android 8.0 ve üzeri.

## APK indir ve kullan

1. [Releases](https://github.com/kanunal99-jpg/LANU-GURULTU-ENGELLEYICI/releases) sayfasındaki son test sürümünden **LANU-Sesli-1.1.0.apk** dosyasını indir. Repo özel olduğu için GitHub hesabınla giriş yapmalısın.
2. Her iki telefona kur. Android'in gerekirse tarayıcı için istediği APK yükleme iznini ver.
3. İki taraf da uygulamayı açsın; 6 haneli görüşme kodunu paylaşın. Biri diğerinin kodunu yazıp **Ara**, diğeri **Cevapla** düğmesine bassın.
4. Mikrofon iznini görüşme sırasında ver. Bluetooth kulaklık için uygulamadaki izin düğmesini kullan. Hoparlör ve mikrofon kapatma seçenekleri var.

## Açık sınırlar

- **Normal telefon araması, WhatsApp görüşmesi veya sistem genelinde gürültü engelleme yapmaz.** Her iki taraf LANU'yu kullanmalıdır.
- Filtreler yalnızca yerel mikrofonun giden sesini işler. Karşı tarafın gürültüsünü onun uygulaması azaltır; tüm gürültüyü yok etme garantisi yoktur. Aktif filtre durumu cihazın bildirdiği ayarlarla gösterilir.
- Ücretsiz PeerJS Cloud ile sinyalleşir; servis garantisi yoktur. Ağ kesintisinde sınırlı otomatik yeniden bağlantı ve elle yeniden deneme vardır. İki Google STUN adresi ile Cloudflare STUN alternatifi kullanılır.
- **TURN aktarma sunucusu yoktur.** Bazı mobil/kurumsal ağlarda, simetrik NAT altında ses bağlantısı kurulamayabilir. Zaman aşımı ve farklı ağa geçiş önerisi gösterilir; tüm ağlar için kesintisiz çalıştığı iddia edilmez. Ücretli servis açılmamıştır.
- Uygulama arka plana alındığında görüşme ve mikrofon güvenli şekilde kapatılır. Arka plan görüşmesi, kapalı uygulamaya bildirim, gelen arama zil sesi ve çağrı geçmişi bu sürümde yoktur.
- 6 haneli kod kimlik doğrulaması değildir. Yalnızca güvendiğin kişiyle paylaş. Gelen görüşme sen cevaplamadan mikrofonu açmaz.
- Görüşme kaydı tutulmaz. Ses WebRTC ile aktarılır; PeerJS sunucusu bağlantı kimlikleri ve ağ bilgilerini görür. Yerelde kod ve filtre tercihleri saklanır.
- Bu dağıtım **debug imzalı test APK'sıdır**, Play Store üretim sürümü değildir. Kalıcı özel imzalama anahtarı henüz kurulmamıştır; farklı derlemelerde imza değişirse eski APK'yı kaldırıp kurmak gerekir.
- Gerçek iki Android telefon, Bluetooth cihazları ve gürültülü ortamda işitme/kalite testi kullanıcı cihazlarında ayrıca yapılmalıdır. Emülatör smoke testi bunların yerine geçmez.

## Derleme ve doğrulama

Java 17, Android SDK 35, Android Gradle Plugin 8.9.2, Gradle 8.11.1.

```sh
node --test tests/*.test.cjs
./gradlew assembleDebug assembleDebugAndroidTest lintDebug
./gradlew connectedDebugAndroidTest
```

Son komut çalışan bir Android cihaz/emülatör ister. `gradlew`, resmî Gradle dağıtımını SHA-256 doğrulayarak indirir; `curl`, `unzip` ve `sha256sum` gerekir. Windows'ta Gradle 8.11.1 ile aynı görevler çalıştırılabilir.

GitHub Actions kaynak kodu checkout eder; JS testleri, bağımlılık bütünlüğü, APK ve test APK derlemesi, Android lint ve API 35 emülatörde gerçek WebView başlangıç testi geçince APK imzası/içeriği kontrol edilir. Ana dala başarılı yayında APK ile SHA-256 dosyası Releases'a eklenir. Branch/PR derlemeleri sadece Actions artifact üretir.

PeerJS 1.5.4 APK içinde yerel olarak paketlenmiştir (MIT, `app/src/main/assets/vendor/PEERJS-LICENSE`). Kaynak paket npm bütünlük değeri doğrulanarak alınmıştır; çalışma anında CDN'den kod yüklenmez. İzinler yalnızca güvenilir yerel WebView kökenine ve ses yakalamaya verilir. Kamera izni yoktur; harici gezinme ve dosya erişimi kapalıdır.

Geliştirme kuralları: [AGENTS.md](AGENTS.md). Bulgu ve test sınırları: [docs/INCELEME.md](docs/INCELEME.md).
