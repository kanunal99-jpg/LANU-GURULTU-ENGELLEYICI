# PROJE ANAYASASI — 15.10.2026

Bu belge mevcut ANAYASA.md, docs/ANAYASA.md, AGENTS.md ve proje belgelerini **silmez veya geçersiz kılmaz**; çelişkide daha güvenli/katı kural uygulanır, karar ADR'de belgelenir.

## Değişmez çalışma kuralları
1. Her proje için dört faz: **Faz 1 Envanter/Araştırma; Faz 2 Kök neden/Düzeltme; Faz 3 Uygulama/Build/Test; Faz 4 Doğrulama/Yayın/Üretim smoke**. Her fazda Araştır → Düzelt → Uygula → Test/Doğrula → Yayınla kapısı tamamlanır; başarısızsa yayın yapılmaz.
2. Kritik her zincir: **Ana servis → Alternatif → Çalışan fallback → Hata yönetimi → Güvenli varsayılan → Log/izleme → Otomatik smoke testi**. AI, üçüncü taraf API, veritabanı, ödeme/kota, dosya, görsel, kimlik doğrulama, frontend/backend, APK/backend ve üretim özel kapsamdır.
3. Ücretsiz/açık kaynak/yerel çözüm önceliklidir. **Kullanıcı açık onayı olmadan ücretli hizmet veya harcama yoktur.**
4. Girdiler ve yetkiler hem istemci hem sunucuda doğrulanır; sırlar asla repoya/loga yazılmaz; kişisel veri asgari tutulur. Yetkisiz veri toplama, hukuka aykırı entegrasyon veya Android kısıtını dolanma yapılmaz.
5. Modül/menü/buton/ekran/izin/veri/export ve offline senaryoları işlev testiyle kanıtlanır. Görünür ama işlevsiz buton yayınlanamaz. Eksik izin ve offline durumunda anlaşılır uyarı zorunludur.
6. CI kalite kapısı: bağımlılık kilidi → lint/typecheck → birim/integrasyon → build → smoke. Hata halinde fail-closed; test başarısızken başarılı release denmez.
7. Android projesinde yayınlanabilir her sürümün **Releases/Yayınlar** bölümünde APK ve mümkünse SHA-256 vardır; URL ve kurulabilirlik doğrulanır. Workflow artifact tek başına yeterli değildir.
8. Prod değişiklikleri küçük, geri alınabilir ve diff ile incelenebilir olmalı; main korunmalı, rollback/yedek ve migration planı tutulmalı. Gizli bilgileri veya eski bulguları silerek 'temiz' rapor hazırlanmaz.
9. **Ürün tam hazır olana kadar** Araştır → Kök neden → Düzelt → Uygula → Build → Test → Doğrula → Deploy → Production smoke → Kanıtla döngüsü geçerli. Çalışma gerçekleştirilmeden 'tamamlandı' yazılmaz.
10. Her hata kaydı: kimlik, etkilenen dosya/modül, etki, önem(P0/P1/P2/P3), kanıt/link, önerilen düzeltme, test, durum, son doğrulama commit'i içermeli.

## Durum etiketleri
- **DOĞRULANDI:** Günlük, test veya kod satırıyla kanıtlanan sorun.
- **RİSK / TEST GEREK:** Kod/iş akışından doğan ama cihaz/üretim testi isteyen konu.
- **BAŞARILI CI:** Yalnızca ilgili iş akışı başarılı; bütün ürünün kusursuzluğu anlamına gelmez.
- **P0:** yayın engelleyici; **P1:** kritik özellik/ güvenilirlik; **P2:** test/iyileştirme açığı; **P3:** dokümantasyon/kozmetik.

## Düzeltilmesi gerekenler ve takip
Bulguları aşağıdaki bölümde kanıt ve tamamlanma kriteriyle izleyin. Tamamlama için kaynak kod değişikliği, başarılı CI, çalışan ürün smoke ve (Android için) Release APK gerekir.

---
# LANU-GURULTU-ENGELLEYICI — DÜZELTİLMESİ GEREKENLER

**Tarama tarihi:** 15.10.2026  
**Depo:** https://github.com/kanunal99-jpg/LANU-GURULTU-ENGELLEYICI  
**Öncelik:** P1  
**Durum:** KISMEN DOĞRULANDI / TEST GEREK

