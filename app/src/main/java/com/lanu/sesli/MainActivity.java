package com.lanu.sesli;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.pm.PackageManager;
import android.content.Intent;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.media.ToneGenerator;
import android.os.Vibrator;
import android.os.VibrationEffect;
import android.util.Base64;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import android.graphics.Color;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;
import java.util.Collections;

/** Only bundled local assets may access capture, ringtone and photo export. */
public class MainActivity extends Activity {
    private static final String TAG = "LANU";
    private static final String HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + HOST + "/assets/index.html";
    private static final int MICROPHONE = 10, BLUETOOTH = 11, CAMERA = 12, SAVE_PHOTO = 13, NOTIFY = 14,
            SAVE_BACKUP = 15, LOAD_BACKUP = 16;
    private static final int MAX_BACKUP_BYTES = 400 * 1024;
    private static final String CALL_CHANNEL = "lanu-call-v1";
    private static final String OPEN_INCOMING = "com.lanu.sesli.OPEN_INCOMING";
    private static final int INCOMING_NOTIFICATION = 2901;
    private WebView web;
    private LanuUpdater updater;
    private AudioManager audio;
    private PermissionRequest pendingMicrophone, pendingCamera;
    private Ringtone ringtone;
    private Vibrator vibrator;
    private ToneGenerator ringback;
    private boolean ringing, ringingBack, incomingAlert;
    private byte[] photoBytes, backupBytes;
    private boolean backupPicking;
    private final ExecutorService files = Executors.newSingleThreadExecutor();
    private final Runnable repeatRing = new Runnable() {
        @Override public void run() {
            if (!ringing || destroyed || !visible) return;
            try {
                if (ringtone != null && !ringtone.isPlaying()) ringtone.play();
                main.postDelayed(this, 3000);
            } catch (RuntimeException e) { ring(false); Log.w(TAG,"Ringtone playback stopped"); }
        }
    };
    private final Runnable repeatRingback = new Runnable() {
        @Override public void run() {
            if (!ringingBack || destroyed || !visible) return;
            if (ringback != null) ringback.startTone(ToneGenerator.TONE_SUP_RINGTONE, 1500);
            main.postDelayed(this, 4000);
        }
    };
    private boolean active, speaker, destroyed, visible, privateUnlocked;
    private int previousMode;
    private boolean previousSpeaker;
    private AudioFocusRequest focus;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AudioManager.OnAudioFocusChangeListener focusListener = change -> {
        if (change == AudioManager.AUDIOFOCUS_LOSS
                || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            main.post(() -> {
                if (active) {
                    pauseCall("Ses başka uygulamaya geçti; görüşme kapatıldı.");
                }
            });
        }
    };
    private final AudioDeviceCallback devices = new AudioDeviceCallback() {
        @Override public void onAudioDevicesAdded(AudioDeviceInfo[] added) { routeAudio(); }
        @Override public void onAudioDevicesRemoved(AudioDeviceInfo[] removed) { routeAudio(); }
    };

