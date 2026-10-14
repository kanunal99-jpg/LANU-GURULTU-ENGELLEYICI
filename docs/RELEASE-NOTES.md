LANU Sesli 1.1.0 — Android 8.0+ için debug imzalı test APK.

- Altı haneli kodla iki uygulama arasında internet üzerinden sesli görüşme.
- Gürültü azaltma, yankı önleme, otomatik dengeleme, mikrofon kapatma, Bluetooth/hoparlör yönlendirmesi.
- İptal/izin yarışı, çift arama, kapanış döngüsü, bekleyen gelen arama, ağ kesintisi ve sınırlı yeniden bağlantı düzeltmeleri.
- APK içine paketlenmiş PeerJS; köken ve kaynak bazlı mikrofon izni, harici gezinme engeli.
- Yayın öncesi JS regresyon testleri, Android lint/derleme ve Android 35 emülatör WebView smoke testi; imza ve SHA-256 kontrolü.

Sınırlar: Normal telefon/WhatsApp aramalarını filtrelemez. Her iki tarafta LANU açık olmalıdır. Arka plana geçince görüşme kapanır. TURN sunucusu yoktur; bazı mobil/kurumsal ağlarda bağlanamayabilir. Filtre etkisi WebView ve cihaza bağlıdır. Gerçek iki telefon/Bluetooth/gürültülü ortam testi bu otomatik kontrollerin kapsamı dışındadır. Bu sürüm kalıcı üretim imzası taşımaz; imza değişirse eski kurulumu kaldırmak gerekebilir.

Repo özeldir. APK'ya erişim için yetkili GitHub hesabıyla giriş gerekir. APK ve SHA256SUMS.txt bu sürüme eklenmiştir.
