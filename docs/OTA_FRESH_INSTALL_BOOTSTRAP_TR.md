# LANU Lens — Tek sefer temiz kurulum, sonraki güncellemelerde uygulama içi OTA

**Karar (27.10.2026):** Kullanıcı eski debug APK'yi kaldırıp LANU Lens'i **yeni ve kalıcı üretim imzasıyla** bir kez temiz yüklemeyi kabul etti. Önceki debug APK'lar birbirinden farklı imzalandığından eski kurulumdaki verilerin yerinde korunması **beklenmemeli**. Eski uygulama yalnız yeni üretim APK'sı mevcut ve doğrulanmış olduğunda silinmelidir.

## Yeni kalıcı imza kimliği

- Android paket adı: `com.lanu.sesli`
- Özel release key alias: `lanu_lens_release_2026`
- **Herkese açık** Android signer SHA-256: `39b2beadf8f3ba3936f58d0617c862932737fff45360baff5cadeb8d0f30d278`
- Imza: RSA 4096 / SHA256withRSA, Java KeyStore (JKS), ~27 yıl geçerli
- Asıl özel anahtar/keystore ve parolalar **GitHub kaynak kodunda veya releases dosyalarında DEĞİLDİR**. Kullanıcıya özel teslim edilen imza arşivinden alınarak GitHub Actions Secrets alanına girilmesi şarttır. Bu arşiv kaybolursa mevcut kurulumlara gelecekte imzası aynı APK üretilemez.
- Gradle bu yeni SHA-256 sertifikasını **sabit pinler**: başka bir fingerprint verilirse build daha imzalanmadan hata verir.

## GitHub Actions Secret / variable kurulumu

Kullanıcının hesabında `Settings → Secrets and variables → Actions`:

| Tür | İsim | Nereden |
|---|---|---|
| Secret | `LANU_RELEASE_KEYSTORE_B64` | Özel imza paketindeki JKS'nin base64 kodlanmış metni |
| Secret | `LANU_RELEASE_STORE_PASSWORD` | Özel paketteki parola |
| Secret | `LANU_RELEASE_KEY_ALIAS` | Özel paketteki alias |
| Secret | `LANU_RELEASE_KEY_PASSWORD` | Özel paketteki özel anahtar parolası |
| Variable | `LANU_RELEASE_CERT_SHA256` | `39b2beadf8f3ba3936f58d0617c862932737fff45360baff5cadeb8d0f30d278` |
| Variable | `LANU_OTA_MANIFEST_URL` | `https://raw.githubusercontent.com/kanunal99-jpg/LANU-LENS-OTA/main/latest.json` |

Özel arşivin içinde mobil GitHub arayüzü için ayrı talimat ve GitHub CLI kullanan bilgisayarlar için anahtarları stdin üzerinden Secrets'a yazan yardımcı betik bulunur. **Hiçbir özel parola veya base64 anahtar bu belgeye eklenmemiştir.**

## İlk telefon kurulumu

1. Anahtar Secrets alanına girilmeden, mevcut debug APK'yi silme. Eski uygulamadan rehber ve şifreli mesajları gerekiyorsa **şifreli dışa aktarım** ile sakla; silme işleminin verileri sıfırlayacağını kabul et.
2. `Actions → APK derle ve doğrula → Run workflow → main` ile yeni build çalıştır.
3. Kaynak depo `Releases` altında yeni sürümün `APK-IMZA-DURUMU.txt` raporunda `SIGNING_MODE=PRODUCTION` ve **yukarıdaki SHA-256** doğrulanmalı. `OTA_COMPATIBLE=SIGNER_ONLY` yalnız doğru imzaya işaret eder; canlı OTA kanıtı değildir.
4. Aynı release'in APK'sını indir, `SHA256SUMS.txt` dosyasına göre bütünlüğünü kontrol et.
5. Yalnızca yeni APK bu kontrolleri geçtikten sonra eski debug APK'yi kaldır ve yeni üretim APK'sını telefona **temiz kur**. Yeni PIN ve verileri yeniden oluştur veya varsa güvenli yedekten geri yükle.
6. Uygulamanın PIN'le açılan özel alanındaki `Güncelleme Kontrol` sekmesi, public feed hâlâ boşsa artık **“Yayın bekleniyor”** der; bağlantı bozuk gibi yanlış bir hata göstermez. İlk üretim kurulumu henüz yükseltme yayını değildir.

## Sonraki her OTA güncellemesi

1. Yeni `versionCode` mutlaka artmalı, **aynı JKS + alias + parolalar** ile üretim imzası korunmalı.
2. Yeni üretim APK özel Release'te hash + imza ile doğrulanır. Mevcut üretim APK'nin üzerine kurulum, PIN, rehber/şifreli mesaj ve ayar kalıcılığı gerçek cihazda sınanır. Ön kontrol: `scripts/verify-installed-ota-compatibility.sh` (salt okunur).
3. Onaylanan **tam APK baytlarının** hash'i `LANU_OTA_DEVICE_ACCEPTED_APK_SHA256` repository variable olarak kaydedilir; `LANU_OTA_PUBLISH_TOKEN` sadece public `LANU-LENS-OTA` deposuna yazabilen token olarak tanımlanır.
4. `Actions → Onaylanan APK'yi OTA'ya yayımla` içinde **main** dalında onaylanan tam release etiketi ve onaylı SHA-256 verilir. Workflow başka hiçbir APK'yi promote etmez; dağıtımdan önce ve sonra hash/binary readback yapar.
5. Telefonun özel alanda `Güncelleme Kontrol → Yeni sürümü indir ve güncelle → Android yükleme onayı` akışı denenir. İndirme veya imza doğrulaması hatasında eski kurulum ve verileri silinmez.

**Durum ayrımı:** Android 10/15 emülatörleri üzerinde aynı imzayla yükseltme + PIN/şifreli taslak kalıcılığı testleri geçti. Bu, yeni üretilen gerçek kalıcı imzalı APK'nın cihazda çalıştırıldığı veya otomatik OTA feed'inin etkinleştiği anlamına **gelmez**. İmzalama GitHub Secrets'a eklenip gerçek cihaz testleri yapılana kadar üretim OTA “tamamlandı” olarak işaretlenmez.