    private boolean localOrigin(Uri uri) {
        return uri != null && "https".equals(uri.getScheme())
                && HOST.equals(uri.getHost()) && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        updater = new LanuUpdater(this);
        audio = (AudioManager) getSystemService(AUDIO_SERVICE);
        setupIncomingChannel();
        if (audio != null) audio.registerAudioDeviceCallback(devices, main);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(15, 20, 25));
        // Respect status/navigation bar and IME insets on Android 15+.
        web.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        setContentView(web);
        WebSettings settings = web.getSettings();
        // No WebView debugging in *any* downloadable build, including the
        // intentionally debug-signed test APKs published to private Releases.
        WebView.setWebContentsDebuggingEnabled(false);
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setSafeBrowsingEnabled(true);
        settings.setSupportMultipleWindows(false);
        settings.setGeolocationEnabled(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        web.addJavascriptInterface(new AudioBridge(), "LanuAudio");
        web.addJavascriptInterface(new UpdateBridge(), "LanuUpdate");
        web.addJavascriptInterface(new BackupBridge(), "LanuBackup");
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap favicon) {
                // A new document must never inherit native PIN authorization
                // from an earlier page (including local asset navigations).
                privateUnlocked = false;
            }
            @Override public void onPageFinished(WebView v, String url) {
                if (HOME.equals(url)) openIncomingIfRequested();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return !localOrigin(r.getUrl()) || !r.getUrl().getPath().startsWith("/assets/");
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                if (localOrigin(r.getUrl())) {
                    // Never fall back to a remote network request for a
                    // missing bundled asset or another path on this origin.
                    if (r.getUrl().getPath().startsWith("/assets/")) {
                        WebResourceResponse asset = loader.shouldInterceptRequest(r.getUrl());
                        if (asset != null) return asset;
                    }
                    return deniedResource(404);
                }
                // Peer signaling fetch/XHR is HTTPS; scripts are bundled, enforced by CSP.
                if ("https".equals(r.getUrl().getScheme()) && "0.peerjs.com".equals(r.getUrl().getHost())) {
                    return null;
                }
                return deniedResource(403);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                main.post(() -> requestCapture(request));
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingMicrophone == request) pendingMicrophone = null;
                if (pendingCamera == request) pendingCamera = null;
            }
        });
        web.loadUrl(HOME);
    }

    private static WebResourceResponse deniedResource(int code) {
        return new WebResourceResponse("text/plain", "UTF-8", code,
                code == 404 ? "Not Found" : "Forbidden",
                Collections.singletonMap("Cache-Control", "no-store"),
                new ByteArrayInputStream(new byte[0]));
    }

    private void requestCapture(PermissionRequest request) {
        if (destroyed || !visible || !localOrigin(request.getOrigin())) { request.deny(); return; }
        String[] resources = request.getResources();
        // Camera and microphone are requested independently, only for their UI action.
        if (resources.length != 1) { request.deny(); return; }
        boolean camera = PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resources[0]);
        boolean microphone = PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resources[0]);
        if (!camera && !microphone) { request.deny(); return; }
        // Camera is available on the public-facing decoy screen, but WebRTC
        // microphone capture requires a live PIN-unlocked private session.
        if (microphone && !privateUnlocked) { request.deny(); return; }
        String permission = camera ? Manifest.permission.CAMERA : Manifest.permission.RECORD_AUDIO;
        if (checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) request.grant(resources);
        else if (pendingCamera == null && pendingMicrophone == null) {
            if(camera) pendingCamera=request; else pendingMicrophone=request;
            requestPermissions(new String[]{permission}, camera ? CAMERA : MICROPHONE);
        } else request.deny();
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == MICROPHONE || code == CAMERA) {
            PermissionRequest request = code == CAMERA ? pendingCamera : pendingMicrophone;
            if (code == CAMERA) pendingCamera=null; else pendingMicrophone=null;
            if(request != null) {
                if (!destroyed && visible && (code != MICROPHONE || privateUnlocked)
                        && results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[]{code == CAMERA ? PermissionRequest.RESOURCE_VIDEO_CAPTURE : PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                } else request.deny();
            }
        }
        if (code == BLUETOOTH) routeAudio();
        if (code == NOTIFY && incomingAlert && results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) updateIncomingAlert(true);
    }

    /** The native updater never starts a system installer from the locked camera
     * surface, background or a destroyed Activity. */
    boolean canShowUpdater() { return !destroyed && visible && privateUnlocked && web != null; }
    /** Only bundled local assets may use this JS bridge; all system UI decisions
     * additionally validate the native unlock/foreground state. */
    private final class UpdateBridge {
        @JavascriptInterface public void setPrivateUnlocked(boolean unlocked) {
            main.post(() -> { if (!destroyed) privateUnlocked = unlocked && visible; });
        }
        @JavascriptInterface public void info() { main.post(() -> { if (canShowUpdater()) updater.info(); }); }
        @JavascriptInterface public void check() { main.post(() -> { if (canShowUpdater()) updater.check(); }); }
        @JavascriptInterface public void download() { main.post(() -> { if (canShowUpdater()) updater.download(); }); }
        @JavascriptInterface public void downloadAndInstall() { main.post(() -> { if (canShowUpdater()) updater.downloadAndInstall(); }); }
        @JavascriptInterface public void install() { main.post(() -> { if (canShowUpdater()) updater.install(); }); }
        @JavascriptInterface public void releases() { main.post(() -> { if (canShowUpdater()) updater.releasePage(); }); }
    }
    void updateStatus(org.json.JSONObject data) {
        if (!canShowUpdater()) return;
        web.evaluateJavascript("window.lanuUpdateEvent && window.lanuUpdateEvent(" + data.toString() + ")", null);
    }

    /** A scoped Storage Access Framework bridge: no file paths, permissions,
     * PINs or backup passphrases pass into native storage or logs. */
    private final class BackupBridge {
        @JavascriptInterface public void exportEncrypted(String json) {
            main.post(() -> {
                if(!canShowUpdater() || backupBytes != null || backupPicking ||
                   json == null || json.length()>MAX_BACKUP_BYTES ||
                   !json.startsWith("{")) { backupResult("save",false);return; }
                try{
                    backupBytes=json.getBytes(java.nio.charset.StandardCharsets.UTF_8);
                    if(backupBytes.length>MAX_BACKUP_BYTES)throw new IllegalArgumentException("size");
                    Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT)
                            .addCategory(Intent.CATEGORY_OPENABLE).setType("application/json")
                            .putExtra(Intent.EXTRA_TITLE,"Lanu-Lens-Sifreli-Yedek-"+System.currentTimeMillis()+".json");
                    startActivityForResult(intent,SAVE_BACKUP);
                }catch(RuntimeException e){backupBytes=null;backupResult("save",false);}
            });
        }
        @JavascriptInterface public void importEncrypted() {
            main.post(() -> {
                if(destroyed || !visible || privateUnlocked || backupPicking || backupBytes!=null) {
                    backupResult("load",false);return;
                }
                try {
                    backupPicking=true;
                    Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT)
                            .addCategory(Intent.CATEGORY_OPENABLE).setType("application/json");
                    startActivityForResult(intent,LOAD_BACKUP);
                }catch(RuntimeException e){backupPicking=false;backupResult("load",false);}
            });
        }
    }
    private void backupResult(String action,boolean ok) {
        if(!destroyed && web!=null)web.evaluateJavascript(
                "window.lanuBackupResult && window.lanuBackupResult("+
                org.json.JSONObject.quote(action)+","+ok+")",null);
    }
    private void backupLoaded(String encryptedJson) {
        if(!destroyed && web!=null)web.evaluateJavascript(
                "window.lanuBackupLoaded && window.lanuBackupLoaded("+
                org.json.JSONObject.quote(encryptedJson)+")",null);
    }

    private final class AudioBridge {
        @JavascriptInterface public void hideKeyboard() {
            main.post(() -> {
                if (destroyed || web == null) return;
                InputMethodManager keyboard = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                if (keyboard != null) keyboard.hideSoftInputFromWindow(web.getWindowToken(), 0);
            });
        }
        @JavascriptInterface public void setRinging(boolean value) {
            main.post(() -> ring(value && visible && !destroyed));
        }
        @JavascriptInterface public void setIncomingNotification(boolean value) {
            main.post(() -> updateIncomingAlert(value && visible && !destroyed));
        }
        @JavascriptInterface public void requestCallNotificationPermission() {
            main.post(() -> {
                if (destroyed || !visible) return;
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, NOTIFY);
                }
            });
        }
        @JavascriptInterface public void setRingback(boolean value) {
            main.post(() -> ringBack(value && visible && !destroyed));
        }
        @JavascriptInterface public void savePhoto(String image) {
            main.post(() -> {
                if(destroyed || !visible || photoBytes != null || image == null || image.length() > 8000000 || !image.startsWith("data:image/jpeg;base64,")) { photoResult(false);return; }
                try {
                    photoBytes=Base64.decode(image.substring(23),Base64.DEFAULT);
                    if(photoBytes.length<3 || photoBytes[0]!=(byte)0xff || photoBytes[1]!=(byte)0xd8)throw new IllegalArgumentException();
                    Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("image/jpeg").addCategory(Intent.CATEGORY_OPENABLE)
                            .putExtra(Intent.EXTRA_TITLE,"Lanu-Lens-"+System.currentTimeMillis()+".jpg");
                    startActivityForResult(intent,SAVE_PHOTO);
                }catch(RuntimeException e){photoBytes=null;photoResult(false);}
            });
        }
        @JavascriptInterface public void setCallActive(boolean value) {
            main.post(() -> { if (!destroyed) setActive(value && visible); });
        }
        @JavascriptInterface public void setSpeaker(boolean value) {
            main.post(() -> { speaker = value; routeAudio(); });
        }
        @JavascriptInterface public void requestBluetooth() {
            main.post(() -> {
                if (!destroyed && visible && Build.VERSION.SDK_INT >= 31
                        && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[] { Manifest.permission.BLUETOOTH_CONNECT }, BLUETOOTH);
                } else routeAudio();
            });
        }
    }

    private void openIncomingIfRequested() {
        if (web == null || destroyed || !visible) return;
        Intent intent = getIntent();
        if (intent == null || !OPEN_INCOMING.equals(intent.getAction())) return;
        // Consume exactly once: rotate/relaunch must not re-open an old invitation.
        intent.setAction(null);
        web.evaluateJavascript("window.LanuLens && window.LanuLens.promptForIncoming && window.LanuLens.promptForIncoming()", null);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openIncomingIfRequested();
    }

    private void setupIncomingChannel() {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(CALL_CHANNEL, "Lanu Lens bildirimleri", NotificationManager.IMPORTANCE_HIGH);
        // The existing Android ringtone/vibration handles the sound while the
        // app is in foreground. A second notification sound would play twice.
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_SECRET);
        manager.createNotificationChannel(channel);
    }

    private void updateIncomingAlert(boolean value) {
        incomingAlert = value;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (!value) { manager.cancel(INCOMING_NOTIFICATION); return; }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        Intent open = new Intent(this, MainActivity.class)
                .setAction(OPEN_INCOMING)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(this, 301, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        // Intentionally never include peer code, name or private-area identity.
        // Tap goes to existing camera/PIN flow; it never answers a call.
        Notification note = new Notification.Builder(this, CALL_CHANNEL)
                .setSmallIcon(R.drawable.ic_lanu)
                .setContentTitle("Lanu Lens")
                .setContentText("Yeni etkinlik var. Açmak için dokun.")
                .setContentIntent(tap)
                .setCategory(Notification.CATEGORY_CALL)
                .setPriority(Notification.PRIORITY_HIGH)
                .setVisibility(Notification.VISIBILITY_SECRET)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .build();
        try { manager.notify(INCOMING_NOTIFICATION, note); }
        catch (SecurityException e) { Log.w(TAG, "Incoming notification permission unavailable"); }
    }

    @SuppressWarnings("deprecation")
    private void ring(boolean value) {
        if(value==ringing)return;
        ringing=value;
        if(!value) {
            main.removeCallbacks(repeatRing);
            if(ringtone!=null){ringtone.stop();ringtone=null;}
            if(vibrator!=null)vibrator.cancel();
            return;
        }
        if(audio==null)return;
        try {
            int mode=audio.getRingerMode();
            if(mode==AudioManager.RINGER_MODE_NORMAL) {
                Uri uri=RingtoneManager.getActualDefaultRingtoneUri(this,RingtoneManager.TYPE_RINGTONE);
                if(uri==null)uri=RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                ringtone=RingtoneManager.getRingtone(this,uri);
                if(ringtone!=null){
                    ringtone.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                    if(Build.VERSION.SDK_INT>=28)ringtone.setLooping(true);
                    ringtone.play();main.postDelayed(repeatRing,3000);
                }
            }
            if(mode!=AudioManager.RINGER_MODE_SILENT){
                vibrator=(Vibrator)getSystemService(VIBRATOR_SERVICE);
                if(vibrator!=null&&vibrator.hasVibrator())vibrator.vibrate(VibrationEffect.createWaveform(new long[]{0,700,700},0));
            }
        }catch(RuntimeException e){Log.w(TAG,"Ringtone unavailable; incoming controls remain visible");}
    }
    private void ringBack(boolean value) {
        if(value==ringingBack)return;ringingBack=value;
        main.removeCallbacks(repeatRingback);
        if(ringback!=null){ringback.release();ringback=null;}
        if(value)try{ringback=new ToneGenerator(AudioManager.STREAM_VOICE_CALL,60);repeatRingback.run();}
        catch(RuntimeException e){Log.w(TAG,"Ringback unavailable");}
    }
    private void photoResult(boolean ok) {
        if(web!=null&&!destroyed)web.evaluateJavascript("window.lanuPhotoSaved && window.lanuPhotoSaved("+ok+")",null);
    }
    @Override protected void onActivityResult(int code,int result,Intent data) {
        super.onActivityResult(code,result,data);
        if(code==SAVE_BACKUP){
            final byte[] bytes=backupBytes;backupBytes=null;
            if(result!=RESULT_OK || data==null || data.getData()==null || bytes==null){
                backupResult("save",false);return;
            }
            final Uri destination=data.getData();
            files.execute(()->{
                boolean saved=false;
                try {
                    // Closing the provider stream is not proof of a complete
                    // persisted copy. Reopen and verify the exact ciphertext.
                    try(OutputStream out=getContentResolver().openOutputStream(destination,"wt")){
                        if(out==null)throw new java.io.IOException("Document provider refused write");
                        out.write(bytes);
                        out.flush();
                    }
                    java.security.MessageDigest digest=java.security.MessageDigest.getInstance("SHA-256");
                    int total=0;
                    byte[] block=new byte[8192];
                    try(java.io.InputStream stream=getContentResolver().openInputStream(destination)){
                        if(stream==null)throw new java.io.IOException("Document provider refused readback");
                        int count;
                        while((count=stream.read(block))!=-1){
                            total+=count;
                            if(total>MAX_BACKUP_BYTES)throw new java.io.IOException("Unexpected backup size");
                            digest.update(block,0,count);
                        }
                    }
                    byte[] expected=java.security.MessageDigest.getInstance("SHA-256").digest(bytes);
                    saved=total==bytes.length &&
                            java.security.MessageDigest.isEqual(expected,digest.digest());
                }catch(Exception exception){
                    Log.w(TAG,"Encrypted backup could not be read back and verified");
                }finally{java.util.Arrays.fill(bytes,(byte)0);}
                final boolean verified=saved;
                main.post(()->backupResult("save",verified));
            });
            return;
        }
        if(code==LOAD_BACKUP){
            backupPicking=false;
            if(result!=RESULT_OK || data==null || data.getData()==null){
                backupResult("load",false);return;
            }
            final Uri source=data.getData();
            files.execute(()->{
                String serialized=null;
                try(java.io.InputStream stream=getContentResolver().openInputStream(source)){
                    if(stream==null)throw new IllegalStateException("Missing encrypted file");
                    java.io.ByteArrayOutputStream resultBytes=new java.io.ByteArrayOutputStream();
                    byte[] block=new byte[8192];int n;
                    while((n=stream.read(block))!=-1){
                        if(resultBytes.size()+n>MAX_BACKUP_BYTES)throw new IllegalArgumentException("Backup too large");
                        resultBytes.write(block,0,n);
                    }
                    serialized=new String(resultBytes.toByteArray(),java.nio.charset.StandardCharsets.UTF_8);
                }catch(Exception exception){Log.w(TAG,"Encrypted backup import failed");}
                final String file=serialized;
                main.post(()->{if(file!=null)backupLoaded(file);else backupResult("load",false);});
            });
            return;
        }
        if(code!=SAVE_PHOTO)return;
        final byte[] bytes=photoBytes;photoBytes=null;
        if(result!=RESULT_OK||data==null||data.getData()==null||bytes==null){photoResult(false);return;}
        final Uri destination=data.getData();
        files.execute(()->{
            boolean ok=false;
            try(OutputStream output=getContentResolver().openOutputStream(destination)){
                if(output!=null){output.write(bytes);output.flush();ok=true;}
            }catch(Exception e){Log.w(TAG,"Photo write failed");}
            final boolean saved=ok;main.post(()->photoResult(saved));
        });
    }

    @SuppressWarnings("deprecation")
    private void setActive(boolean value) {
        if (audio == null || value == active) return;
        if (value) {
            previousMode = audio.getMode();
            previousSpeaker = audio.isSpeakerphoneOn();
            focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                    .setOnAudioFocusChangeListener(focusListener, main).build();
            if (audio.requestAudioFocus(focus) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
                notifyPage("Ses kanalı kullanılamıyor; görüşmeyi yeniden deneyin.");
                focus = null;
                return;
            }
            active = true;
            audio.setMode(AudioManager.MODE_IN_COMMUNICATION);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            routeAudio();
        } else {
            active = false;
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            try {
                if (Build.VERSION.SDK_INT >= 31) audio.clearCommunicationDevice();
                else { audio.stopBluetoothSco(); audio.setBluetoothScoOn(false); }
                audio.setSpeakerphoneOn(previousSpeaker);
                audio.setMode(previousMode);
                if (focus != null) audio.abandonAudioFocusRequest(focus);
            } catch (RuntimeException e) { Log.w(TAG, "Audio cleanup failed", e); }
            focus = null;
        }
    }

    @SuppressWarnings("deprecation")
    private void routeAudio() {
        if (!active || audio == null) return;
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                AudioDeviceInfo preferred = null;
                int score = -1;
                for (AudioDeviceInfo device : audio.getAvailableCommunicationDevices()) {
                    int type = device.getType();
                    int rank = -1;
                    if (speaker) { if (type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) rank = 100; }
                    else if ((type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || type == AudioDeviceInfo.TYPE_BLE_HEADSET)
                            && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED) rank = 100;
                    else if (type == AudioDeviceInfo.TYPE_WIRED_HEADSET || type == AudioDeviceInfo.TYPE_USB_HEADSET) rank = 80;
                    else if (type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) rank = 60;
                    else if (type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) rank = 10;
                    if (rank > score) { score = rank; preferred = device; }
                }
                if (preferred != null && audio.setCommunicationDevice(preferred)) return;
                audio.clearCommunicationDevice();
                Log.w(TAG, "Requested audio route unavailable; system route retained");
            } else if (!speaker && audio.isBluetoothScoAvailableOffCall() && audio.isBluetoothA2dpOn()) {
                audio.setSpeakerphoneOn(false);
                audio.startBluetoothSco();
                audio.setBluetoothScoOn(true);
            } else {
                audio.stopBluetoothSco(); audio.setBluetoothScoOn(false); audio.setSpeakerphoneOn(speaker);
            }
        } catch (RuntimeException e) {
            Log.w(TAG, "Headset route failed; using system audio", e);
            if (Build.VERSION.SDK_INT >= 31) {
                try { audio.clearCommunicationDevice(); } catch (RuntimeException ignored) { }
            }
        }
    }

    private void notifyPage(String message) {
        if (web != null && !destroyed) web.evaluateJavascript(
                "window.lanuPause && window.lanuPause(" + org.json.JSONObject.quote(message) + ")", null);
    }
    private void pauseCall(String message) {
        ring(false); ringBack(false);
        notifyPage(message);
        setActive(false);
        if (pendingMicrophone != null) { pendingMicrophone.deny(); pendingMicrophone = null; }
    }
    @Override protected void onResume() {
        super.onResume(); visible = true;
        if (web != null) { web.onResume(); web.evaluateJavascript("window.lanuForeground && window.lanuForeground(); window.lanuResume && window.lanuResume()", null); }
        openIncomingIfRequested();
        if (updater != null) updater.resumed();
    }
    @Override protected void onStop() {
        visible = false;
        privateUnlocked = false;
        updateIncomingAlert(false);
        ring(false); ringBack(false);
        if(web!=null)web.evaluateJavascript("window.lanuBackground && window.lanuBackground()",null);
        pauseCall("Uygulama arka plana alındı; görüşme kapatıldı.");
        if(pendingCamera!=null){pendingCamera.deny();pendingCamera=null;}
        if (web != null) web.onPause();
        super.onStop();
    }
    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() {
        if(web==null){super.onBackPressed();return;}
        web.evaluateJavascript("window.lanuBack ? window.lanuBack() : false",handled->{if(!"true".equals(handled))finish();});
    }
    @Override protected void onDestroy() {
        privateUnlocked = false;
        updateIncomingAlert(false);
        ring(false); ringBack(false); setActive(false);
        files.shutdown(); photoBytes=null;backupBytes=null;backupPicking=false;
        if (updater != null) updater.close();
        destroyed = true;
        if (pendingMicrophone != null) { pendingMicrophone.deny(); pendingMicrophone = null; }
        if (pendingCamera != null) { pendingCamera.deny(); pendingCamera = null; }
        if (audio != null) audio.unregisterAudioDeviceCallback(devices);
        if (web != null) { web.removeJavascriptInterface("LanuUpdate"); web.removeJavascriptInterface("LanuBackup"); web.removeJavascriptInterface("LanuAudio"); web.destroy(); web = null; }
        main.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
