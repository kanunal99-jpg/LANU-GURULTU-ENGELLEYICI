# Lanu Lens 2.0.3 — güvenli gelen çağrı bildirimi (ilk aşama)

- **Uygulama açıkken** gelen WebRTC görüşmelerinde Android sistem bildirimi eklenmiştir. Dokunmak uygulamayı açar, PIN kilidini atlamaz; mikrofonu açmaz veya çağrıyı otomatik cevaplamaz.
- Bildirim başlığında yalnızca **Lanu Lens**, açıklamada nötr **Yeni etkinlik var. Açmak için dokun.** ifadesi görünür. Görüşme kodu, kişi adı veya gizli alana ilişkin ipucu gösterilmez.
- Bildirim Android kilit ekranında `VISIBILITY_SECRET` ile gizlenir. Android 13+ için bildirim izni, yalnızca özel alanın ayarlarından kullanıcı isteğiyle alınır.
- Mevcut zil/titreşim işlevi korunmuştur; bildirim kanalında ikinci kez ses çalınmaz. Ret, yanıt, çağrı iptali, zaman aşımı veya arka plana geçişte bildirim temizlenir.
- **Önemli:** Uygulama kapalıyken/arka plandayken bağımsız çağrı alımı henüz desteklenmez. Bunun için yetkili kimlik/kod eşleştirmesi olan arka uç + FCM yüksek öncelikli push + Android çağrı teslim/zaman aşımı akışı gereklidir. Sadece bildirim ekranı ekleyerek arka planda arama geliyormuş gibi davranılmaz.
- Kişisel PIN, AES-GCM rehber, kalıcı kullanıcı kodu, kamera ve WebRTC ses akışı davranışı korunmuştur.

Debug imzalı test APK'sıdır. Önceki debug sürümüyle imza uyuşmazlığı yerel verilerin kaybı olmadan güncellemeyi engelleyebilir. Gerçek iki Android cihazda bildirim, zil, ağ geçişi ve Bluetooth testleri ayrıca yapılmalıdır.
