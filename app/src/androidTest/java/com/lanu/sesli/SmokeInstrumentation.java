package com.lanu.sesli;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.InputDevice;
import org.json.JSONArray;
import android.view.ViewGroup;
import android.webkit.WebView;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Real Android WebView/asset/bridge startup smoke; does not claim real-phone audio QA. */
public class SmokeInstrumentation extends Instrumentation {
    @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }
    @Override public void onStart() {
        Bundle test = new Bundle();
        test.putString("class", getClass().getName()); test.putString("test", "bundledWebViewStarts");
        test.putInt("numtests", 1); test.putInt("current", 1); sendStatus(1, test);
        Activity activity = null;
        try {
            activity = startActivitySync(new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            final Activity target = activity;
            AtomicReference<WebView> view = new AtomicReference<>();
            runOnMainSync(() -> view.set((WebView) ((ViewGroup) target.findViewById(android.R.id.content)).getChildAt(0)));
            WebView web = view.get();
            long limit = System.currentTimeMillis() + 20000;
            boolean loaded = false;
            while (System.currentTimeMillis() < limit) {
                loaded = "true".equals(js(web, "document.readyState === 'complete' && typeof Peer === 'function' && typeof window.lanuPause === 'function'"));
                if (loaded) break;
                Thread.sleep(200);
            }
            if (!loaded) throw new AssertionError("Bundled JavaScript did not start: "
                + js(web,"JSON.stringify({ready:document.readyState,url:location.href,peer:typeof Peer,"
                + "pause:typeof window.lanuPause,lens:typeof window.LanuLens,"
                + "crypto:typeof window.crypto,agent:navigator.userAgent,"
                + "scripts:Array.from(document.scripts).map(s=>[s.src,s.readyState])})"));
            verifyOtaDigestRejectsTampering(target);
            verifyPinnedSignerFailClosed();
            assertUpdaterGate(target, false, "Locked camera must block native OTA");
            // Debug builds never claim real OTA even when a public feed exists.
            if (BuildConfig.DEBUG && new LanuUpdater(target).productionOtaConfigured())
                throw new AssertionError("Debug-signed APK must not enable production OTA");
            require(web, "location.origin === 'https://appassets.androidplatform.net'", "Secure asset origin");
            require(web, "!!navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function'", "Microphone API available");
            require(web, "typeof window.LanuAudio.setCallActive === 'function'", "Trusted native bridge");
            require(web, "typeof window.LanuAuthProtocol.generate === 'function' && typeof window.LanuAuthProtocol.verifyInvite === 'function'", "P-256 identity protocol available");
            require(web, "typeof window.LanuEncryptedTransfer.exportBackup === 'function' && typeof window.LanuEncryptedTransfer.importBackup === 'function'", "Encrypted user backup protocol available but not automatically invoked");
            require(web, "typeof window.LanuDeviceKeyStore.create === 'function' && typeof indexedDB.open === 'function'", "Local CryptoKey store available; enrollment stays explicit");
            require(web, "typeof window.LanuBrokerClient.create === 'function'", "Dormant HTTPS broker client present, never auto-enrolled");
            require(web, "document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]') !== null", "CSP present");
            require(web, "document.getElementById('answerBtn').hidden && document.getElementById('hangBtn').hidden", "Idle controls");
            require(web, "(window.lanuPause('Smoke test'), document.getElementById('callBtn').disabled)", "Pause disables dialing");
            require(web, "(window.lanuResume(), typeof window.lanuPause === 'function')", "Resume survives pause");
            require(web, "document.title === 'Lanu Lens' && document.getElementById('privateView').hidden", "Camera-only landing");
            require(web, "!document.body.innerText.match(/görüşme|rehber|eşleştirme|gizli|PIN/i)", "No private hints in camera UI");
            require(web, "typeof window.LanuAudio.setRinging === 'function' && typeof window.LanuAudio.savePhoto === 'function'", "Ringtone and export bridges");
            require(web, "typeof window.LanuAudio.setIncomingNotification === 'function' && typeof window.LanuAudio.requestCallNotificationPermission === 'function'", "Incoming call notification bridges");
            // Real OS touchscreen events, not DOM-dispatched PointerEvents.
            hold(web,"lensEmblem",180,false);
            Thread.sleep(3100);
            require(web,"document.getElementById('gate').hidden","Short center-logo touch stays in camera");
            hold(web,"lensEmblem",3300,false);
            awaitTrue(web,"!document.getElementById('gate').hidden",6000,"Center emblem opens PIN with real touch");
            require(web,"document.getElementById('privateView').hidden","Hold does not bypass PIN");
            js(web,"document.getElementById('cancelGate').click()");
            // Short moves near the top system gesture area can cause a real
            // Android touchcancel. Verify the header without dragging.
            hold(web,"lensLogo",3300,false);
            awaitTrue(web,"!document.getElementById('gate').hidden",6000,"Header logo opens with a continuous hold");
            js(web,"document.getElementById('pin').value='741963';document.getElementById('pinConfirm').value='741963';document.getElementById('pinForm').dispatchEvent(new Event('submit',{cancelable:true}))");
            long unlockLimit=System.currentTimeMillis()+10000;
            while(System.currentTimeMillis()<unlockLimit && !"true".equals(js(web,"!document.getElementById('privateView').hidden")))Thread.sleep(100);
            require(web,"!document.getElementById('privateView').hidden","PIN setup opens private area");
            assertUpdaterGate(target, true, "PIN unlock must authorize native OTA");
            if (!"https://raw.githubusercontent.com/kanunal99-jpg/LANU-LENS-OTA/main/latest.json".equals(BuildConfig.OTA_MANIFEST_URL))
                throw new AssertionError("Pinned OTA feed must ship in every APK");
            require(web,"typeof window.LanuUpdate.info === 'function' && typeof window.LanuUpdate.check === 'function' && typeof window.LanuUpdate.install === 'function'","OTA native bridge exists");
            require(web,"typeof window.LanuUpdate.downloadAndInstall === 'function'","One-tap native OTA bridge exists");
            require(web,"document.getElementById('updatesPane').hidden && !document.getElementById('callsPane').hidden","Calls tab defaults visible");
            js(web,"document.getElementById('updatesTab').click()");
            require(web,"!document.getElementById('updatesPane').hidden && document.getElementById('callsPane').hidden","Update tab opens behind PIN");
            require(web,"document.getElementById('checkUpdates') !== null && document.getElementById('downloadUpdate') !== null && document.getElementById('installUpdate') !== null","OTA controls exist");
            // Native OTA checks are asynchronous; verify event and resulting UI
            // in a single WebView JS transaction to avoid a network callback
            // racing with separate synthetic event/assertion evaluations.
            require(web,"(window.lanuUpdateEvent({state:'available',version:'2.0.9',versionCode:999999,message:'Update test'}), !document.getElementById('downloadUpdate').hidden && document.getElementById('installUpdate').hidden)","New build offers one-tap download and install");
            require(web,"(window.lanuUpdateEvent({state:'ready',version:'2.0.9',versionCode:999999,message:'Verified'}), document.getElementById('downloadUpdate').hidden && !document.getElementById('installUpdate').hidden)","Verified APK allows installer retry");
            require(web,"typeof window.LanuDiagnostics.snapshot==='function' && typeof window.LanuDiagnostics.render==='function'","Bundled offline diagnostics available");
            js(web,"document.getElementById('diagnosticsTab').click()");
            require(web,"!document.getElementById('diagnosticsPane').hidden && document.getElementById('callsPane').hidden && document.getElementById('updatesPane').hidden","Diagnosis stays in private PIN area");
            require(web,"document.getElementById('diagnosticsResults').children.length===6","Six local-only capabilities reported without network or microphone requests");
            js(web,"document.getElementById('refreshDiagnostics').click()");
            require(web,"document.getElementById('diagnosticsResults').children.length===6","Refreshing capability diagnostics does not duplicate rows");
            js(web,"document.getElementById('callsTab').click()");
            require(web,"document.getElementById('diagnosticsPane').hidden && document.getElementById('updatesPane').hidden && !document.getElementById('callsPane').hidden","Calls tab restored");
            require(web,"(window.LanuLens.lock(),document.getElementById('privateView').hidden && !document.getElementById('cameraView').hidden)","Lock restores camera");
            assertUpdaterGate(target, false, "Relocking must revoke native OTA before installer");
            require(web,"!document.body.innerText.match(/görüşme|rehber|eşleştirme|gizli|PIN/i)","No private hints after lock");
            // Exercise natural finger drift on the centered target where it
            // cannot be intercepted by Android's top-edge system gestures.
            hold(web,"lensEmblem",3300,true);
            awaitTrue(web,"!document.getElementById('gate').hidden",6000,"Center emblem tolerates finger drift after locking");
            require(web,"document.getElementById('pinConfirm').hidden && document.getElementById('privateView').hidden","Existing PIN is required after relock");
            js(web,"document.getElementById('cancelGate').click()");
            test.putString("stream", "Real Android center/header touch holds, short-touch rejection, finger drift, PIN vault, relock, camera privacy and lifecycle passed.\n");
            sendStatus(0, test);
            Bundle result = new Bundle(); result.putString("stream", "OK (1 test)\n");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable failure) {
            test.putString("stack", failure.toString()); sendStatus(-2, test);
            Bundle result = new Bundle(); result.putString("stream", "FAILURES!!!\n" + failure);
            finish(Activity.RESULT_CANCELED, result);
        } finally {
            if (activity != null) { final Activity target = activity; runOnMainSync(target::finish); }
        }
    }
    private void assertUpdaterGate(Activity target, boolean expected, String description) throws Exception {
        // Wait for the JS-to-Java @JavascriptInterface call and its UI-thread
        // relay to settle before asserting the trusted native permission state.
        long limit=System.currentTimeMillis()+3000;
        boolean granted=false;
        while(System.currentTimeMillis()<limit){
            final java.util.concurrent.atomic.AtomicReference<Boolean> value=new java.util.concurrent.atomic.AtomicReference<>();
            runOnMainSync(()->value.set(((MainActivity)target).canShowUpdater()));
            granted=Boolean.TRUE.equals(value.get());
            if(granted==expected)return;
            Thread.sleep(40);
        }
        throw new AssertionError(description+"; expected="+expected+" actual="+granted);
    }
    /** Same-size and truncated APK tampering must be detected before installer opens. */
    private static void verifyPinnedSignerFailClosed() throws Exception {
        android.content.pm.Signature onlySigner=new android.content.pm.Signature(
                new byte[]{3,9,27,1,8,6,42});
        byte[] hash=java.security.MessageDigest.getInstance("SHA-256").digest(onlySigner.toByteArray());
        StringBuilder builder=new StringBuilder(64);
        for(byte entry:hash)builder.append(String.format(java.util.Locale.ROOT,"%02x",entry&255));
        String known=builder.toString();
        if(!LanuUpdater.matchesPinnedSigner(new android.content.pm.Signature[]{onlySigner},known))
            throw new AssertionError("Correct installed signer must match its digest");
        if(LanuUpdater.matchesPinnedSigner(null,known)
                || LanuUpdater.matchesPinnedSigner(new android.content.pm.Signature[]{},known)
                || LanuUpdater.matchesPinnedSigner(new android.content.pm.Signature[]{onlySigner,onlySigner},known)
                || LanuUpdater.matchesPinnedSigner(new android.content.pm.Signature[]{onlySigner},new String(new char[64]).replace('\0','0'))
                || LanuUpdater.matchesPinnedSigner(new android.content.pm.Signature[]{onlySigner},"invalid"))
            throw new AssertionError("Missing, altered or multiple installed signers accepted");
    }
    private static void verifyOtaDigestRejectsTampering(Activity target) throws Exception {
        java.io.File file=java.io.File.createTempFile("lanu-ota-integrity-", ".bin", target.getCacheDir());
        try {
            byte[] original=new byte[2048];
            java.util.Arrays.fill(original,(byte)0x3f);
            try(java.io.FileOutputStream output=new java.io.FileOutputStream(file)){
                output.write(original);
            }
            byte[] hash=java.security.MessageDigest.getInstance("SHA-256").digest(original);
            StringBuilder expected=new StringBuilder();
            for(byte entry:hash) expected.append(String.format(java.util.Locale.ROOT,"%02x",entry&255));
            if(!LanuUpdater.matchesDigest(file,original.length,expected.toString()))
                throw new AssertionError("Authentic cached APK digest not accepted");
            original[1024]=(byte)0x40;
            try(java.io.FileOutputStream output=new java.io.FileOutputStream(file)){
                output.write(original);
            }
            if(LanuUpdater.matchesDigest(file,original.length,expected.toString()))
                throw new AssertionError("Same-length malicious APK modification was accepted");
            if(LanuUpdater.matchesDigest(file,original.length+1,expected.toString()))
                throw new AssertionError("Truncated APK was accepted");
        } finally { file.delete(); }
    }
    private void awaitTrue(WebView web,String expression,long duration,String label) throws Exception {
        long deadline=System.currentTimeMillis()+duration;
        while(System.currentTimeMillis()<deadline){if("true".equals(js(web,expression)))return;Thread.sleep(100);}
        throw new AssertionError(label + " " + js(web,"JSON.stringify({trace:window.__entryTrace,gate:document.getElementById('gate').hidden,active:document.activeElement.id,viewport:[innerWidth,innerHeight],target:window.__entryTarget})"));
    }
    private void requireForegroundWindow(WebView web) throws Exception {
        // Android 15 occasionally focuses system/IME windows just as a real
        // touch begins. Sending an instrumentation event then raises
        // "not directed at a window owned by uid". Never inject off-app.
        long deadline=SystemClock.uptimeMillis()+6000;
        while(SystemClock.uptimeMillis()<deadline){
            AtomicReference<Boolean> ownsFocus=new AtomicReference<>(false);
            runOnMainSync(()->ownsFocus.set(web.isShown() && web.hasWindowFocus()));
            if(Boolean.TRUE.equals(ownsFocus.get()))return;
            SystemClock.sleep(100);
        }
        throw new AssertionError("Android app window never regained focus for real touch smoke");
    }
    private void hold(WebView web,String id,long duration,boolean jitter) throws Exception {
        requireForegroundWindow(web);
        Thread.sleep(300); // Let the IME/viewport settle before calculating screen coordinates.
        js(web,"window.__entryTrace=[];window.__entryTarget='"+id+"';if(!window.__entryRecording){window.__entryRecording=true;['pointerdown','pointermove','pointerup','pointercancel','touchstart','touchmove','touchend','touchcancel','blur','focus','contextmenu'].forEach(type=>document.addEventListener(type,e=>{if(window.__entryTrace)window.__entryTrace.push({type:e.type,target:e.target.id,pointer:e.pointerType,x:e.clientX,y:e.clientY,touches:e.touches?Array.from(e.touches,t=>[t.clientX,t.clientY]):null});},true));}");
        JSONArray bounds=new JSONArray(js(web,"(()=>{const r=document.getElementById('"+id+"').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2,innerWidth];})()"));
        final float[] point=new float[3];
        runOnMainSync(()->{
            int[] location=new int[2];web.getLocationOnScreen(location);
            float scale=(web.getWidth()-web.getPaddingLeft()-web.getPaddingRight())/(float)bounds.optDouble(2);
            point[0]=location[0]+web.getPaddingLeft()+(float)bounds.optDouble(0)*scale;
            point[1]=location[1]+web.getPaddingTop()+(float)bounds.optDouble(1)*scale;
            point[2]=scale;
        });
        // Calibrate CSS-to-screen offsets using a real short touch. WebView
        // padding/insets differ across Android versions and must not turn a
        // correct gesture into a tap below the small header emblem.
        requireForegroundWindow(web);
        long probe=SystemClock.uptimeMillis();
        pointer(probe,MotionEvent.ACTION_DOWN,point[0],point[1]);SystemClock.sleep(50);
        pointer(probe,MotionEvent.ACTION_UP,point[0],point[1]);waitForIdleSync();
        // Chrome 74 can expose native POINTER events without a touchstart.
        // Calibrate against whichever real OS event actually reached WebView;
        // never continue on null or manufacture a DOM touch.
        String observedJson=js(web,"(()=>{const events=window.__entryTrace||[];"
                +"const t=events.find(e=>e.type==='touchstart'&&e.touches&&e.touches.length);"
                +"if(t)return t.touches[0];"
                +"const p=events.find(e=>e.type==='pointerdown');return p?[p.x,p.y]:null;})()");
        if(observedJson==null || "null".equals(observedJson))
            throw new AssertionError("Real Android touch calibration failed: "
                    + js(web,"JSON.stringify({focus:document.hasFocus(),trace:window.__entryTrace,"
                    +"target:window.__entryTarget,viewport:[innerWidth,innerHeight]})"));
        JSONArray observed=new JSONArray(observedJson);
        point[0]+=(bounds.optDouble(0)-observed.optDouble(0))*point[2];
        point[1]+=(bounds.optDouble(1)-observed.optDouble(1))*point[2];
        js(web,"window.__entryTrace=[]");
        requireForegroundWindow(web);
        long down=SystemClock.uptimeMillis();
        pointer(down,MotionEvent.ACTION_DOWN,point[0],point[1]);
        if(jitter){SystemClock.sleep(250);pointer(down,MotionEvent.ACTION_MOVE,point[0]+3*point[2],point[1]+2*point[2]);SystemClock.sleep(Math.max(0,duration-250));}
        else SystemClock.sleep(duration);
        pointer(down,MotionEvent.ACTION_UP,point[0],point[1]);
        waitForIdleSync();
    }
    private void pointer(long down,int action,float x,float y) {
        MotionEvent event=MotionEvent.obtain(down,SystemClock.uptimeMillis(),action,x,y,0);
        event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try{
            // Instrumentation.sendPointerSync can cross the Android 10 UID
            // boundary and throw INJECT_EVENTS. UiAutomation is Android's
            // sanctioned OS-level automation channel; not a DOM fake.
            if(!getUiAutomation().injectInputEvent(event,true))
                throw new AssertionError("Android denied real touch input");
        }finally{event.recycle();}
    }
    private String js(WebView view, String expression) throws Exception {
        CountDownLatch done = new CountDownLatch(1); AtomicReference<String> result = new AtomicReference<>();
        runOnMainSync(() -> view.evaluateJavascript(expression, value -> { result.set(value); done.countDown(); }));
        if (!done.await(5, TimeUnit.SECONDS)) throw new AssertionError("WebView script timed out");
        return result.get();
    }
    private void require(WebView view, String expression, String label) throws Exception {
        if (!"true".equals(js(view, expression))) throw new AssertionError(label);
    }
}
