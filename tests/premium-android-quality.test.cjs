const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const gradle=fs.readFileSync('app/build.gradle.kts','utf8');
const root=fs.readFileSync('build.gradle.kts','utf8');
const catalog=fs.readFileSync('gradle/libs.versions.toml','utf8');
const rules=fs.readFileSync('app/proguard-rules.pro','utf8');
const workflow=fs.readFileSync('.github/workflows/build.yml','utf8');
const java=fs.readFileSync('app/src/main/java/com/lanu/sesli/MainActivity.java','utf8');
const manifest=fs.readFileSync('app/src/main/AndroidManifest.xml','utf8');

test('production R8 minimizes code and resources without deleting WebView JS interface contracts',()=>{
  assert.match(gradle,/isMinifyEnabled = true/);
  assert.match(gradle,/isShrinkResources = true/);
  assert.match(gradle,/getDefaultProguardFile\("proguard-android-optimize\.txt"\)/);
  assert.match(gradle,/"proguard-rules\.pro"/);
  assert.match(rules,/@android\.webkit\.JavascriptInterface <methods>;/);
  assert.doesNotMatch(rules,/-dont(obfuscate|optimize|shrink)/);
  assert.match(workflow,/test -s app\/build\/outputs\/mapping\/release\/mapping\.txt/);
  assert.match(workflow,/for method in setPrivateUnlocked downloadAndInstall requestCallNotificationPermission setCallActive savePhoto/);
  assert.match(workflow,/app\/build\/outputs\/mapping\/release\//);
});
test('Gradle version catalog pins build and dependency versions in one place',()=>{
  assert.match(root,/alias\(libs\.plugins\.android\.application\) apply false/);
  assert.match(gradle,/alias\(libs\.plugins\.android\.application\)/);
  assert.match(gradle,/implementation\(libs\.androidx\.webkit\)/);
  assert.match(gradle,/implementation\(libs\.androidx\.core\)/);
  assert.match(catalog,/agp = "8\.9\.2"/);
  assert.match(catalog,/androidxCore = "1\.13\.1"/);
  assert.match(catalog,/androidxWebkit = "1\.11\.0"/);
});
test('webview cannot inspect private contacts via debugger, missing assets, remote file URLs or unauthorized capture',()=>{
  assert.match(java,/WebView\.setWebContentsDebuggingEnabled\(false\)/);
  assert.match(java,/settings\.setSafeBrowsingEnabled\(true\)/);
  assert.match(java,/settings\.setSupportMultipleWindows\(false\)/);
  assert.match(java,/settings\.setGeolocationEnabled\(false\)/);
  assert.match(java,/setAcceptThirdPartyCookies\(web, false\)/);
  assert.match(java,/setAllowFileAccess\(false\)/);
  assert.match(java,/setAllowFileAccessFromFileURLs\(false\)/);
  assert.match(java,/setAllowUniversalAccessFromFileURLs\(false\)/);
  assert.match(java,/if \(asset != null\) return asset/);
  assert.match(java,/return deniedResource\(404\)/);
  assert.match(java,/if \(microphone && !privateUnlocked\) \{ request\.deny\(\); return; \}/);
  assert.match(java,/code != MICROPHONE \|\| privateUnlocked/);
  assert.match(manifest,/android:allowBackup="false"/);
  assert.match(manifest,/android:usesCleartextTraffic="false"/);
  assert.match(java,/WindowManager\.LayoutParams\.FLAG_SECURE/);
});
test('critical legacy camera and calls are kept intact during staged architecture migration',()=>{
  assert.match(java,/web\.loadUrl\(HOME\)/);
  assert.match(java,/LanuAudio/);
  assert.match(java,/LanuUpdate/);
  assert.match(manifest,/android:name="\.MainActivity"/);
  assert.match(gradle,/versionName = "2\.0\.9"/);
});

test('WebRTC test WebSocket dependency uses a patched and integrity-pinned tarball',()=>{
  const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
  const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
  const ws=lock.packages['node_modules/ws'];
  assert.equal(pkg.devDependencies.ws,'8.21.0');
  assert.equal(lock.packages[''].devDependencies.ws,'8.21.0');
  assert.equal(ws.version,'8.21.0');
  assert.equal(ws.resolved,'https://registry.npmjs.org/ws/-/ws-8.21.0.tgz');
  assert.match(ws.integrity,/^sha512-[A-Za-z0-9+/]+={0,2}$/);
  assert.match(workflow,/npm audit --audit-level=high --no-fund/);
});
