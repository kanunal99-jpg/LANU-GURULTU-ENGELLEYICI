package com.lanu.sesli;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
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
            test.putString("stream", "Bundled assets, secure origin, microphone API, native bridge and pause/resume passed.\n");
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
