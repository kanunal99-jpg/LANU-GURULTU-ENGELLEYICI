# LANU Lens — OTA imza sürekliliği ve gerçek cihaz kabul rehberi

> Kapsam yalnız LANU Lens OTA'dır. LANU Hesap Makinesi **salt okunur referans** olarak incelenmiştir. Bu doküman üretim kabul kanıtı değildir.

## 27.10.2026 doğrulanan başlangıç

- Paket: `com.lanu.sesli`, son doğrulanan sürüm etiketi: `v2.0.10-build234`, `versionCode=234`.
- İlgili GitHub Actions logu: `SIGNING_MODE=DEBUG`, `OTA_COMPATIBLE=NO`.
- Build234 (debug/test) imza sertifikası SHA-256: `3ba3a57228a12242d197721a7550f71b47ed0d76209e8c67cd4876c4aa367339`.
- `LANU-LENS-OTA/main/latest.json` henüz yayın yok anlamındaki `versionCode=0` boş manifestini taşıyor.
- Önceki build208/212/214/230/234 test APK'ları birbiriyle eşleşmeyen sertifikalar kullanmıştır. **Cihazdaki kurulumun** orijinal özel keystore'u doğrulanmadan bunlardan herhangi birinin üzerine veri koruyan OTA garanti edilemez.

## Kalıcı üretim anahtarı — kayıpsız geçiş koşulu

**Yeni keystore, mevcut farklı sertifikalı LANU Lens kurulumunu üzerine güncelleyemez.** Önce kurulu APK'nin SHA-256 sertifikasını ve mevcut eski özel keystore'un yedeğini güvenli çevrimdışı ortamda incele. Keystore yoksa yeni anahtarı eskisi gibi gösterme; kullanıcı verilerini riske atacak kaldır/yeniden kur yöntemini uygulama.

