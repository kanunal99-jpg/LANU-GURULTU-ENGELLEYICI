# LANU Lens — İki paralel premium faz (20 Ekim 2026)

Bu plan, **Lanu Lens** adlı Android Java/WebView uygulamasını kademeli profesyonel üretim seviyesine taşıma sözleşmesidir. Her fazın kod/testleri ayrı GitHub branch/PR içinde yürütülür. Hedef olarak tanımlanan bir özellik, test ve dış hesap kurulumları yapılmadıkça **tamamlandı** sayılmaz.

## Faz 1 — P0 güvenlik, veri koruma ve yayın dayanıklılığı
**Akış sahibi:** `feat/lens-phase1-security-data-20261020`

| İş paketi | Kodda yapılabilir teslim | Gerçek üretim kabulü |
| --- | --- | --- |
| PIN ve AES-GCM veri kasası | Şifreli v1 envelope maksimum boyut/salt/IV/cipher doğrulaması; invalid rehber reddi; yanlış PIN sonrası key sıfırlama; bozuk veri otomatik silinmez | Doğru PIN ile eski rehber açılır; yanlış PIN, bozuk ve 256KB+ zarf testleri; iki telefonda veri korunur |
| Uygulama kimliği/güvenli eşleşme | Mevcut kod 6 haneli PeerJS ID; güvenli API + auth mimari gereksinimleri ayrılır | Kimlik doğrulamalı servis, yetki, hız sınırlama, 2 gerçek cihaz ve tehdit modeli |
| Arka plan gelen çağrı | Şimdiki açık WebView çağrısı ve privacy fallback korunur | FCM + güvenli çağrı sunucusu + TTL + kilit ekranı PIN, kapalı/Doze testleri; issue #21 |
| APK OTA / rollback | SHA256, Android imzası, artan build kodu ve public yayın scripti korunur | Hesap sahibi tarafından yedekli sabit keystore, public binary-only LANU-LENS-OTA repo, scoped publisher secrets, iki ardışık **yerinde** güncelleme, veri korunması; issue #23 |
| Yedekleme / kurtarma | Şimdilik şifreli vault v1'i koruma ve bozuk kaydı sıfırlamama | Kullanıcı kontrollü harici şifreli yedek+restore, kötü/eksik yedek hata testleri ve migration/rollback |

**Faz 1 bitirme kapısı:** JS vault regresyonları, eski sürüm uyumluluğu, CI Android/WebRTC, paket SHA-256 ve imza doğrulaması, gerçek cihaz ve hesap gerekliliklerinin listelenmesi. Fiziksel E2E/FCM/OTA hesap adımları olmadıkça **üretim tamamen hazır** yazılamaz.

## Faz 2 — P1/P2 mimari, premium UX, performans, gözlemlenebilirlik
**Akış sahibi:** `feat/lens-phase2-premium-ux-quality-20261020`

| İş paketi | Kodda yapılabilir teslim | Gerçek üretim kabulü |
| --- | --- | --- |
| Erişilebilir özel arayüz | PIN arkasında ARIA tablist+tabpanel; klavye sağ/sol/Home/End; dar ekran, kontrast, reduced motion CSS | Android emülatörde gizli alan sekmeleri, gerçek TalkBack, büyük yazı ve ekran ölçeği |
| Gizlilik dostu sistem tanılama | Yalnızca local booleans ile çevrimiçi/güvenli bağlam/Web Crypto/WebRTC/mikrofon API/native bridge desteğini göster; **kayıt, telemetri ve ağ isteği yok** | Kullanıcının PIN olmadan tanılama görüntüleyememesi, hiçbir kişisel bilgi loglanmaması |
| Modern Clean Architecture | Java/WebView işlevleri korunur; native controller/viewmodel ayrıştırma kararı | Kotlin + MVVM/MVI + Jetpack Compose Material3 + Hilt + Coroutines/Flow, her modülde testli kademeli migration |
| Crash/ANR ve kalite | CI lint, WebRTC, APK/R8, Android 15 smoke korunur | Firebase projesi `com.lanu.sesli`, Crashlytics PII-safe rapor, ANR/startup/battery ölçümü, erişilebilirlik testleri |
| Yerelleştirme | Mevcut Türkçe metinler korunur | Android/web kaynak kataloğuyla TR/EN çeviri + a11y + 200% yazı testi |
| Dağıtım ve teşhis | Güvenli release pipeline korunur | İmza anahtarı, bağımsız gerçek iki cihaz, çağrı kalite regresyonu, üretim sürümü ve rollback runbook |

**Faz 2 bitirme kapısı:** Unit/regression+WebRTC+Android emülatör testleri ve audit; camera/secret/permission regressions görülmez. Firebase/Compose/Room gibi bir servisin **adı** olması, gerçekten entegre edildiğini göstermez.

## Bağımlılık yönetimi ve iki fazı birleştirme

1. İki ayrı branch, bağımsız PR ve CI; aynı dosyada çakışmaları minimize et.
2. Her PR'da `npm ci`, `node --test tests/*.test.cjs`, `npm audit --audit-level=high`, Chromium 2 istemci WebRTC, Android debug+release build/lint/R8, Android 15 emulator smoke.
3. Önce Faz 1 PR birleştir; Faz 2 PR güncel main'e uygulanır. Sürüm ve release dosyaları birleştirme sonunda tek kez güncellenir; son APK Releases'dan SHA ile doğrulanır.
4. Bir build başarısızsa kırık APK yayımlama. Debug imzalı sürümü üretim OTA veya Play yayın sürümü gibi gösterme.
5. **Harici hesap bağımlılıkları** (FCM/Firebase, keystore, public binary repo) kullanıcı hesabındaki gerçek izinler olmadan otomatik tamamlanamaz. Bu maddeler açık issue #21, #23, #30 ile takip edilir.

## Premium hedef ölçütleri (10 üzerinden)

İşlevsel doğruluk ≥9, mahremiyet/güvenlik ≥9, mimari/test edilebilirlik ≥9, CI ve sürüm doğruluğu ≥9, gerçek cihaz kabulü ≥9, veri kaybına dayanıklılık ≥9. Bunlar mevcut puan değil **kapanış hedefleri**dir.
