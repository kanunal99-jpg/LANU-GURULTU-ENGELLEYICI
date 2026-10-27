const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');

test('public OTA publisher fails closed for foreign package, mismatched version and extra APK signers',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lanu-ota-identity-'));
 try{
  const bin=path.join(dir,'bin');fs.mkdirSync(bin);
  const apk=path.join(dir,'Lanu-Lens-2.0.10.apk');fs.writeFileSync(apk,Buffer.alloc(2048,5));
  const log=path.join(dir,'calls.txt');
  const cert='a'.repeat(64);
  fs.writeFileSync(path.join(bin,'gh'),`#!/usr/bin/env bash
echo "$*" >> "$MOCK_GH_LOG"
if [[ "$1 $2" == "repo view" ]]; then echo PUBLIC;exit 0;fi
echo "Unexpected GitHub mutation" >&2
exit 1
`,{mode:0o755});
  fs.writeFileSync(path.join(bin,'apksigner'),`#!/usr/bin/env bash
echo "Signer #1 certificate SHA-256 digest: ${cert}"
if [[ "$MOCK_SIGNERS" == "2" ]];then echo "Signer #2 certificate SHA-256 digest: ${cert}";fi
`,{mode:0o755});
  fs.writeFileSync(path.join(bin,'aapt'),`#!/usr/bin/env bash
echo "package: name='$MOCK_PACKAGE' versionCode='$MOCK_CODE' versionName='$MOCK_VERSION'"
`,{mode:0o755});
  const env={...process.env,PATH:bin+':'+process.env.PATH,
    GH_TOKEN:'test-only',GITHUB_REPOSITORY_OWNER:'kanunal99-jpg',
    OTA_BUILD_NUMBER:'120',OTA_APK:apk,OTA_VERSION:'2.0.10',
    LANU_OTA_MANIFEST_URL:'https://raw.githubusercontent.com/kanunal99-jpg/LANU-LENS-OTA/main/latest.json',
    LANU_RELEASE_CERT_SHA256:cert,MOCK_GH_LOG:log,
    MOCK_PACKAGE:'com.lanu.sesli',MOCK_CODE:'120',MOCK_VERSION:'2.0.10',MOCK_SIGNERS:'1'};
  for(const [title,overrides,diagnostic] of [
    ['wrong package',{MOCK_PACKAGE:'com.attacker.fake'},/APK package, versionCode or versionName mismatch/],
    ['wrong code',{MOCK_CODE:'119'},/APK package, versionCode or versionName mismatch/],
    ['wrong name',{MOCK_VERSION:'2.0.9'},/APK package, versionCode or versionName mismatch/],
    ['two signers',{MOCK_SIGNERS:'2'},/exactly one Android signing certificate/]
  ]){
    fs.writeFileSync(log,'');
    const run=cp.spawnSync('bash',['scripts/publish-ota.sh'],{encoding:'utf8',env:{...env,...overrides}});
    assert.notEqual(run.status,0,title);
    assert.match(run.stdout+run.stderr,diagnostic,title);
    const calls=fs.readFileSync(log,'utf8');
    assert.doesNotMatch(calls,/release create|contents\/latest.json/,title+' must fail before publishing');
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