## Kanıtlanan durum / ön bulgu
Son APK derleme ve doğrulama workflow başarılı; v1.1.0-build12 APK release mevcut. Normal GSM görüşmesi içindeki sesi değiştirme yetkisi doğrulanmadı.

## İlgili düzeltme / kabul kriteri
Tek kulak kullanımını, WebRTC akışını, mikrofon izinlerini ve Android platform sınırlamalarını cihaz üzerinde test et; gerçek çağrı ANC vaadini doğrulanmadan sunma.

## Kontrol adımları
- [ ] README, ağaç, iş akışı, bağımlılık ve gerekiyorsa Android manifest bütünlüğü
- [ ] Kod içinde her görünür özelliğin olay işleyicisi ve veri akışı
- [ ] CI tüm kontroller yeşil, başarısız log kök nedeni giderilmiş
- [ ] Alternatif/fallback, offline, boş/bozuk veri, iptal/izin ret ve güvenlik kontrolleri
- [ ] Android ise gerçek cihaz testi, sağ/sol kulaklık varsa ayrı test, Release APK bağlantı+SHA kontrolü
- [ ] Üretim smoke kanıtı, sürüm/commit ve tarih güncellemesi

## Faz takibi
- **Faz 1 — Araştır:** Repo dosya ağacı ve son workflow/release kayıtları incelendi; tüm fonksiyonların cihazda çalışması henüz kanıtlanmadı.
- **Faz 2 — Düzelt:** Yukarıdaki konu için kod ve konfigürasyonda en küçük güvenli değişiklik gerekli.
- **Faz 3 — Test:** Birim + entegrasyon + cihaz / gerçek servis testi gerekir.
- **Faz 4 — Yayın:** Başarılı ve indirilebilir çıktı ile production smoke yapılmadan kapatılmaz.

---

## Ek Anayasa — Kanıtlı İnceleme ve Düzeltme Takibi (15.10.2026)

