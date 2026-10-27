const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const script='scripts/verify-installed-ota-compatibility.sh';
function execute({oldCode=214,newCode=220,oldCert='a',newCert='a',adbFails=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lanu-ota-device-'));
 try{
  const bin=path.join(dir,'bin');fs.mkdirSync(bin);
  const apk=path.join(dir,'new.apk');fs.writeFileSync(apk,'new test APK');
  const mk=(name,source)=>fs.writeFileSync(path.join(bin,name),'#!/usr/bin/env bash\n'+source+'\n',{mode:0o755});
  mk('adb',`case "$1" in
    get-state) echo device;;
    shell) echo 'package:/data/app/~~abc/com.lanu.sesli-random/base.apk';;
    pull) if [[ "$MOCK_ADB_FAILS" == true ]]; then exit 1; fi; echo installed > "$3";;
    *) exit 1;;
  esac`);
  mk('aapt',`if [[ "$3" == *installed.apk ]]; then code="$MOCK_OLD_CODE"; else code="$MOCK_NEW_CODE"; fi
    echo "package: name='com.lanu.sesli' versionCode='$code' versionName='2.0.10'"`);
  mk('apksigner',`if [[ "$2" == '--print-certs' ]]; then
    if [[ "$3" == *installed.apk ]]; then letter="$MOCK_OLD_CERT"; else letter="$MOCK_NEW_CERT"; fi
    printf 'Signer #1 certificate SHA-256 digest: %s\\n' "$(printf '%064s' '' | tr ' ' "$letter")"
  fi`);
  const env={...process.env,PATH:bin+':'+process.env.PATH,MOCK_OLD_CODE:String(oldCode),
    MOCK_NEW_CODE:String(newCode),MOCK_OLD_CERT:oldCert,MOCK_NEW_CERT:newCert,MOCK_ADB_FAILS:String(adbFails),
    LANU_RELEASE_CERT_SHA256:''};
  const result=cp.spawnSync('bash',[script,apk],{encoding:'utf8',env});
  return {code:result.status,log:result.stdout+result.stderr};
 } finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('read-only device preflight has valid Bash syntax',()=>{
 const r=cp.spawnSync('bash',['-n',script],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
test('installed and candidate APK signed with the same cert and ascending codes can pass preflight',()=>{
 const r=execute();
 assert.equal(r.code,0,r.log);
 assert.match(r.log,/versionCode 214 -> 220/);
 assert.match(r.log,/READ-ONLY PRECHECK ONLY/);
});
test('different old/new Android signing certificates always block an in-place update',()=>{
 const r=execute({oldCert:'b'});
 assert.notEqual(r.code,0,r.log);
 assert.match(r.log,/signing certificates DIFFER/);
 assert.match(r.log,/Do not uninstall/);
});
test('downgrade and equal version code are rejected',()=>{
 for(const code of [213,214]){
  const r=execute({newCode:code});
  assert.notEqual(r.code,0,r.log);
  assert.match(r.log,/not higher/);
 }
});
test('ADB permission errors fail closed without uninstalling or modifying data',()=>{
 const r=execute({adbFails:true});
 assert.notEqual(r.code,0,r.log);
 assert.match(r.log,/cannot read installed APK/);
 const source=fs.readFileSync(script,'utf8');
 assert.doesNotMatch(source,/adb (?:uninstall|install)|pm clear|run-as/);
 assert.match(source,/--min-sdk-version 29/);
 assert.match(source,/--min-sdk-version 35/);
});
