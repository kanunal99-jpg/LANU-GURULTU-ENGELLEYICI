const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const script='scripts/publish-ota.sh';
const feed='https://raw.githubusercontent.com/kanunal99-jpg/LANU-LENS-OTA/main/latest.json';
function manifest(overrides={}) {
 return {schema:1,versionCode:0,versionName:'0.0.0',apkUrl:'',sha256:'',sizeBytes:0,...overrides};
}
function run(previous,{version=120,tagCode=404,manifestStatus=200}={}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lanu-ota-first-'));
 try {
  const bin=path.join(dir,'bin');fs.mkdirSync(bin);
  const apk=path.join(dir,'Lanu-Lens-2.0.10.apk');fs.writeFileSync(apk,Buffer.alloc(4096,77));
  const calls=path.join(dir,'calls.log');fs.writeFileSync(calls,'');
  const encoded=Buffer.from(JSON.stringify(previous)).toString('base64');
  fs.writeFileSync(path.join(bin,'gh'),[
    '#!/usr/bin/env bash',
    'echo "$*" >> "$MOCK_GH_LOG"',
    'if [[ "$1 $2" == "repo view" ]]; then echo PUBLIC;exit 0;fi',
    'if [[ "$1" == "api" && "$2" == *"contents/latest.json"* ]]; then',
    ' if [[ "$MOCK_MANIFEST_STATUS" != 200 ]]; then echo "HTTP $MOCK_MANIFEST_STATUS" >&2;exit 1;fi',
    ' printf \'{"sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","content":"%s"}\\n\' "$MOCK_PREVIOUS_B64"',
    ' exit 0',
    'fi',
    'if [[ "$1" == "api" && "$2" == *"releases/tags/"* ]]; then',
    ' echo "HTTP $MOCK_TAG_CODE" >&2;exit 1',
    'fi',
    'if [[ "$1 $2" == "release create" ]]; then exit 19;fi',
    'exit 42'
  ].join('\n')+'\n',{mode:0o755});
  fs.writeFileSync(path.join(bin,'apksigner'),[
   '#!/usr/bin/env bash',
   "echo 'Signer #1 certificate SHA-256 digest: "+'a'.repeat(64)+"'"
  ].join('\n')+'\n',{mode:0o755});
  fs.writeFileSync(path.join(bin,'aapt'),[
   '#!/usr/bin/env bash',
   "echo \"package: name='com.lanu.sesli' versionCode='"+version+"' versionName='2.0.10'\""
  ].join('\n')+'\n',{mode:0o755});
  const env={...process.env,GH_TOKEN:'test-token',GITHUB_REPOSITORY_OWNER:'kanunal99-jpg',
   GITHUB_RUN_NUMBER:String(version),OTA_VERSION:'2.0.10',OTA_APK:apk,
   LANU_RELEASE_CERT_SHA256:'a'.repeat(64),LANU_OTA_MANIFEST_URL:feed,
   PATH:bin+':'+process.env.PATH,MOCK_GH_LOG:calls,
   MOCK_PREVIOUS_B64:encoded,MOCK_MANIFEST_STATUS:String(manifestStatus),
   MOCK_TAG_CODE:String(tagCode)};
  const result=cp.spawnSync('bash',[script],{encoding:'utf8',env});
  return {status:result.status,log:fs.readFileSync(calls,'utf8'),output:result.stdout+result.stderr};
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
}
test('exact factory-empty v0 manifest can bootstrap first signed OTA release',()=>{
 const result=run(manifest());
 assert.equal(result.status,19,result.output);
 assert.match(result.log,/release create/);
 assert.match(result.log,/contents\/latest.json/);
});
test('versionCode=0 with invalid publisher fields is rejected before publishing',()=>{
 for(const changed of [
  {versionName:'2.0.10'},{apkUrl:'https://example.com/file.apk'},
  {sha256:'a'.repeat(64)},{sizeBytes:2048},{schema:2}
 ]) {
  const result=run(manifest(changed));
  assert.notEqual(result.status,19,JSON.stringify(changed));
  assert.doesNotMatch(result.log,/release create/);
  assert.match(result.output,/Existing public OTA manifest is invalid/);
 }
});
test('already higher published OTA version cannot be rolled back',()=>{
 const previous={schema:1,versionCode:250,versionName:'2.0.10',
  apkUrl:'https://github.com/kanunal99-jpg/LANU-LENS-OTA/releases/download/v2.0.10-build250/Lanu-Lens-2.0.10.apk',
  sha256:'b'.repeat(64),sizeBytes:4096};
 const result=run(previous);
 assert.doesNotMatch(result.log,/release create/);
 assert.match(result.output,/refusing rollback/);
});
test('malformed public manifest and HTTP 403 block OTA publication',()=>{
 for(const value of [manifest({versionCode:-1}),manifest({versionCode:'0'}),manifest({versionCode:1.2})]) {
  const result=run(value);
  assert.doesNotMatch(result.log,/release create/);
 }
 const forbidden=run(manifest(),{manifestStatus:403});
 assert.doesNotMatch(forbidden.log,/release create/);
 assert.match(forbidden.output,/Cannot verify previous public OTA manifest/);
});
test('tag lookup HTTP 500 must never overwrite public release',()=>{
 const result=run(manifest(),{tagCode:500});
 assert.doesNotMatch(result.log,/release create/);
 assert.match(result.output,/Cannot verify public release tag/);
});
test('publisher verifies anonymous public APK download before promoting latest manifest',()=>{
 const s=fs.readFileSync(script,'utf8');
 assert.match(s,/curl --fail --location --silent --show-error/);
 assert.match(s,/sha256sum -c -/);
 assert.ok(s.indexOf('public_available=true')<s.indexOf('gh api "\${args[@]}"'));
 assert.match(s,/OTA manifest not promoted/);
});
