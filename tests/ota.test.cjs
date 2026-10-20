const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('app/src/main/assets/index.html','utf8');
const lens=fs.readFileSync('app/src/main/assets/lens.js','utf8');
const java=fs.readFileSync('app/src/main/java/com/lanu/sesli/LanuUpdater.java','utf8');
const manifest=fs.readFileSync('app/src/main/AndroidManifest.xml','utf8');
const gradle=fs.readFileSync('app/build.gradle.kts','utf8');

test('update controls live inside the PIN-protected private view only',()=>{
  const privateIndex=html.indexOf('id="privateView"');
  const tabIndex=html.indexOf('id="updatesTab"');
  const paneIndex=html.indexOf('id="updatesPane"');
  assert.ok(privateIndex>=0&&tabIndex>privateIndex&&paneIndex>tabIndex);
  assert.match(html,/<section id="updatesPane"[^>]*hidden/);
  assert.match(html,/id="checkUpdates"/);
  assert.match(html,/id="downloadUpdate"/);
  assert.match(html,/id="installUpdate"/);
  assert.match(lens,/if \(!opened\) return;\s*\$\('callsPane'\)/);
  assert.match(lens,/window\.lanuUpdateEvent = event => \{/);
  assert.match(lens,/if \(!opened \|\| !event/);
});
test('OTA is opt-in and private repo secrets are never embedded in the app',()=>{
  assert.match(gradle,/LANU_OTA_MANIFEST_URL/);
  assert.match(java,/BuildConfig\.OTA_MANIFEST_URL/);
  assert.match(java,/if\(feed\.isEmpty\(\)\)/);
  assert.doesNotMatch(java,/(Authorization["']|Bearer\s+gh[pousr]_)/);
});
test('APK must pass SHA-256, package, signing-certificate and higher-code checks',()=>{
  assert.match(java,/MessageDigest\.getInstance\("SHA-256"\)/);
  assert.match(java,/MessageDigest\.isEqual/);
  assert.match(java,/validatePackage\(tmp,next\.code,next\.version\)/);
  assert.match(java,/archive\.packageName/);
  assert.match(java,/GET_SIGNING_CERTIFICATES/);
  assert.match(java,/archive\.signingInfo\.getApkContentsSigners\(\)/);
  assert.match(java,/sig\.toByteArray\(\),currentSigner\.toByteArray\(\)/);
  assert.match(java,/code<=installedCode\(\)/);
  assert.match(java,/MAX_APK/);
  assert.match(java,/OTA_REPO_PATH/);
});
test('installer requires system consent and shares only scoped cache file',()=>{
  assert.match(java,/canRequestPackageInstalls\(\)/);
  assert.match(java,/ACTION_MANAGE_UNKNOWN_APP_SOURCES/);
  assert.match(java,/FileProvider\.getUriForFile/);
  assert.match(java,/FLAG_GRANT_READ_URI_PERMISSION/);
  assert.match(manifest,/REQUEST_INSTALL_PACKAGES/);
  assert.match(manifest,/android:exported="false"/);
  const xml=fs.readFileSync('app/src/main/res/xml/update_paths.xml','utf8');
  assert.match(xml,/<cache-path[^>]+path="updates\/"/);
});

test('one-button Android update keeps the verified file after unknown-source settings relocks the PIN',()=>{
  const main=fs.readFileSync('app/src/main/java/com/lanu/sesli/MainActivity.java','utf8');
  assert.match(main,/void downloadAndInstall\(\)/);
  assert.match(lens,/window\.LanuUpdate\.downloadAndInstall\(\)/);
  assert.match(java,/void downloadAndInstall\(\)\{download\(true\);\}/);
  assert.match(java,/if\(installAfterVerification\)install\(\);/);
  assert.match(java,/final Candidate previous = latest/);
  assert.match(java,/final File previousApk = verified/);
  assert.match(java,/sameCandidate\(previous,candidate\)/);
  assert.match(java,/void info\(\) \{/);
  assert.match(java,/if \(readyForInstall\(\)\) emit\("ready"/);
  assert.match(java,/if\(awaitingInstallPermission&&activity\.getPackageManager\(\)\.canRequestPackageInstalls\(\)\)/);
  assert.match(html,/Yeni sürümü indir ve güncelle/);
});
test('version pinning prevents a remote older APK from being installed',()=>{
  assert.match(java,/latest\.code > installedCode\(\)/);
  assert.match(java,/candidate\.code>installedCode\(\)/);
  assert.match(java,/code!=wantedCode\|\|code<=installedCode\(\)/);
  assert.match(java,/proposed\.length!=existing\.length/);
  assert.match(java,/Signature\[\] proposed/);
});

test('production OTA feed is pinned by default before the public mirror exists',()=>{
  assert.match(gradle,/defaultOtaManifestUrl = "https:\/\/raw\.githubusercontent\.com\/kanunal99-jpg\/LANU-LENS-OTA\/main\/latest\.json"/);
  assert.match(gradle,/otaManifestUrl == defaultOtaManifestUrl/);
  assert.match(gradle,/versionName = "2\.0\.10"/);
  assert.match(java,/Manifest HTTP status: 404/);
});
test('installer re-verifies the on-disk APK when the user taps install',()=>{
  assert.match(java,/void install\(\)\s*\{/);
  assert.match(java,/void openInstallerAfterValidation\(\)\s*\{/);
  assert.match(java,/new java\.io\.FileInputStream\(file\)/);
  assert.match(java,/APK changed after verification/);
  assert.match(java,/validatePackage\(file,candidate\.code,candidate\.version\)/);
  assert.ok(java.indexOf('validatePackage(file,candidate.code,candidate.version)')<java.indexOf('openInstallerAfterValidation();'));
  assert.match(java,/verified!=file/);
  assert.match(java,/busy=true;\s*emit\("verifying"/);
  assert.match(lens,/\['checking','downloading','verifying','installing'\]\.includes/);
});
test('interrupted downloads preserve earlier valid build and isolate temp names',()=>{
  assert.match(java,/"lanu-lens-"\+next\.code\+"\.apk"/);
  assert.match(java,/"download-"\+next\.code\+"\.tmp"/);
  assert.doesNotMatch(java,/tmp\.delete\(\);dest\.delete\(\);/);
  assert.match(java,/if\(readyForInstall\(\)\)\s*\{/);
  assert.match(java,/if\(Thread\.currentThread\(\)\.isInterrupted\(\)\)/);
});

test('native update bridge revokes authorization on PIN lock, background and page navigation',()=>{
  const main=fs.readFileSync('app/src/main/java/com/lanu/sesli/MainActivity.java','utf8');
  assert.match(main,/boolean canShowUpdater\(\)/);
  assert.match(main,/privateUnlocked && web != null/);
  assert.match(main,/@JavascriptInterface public void setPrivateUnlocked\(boolean unlocked\)/);
  assert.match(main,/privateUnlocked = unlocked && visible/);
  assert.match(main,/visible = false;\s*privateUnlocked = false;/);
  assert.match(main,/onPageStarted\(WebView v, String url/);
  assert.match(main,/privateUnlocked = false;[\s\S]*onPageFinished/);
  assert.match(main,/@JavascriptInterface public void install\(\) \{ main\.post\(\(\) -> \{ if \(canShowUpdater\(\)\)/);
  assert.match(lens,/window\.LanuUpdate\.setPrivateUnlocked\(true\)/);
  assert.match(lens,/window\.LanuUpdate\.setPrivateUnlocked\(false\)/);
  assert.match(java,/if\(installAfterVerification && mayPromptUser\(\)\)install\(\)/);
  assert.match(java,/if \(!mayPromptUser\(\)\) \{/);
  assert.match(java,/private void openInstallerAfterValidation\(\)\{\s*if\(!mayPromptUser\(\)\)return;/);
  assert.match(java,/private void openInstallerAfterValidation/);
});
test('manifest refresh bypasses stale intermediary caches',()=>{
  assert.match(java,/c\.setUseCaches\(false\)/);
  assert.match(java,/Cache-Control","no-cache, no-store"/);
  assert.match(java,/Pragma","no-cache"/);
});

test('OTA manifest URL is pinned and update tag binds versionCode',()=>{
  assert.ok(java.includes('"https://raw.githubusercontent.com/kanunal99-jpg/LANU-LENS-OTA/main/latest.json".equals(url)'));
  assert.ok(java.includes('isExpectedReleaseUrl(url,version,code)'));
  assert.ok(java.includes('OTA_REPO_PATH+"v"+version+"-build"+code'));
  assert.ok(java.includes('u.getQuery()==null && u.getRef()==null'));
});
test('production OTA cert validates both installed and downloaded APK',()=>{
  assert.ok(gradle.includes('LANU_RELEASE_CERT_SHA256'));
  assert.ok(gradle.includes('OTA_RELEASE_CERT_SHA256'));
  assert.ok(java.includes('BuildConfig.OTA_RELEASE_CERT_SHA256'));
  assert.ok(java.includes('MessageDigest.getInstance("SHA-256").digest(sig.toByteArray())'));
  assert.ok(java.includes('for(Signature sig:proposed)'));
  assert.ok(java.includes('for(Signature sig:existing)'));
  assert.ok(java.includes('wantedVersion.equals(archive.versionName)'));
  assert.ok(java.includes('u.getPort()!=443'));
});

test('debug and unpinned APKs cannot advertise update availability or install a cached package',()=>{
  assert.match(java,/boolean productionOtaConfigured\(\)/);
  assert.ok(java.includes('!BuildConfig.DEBUG && BuildConfig.OTA_RELEASE_CERT_SHA256.matches'));
  assert.ok(java.includes('j.put("configured",productionOtaConfigured())'));
  assert.ok(java.includes('return productionOtaConfigured() && latest != null'));
  for(const method of ['void info()', 'void check()', 'private void download(boolean installAfterVerification)', 'void install()']){
    const begin=java.indexOf(method);
    assert.ok(begin!==-1,method);
    assert.ok(java.slice(begin,begin+320).includes('!productionOtaConfigured()'),method);
  }
  const instrumentation=fs.readFileSync('app/src/androidTest/java/com/lanu/sesli/SmokeInstrumentation.java','utf8');
  assert.ok(instrumentation.includes('BuildConfig.DEBUG && new LanuUpdater(target).productionOtaConfigured()'));
});
test('production release CI compares real signed binary against pinned public certificate before publishing',()=>{
  const workflow=fs.readFileSync('.github/workflows/build.yml','utf8');
  assert.ok(workflow.includes('apksigner" verify --print-certs dist/Lanu-Lens-2.0.10.apk'));
  assert.ok(workflow.includes('"$actual" != "$expected"'));
  assert.ok(workflow.includes('Refusing release.'));
  assert.ok(workflow.indexOf('Refusing release.') < workflow.indexOf('Releases\'a APK ekle'));
});
