const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const gate='scripts/verify-ota-promotion-candidate.sh';
const promotion=fs.readFileSync('.github/workflows/publish-approved-ota.yml','utf8');
const build=fs.readFileSync('.github/workflows/build.yml','utf8');
const publisher=fs.readFileSync('scripts/publish-ota.sh','utf8');
const cert='a'.repeat(64),version='2.0.10',code='250';
function execute(changes={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lanu-ota-approve-'));
 try {
  const bin=path.join(dir,'bin');fs.mkdirSync(bin);
  const apk=path.join(dir,'Lanu-Lens-2.0.10.apk');
  fs.writeFileSync(apk,Buffer.alloc(4096,77));
  const hash=crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
  fs.writeFileSync(path.join(dir,'SHA256SUMS.txt'),hash+'  Lanu-Lens-2.0.10.apk\n');
  fs.writeFileSync(path.join(dir,'APK-IMZA-DURUMU.txt'),
    ['SIGNING_MODE=PRODUCTION','OTA_COMPATIBLE=SIGNER_ONLY',
     'APK_PACKAGE=com.lanu.sesli','APK_VERSION_CODE='+code,
     'APK_VERSION_NAME='+version,'APK_CERT_SHA256='+cert].join('\n')+'\n');
  const mk=(name,body)=>fs.writeFileSync(path.join(bin,name),'#!/usr/bin/env bash\n'+body+'\n',{mode:0o755});
  mk('apksigner',`echo 'Signer #1 certificate SHA-256 digest: ${cert}'`);
  mk('aapt',`echo "package: name='com.lanu.sesli' versionCode='$MOCK_CODE' versionName='2.0.10'"`);
  const env={...process.env,PATH:bin+':'+process.env.PATH,
   OTA_PROMOTE_TAG:'v2.0.10-build250',OTA_PROMOTE_DIR:dir,OTA_ACCEPTED_SHA256:hash,
   LANU_OTA_DEVICE_ACCEPTED_APK_SHA256:hash,LANU_RELEASE_CERT_SHA256:cert,
   GITHUB_REPOSITORY:'kanunal99-jpg/LANU-GURULTU-ENGELLEYICI',MOCK_CODE:code,
   ...changes};
  const r=cp.spawnSync('bash',[gate],{encoding:'utf8',env});
  return {status:r.status,output:r.stdout+r.stderr,hash};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('manual publication gate has valid Bash syntax and is read only',()=>{
 const r=cp.spawnSync('bash',['-n',gate],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 const source=fs.readFileSync(gate,'utf8');
 assert.doesNotMatch(source,/gh release create|gh api -X|adb install|pm clear/);
 assert.match(source,/verify-release-apk.sh/);
 assert.match(source,/apksigner verify --min-sdk-version 29/);
 assert.match(source,/apksigner verify --min-sdk-version 35/);
});
test('exact original-signer approved production artifact passes read-only gate',()=>{
 const r=execute();
 assert.equal(r.status,0,r.output);
 assert.match(r.output,/ACCEPTED: production APK/);
});
test('no accepted physical device SHA or a different accepted SHA blocks public release',()=>{
 for(const change of [
   {LANU_OTA_DEVICE_ACCEPTED_APK_SHA256:''},
   {LANU_OTA_DEVICE_ACCEPTED_APK_SHA256:'b'.repeat(64)},
   {OTA_ACCEPTED_SHA256:'b'.repeat(64)},
   {OTA_ACCEPTED_SHA256:'undefined'},
 ]){
  const r=execute(change);
  assert.notEqual(r.status,0,JSON.stringify(change));
  assert.doesNotMatch(r.output,/ACCEPTED:/);
 }
});
test('candidate tag, package version, certificate pin and source identity mismatches block promotion',()=>{
 for(const change of [
   {OTA_PROMOTE_TAG:'v2.0.10-build249'},
   {OTA_PROMOTE_TAG:'../../bad'},
   {MOCK_CODE:'249'},
   {LANU_RELEASE_CERT_SHA256:'b'.repeat(64)},
   {GITHUB_REPOSITORY:'attacker/fork'}
 ]){
  const r=execute(change);
  assert.notEqual(r.status,0,JSON.stringify(change));
 }
});
test('release gate rejects an altered APK even when input and acceptance hashes agree',()=>{
 const r=execute({OTA_ACCEPTED_SHA256:'c'.repeat(64),LANU_OTA_DEVICE_ACCEPTED_APK_SHA256:'c'.repeat(64)});
 assert.notEqual(r.status,0);
 assert.match(r.output,/APK bytes do not match physical-device accepted SHA256/);
});
test('workflow stages signed APK but requires manual approval before public OTA',()=>{
 assert.match(build,/İmzalı OTA adayı için gerçek cihaz kabulü bekle/);
 assert.doesNotMatch(build,/bash scripts\/publish-ota.sh/);
 assert.match(promotion,/workflow_dispatch:/);
 assert.match(promotion,/LANU_OTA_DEVICE_ACCEPTED_APK_SHA256/);
 assert.match(promotion,/verify-ota-promotion-candidate.sh/);
 assert.match(promotion,/gh release download/);
 assert.match(promotion,/git merge-base --is-ancestor/);
 assert.match(promotion,/bash scripts\/publish-ota.sh/);
 assert.match(promotion,/LANU_OTA_PUBLISH_TOKEN/);
 assert.match(publisher,/OTA_BUILD_NUMBER/);
 assert.doesNotMatch(publisher,/GITHUB_RUN_NUMBER/);
});
