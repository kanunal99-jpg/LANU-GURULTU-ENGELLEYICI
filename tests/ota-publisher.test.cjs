const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
const script='scripts/publish-ota.sh';
const source=fs.readFileSync(script,'utf8');
const workflow=fs.readFileSync('.github/workflows/build.yml','utf8');
const promotion=fs.readFileSync('.github/workflows/publish-approved-ota.yml','utf8');
test('public publisher shell syntax is valid',()=>{
 const r=cp.spawnSync('bash',['-n',script],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
test('publisher refuses missing scoped public release token without side effects',()=>{
 const r=cp.spawnSync('bash',[script],{encoding:'utf8',env:{...process.env,GH_TOKEN:'',OTA_APK:'dist/fake.apk',LANU_RELEASE_CERT_SHA256:'abc'}});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/LANU_OTA_PUBLISH_TOKEN/);
});
test('publisher only uploads verified signed APKs to binary-only public destination',()=>{
 assert.match(source,/LANU-LENS-OTA/);
 assert.match(source,/gh repo view.*visibility/);
 assert.match(source,/PUBLIC/);
 assert.match(source,/apksigner verify --print-certs/);
 assert.match(source,/expected_cert/);
 assert.match(source,/gh release download/);
 assert.match(source,/sha256sum -c/);
 assert.ok(source.indexOf('gh release download')<source.indexOf('gh api "${args[@]}"'));
 assert.match(source,/old_code >= OTA_BUILD_NUMBER/);
 assert.match(source,/OTA_BUILD_NUMBER/);
});
test('production publishing requires a separately approved exact APK SHA256',()=>{
 assert.match(promotion,/LANU_OTA_PUBLISH_TOKEN/);
 assert.match(promotion,/LANU_RELEASE_CERT_SHA256/);
 assert.match(promotion,/LANU_OTA_MANIFEST_URL/);
 assert.match(promotion,/LANU_OTA_DEVICE_ACCEPTED_APK_SHA256/);
 assert.match(promotion,/verify-ota-promotion-candidate.sh/);
 assert.match(promotion,/scripts\/publish-ota.sh/);
 assert.match(workflow,/İmzalı OTA adayı için gerçek cihaz kabulü bekle/);
 assert.doesNotMatch(workflow,/bash scripts\/publish-ota.sh/);
 assert.doesNotMatch(source,/gh release create .*GITHUB_REPOSITORY(?=\\s|$)/m);
});

test('publisher fails closed for a private distribution repo and mismatched signing certificate',()=>{
  const os=require('node:os'),path=require('node:path');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lanu-publisher-'));
  try {
    const bin=path.join(dir,'bin');fs.mkdirSync(bin);
    const logfile=path.join(dir,'calls.log');
    const apk=path.join(dir,'lanu.apk');fs.writeFileSync(apk,'not a real signed APK - cert mismatch test');
    fs.writeFileSync(path.join(bin,'gh'),`#!/bin/sh
echo "$*" >> "$MOCK_GH_LOG"
if [ "$1" = "repo" ] && [ "$2" = "view" ]; then echo "$MOCK_VISIBILITY"; exit 0; fi
exit 1
`,{mode:0o755});
    fs.writeFileSync(path.join(bin,'apksigner'),`#!/bin/sh
echo "Signer #1 certificate SHA-256 digest: $(printf 'a%.0s' $(seq 1 64))"
`,{mode:0o755});
    const shared={...process.env,GH_TOKEN:'test-only',GITHUB_REPOSITORY_OWNER:'kanunal99-jpg',OTA_BUILD_NUMBER:'400',
      OTA_APK:apk,OTA_VERSION:'2.0.7',
      LANU_OTA_MANIFEST_URL:'https://raw.githubusercontent.com/kanunal99-jpg/LANU-LENS-OTA/main/latest.json',
      LANU_RELEASE_CERT_SHA256:'b'.repeat(64),MOCK_GH_LOG:logfile,PATH:bin+':'+process.env.PATH};
    let run=cp.spawnSync('bash',[script],{encoding:'utf8',env:{...shared,MOCK_VISIBILITY:'PRIVATE'}});
    assert.notEqual(run.status,0);
    assert.match(run.stdout+run.stderr,/Create LANU-LENS-OTA as a PUBLIC repository/);
    assert.doesNotMatch(fs.readFileSync(logfile,'utf8'),/release create/);
    fs.writeFileSync(logfile,'');
    run=cp.spawnSync('bash',[script],{encoding:'utf8',env:{...shared,MOCK_VISIBILITY:'PUBLIC'}});
    assert.notEqual(run.status,0);
    assert.match(run.stdout+run.stderr,/release signature does not match pinned fingerprint/);
    assert.doesNotMatch(fs.readFileSync(logfile,'utf8'),/release create/);
  }finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('CI rejects incomplete signing and never auto-publishes private candidate',()=>{
 assert.match(workflow,/Incomplete release signing configuration; refusing a debug-signed fallback/);
 assert.match(workflow,/configured=0/);
 assert.match(workflow,/configured.*-gt 0.*configured.*-lt 4/);
 assert.match(workflow,/Production certificate configured without complete original keystore/);
 assert.match(promotion,/verify-ota-promotion-candidate.sh/);
});

test('both debug and production Android variants are compiled and linted on each PR',()=>{
  assert.match(workflow,/gradle assembleDebug assembleDebugAndroidTest assembleRelease lintDebug lintRelease --no-daemon/);
  assert.match(workflow,/Üretim APK imzalama koşulları/);
  assert.match(workflow,/if: github\.event_name != 'pull_request'/);
});
