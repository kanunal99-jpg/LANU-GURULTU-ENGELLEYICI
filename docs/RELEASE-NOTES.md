# Lanu Lens 2.0.2 — kalıcı görüşme kodu

- **Görüşme kodu artık bağlantı çakışması nedeniyle otomatik değiştirilmez.** Başka açık oturum kodu kullanıyorsa mevcut kod korunur; hata gösterilir ve diğer oturum kapatıldıktan sonra aynı kodla yeniden bağlanılabilir.
- İlk açılışta oluşturulan kod, internet bağlantısı olmadan da yerel depolamaya kaydedilir.
- Kullanıcı, yalnızca PIN ile açılan özel alanda Güvenlik bölümünden ve ikinci bir onay vererek görüşme kodunu değiştirebilir.
- Yeni kod kaydedilemezse eskisi korunur. Aktif görüşme sürerken veya alan kilitliyken kod değişimine izin verilmez.
- PIN, kamera giriş hareketi, rehber ve çağrı zili bir önceki sürümden korunmuştur.
- Kod değişimi diğer kullanıcıların rehberlerini otomatik güncellemez; yeni kod karşı tarafla paylaşılmalıdır. Altı haneli kod, uçtan uca kimlik doğrulaması değildir.
- İlk kamera ekranında gizli alana ilişkin açıklama veya düğme yer almaz.

Bu bir **debug imzalı test APK'sıdır**. Eski test APK'sının imzası farklı olabilir. APK kurmak için mevcut uygulamayı kaldırmak yerel PIN/rehber/kod verilerinin kaybına yol açabilir; önemli veriler varsa kaldırmadan önce bu sınır değerlendirilmelidir.

Uygulama kapalı/arka plandayken çağrı alma, TURN sunucusu ve gerçek iki fiziksel telefonla farklı ağlarda mikrofon, hoparlör, Bluetooth testleri bu sürümün doğrulanmış özellikleri değildir.
