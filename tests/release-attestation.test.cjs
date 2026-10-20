'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
test('release APK signer/package/version gate and debug warning',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lanu-release-pin-'));
 try{
  const bin=path.join(root,'bin');fs.mkdirSync(bin);
  const apk=path.join(root,'app.apk');fs.writeFileSync(apk,Buffer.alloc(256,42));
  fs.writeFileSync(path.join(bin,'apksigner'),[
    '#!/usr/bin/env bash',
    'printf "Signer #1 certificate SHA-256 digest: %s\\n" "$MOCK_CERT"',
    'if [[ "$MOCK_SIGNERS" == 2 ]]; then printf "Signer #2 certificate SHA-256 digest: %s\\n" "$MOCK_CERT"; fi'
  ].join('\n')+'\n',{mode:0o755});
  fs.writeFileSync(path.join(bin,'aapt'),[
    '#!/usr/bin/env bash',
    'printf "package: name=\\x27%s\\x27 versionCode=\\x27%s\\x27 versionName=\\x27%s\\x27\\n" "$MOCK_PACKAGE" "$MOCK_CODE" "$MOCK_VERSION"'
  ].join('\n')+'\n',{mode:0o755});
  const cert='a'.repeat(64);
  const env={...process.env,PATH:bin+':'+process.env.PATH,
    MOCK_CERT:cert,LANU_RELEASE_CERT_SHA256:cert,
    MOCK_PACKAGE:'com.lanu.sesli',MOCK_CODE:'222',MOCK_VERSION:'2.0.10'};
  function run(mode='DEBUG',overrides={}){
   return cp.spawnSync('bash',['scripts/verify-release-apk.sh',apk,mode,'222','2.0.10'],
      {env:{...env,...overrides},encoding:'utf8'});
  }
  const debug=run('DEBUG'),production=run('PRODUCTION');
  assert.equal(debug.status,0,debug.stderr);
  assert.match(debug.stdout,/SIGNING_MODE=DEBUG[\s\S]*OTA_COMPATIBLE=NO/);
  assert.equal(production.status,0,production.stderr);
  assert.match(production.stdout,/SIGNING_MODE=PRODUCTION[\s\S]*OTA_COMPATIBLE=SIGNER_ONLY/);
  for(const [label,mode,override,error] of [
   ['foreign package','PRODUCTION',{MOCK_PACKAGE:'com.attacker.pkg'},/package or version/],
   ['wrong code','PRODUCTION',{MOCK_CODE:'221'},/package or version/],
   ['wrong name','PRODUCTION',{MOCK_VERSION:'2.0.9'},/package or version/],
   ['wrong signer','PRODUCTION',{MOCK_CERT:'b'.repeat(64)},/signing certificate/],
   ['two signers','DEBUG',{MOCK_SIGNERS:'2'},/exactly one APK signer/],
   ['invalid certificate','DEBUG',{MOCK_CERT:'invalid'},/fingerprint unavailable/]
  ]){
   const result=run(mode,override);
   assert.notEqual(result.status,0,label);
   assert.match(result.stdout+result.stderr,error,label);
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('release workflow publishes signing evidence next to APK and SHA256',()=>{
 const yml=fs.readFileSync('.github/workflows/build.yml','utf8');
 const script=fs.readFileSync('scripts/verify-release-apk.sh','utf8');
 assert.ok(yml.includes('dist/APK-IMZA-DURUMU.txt'));
 assert.ok(yml.includes('scripts/verify-release-apk.sh'));
 assert.ok(yml.includes('dist/SHA256SUMS.txt'));
 assert.match(script,/Expected exactly one APK signer/);
 assert.match(script,/OTA_COMPATIBLE=NO/);
});
