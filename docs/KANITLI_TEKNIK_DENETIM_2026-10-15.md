# LANU-GURULTU-ENGELLEYICI — KANITLI TEKNİK DENETİM

**Tarih:** 15.10.2026  
**Kapsam:** GitHub dosya ağacı, seçili kaynak kodu, CI logları, Releases. Gerçek cihaz ve dış servislerin tam E2E testi yapılmadı.  
**Dosya sayısı (denetim anında):** 26  
**CI gözlemi:** 14.10.2026 Android APK derleme ve doğrulama başarılı; v1.1.0-build12 Release APK/SHA var.  
**Anayasa:** [PROJE_ANAYASASI_VE_DUZELTILECEKLER.md](https://github.com/kanunal99-jpg/LANU-GURULTU-ENGELLEYICI/blob/main/PROJE_ANAYASASI_VE_DUZELTILECEKLER.md)

## Kanıtlarla Düzeltilmesi Gerekenler

### 1. Telefonun normal GSM aramasına değil uygulama içi PeerJS görüşmesine katılır — P1 (İŞLEVSEL KAPSAM / KANIT)
- **Kanıt:** [app/src/main/assets/app.js#L151-L171](https://github.com/kanunal99-jpg/LANU-GURULTU-ENGELLEYICI/blob/main/app/src/main/assets/app.js#L151-L171); [CI koşusu](https://github.com/kanunal99-jpg/LANU-GURULTU-ENGELLEYICI/actions/runs/38623203740)
- **Gözlem:** dial() çağrısı peer.call(...) üzerinden uygulama içi ses bağlantısı başlatıyor; telefon dialer araması değildir.
- **Somut örnek / etkisi:** Normal telefon görüşmesindeki karşı tarafın sesi otomatik temizlenecek sanılmamalı.
- **Düzeltme kabul testi:** Ürün metninde uygulama içi internet görüşmesi net; iki cihaz PeerJS bağlantısı ile doğrulama.
- **Durum:** ARAŞTIRILDI, DÜZELTME HENÜZ BAŞLAMADI.

### 2. Çağrı durumu ve yeniden bağlantı mantığı bulunuyor — P2 (AĞ GÜVENLİĞİ / DAYANIKLILIK)
- **Kanıt:** [app/src/main/assets/app.js#L120-L194](https://github.com/kanunal99-jpg/LANU-GURULTU-ENGELLEYICI/blob/main/app/src/main/assets/app.js#L120-L194); [CI koşusu](https://github.com/kanunal99-jpg/LANU-GURULTU-ENGELLEYICI/actions/runs/38623203740)
- **Gözlem:** ICE failed durumları, bağlantı deadline ve internet yeniden bağlanma davranışı kodda mevcut.
- **Somut örnek / etkisi:** Peer sunucusu kapalıysa uygulama sahte 'connected' göstermemeli.
- **Düzeltme kabul testi:** Peer sunucusu yok, geç gelen arama, NAT, 4G↔Wi-Fi, uygulama arka planı ve çağrı sonlandırma testleri.
- **Durum:** ARAŞTIRILDI, DÜZELTME HENÜZ BAŞLAMADI.

### 3. Android WebView audio route ve mikrofon izinleri kritik — P2 (SESLİ CİHAZ TESTİ)
- **Kanıt:** [app/src/main/java/com/lanu/sesli/MainActivity.java#L154-L225](https://github.com/kanunal99-jpg/LANU-GURULTU-ENGELLEYICI/blob/main/app/src/main/java/com/lanu/sesli/MainActivity.java#L154-L225); [CI koşusu](https://github.com/kanunal99-jpg/LANU-GURULTU-ENGELLEYICI/actions/runs/38623203740)
- **Gözlem:** AudioManager iletişim cihazı route ve ses odağı kullanılıyor; bazı kulaklıklarda fallback sistem yönlendirmesi.
- **Somut örnek / etkisi:** Tek sağ veya sol kulaklık, telefon mikrofonu ve Bluetooth SCO testleri gerekir.
- **Düzeltme kabul testi:** Gerçek cihaz/test ekipmanı ile sesin her iki tarafta ulaştığı, route davranışı, geri besleme, izin ve ses seviyesi raporu.
- **Durum:** ARAŞTIRILDI, DÜZELTME HENÜZ BAŞLAMADI.

### 4. Call-lifecycle ve WebRTC smoke dosyaları var — P2 (MEVCUT TESTLER)
- **Kanıt:** [tests/webrtc-smoke.cjs](https://github.com/kanunal99-jpg/LANU-GURULTU-ENGELLEYICI/blob/main/tests/webrtc-smoke.cjs); [CI koşusu](https://github.com/kanunal99-jpg/LANU-GURULTU-ENGELLEYICI/actions/runs/38623203740)
- **Gözlem:** JS test ve Android instrumentation kaynakları bulunuyor, son build yeşil.
- **Somut örnek / etkisi:** Unit testlerin başarılı olması gerçek iki cihazdan ses doğrulaması değildir.
- **Düzeltme kabul testi:** İki telefon ve farklı ağ üzerinde ses alma/gönderme, yeniden bağlanma, fail-safe testi ve Release sürüm eşleme.
- **Durum:** ARAŞTIRILDI, DÜZELTME HENÜZ BAŞLAMADI.

## Zorunlu 4 Faz
1. Araştır/Envanter: kapsam, kanıt ve etki; bu rapor başlangıç seviyesinde seçili dosya/CI incelemesidir.
2. Kök neden ve düzeltme: P0/P1 önce; en küçük geri alınabilir kod değişimi; gizli veriyi koru; ücret için onay al.
3. Build + test: lint, unit/integrasyon/UI/E2E, offline/kesinti/fallback, gerekirse gerçek cihaz.
4. Doğrula ve yayınla: tüm testler yeşil; Android APK Releases altında SHA-256 ile doğrudan indirilebilir; smoke ve bağlantı doğrulaması.

**Bulgu kapatma:** Kod satırı + kök neden + düzeltme commit'i + test + CI + sürüm/ürün smoke kanıtı olmadan hiçbir madde bitmiş sayılmaz.
