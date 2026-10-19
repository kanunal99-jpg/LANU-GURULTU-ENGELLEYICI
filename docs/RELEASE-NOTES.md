# Lanu Lens 2.0.3 — Android gelen çağrı bildirimi (deneysel)

- Gelen çağrı sırasında yerel Android yüksek öncelikli bildirim, sistem zil sesi ve titreşim kullanılır. Bildirime dokunulduğunda PIN ekranı açılır; kilit atlanmaz.
- Android 13+ bildirim izni, özel alanda açıkça istenebilir. İzin verilmezse arka plan dinleme devreye girmez.
- Özel alan ayarında **Arka planda çağrı dinle** seçeneği eklendi. Kullanıcı açtığında ekranda sürekli ve gizli içerikli Android foreground-service bildirimi gösterilir.
- Kullanıcı dinlemeyi seçerse uygulama arka plana geçtiğinde özel alan kilitlenir, etkin görüşme/mikrofon kapanır; uygulama işlemi ve WebView ayakta olduğu müddetçe yeni PeerJS çağrı teklifleri için sinyalleşme açık tutulmaya çalışılır.
- Bildirimlerde görüşme kodu, kişi adı veya özel alan bilgisi gösterilmez; Android kilit ekranında içerik saklanır.
- Uygulama tamamen kapatılırsa, işletim sistemi WebView'ı durdurursa, uygulama force-stop edilirse veya ağ koparsa **çağrı teslimi garanti değildir**. Bu sürüm FCM/push veya sunucudan yeniden çağrı kurma içermez.
- Kalıcı 6 haneli kod, PIN ve şifreli rehber gibi önceki güvenlik önlemleri korunur.

**Sınır:** Bu, gerçek WhatsApp benzeri her koşulda çalışan kapalı-uygulama çağrısı değildir. Bunun için FCM/push ve güvenilir sunucu tarafı davet/oturum yönetimi gerekir. Ücretli altyapı kurulmadı.

Debug test APK'sıdır. Önceki CI imzası farklıysa eski kurulumu silmek yerel PIN/rehber/kod verilerinin kaybına yol açabilir. İki fiziksel Android cihazda gerçek gelen çağrı, pil optimizasyonu, Bluetooth, ekran kilidi ve farklı ağlar henüz doğrulanmamıştır.
