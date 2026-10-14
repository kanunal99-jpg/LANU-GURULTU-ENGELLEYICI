package com.lanu.sesli;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.pm.PackageManager;
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
import android.webkit.JavascriptInterface;
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

/** Only bundled, trusted assets may run script or use the microphone bridge. */
public class MainActivity extends Activity {
    private static final String TAG = "LANU";
    private static final String HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + HOST + "/assets/index.html";
    private static final int MICROPHONE = 10, BLUETOOTH = 11;
    private WebView web;
    private AudioManager audio;
    private PermissionRequest pendingMicrophone;
    private boolean active, speaker, destroyed, visible;
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
        audio = (AudioManager) getSystemService(AUDIO_SERVICE);
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
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        web.addJavascriptInterface(new AudioBridge(), "LanuAudio");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return !localOrigin(r.getUrl()) || !r.getUrl().getPath().startsWith("/assets/");
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                if (localOrigin(r.getUrl())) return loader.shouldInterceptRequest(r.getUrl());
                // Peer signaling fetch/XHR is HTTPS; scripts are bundled, enforced by CSP.
                if ("https".equals(r.getUrl().getScheme()) && "0.peerjs.com".equals(r.getUrl().getHost())) {
                    return null;
                }
                return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden",
                        Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                main.post(() -> requestMicrophone(request));
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingMicrophone == request) pendingMicrophone = null;
            }
        });
        web.loadUrl(HOME);
    }

    private void requestMicrophone(PermissionRequest request) {
        if (destroyed || !visible || !localOrigin(request.getOrigin())) { request.deny(); return; }
        boolean asksAudio = false;
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) asksAudio = true;
        }
        if (!asksAudio) { request.deny(); return; }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE });
        } else if (pendingMicrophone == null) {
            pendingMicrophone = request;
            requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, MICROPHONE);
        } else request.deny();
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == MICROPHONE && pendingMicrophone != null) {
            PermissionRequest request = pendingMicrophone;
            pendingMicrophone = null;
            if (!destroyed && visible && results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
                request.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE });
            } else request.deny();
        }
        if (code == BLUETOOTH) routeAudio();
    }

    private final class AudioBridge {
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
        notifyPage(message);
        setActive(false);
        if (pendingMicrophone != null) { pendingMicrophone.deny(); pendingMicrophone = null; }
    }
    @Override protected void onResume() {
        super.onResume(); visible = true;
        if (web != null) { web.onResume(); web.evaluateJavascript("window.lanuResume && window.lanuResume()", null); }
    }
    @Override protected void onStop() {
        visible = false;
        pauseCall("Uygulama arka plana alındı; görüşme kapatıldı.");
        if (web != null) web.onPause();
        super.onStop();
    }
    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() {
        if (!active) { super.onBackPressed(); return; }
        new AlertDialog.Builder(this).setMessage("Görüşmeyi kapatıp uygulamadan çıkılsın mı?")
                .setNegativeButton("Vazgeç", null).setPositiveButton("Çık", (dialog, which) -> finish()).show();
    }
    @Override protected void onDestroy() {
        setActive(false);
        destroyed = true;
        if (pendingMicrophone != null) { pendingMicrophone.deny(); pendingMicrophone = null; }
        if (audio != null) audio.unregisterAudioDeviceCallback(devices);
        if (web != null) { web.removeJavascriptInterface("LanuAudio"); web.destroy(); web = null; }
        main.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