- **Kanıtlı araştırma:** [4 bulguluk kaynak-kod/CI/Release incelemesi](https://github.com/kanunal99-jpg/LANU-GURULTU-ENGELLEYICI/blob/main/docs/KANITLI_TEKNIK_DENETIM_2026-10-15.md).
- **Özel proje kuralı:** Yalnız uygulama içi PeerJS/WebRTC bağlantısı GSM araması sanılmamalı; iki fiziksel cihazda gerçek ses testi olmadan çalışıyor denmez.
- **Kanıt sınıfları:** Doğrulanmış hata / kaynak kodu ile doğrulanmış eksik / hipotez / gerçek cihaz testi gerekli. Bu statüler birbirine karıştırılamaz.
- **Gerçek işlev zorunluluğu:** Her görünen menü, form, buton, kayıt, harita, oynatıcı ve servis işlev testiyle kanıtlanır; sahte bağlantı ve sahte başarı yasaktır.
- **Veri güvenliği:** Kullanıcı bilgisi uydurulamaz, sızdırılamaz veya sessizce kaybedilemez. Kimlik, senkronizasyon ve import/export yetki testinden geçer.
- **CI/Release kapısı:** Başarısız testte ürün tamamlanmış sayılmaz. Android'de SHA-256 ve indirilebilir Release APK; kritik modülde gerçek cihaz smoke zorunludur.
- **Ücret onayı:** Ücretli API/kota/servis tüketimi kullanıcı onayı olmadan genişletilmez; gerçek alternatif ve fallback test edilir.
- **Kanıtlı kapanış:** Bulgu ID, önem, dosya+satır, CI kanıtı, kök neden, düzeltme commit'i, kabul testi, sürüm, geri dönüş planı ile izlenir.
- **Faz durumu:** Bu ekleme yalnız analiz/dokümantasyon; kaynak kod düzeltmesi veya üretim doğrulaması değildir.

## 2026-10-18 — Lanu Lens

İlk kamera ekranında özel görüşme/rehber/kod alanına ait hiçbir metin veya giriş ipucu gösterilmez. Kamera gerçek ve kullanılabilir olmalıdır. Özel alana kullanıcı seçimiyle uzun basma ve kişisel PIN ile girilir. Rehber isteğe bağlı ve cihazda şifrelidir; telefon rehberi okunmaz. Gelen arama zilinin başlayıp tüm bitiş yollarında durması doğrulanır. Arka plan/kapalı uygulamaya arama desteği, push altyapısı olmadığı sürece varmış gibi sunulmaz. Kamera ve mikrofon kilitte bırakılır; kamera ekranında çağrı alma açıksa sinyalleşme yalnızca ön planda sürer, arka planda bırakılır; özel veriler loglanmaz. APK her başarılı ana dal sürümünde Releases'a yüklenir.


## 2026-10-19 — giriş hatasının kök nedeni ve düzeltmesi

Kamera ekranında iki objektif amblemi olmasına rağmen yalnızca üstteki küçük ambleme giriş olayı bağlanmıştı. Ortadaki büyük amblem boşta kalıyordu. Ayrıca yalnızca sentetik DOM PointerEvent ile yapılan test gerçek Android dokunma iptallerini sınamıyordu. Her iki amblem aynı giriş bileşenine bağlandı; dokunma ve pointer uyumluluk olayları ayrıldı. Android testleri gerçek işletim sistemi MotionEvent dokunuşlarıyla yapılır. Kısa dokunuş/çoklu dokunma/kaydırma/arka plan gizli alanı açmamalıdır; PIN koruması korunur. İlk ekrana giriş açıklaması eklenmez.

---

## 20.10.2026 — LANU Lens 2 fazlı premium dönüşüm: durum, puan ve kabul anayasası

### Kapsam ve değişmez ilkeler
- Ürün: `com.lanu.sesli` paketli LANU Lens; ilk ekranda gerçek kamera, kullanıcı seçimiyle açılan PIN korumalı özel görüşme, AES-GCM ile yerel şifreli isteğe bağlı rehber ve PeerJS/WebRTC sesli bağlantısı. **Operatör GSM çağrısında sistem çapında gürültü engelleme** veya **uygulama tamamen kapalıyken çağrı** doğrulanmış yetenek değildir.
- Kişisel PIN, rehber, görüşme kimliği ve gizli arayüz sızdırılamaz; mevcut veriyi silen migrasyon / reset / uninstall, kullanıcıya açık veri kaybı uyarısı ve gerçek kurtarma kanıtı olmadan önerilemez.
- Ayrı dal → küçük PR → test → gözden geçirme → `main` → doğrulanmış SHA+APK Release. Kritik zincir: ana yol → alternatif → fallback → hata yönetimi → güvenli varsayılan → PII'siz log → smoke. Ücretli servis, hesap bağlantısı veya anahtar oluşturma için kullanıcının açık onayı ve gerçek erişim gerekir.
- Yeni Android yüzeyleri aşamalı Kotlin + MVVM/MVI, Compose/Material 3, Hilt, Coroutines/Flow ve test edilebilir mimariyi hedefler; kanıtsız toplu yeniden yazım yapılmaz. Firebase yapılandırması veya üretim anahtarı taklit edilmez.
- “CI başarılı”, “emülatör başarılı”, “fiziksel cihazda başarılı” ve “üretim kabulü” farklı statülerdir; birbirine eşitlenemez.

### Tamamlanan ve kanıtlanan teslimler — 20.10.2026 kesiti
| Grup | Yapılan | Kanıt / sınırlama |
| --- | --- | --- |
| Önceki paketler | WebView köprü kilidi, PIN/foreground OTA yetki denetimi, asset origin fail-closed, R8 küçültme ve imza/hash doğrulama zinciri | PR #27, #28, #29 — birleştirildi; dış OTA kurulumları hariç |
| Faz 1 ilk paket | AES-GCM v1 envelope salt/IV/cipher/üst boyut doğrulaması, bozuk kayıt üzerine yazmama, yanlış PIN sonrası anahtar referansını temizleme | PR #31 — birleştirildi; iki gerçek cihazda kurtarma kabulü yok |
| Faz 2 ilk paket | PIN arkasında yalnızca yerel 6 yetenekli tanılama, ARIA sekmeler, klavye, dar ekran ve azaltılmış hareket desteği | PR #32 — birleştirildi; Compose/Hilt/Crashlytics henüz kurulmadı |
| Birleşik ön sürüm | Lanu Lens 2.0.10, Build 84, 2.097.145 bayt APK; önceki 27/27 CI kontrolü ve başarılı workflow | Tag `v2.0.10-build84`; Actions run `39411211819`. APK **debug imzalı**; üretim OTA değil |
| Yeni tanılama düzeltmesi | Bilinmeyen `navigator.onLine` durumunda çevrimiçi varsaymama ve regresyon testleri | PR #35; CI tamamlanıp birleştirilmeden tamamlandı sayılmaz |

Bağlantılar: [PR #31](https://github.com/kanunal99-jpg/LANU-GURULTU-ENGELLEYICI/pull/31) · [PR #32](https://github.com/kanunal99-jpg/LANU-GURULTU-ENGELLEYICI/pull/32) · [PR #35](https://github.com/kanunal99-jpg/LANU-GURULTU-ENGELLEYICI/pull/35) · [Build 84 Release](https://github.com/kanunal99-jpg/LANU-GURULTU-ENGELLEYICI/releases/tag/v2.0.10-build84).

### Açık iş listesi ve gerçek bitirme koşulları
| Öncelik / kaynak | Yapılacak | Bitirme kriteri |
| --- | --- | --- |
| P0 / #33 | Şifreli, kullanıcı kontrollü yedekleme ve geri yükleme; PIN/veri göçü | Hatalı ve eksik yedek reddi, eski veri doğrulaması, kritik işlem yarışları ve iptal/force-stop regresyonu; gerçek cihazda kurtarma |
| P0 / #33 | Güvenilir kullanıcı ve cihaz kimliği, yetkilendirilmiş `callId`, tekrar oynatma önleme, hız sınırlama, cihaz iptali | Gerçek güvenli backend + saldırı testleri; 6 haneli kod tek başına auth değildir |
| P0 / #21 ve #33 | FCM yüksek öncelikli gelen çağrı, çağrı TTL/iptal ve PIN gate; TURN/fallback | 2 fiziksel Android, Doze/arka plan/kilitli ekran/kapalı uygulama, farklı ağ ve Bluetooth testleri |
| P0 / #23 ve #33 | Kalıcı ve yedekli production signing, public yalnız APK OTA deposu, sınırlı yetkili token/secret, cert pin | Aynı sertifikayla iki artan build, yerinde güncelleme, PIN/rehber korunumu, kötü manifest/yanlış sertifika/rollback reddi |
| P1 / #34 | Java/WebView kodu katmanlara ayırıp testli Kotlin MVVM/MVI + Compose + Hilt + Flow migrasyonu | Parça parça çalışan build, mevcut kamera/çağrı/PIN ile geriye uyumluluk ve smoke |
| P1 / #34 | Crashlytics gerçek Firebase projesi, global exception handler, PII redaksiyonu | Gerçek serviste veri sızdırmayan crash/ANR doğrulaması ve mapping yükleme |
| P1/P2 / #34 | TR/EN, TalkBack, 200% yazı, yatay/tablet, performans ve erişilebilirlik | Gerçek cihaz a11y ve startup/battery/CPU/RAM ölçümü, izlenebilir test sonuçları |
| P1/P2 / #34 | SBOM, bağımlılık politikası, Action pinleme, geri dönüş/yayın runbook | CI/doğrulama kayıtları ve rollback tatbikatı |
| P0/P1 / cihaz | İki gerçek telefonda WebRTC, kamera, ses, Bluetooth, veri koruma ve OTA kabulü | Model/Android/ağ/sürüm/sonuç ve tekrar adımlarıyla kanıt |

### Gerekçeli durum puanı (0–100)
Bu puanlar kaynak kodu, birleştirilmiş PR'lar, geçmiş CI/Release ve kapatılamayan dış gereksinimlere göre **geçici mühendislik olgunluk notudur**, bağımsız güvenlik sertifikası veya cihazdan alınmış ölçüm değildir.

| Alan | Maksimum | Şimdi | Premium kabul hedefi |
| --- | ---: | ---: | ---: |
| İşlevsel özellikler | 15 | 11 | 14 |
| Güvenlik ve veri koruma | 20 | 13 | 19 |
| Gerçek kimlik / arka plan çağrısı | 15 | 2 | 14 |
| Üretim OTA / sürüm | 15 | 5 | 14 |
| Mimari / UX / a11y | 15 | 9 | 14 |
| Otomatik test / CI | 10 | 8 | 9 |
| Fiziksel cihaz / prod smoke | 10 | 1 | 9 |
| **TOPLAM** | **100** | **49** | **93** |

- **Mevcut: 49/100** (üretim kabulüne hazır değil). **Hedef: 93/100**; hedef puan ancak bitirme kriterleri kapanınca verilir.
- Öncelik sırası: veri kaybı/kullanıcı güvenliği → üretim imzası+OTA → güvenli auth+FCM → Kotlin/UX+telemetri → iki cihazda bütünsel kabul.
- Her puan değişikliği: tarih, commit/PR, workflow, gerçek cihaz kanıtı (varsa), bilinen açık risk ile bu bölümde kayıt altına alınır. Yeni PR açılması tek başına puanı yükseltmez.

### Bu çalışmanın sonraki kontrollü kod adımı
- **P0 güvenlik sınırı:** Asenkron vault şifreleme devam ederken PIN kilitlenir veya başka yazma işlemi başlarsa eski şifreleme sonucunun kilitten sonra yazılmasını engelle; eşzamanlı PIN değişimi / kilit / yazma ve hata durumları için regresyon testi ekle.
- Onay kapısı: kaynak değişikliği + testler + PR CI; ana dal ve yeni APK yalnız CI başarılı olduktan sonra. Debug anahtarı ile veri kayıpsız üretim OTA iddiası yok.

---

## 20.10.2026 — Kimlik ve OTA 14/15 hedef teslim anayasası

**Bütçe/kanıt kuralı:** 13 veya 14/15 puanı **üretim kabul puanıdır**; PR veya yalnızca başarılı CI, hesap/backend/gerçek Android doğrulamasının yerine geçmez. Kaynak kodu hazırlığı ayrı not edilir. Mevcut baz puanlar: kimlik+arka plan çağrısı **2/15**; OTA+üretim dağıtımı **5/15**. Üretim hedefi her biri **14/15**. Her kalem, kanıtı görülünce ilerletilir.

### Bu oturumun gerçek kod işleri
- **Kimlik PR #38 — CI/merge bekleniyor:** 6 haneli PeerJS yönlendirme kodunda CSPRNG dışı `Math.random` kaldırıldı; modulo yanlılığı reddedildi; kriptografi yoksa kod üretimi fail-closed. 60 saniyelik istemci çağrı/eşleştirme sınırları ve 128 girdilik bellek limiti eklendi. Altı haneli kod **asla güvenilir kimlik değildir**.
- **Kimlik PR #38 — protokol taslağı:** nonextractable ECDSA P-256 `CryptoKey` oluşturma ve kalıcı depolama arabirimi, çağrı başına iki rastgele 128-bit belirteç, kısa TTL, imzalı tekil davet, hedef ve gönderen açık anahtarı fingerprint denetimi, bounded anti-replay cache ve negatif testler. Protokol henüz canlı PeerJS görüşmesine bağlanmadı; **sunucu yetkisi, cihaz kaydı/iptali ve PIN sonrası trust store** yok.
- **OTA PR #37 — CI/merge bekleniyor:** tam sabit public `latest.json` adresi, manifest `versionName` + `versionCode` ile eşleşen release tag'i, indirilen APK gerçek `versionName` doğrulaması, konfigüre edildiğinde hem kurulu hem indirilen APK'yı bağlayan SHA-256 sertifika fingerprint kontrolü. İzin/güvenli kurulum, hash ve aynı imzacı şartı korunuyor.
- **Önceki P0 PR #36** emülatör/Node/Android CI'dan başarılı geçti ve `main` dalına birleştirildi. Bu değişiklik PIN kasasındaki gecikmiş veri işlemlerini iptal eder.

### Kimlik/çağrı üretim kabul kapıları — 14/15
| Kontrol | Kabul kanıtı | Durum |
|---|---|---|
| Cihaz anahtarları | Android cihaz başına nonextractable/imkân varsa Keystore'da donanım destekli anahtar, kalıcı ve PIN korumalı kimlik; key-loss/revoke testleri | Açık |
| Yetkili sunucu | TLS üstünde cihaz kayıt/kimlik, imzalı nonce challenge, hedefe yönelik yetkili callId, TTL, tekrar saldırısı reddi, rate-limit ve audit (PII'siz) | Açık |
| Güvenli rehber eşleştirmesi | Kısa kod yalnız yönlendirme; açık anahtar fingerprint veya QR ile kullanıcı onayı; sahte PeerJS bağlantısı ve taklitçi kimlik reddi | Açık |
| Yetki iptali/anahtar çevrimi | Cihaz iptali, yeni cihaz devri, kimlik kaybı ve geri alma testleri; sessiz kimlik yeniden oluşturma yok | Açık |
| FCM+gerçek E2E | Kısa ömürlü, kod/PIN içermeyen push; iki fiziksel Android'de kilit/Doze/farklı ağ, cihaz PIN'i, çağrı iptal/red ve mikrofon kontrolü | Açık |
| Test/prod izleme | Negatif replay/expiry/unauthorized tests + üretim broker erişimi, hata oranı/sürüm kanıtı | Açık |

### OTA üretim kabul kapıları — 14/15
| Kontrol | Kabul kanıtı | Durum |
|---|---|---|
| Kalıcı production signing | Kullanıcı kontrolünde korunmuş ve **yedekli** aynı `.jks`; PIN/parola kaynak kodda değil. Sonraki her sürümde aynı sertifika | Açık |
| Güvenli CI | Repo-scoped GitHub Secrets: `LANU_RELEASE_KEYSTORE_B64`, `LANU_RELEASE_STORE_PASSWORD`, `LANU_RELEASE_KEY_ALIAS`, `LANU_RELEASE_KEY_PASSWORD`; SHA-256 fingerprint var + release fail-closed | Açık |
| Binary-only public OTA | Ayrı `kanunal99-jpg/LANU-LENS-OTA` public repo; release yalnız imzalı APK, SHA; checksum doğrulandıktan sonra atomic `latest.json` yayımlanır. Kaynak depo private | Açık |
| Yayın güvenlik testleri | Bozuk manifest, sahte sertifika, yanlış APK paketi/sürümü, alt sürüm, yanlış yönlendirme, 404/403/500/ağ kopması, iptal ve erişim reddi | Kısmen CI; üretim açık |
| Üstüne kurulum / veri | Aynı key ile artan 2 sürüm; **iki gerçek cihazda** önce/sonra PIN, kimlik kodu, şifreli rehber checksum ve kurulum kanıtı. Debug→production imza uyuşmazlığında kaldırma/uygulama verisi kaybı kabul edilmez | Açık |
| Operasyon/geri dönüş | Keystore kurtarma, key fingerprint kayıt, scoped publisher rollback önleme, imzalı ileri düzeltme ve dokümante edilmiş yayın onayı | Açık |

### 13–14 puanını almak için değişmez kural
- **Kod hazır**: CI ve Android emülatör smoke başarılı + tamlanan kod yolları.
- **13/15**: yukarıdaki üretim zorunlulukları büyük ölçüde kanıtlı, kalan risk düşük ve tanımlı.
- **14/15**: bütün P0 kabul kapıları kapanmış, iki gerçek cihaz/yayın kanıtı ve geri dönüş tatbikatı var.
- Harici hesap/repo/anahtar kurmadan **sahte tamamlandı** yok. Debug APK imzalı sürümün üzerine veri kayıpsız production OTA vaadi yok.

---

## 20.10.2026 — Kimlik ve OTA hedef 14/15: kanıtlı teslim güncellemesi

**Kural:** Kod teslimi, CI ve üretim kabulü birbirinden bağımsızdır. Harici hesap, kalıcı imzalama, güvenilir backend, FCM ve iki fiziksel cihaz testi olmadan kimlik veya OTA alanına 13–14/15 **üretim** puanı yazılmaz. Önceki kanıta dayalı üretim kabul baz puanları kimlik/arka plan çağrısı 2/15, OTA/dağıtım 5/15; hedef her biri 14/15.

### Bu dönüşte teslim edilen kod
- **[PR #39](https://github.com/kanunal99-jpg/LANU-GURULTU-ENGELLEYICI/pull/39) — birleştirildi, CI başarılı:** Debug/unpinned APK'da OTA status/check/download/install tümüyle fail-closed; production APK'sının gerçek signer SHA-256 sertifikası yayın öncesi `apksigner` ile doğrulanır; Android 15 smoke ve kaynak regresyonları.
- **[PR #40](https://github.com/kanunal99-jpg/LANU-GURULTU-ENGELLEYICI/pull/40) — birleştirildi, CI başarılı:** Nonextractable P-256 CryptoKey'i WebView IndexedDB üzerinden ilk-yazan-kazanır biçimde kalıcı tutma arayüzü. Duplicate, eşzamanlı ilk kayıt, depolama hatası, imza doğrulama negatif testleri; Android 15 WebView smoke. Modül yalnız yüklenir; canlı kimlik akışına henüz bağlanmaz.
- **[PR #41](https://github.com/kanunal99-jpg/LANU-GURULTU-ENGELLEYICI/pull/41) — test/merge kapısı açık:** Node tabanlı güvenli kimlik broker çekirdeği: enrollment/login tek kullanımlık challenge, P-256 proof-of-possession, süreli oturum, device revoke, imzalı çağrı daveti TTL, rate limits ve anti-replay. **Servis değil, deploy edilmemiş çekirdek**; bellek üstündeki durum veri merkezinde kalıcı/durabilen güvenli depolama yerine geçmez.

### 14/15 kimlik üretim kapısı
- [ ] Güvenilir TLS backend, atomik ve kalıcı kimlik/challenge/token store, çok örnekli anti-replay/limit, loglarda kişisel veri ayıklaması, imzalı challenge ve kayıt politikası canlı çalışıyor
- [ ] PIN arkasından cihaz anahtarı gerçek enroll/login akışına bağlandı; açık anahtar fingerprint eşleştirmesi ve hesap/cihaz kaydı yetki iptali test edildi
- [ ] Backend yalnız yetkili `callId` için FCM high priority çağrı gönderiyor; TTL, iptal, kilit ekranı, bildirim red/izin yok ve Doze testleri mevcut
- [ ] İki gerçek Android farklı ağda ve Bluetooth ile güvenli ses bağlantısını sağladı; sahte caller/tekrar/timeout/revoke testleri kanıtlandı
- [ ] Push mesajında kod/PIN/rehber yok; Google servis hesabı sunucuda, APK'da yok

### 14/15 OTA üretim kapısı
- [ ] *Kullanıcının güvenli ortamında* kalıcı production keystore, bağımsız korumalı yedek, anahtar sertifika parmak izi ve GitHub Actions sınırlı kapsamlı secrets/vars kuruldu
- [ ] Public binary-only `kanunal99-jpg/LANU-LENS-OTA` oluşturuldu; yalnız imzalı APK ve doğrulanmış `latest.json` yayımlanıyor, private kaynak kod sızmadı
- [ ] Release öncesi SHA-256, Android package ID, sertifika pin, versionName/versionCode, negatif manifest/redirect/yanlış signer/sürüm testleri CI'da başarılı
- [ ] Aynı sertifikayla artan 2 release, iki gerçek Android'de **yerinde ve veri kaybı olmadan** kuruldu; eski PIN/rehber/PeerJS kodunun korunması doğrulandı
- [ ] Kurtarma/rollback ve key-loss runbook sınandı. İmzası farklı eski debug uygulaması üzerine doğrudan production kurma veya veri silerek geçiş YASAK; kullanıcı kontrollü şifreli export/restore kanıtı ön koşuldur

### Dış kuruluma ait bilgi — sırları belgeye yazma
GitHub private repo → Settings → Secrets and variables → Actions:
`LANU_RELEASE_KEYSTORE_B64`, `LANU_RELEASE_STORE_PASSWORD`, `LANU_RELEASE_KEY_ALIAS`, `LANU_RELEASE_KEY_PASSWORD`, `LANU_OTA_PUBLISH_TOKEN` **Secrets**; `LANU_RELEASE_CERT_SHA256` ve sabit `LANU_OTA_MANIFEST_URL` **Variables**. P-256 sunucu anahtarları, FCM servis hesabı, Android imzalama şifreleri ve .jks kesinlikle Git geçmişine veya sohbete yazılmaz. Dış sunucu anahtarı/cihaz test kanıtı görülmeden üretim onayı verilmez.

**Puan kapısı:** Üretim 13–14 notu yalnız bu kabul maddeleri gerçek kanıtla kapandığında geçerli; CI başarısı ve PR sayısı tek başına puan artışı değildir.
