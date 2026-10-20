package com.lanu.sesli;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import androidx.core.content.FileProvider;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.net.ssl.HttpsURLConnection;

/** Secure, opt-in sideload updater. Never stores access tokens, PIN or contact data. */
final class LanuUpdater {
    private static final String TAG = "LanuUpdate";
    private static final long MAX_APK = 160L * 1024 * 1024;
    private static final int MAX_MANIFEST = 8192;
    private static final String OTA_REPO_PATH = "/kanunal99-jpg/LANU-LENS-OTA/releases/download/";
    private static final String RELEASE_PAGE =
            "https://github.com/kanunal99-jpg/LANU-GURULTU-ENGELLEYICI/releases";
    private final Activity activity;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private boolean busy, awaitingInstallPermission;
    private volatile boolean destroyed;
    private Candidate latest;
    private File verified;

    private static final class Candidate {
        final int code;
        final String version, url, sha;
        final long size;
        Candidate(int code, String version, String url, String sha, long size) {
            this.code=code;this.version=version;this.url=url;this.sha=sha;this.size=size;
        }
    }
    LanuUpdater(Activity activity) { this.activity=activity; }

    private int installedCode() {
        try {
            PackageInfo info=activity.getPackageManager().getPackageInfo(activity.getPackageName(),0);
            return Build.VERSION.SDK_INT>=28?(int)info.getLongVersionCode():info.versionCode;
        }catch(PackageManager.NameNotFoundException e){return 0;}
    }
    private String installedVersion(){
        try{return activity.getPackageManager().getPackageInfo(activity.getPackageName(),0).versionName;}
        catch(PackageManager.NameNotFoundException e){return "bilinmiyor";}
    }
    private boolean mayPromptUser() {
        return !destroyed && activity instanceof MainActivity
                && ((MainActivity) activity).canShowUpdater();
    }
    private void emit(String state, String message) {
        if (destroyed) return;
        JSONObject j=new JSONObject();
        try {
            j.put("state",state);
            j.put("message",message);
            j.put("version",installedVersion());
            j.put("versionCode",installedCode());
            j.put("configured",!BuildConfig.OTA_MANIFEST_URL.isEmpty());
            if(latest!=null)j.put("availableVersion",latest.version);
        }catch(Exception ignored){}
        if (activity instanceof MainActivity) ((MainActivity)activity).updateStatus(j);
    }
    private boolean readyForInstall() {
        return latest != null && latest.code > installedCode()
                && verified != null && verified.isFile() && verified.length() == latest.size;
    }
    private static boolean sameCandidate(Candidate a, Candidate b) {
        return a != null && b != null && a.code == b.code && a.size == b.size
                && a.sha.equals(b.sha) && a.url.equals(b.url) && a.version.equals(b.version);
    }
    void info() {
        if (readyForInstall()) emit("ready","Önceden doğrulanmış güncelleme hazır. Kurulum için onayla.");
        else emit("info","Yüklü sürüm: "+installedVersion()+" (kod "+installedCode()+")");
    }
    void check(){
        if(busy){emit("busy","Önceki işlem devam ediyor.");return;}
        // Keep previously verified APK across tab changes and the Android
        // unknown-sources permission screen, which locks the private UI.
        final Candidate previous = latest;
        final File previousApk = verified;
        String feed=BuildConfig.OTA_MANIFEST_URL;
        if(feed.isEmpty()){
            emit("not_configured","Güvenli OTA dağıtım adresi henüz kurulmadı. Özel GitHub deposundaki APK anonim indirilemez.");
            return;
        }
        if(!isFeedUrl(feed)){
            emit("error","Güncelleme adresi güvenilir HTTPS kaynağı değil.");
            return;
        }
        busy=true;emit("checking","Güncel sürüm denetleniyor…");
        io.execute(()->{
            Candidate found=null;
            String error=null;
            try {
                byte[] bytes=readSmall(feed);
                JSONObject m=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
                if(m.getInt("schema")!=1)throw new IllegalArgumentException("Bilinmeyen güncelleme manifest şeması");
                int code=m.getInt("versionCode");
                String version=m.getString("versionName"),url=m.getString("apkUrl");
                String hash=m.getString("sha256").toLowerCase(Locale.ROOT);
                long size=m.getLong("sizeBytes");
                if(code<=0||version.length()<1||version.length()>40
                    ||!version.matches("[0-9A-Za-z._+\\-]+")
                    ||!hash.matches("[0-9a-f]{64}")||size<1024||size>MAX_APK
                    ||!isApkUrl(url))throw new IllegalArgumentException("Güncelleme dosyası bilgileri geçersiz");
                found=new Candidate(code,version,url,hash,size);
            }catch(Exception e){
                Log.w(TAG,"Update metadata unavailable ("+e.getClass().getSimpleName()+")");
                error="Manifest HTTP status: 404".equals(e.getMessage())
                        ? "OTA yayın adresi henüz hazırlanmadı. Kurulum ve verilerin güvende."
                        : "Sürüm bilgisi alınamadı. Bağlantını ve yayın adresini kontrol et.";
            }
            final Candidate candidate=found;final String failure=error;
            main.post(()->{
                if(destroyed)return;
                busy=false;
                if(failure!=null) {
                    if (previousApk != null && previousApk.isFile() && previous != null
                            && previous.code > installedCode() && previousApk.length() == previous.size) {
                        latest=previous;verified=previousApk;
                        emit("ready","Ağ denetimi başarısız; önceden doğrulanmış güncelleme hâlâ hazır.");
                    } else {
                        latest=null;verified=null;emit("error",failure);
                    }
                } else {
                    latest=candidate;
                    verified=sameCandidate(previous,candidate) && previousApk!=null
                            && previousApk.isFile() && previousApk.length()==candidate.size ? previousApk : null;
                    if(candidate.code>installedCode()) {
                        if(readyForInstall())emit("ready","Güncelleme "+candidate.version+" daha önce doğrulandı; kuruluma hazır.");
                        else emit("available","Yeni sürüm bulundu: "+candidate.version+". İndirmek için onayla.");
                    } else {
                        verified=null;emit("current","Uygulaman güncel. Kurulu sürüm: "+installedVersion());
                    }
                }
            });
        });
    }
    void download(){download(false);}
    void downloadAndInstall(){download(true);}
    private void download(boolean installAfterVerification){
        if(busy){emit("busy","Önceki işlem devam ediyor.");return;}
        Candidate next=latest;
        if(next==null||next.code<=installedCode()){emit("error","Önce güncelleme denetimi yap.");return;}
        if(readyForInstall()) {
            emit("ready","Önceden doğrulanmış güncelleme hazır.");
            if(installAfterVerification)install();
            return;
        }
        busy=true;emit("downloading","Güncelleme APK'sı indiriliyor ve doğrulanıyor…");
        io.execute(()->{
            // Cache paths are bound to the target build. An interrupted
            // download of a newer build must not erase the older verified APK.
            File dest=new File(new File(activity.getCacheDir(),"updates"),"lanu-lens-"+next.code+".apk");
            File tmp=new File(dest.getParentFile(),"download-"+next.code+".tmp");
            String error=null;
            try {
                if(!dest.getParentFile().exists()&&!dest.getParentFile().mkdirs())throw new IllegalStateException("Cannot create cache");
                if(tmp.exists()&&!tmp.delete())throw new IllegalStateException("Cannot clean temp");
                MessageDigest digest=MessageDigest.getInstance("SHA-256");
                long total=0;
                int lastPercent=0;
                try(InputStream input=openApk(next.url);FileOutputStream out=new FileOutputStream(tmp)){
                    byte[] buffer=new byte[32768];int n;
                    while((n=input.read(buffer))!=-1){
                        if(Thread.currentThread().isInterrupted())throw new java.io.InterruptedIOException("Cancelled update");
                        if(total+n>MAX_APK||total+n>next.size)throw new IllegalArgumentException("Unexpected APK length");
                        digest.update(buffer,0,n);out.write(buffer,0,n);total+=n;
                        int percent=(int)((total*100)/next.size);
                        if(percent>=lastPercent+10 && percent<100){
                            lastPercent=percent;
                            final int shown=percent;
                            main.post(()->{if(!destroyed)emit("downloading","APK indiriliyor: %"+shown);});
                        }
                    }
                    out.getFD().sync();
                }
                if(total!=next.size||!MessageDigest.isEqual(hex(digest.digest()).getBytes(StandardCharsets.US_ASCII),
                        next.sha.getBytes(StandardCharsets.US_ASCII)))throw new SecurityException("APK checksum mismatch");
                validatePackage(tmp,next.code);
                if(dest.exists()&&!dest.delete())throw new IllegalStateException("Cannot replace old APK");
                if(!tmp.renameTo(dest))throw new IllegalStateException("Cannot finalize download");
            }catch(Exception e){
                Log.w(TAG,"Update verification failed ("+e.getClass().getSimpleName()+")");
                error=e instanceof SecurityException?"APK imzası veya SHA-256 doğrulanamadı. Güncelleme kurulmadı.":
                       "APK indirilemedi veya doğrulanamadı. İnternet ve dağıtım adresini kontrol et.";
                // Never delete a previously verified APK on download failure.
                tmp.delete();
            }
            final String failure=error;
            main.post(()->{
                if(destroyed)return;
                busy=false;
                if(failure!=null){verified=null;emit("error",failure);}
                else {
                    verified=dest;
                    emit("ready","APK doğrulandı. Android kurulum iznini onaylayarak güncelleyebilirsin.");
                    // A download can finish after the user locks the private
                    // screen or backgrounds the app: NEVER surface an installer.
                    if(installAfterVerification && mayPromptUser())install();
                }
            });
        });
    }
    void install(){
        if(!mayPromptUser())return; // Never launch from a locked/decoy screen.
        if(busy){emit("busy","Önceki işlem devam ediyor.");return;}
        if(!readyForInstall()){emit("error","Önce güncellemeyi indirip doğrula.");return;}
        busy=true;
        emit("verifying","Kurulumdan önce APK imzası ve SHA-256 yeniden doğrulanıyor…");
        final Candidate candidate=latest;
        final File file=verified;
        io.execute(()->{
            boolean valid=false;
            try{
                if(!matchesDigest(file,candidate.size,candidate.sha))
                    throw new SecurityException("APK changed after verification");
                validatePackage(file,candidate.code);
                valid=true;
            }catch(Exception e){
                Log.w(TAG,"Pre-install APK integrity verification failed ("+e.getClass().getSimpleName()+")");
            }
            final boolean verifiedAgain=valid;
            main.post(()->{
                if(destroyed)return;
                busy=false;
                if(!verifiedAgain || latest!=candidate || verified!=file || !readyForInstall()){
                    verified=null;
                    emit("error","Kurulumdan önce APK doğrulanamadı. Yeniden indirmen gerekiyor.");
                    return;
                }
                if (!mayPromptUser()) {
                    emit("ready","APK doğrulandı. Kuruluma devam etmek için özel alanı aç.");
                    return;
                }
                openInstallerAfterValidation();
            });
        });
    }
    private void openInstallerAfterValidation(){
        if(!mayPromptUser())return;
        if(!activity.getPackageManager().canRequestPackageInstalls()){
            awaitingInstallPermission=true;
            emit("permission","Android'de Lanu Lens için ‘Bu kaynaktan izin ver’ seçeneğini aç.");
            try{
                activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:"+activity.getPackageName())));
            }catch(ActivityNotFoundException e){emit("error","Kurulum izinleri açılamadı. Ayarlar’dan izin ver.");}
            return;
        }
        awaitingInstallPermission=false;
        try {
            Uri uri=FileProvider.getUriForFile(activity,activity.getPackageName()+".updates",verified);
            Intent installer=new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri,"application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            emit("installing","Android kurulum ekranı açılıyor. Güncelleme için onay ver.");
            activity.startActivity(installer);
        }catch(RuntimeException e){Log.w(TAG,"Android installer unavailable",e);emit("error","Android APK yükleyici açılamadı.");}
    }
    void resumed() {
        if(awaitingInstallPermission&&activity.getPackageManager().canRequestPackageInstalls()){
            awaitingInstallPermission=false;
            emit("ready","Kurulum izni verildi. ‘Güncellemeyi kur’ düğmesine dokun.");
        }
    }
    void releasePage(){
        if(!mayPromptUser())return;
        try{activity.startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(RELEASE_PAGE)));}
        catch(ActivityNotFoundException e){emit("error","Sürüm sayfası açılamadı.");}
    }
    void close(){destroyed=true;io.shutdownNow();}

    private static boolean isFeedUrl(String url){
        try{URL u=new URL(url);return "https".equals(u.getProtocol())&&u.getUserInfo()==null
          &&u.getPort()==-1&&("raw.githubusercontent.com".equals(u.getHost())
          ||"github.com".equals(u.getHost())||"updates.lanu.app".equals(u.getHost()));}
        catch(Exception ignored){return false;}
    }
    private static boolean isApkUrl(String url){
        try {
            URL u=new URL(url);
            return "https".equals(u.getProtocol())&&u.getUserInfo()==null&&u.getPort()==-1
                &&"github.com".equals(u.getHost())&&u.getPath().startsWith(OTA_REPO_PATH)
                &&u.getPath().endsWith(".apk");
        }catch(Exception ignored){return false;}
    }
    private static HttpsURLConnection connection(String url) throws Exception {
        URL u=new URL(url);HttpsURLConnection c=(HttpsURLConnection)u.openConnection();
        c.setConnectTimeout(10000);c.setReadTimeout(25000);
        c.setInstanceFollowRedirects(false);
        c.setUseCaches(false);
        c.setRequestProperty("Cache-Control","no-cache, no-store");
        c.setRequestProperty("Pragma","no-cache");
        c.setRequestProperty("Accept","application/octet-stream");
        return c;
    }
    private static byte[] readSmall(String url) throws Exception {
        HttpsURLConnection c=connection(url);
        try{
            int status=c.getResponseCode();
            if(status!=200)throw new IllegalStateException("Manifest HTTP status: "+status);
            try(InputStream in=c.getInputStream();java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream()){
                byte[] b=new byte[2048];int n;
                while((n=in.read(b))!=-1){if(out.size()+n>MAX_MANIFEST)throw new IllegalArgumentException("Manifest too big");out.write(b,0,n);}
                return out.toByteArray();
            }
        }finally{c.disconnect();}
    }
    private static InputStream openApk(String url) throws Exception {
        String next=url;
        for(int i=0;i<5;i++){
            URL u=new URL(next);
            if(!"https".equals(u.getProtocol())||u.getUserInfo()!=null)throw new SecurityException("Unsafe redirect");
            String host=u.getHost();
            if(!(("github.com".equals(host)&&u.getPath().startsWith(OTA_REPO_PATH))
                ||"release-assets.githubusercontent.com".equals(host)
                ||"objects.githubusercontent.com".equals(host)))throw new SecurityException("Invalid download host");
            HttpsURLConnection c=connection(next);
            int status=c.getResponseCode();
            if(status==200)return new java.io.FilterInputStream(c.getInputStream()){
                @Override public void close() throws java.io.IOException {try{super.close();}finally{c.disconnect();}}
            };
            String loc=c.getHeaderField("Location");c.disconnect();
            if((status!=301&&status!=302&&status!=303&&status!=307&&status!=308)||loc==null)throw new IllegalStateException("APK HTTP error");
            next=new URL(u,loc).toExternalForm();
        }
        throw new SecurityException("Too many redirects");
    }
    /** Re-reads cached bytes on every install; also exercised in Android emulator. */
    static boolean matchesDigest(File file,long expectedSize,String expectedSha) throws Exception {
        if(file==null||expectedSize<1024||expectedSize>MAX_APK
                ||expectedSha==null||!expectedSha.matches("[0-9a-f]{64}")
                ||!file.isFile()||file.length()!=expectedSize)return false;
        MessageDigest digest=MessageDigest.getInstance("SHA-256");
        long total=0;
        try(InputStream input=new java.io.FileInputStream(file)){
            byte[] buffer=new byte[32768];int n;
            while((n=input.read(buffer))!=-1){
                total+=n;
                if(total>expectedSize)return false;
                digest.update(buffer,0,n);
            }
        }
        return total==expectedSize && MessageDigest.isEqual(
                hex(digest.digest()).getBytes(StandardCharsets.US_ASCII),
                expectedSha.getBytes(StandardCharsets.US_ASCII));
    }

    private static String hex(byte[] b){
        char[] out=new char[b.length*2], alphabet="0123456789abcdef".toCharArray();
        for(int i=0;i<b.length;i++){out[i*2]=alphabet[(b[i]&255)>>>4];out[i*2+1]=alphabet[b[i]&15];}
        return new String(out);
    }
    @SuppressWarnings("deprecation")
    private void validatePackage(File apk,int wantedCode) throws Exception {
        PackageManager pm=activity.getPackageManager();
        int flags=Build.VERSION.SDK_INT>=28
                ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo archive=pm.getPackageArchiveInfo(apk.getAbsolutePath(),flags);
        PackageInfo current=pm.getPackageInfo(activity.getPackageName(),flags);
        if(archive==null||!activity.getPackageName().equals(archive.packageName))
            throw new SecurityException("Package identity invalid");
        Signature[] proposed;
        Signature[] existing;
        if(Build.VERSION.SDK_INT>=28){
            proposed=archive.signingInfo==null?null:archive.signingInfo.getApkContentsSigners();
            existing=current.signingInfo==null?null:current.signingInfo.getApkContentsSigners();
        }else{
            proposed=archive.signatures;existing=current.signatures;
        }
        if(proposed==null||existing==null||proposed.length==0
                ||proposed.length!=existing.length)throw new SecurityException("Package signing info unavailable");
        int code=Build.VERSION.SDK_INT>=28?(int)archive.getLongVersionCode():archive.versionCode;
        if(code!=wantedCode||code<=installedCode())throw new SecurityException("Unexpected version");
        // Exact current signer equality is deliberately stricter than a
        // historical certificate chain: never accept an unexpected key swap.
        for(Signature sig:proposed){
            boolean match=false;
            for(Signature currentSigner:existing)
                if(Arrays.equals(sig.toByteArray(),currentSigner.toByteArray())){match=true;break;}
            if(!match)throw new SecurityException("APK signing certificate changed");
        }
    }
}