GitHub **Settings → Secrets and variables → Actions** altında aşağıdakileri yapılandır (değerleri depoya/PR'a/CI loguna yazma):

| Tür | Ad | İçerik |
|---|---|---|
| Secret | `LANU_RELEASE_KEYSTORE_B64` | Önceden kullanılan **orijinal** üretim keystore'unun base64 içeriği |
| Secret | `LANU_RELEASE_STORE_PASSWORD` | Keystore parolası |
| Secret | `LANU_RELEASE_KEY_ALIAS` | İlgili imzalama alias'ı |
| Secret | `LANU_RELEASE_KEY_PASSWORD` | Özel anahtar parolası |
| Secret | `LANU_OTA_PUBLISH_TOKEN` | Yalnız `LANU-LENS-OTA` için Contents + Releases write yetkisine sahip ince kapsamlı token |
| Variable | `LANU_RELEASE_CERT_SHA256` | Orijinal keystore sertifikasının herkese açık 64 karakter hex SHA-256 izi |
| Variable | `LANU_OTA_MANIFEST_URL` | `https://raw.githubusercontent.com/kanunal99-jpg/LANU-LENS-OTA/main/latest.json` |
| Variable | `LANU_OTA_DEVICE_ACCEPTED_APK_SHA256` | **Yalnız gerçek cihazda bu APK ile güncelleme ve PIN/veri koruması sınandıktan sonra** onay verilen tam APK dosyasının 64 haneli SHA-256 izi |

**İlave güvenlik:** Üretim sertifikası doğrulamasını keystore parolasını veya özel anahtarı göstermeden yap. Keystore ve parolalar için çevrimdışı şifreli yedek oluştur. Kaybolan bir anahtarın üretilen yeni bir anahtarla eşdeğer olacağını varsayma. CI kısmi kurulumda hata verir, üretim imzasız APK'yi OTA deposuna yayımlamaz.

## Kurulu cihazla salt-okunur imza testi

Android SDK platform-tools ve build-tools kurulu, geliştirici tarafından onaylanmış ADB cihazında:

```bash
export PATH="$ANDROID_HOME/build-tools/35.0.0:$ANDROID_HOME/platform-tools:$PATH"
bash scripts/verify-installed-ota-compatibility.sh /secure/path/to/verified-new.apk
```

Bu kontrol cihazdaki **yalnız yüklü base APK'yi** geçici ve özel erişimli bir klasöre alarak yeni APK ile imza parmak izini, paketi ve yükselen `versionCode` değerlerini karşılaştırır. APK bütünlüğünün üretimde ayrıca yayımlanan SHA-256 değerine göre doğrulanmış olması gerekir; bu script yayın sunucusu/manifest doğrulamasının yerine geçmez. Script hiçbir `adb install`, `adb uninstall`, `pm clear` veya uygulama kullanıcı verisi okuma işlemi yapmaz.

ADB sistemin koruduğu kurulu APK'yi okuyamazsa **başarılı saymaz**. Başka telefona ait sertifikayı referans göstermez. Farklı imza tespitinde mevcut LANU Lens kurulumunu ve kullanıcı verilerini olduğu gibi bırakır.

## Nihai OTA kabul kayıtları

Gerçek geçiş için eski sertifikayla imzalanmış bir sürümü yükle; PIN, rehber, taslak, görüşme kodu ve ayarları oluştur. Yeni sürümü özel alan üzerinden kontrol et/indir ve **Android'in kurulum onayını** vererek mevcut paket üzerine kur. Eski verilerin yeni sürümde ve uygulamayı tekrar açınca korunduğunu göster. Bozuk APK, imza farkı, indirme iptali ve ağ kaybı senaryolarında eski APK'nin çalıştığını doğrula.

Android 10 (API 29) ve Android 15 (API 35) emülatör sonuçlarını ayrı raporla. Emülatör smokeları **gerçek cihaz üzerinde OTA+veri koruma kanıtı değildir**. Fiziksel cihaz ve eski orijinal anahtar bulunmadığında kabul durumu **BLOKE** kalır. `latest.json` yalnız doğrulanmış, kalıcı üretim anahtarıyla imzalı ve anonim erişilebilir APK hazır olduğunda güncellenmelidir.

## İki ayrı sürüm kapısı: imzalı aday → gerçek cihaz kabulü → canlı OTA

- Normal `build.yml` ana dal CI'sı yalnızca APK üretir, bütünlük/imza delilini `APK-IMZA-DURUMU.txt` ve `SHA256SUMS.txt` ile birlikte özel kaynak deponun Releases alanına koyar. **İmzalama secret'ları tam olsa bile canlı manifest otomatik etkinleşmez.**
- Cihazdaki eski orijinal imzalı sürümün kurulu olduğunu ve veri/yedek güvenliğini doğrula. PIN, rehber, şifreli taslak, bildirim tercihleri gibi kontrol öğelerini not et; özel içerikleri veya PIN'i GitHub'a yükleme.
- Onaylamak istediğin yeni APK'yı **özel depo Release'indeki tam dosya** olarak indir; `SHA256SUMS.txt` değerini karşılaştır. Salt-okunur `scripts/verify-installed-ota-compatibility.sh` ile sertifika, paket ve sürüm artışı kontrolünden **PASS** al. Sertifikalar farklıysa DUR: kaldırma, sıfırlama, yeniden kurma yok.
- Fiziksel cihazda eski sürümden yeniye Android'in resmi onayı ile kullanıcı verilerini silmeden geçişi test et. Önceki PIN ile açılma, şifreli taslak, rehber ve tercihler, uygulamanın kapanıp yeniden açılmasından sonra tekrar doğrulanmalı. Negatif indirme ve imza testleri de kaydedilmeli. CI'nın emülatördeki aynı-imzalı yükseltme testi tek başına **bu adımın yerine geçmez**.
- Kabulü geçmiş **tam APK dosyasının SHA-256** değerini `LANU_OTA_DEVICE_ACCEPTED_APK_SHA256` Actions variable olarak belirle. Bu açık, sürüme özgü onaydır; yeni derleme/yeni byte dizisi, aynı versionName taşısa bile eski onaya dayanamaz.
- GitHub **Actions → Onaylanan APK'yi OTA'ya yayımla → Run workflow** menüsünde `release_tag` olarak onaylı özel repo sürümünü (örnek: `v2.0.10-build250`), `accepted_sha256` olarak **aynı APK'nın** 64 haneli hash'ini gir. Workflow hem bu değeri bağımsız Actions onay variable'ıyla hem private Release `SHA256SUMS.txt` ve üretim imza kanıtıyla, hem de APK dosyasını yeniden inceleyerek karşılaştırır. Sadece birebir eşleşme ve kaynak commit ana dal geçmişindeyse kamuya açık sadece-APK deposuna yayımlar.
- `LANU_OTA_PUBLISH_TOKEN` yalnız **bu manuel yayın** için gereklidir. Manifesti en son güncelleyen publisher önce public APK dosyasını **anonim** yeniden indirerek SHA-256 doğrular. Yayın geriye sarılamaz; yayın veya manifest API hatası oluşursa `latest.json` terfi ettirilmez.
- Son olarak **gerçek telefonun uygulama içindeki PIN korumalı Güncelleme Kontrol alanında** sürüm kontrolü → indirme → Android yükleme onayı → veri kalıcılığı testini doğrula. CI iş akışında kullanıcı onay ekranı otomatik atlanmaz.

**Önemli:** Hash onay değişkeni gerçek cihaz testinin yerine geçmez; yalnızca gerçekleştirilen testin sonrasında insan tarafından verilen bir yayına geçiş iznidir. Orijinal imzalama keystore'u/kullanıcı cihazı sağlanmadan `ÜRETİME HAZIR` veya `OTA KURULUM TAMAM` denilmez. `LANU-Hesap-Makinesi` deposu hiçbir aşamada değiştirilmez.
