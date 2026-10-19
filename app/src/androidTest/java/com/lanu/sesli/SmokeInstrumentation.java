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
            if (!loaded) throw new AssertionError("Bundled JavaScript did not start");
            require(web, "location.origin === 'https://appassets.androidplatform.net'", "Secure asset origin");
            require(web, "!!navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function'", "Microphone API available");
            require(web, "typeof window.LanuAudio.setCallActive === 'function'", "Trusted native bridge");
            require(web, "document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]') !== null", "CSP present");
            require(web, "document.getElementById('answerBtn').hidden && document.getElementById('hangBtn').hidden", "Idle controls");
            require(web, "(window.lanuPause('Smoke test'), document.getElementById('callBtn').disabled)", "Pause disables dialing");
            require(web, "(window.lanuResume(), typeof window.lanuPause === 'function')", "Resume survives pause");
            require(web, "document.title === 'Lanu Lens' && document.getElementById('privateView').hidden", "Camera-only landing");
            require(web, "!document.body.innerText.match(/görüşme|rehber|eşleştirme|gizli|PIN/i)", "No private hints in camera UI");
            require(web, "typeof window.LanuAudio.setRinging === 'function' && typeof window.LanuAudio.savePhoto === 'function'", "Ringtone and export bridges");
            // Real OS touchscreen events, not DOM-dispatched PointerEvents.
            hold(web,"lensEmblem",180,false);
            Thread.sleep(3100);
            require(web,"document.getElementById('gate').hidden","Short center-logo touch stays in camera");
            hold(web,"lensEmblem",3300,false);
            awaitTrue(web,"!document.getElementById('gate').hidden",6000,"Center emblem opens PIN with real touch");
            require(web,"document.getElementById('privateView').hidden","Hold does not bypass PIN");
            js(web,"document.getElementById('cancelGate').click()");
            hold(web,"lensLogo",3300,true);
            awaitTrue(web,"!document.getElementById('gate').hidden",6000,"Header logo tolerates natural finger drift");
            js(web,"document.getElementById('pin').value='741963';document.getElementById('pinConfirm').value='741963';document.getElementById('pinForm').dispatchEvent(new Event('submit',{cancelable:true}))");
            long unlockLimit=System.currentTimeMillis()+10000;
            while(System.currentTimeMillis()<unlockLimit && !"true".equals(js(web,"!document.getElementById('privateView').hidden")))Thread.sleep(100);
            require(web,"!document.getElementById('privateView').hidden","PIN setup opens private area");
            require(web,"(window.LanuLens.lock(),document.getElementById('privateView').hidden && !document.getElementById('cameraView').hidden)","Lock restores camera");
            require(web,"!document.body.innerText.match(/görüşme|rehber|eşleştirme|gizli|PIN/i)","No private hints after lock");
            hold(web,"lensEmblem",3300,false);
            awaitTrue(web,"!document.getElementById('gate').hidden",6000,"Center emblem still works after locking");
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
    private void awaitTrue(WebView web,String expression,long duration,String label) throws Exception {
        long deadline=System.currentTimeMillis()+duration;
        while(System.currentTimeMillis()<deadline){if("true".equals(js(web,expression)))return;Thread.sleep(100);}
        throw new AssertionError(label + " " + js(web,"JSON.stringify({trace:window.__entryTrace,gate:document.getElementById('gate').hidden,active:document.activeElement.id,viewport:[innerWidth,innerHeight],target:window.__entryTarget})"));
    }
    private void hold(WebView web,String id,long duration,boolean jitter) throws Exception {
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
        long probe=SystemClock.uptimeMillis();
        pointer(probe,MotionEvent.ACTION_DOWN,point[0],point[1]);SystemClock.sleep(50);
        pointer(probe,MotionEvent.ACTION_UP,point[0],point[1]);waitForIdleSync();
        JSONArray observed=new JSONArray(js(web,"(()=>{const t=window.__entryTrace.find(e=>e.type==='touchstart');return t&&t.touches?t.touches[0]:null;})()"));
        point[0]+=(bounds.optDouble(0)-observed.optDouble(0))*point[2];
        point[1]+=(bounds.optDouble(1)-observed.optDouble(1))*point[2];
        js(web,"window.__entryTrace=[]");
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
        try{sendPointerSync(event);}finally{event.recycle();}
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
