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
  assert.match(java,/validatePackage\(tmp,next\.code\)/);
  assert.match(java,/archive\.packageName/);
  assert.match(java,/archive\.signatures/);
  assert.match(java,/sig\.toByteArray\(\),existing\.toByteArray\(\)/);
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
