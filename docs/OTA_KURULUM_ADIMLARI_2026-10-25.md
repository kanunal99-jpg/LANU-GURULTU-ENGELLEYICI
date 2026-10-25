# OTA Üretim Kurulum Adımları — 25.10.2026

## Yapılan

- Public binary-only depo oluşturuldu: https://github.com/kanunal99-jpg/LANU-LENS-OTA
- `latest.json` placeholder eklendi (versionCode: 0 — henüz production yayın yok)
- `scripts/publish-ota.sh` bu depoyu bekliyor ve imza + versionCode + tek signer kontrolleri yapıyor

## Hâlâ senin yapman gerekenler (P0)

### 1. Kalıcı production keystore oluştur

```bash
keytool -genkeypair -v \
  -keystore lanu-lens-release.jks \
  -alias lanu_lens \
  -keyalg RSA -keysize 2048 \
  -validity 10000 \
  -storepass "GÜÇLÜ_ŞİFRE" \
  -keypass "GÜÇLÜ_ŞİFRE" \
  -dname "CN=Lanu Lens, OU=LANU, O=LANU, L=Istanbul, ST=Istanbul, C=TR"
```

**Keystore dosyasını güvenli yere yedekle.** Kaybedersen bir daha aynı imzayla güncelleme yapılamaz.

### 2. Sertifika SHA-256 al

```bash
keytool -list -v -keystore lanu-lens-release.jks -alias lanu_lens | grep "SHA256:"
```

Çıktıdaki hex değerini (iki nokta olmadan, küçük harf) kaydet.

### 3. GitHub Secrets ekle (kaynak repo)

Settings → Secrets and variables → Actions → Secrets:

| Secret | Değer |
|--------|------|
| `LANU_RELEASE_KEYSTORE_B64` | `base64 -w 0 lanu-lens-release.jks` çıktısı |
| `LANU_RELEASE_STORE_PASSWORD` | keystore şifresi |
| `LANU_RELEASE_KEY_ALIAS` | `lanu_lens` |
| `LANU_RELEASE_KEY_PASSWORD` | key şifresi |
| `LANU_OTA_PUBLISH_TOKEN` | Fine-grained token (sadece `LANU-LENS-OTA` Contents: Read+Write) |

Variables:

| Variable | Değer |
|----------|------|
| `LANU_RELEASE_CERT_SHA256` | 64 karakter hex (küçük harf, : yok) |
| `LANU_OTA_MANIFEST_URL` | `https://raw.githubusercontent.com/kanunal99-jpg/LANU-LENS-OTA/main/latest.json` |

### 4. İlk production build

Secrets eklendikten sonra main dalına merge edilen her başarılı CI, imzalı APK üretir ve `publish-ota.sh` ile public depoya yayınlar.

### 5. İki gerçek telefonda test

Aynı production imzalı iki artan sürüm arasında:
- PIN korunuyor mu?
- Şifreli rehber korunuyor mu?
- Görüşme kodu korunuyor mu?
- OTA indirme + kurulum akışı çalışıyor mu?

## Önemli uyarılar

- Debug imzalı APK üzerine production imzalı APK **yüklenemez**. Veri varsa önce yedek al.
- Keystore asla kaynak depoya commit edilmez.
- `LANU_OTA_PUBLISH_TOKEN` sadece OTA public deposuna yetkili olsun; kaynak depoya yazma yetkisi vermeyin.
