const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
const read=p=>fs.readFileSync(p,'utf8');
const workflow=read('.github/workflows/build.yml');
const instrument=read('app/src/androidTest/java/com/lanu/sesli/SmokeInstrumentation.java');
const prep=read('scripts/prepare-ota-upgrade-apks.sh');
const runner=read('scripts/test-ota-upgrade-emulator.sh');

test('OTA upgrade acceptance scripts have valid Bash syntax',()=>{
 for(const name of ['scripts/prepare-ota-upgrade-apks.sh','scripts/test-ota-upgrade-emulator.sh']){
  const result=cp.spawnSync('bash',['-n',name],{encoding:'utf8'});
  assert.equal(result.status,0,name+': '+result.stderr);
 }
});
test('two real APK files are built under the same signing key, never treated as production',()=>{
 assert.match(prep,/old_code=\$\(\(GITHUB_RUN_NUMBER \* 2\)\)/);
 assert.match(prep,/new_code=\$\(\(old_code \+ 1\)\)/);
 assert.match(prep,/LANU_VERSION_CODE="\$old_code" gradle assembleDebug/);
 assert.match(prep,/LANU_VERSION_CODE="\$new_code" gradle assembleDebug assembleDebugAndroidTest/);
 assert.match(prep,/old_signer.*new_signer/s);
 assert.match(prep,/Not a production OTA signature/);
});
test('Android package replacement preserves PIN encrypted vault, draft and native settings',()=>{
 assert.match(runner,/adb install -r "\$work\/old\.apk"/);
 assert.match(runner,/adb install -r "\$work\/new\.apk"/);
 assert.match(runner,/instrument seed/);
 assert.match(runner,/instrument verify/);
 assert.match(runner,/ro\.kernel\.qemu/);
 assert.match(runner,/LANU_DISPOSABLE_CI_EMULATOR/);
 assert.doesNotMatch(runner,/adb\s+uninstall|pm\s+clear|\sinstall\s+-[a-z]*d\b/);
 assert.match(instrument,/otaUpgradePhase/);
 assert.match(instrument,/getSharedPreferences\("lanu-ota-ci-upgrade"/);
 assert.match(instrument,/localStorage\.getItem\('lens-vault-v1'\)/);
 assert.match(instrument,/draftList/);
 assert.match(instrument,/pinConfirm'\)\.hidden/);
 assert.match(instrument,/Original PIN decrypts original draft after same-key upgrade/);
});
test('upgrade CI is separate from production release and Android 10 and 15 smoke',()=>{
 assert.match(workflow,/ota-upgrade-android15:/);
 assert.match(workflow,/ota-android10:/);
 assert.match(workflow,/Android WebView smoke testi/);
 assert.match(workflow,/LANU_DISPOSABLE_CI_EMULATOR: 'true'/);
 assert.match(workflow,/scripts\/test-ota-upgrade-emulator\.sh/);
 assert.match(workflow,/LANU-OTA-Android15-yerinde-yukseltme-raporu/);
});
