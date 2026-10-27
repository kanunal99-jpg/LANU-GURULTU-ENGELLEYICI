# LANU Lens — OTA imza sürekliliği ve gerçek cihaz kabul rehberi

> Kapsam yalnız LANU Lens OTA'dır. LANU Hesap Makinesi **salt okunur referans** olarak incelenmiştir. Bu doküman üretim kabul kanıtı değildir.

## 27.10.2026 doğrulanan başlangıç

- Paket: `com.lanu.sesli`, sürüm etiketi: `v2.0.10-build214`, `versionCode=214`.
- İlgili GitHub Actions logu: `SIGNING_MODE=DEBUG`, `OTA_COMPATIBLE=NO`.
- Build214 imza sertifikası SHA-256: `1cb739318674d123ce86f305cec9b286df670ff0c61dc5d3d624ef0816d2efbf`.
- `LANU-LENS-OTA/main/latest.json` henüz yayın yok anlamındaki `versionCode=0` boş manifestini taşıyor.
- Bu imzanın **orijinal özel anahtarı/keystore'u** doğrulanmadan build214 kurulu cihaz üzerine güvenli bir OTA garantisi verilemez.

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
