# Lanu Lens 2.0.1 — gizli giriş düzeltmesi

- Ortadaki büyük objektif amblemi de giriş hareketine bağlandı; üstteki küçük amblem çalışmaya devam eder.
- Her iki amblemde üç saniye basılı tutma PIN ekranını açar. PIN doğrulaması atlanmaz.
- Android/WebView dokunma ve uyumluluk pointer olayları birbirinin sayacını bozmaz. Küçük parmak hareketi tolere edilir; kaydırma, gerçek iptal, çoklu dokunma ve arka plan hareketi güvenli biçimde iptal eder.
- Kilitleme sonrası kamera ekranı başa döner; ilk ekranda özel alana ilişkin yazı veya giriş ipucu yoktur.
- Regresyon testleri ve gerçek Android Instrumentation MotionEvent ile iki amblemden giriş testleri eklendi. DOM-dispatched olaylar tek başına dokunma kanıtı sayılmaz.

Debug imzalı test APK'sıdır. Önceki CI imzası farklıysa Android mevcut kurulumun üzerine yüklemeyi reddedebilir. Kaldırmak yerel PIN/rehber/kod verilerini siler; veriler önemliyse eski kurulumu kaldırmadan önce bu sınır değerlendirilmelidir. Fiziksel telefonda giriş/zil/ses testi ayrıca gereklidir. Arka plan/kapalı uygulamaya çağrı ve TURN aktarma bu sürüme eklenmemiştir.
