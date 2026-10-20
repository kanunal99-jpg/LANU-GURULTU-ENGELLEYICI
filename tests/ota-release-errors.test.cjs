const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
test('OTA publisher fails closed on GitHub 403/500 but recognizes first-publication 404',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lanu-ota-failclosed-'));
  try{
    const bin=path.join(root,'bin');fs.mkdirSync(bin);
    const apk=path.join(root,'Lanu-Lens-2.0.8.apk');
    fs.writeFileSync(apk,Buffer.alloc(2048,1));
    const record=path.join(root,'requests.txt');
    fs.writeFileSync(path.join(bin,'gh'),`#!/usr/bin/env bash
echo "$*" >> "$MOCK_CALLS"
if [[ "$1 $2" == "repo view" ]]; then echo PUBLIC; exit 0; fi
if [[ "$1" == "api" && "$2" == *"contents/latest.json"* ]]; then
  echo "gh: \${MOCK_ERROR} (HTTP \${MOCK_CODE})" >&2; exit 1
fi
if [[ "$1 $2" == "release view" ]]; then exit 1; fi
if [[ "$1 $2" == "release create" ]]; then exit 15; fi
exit 1
`,{mode:0o755});
    fs.writeFileSync(path.join(bin,'apksigner'),`#!/usr/bin/env bash
echo 'Signer #1 certificate SHA-256 digest: ${'a'.repeat(64)}'
`,{mode:0o755});
    fs.writeFileSync(path.join(bin,'aapt'),`#!/usr/bin/env bash
echo "package: name='com.lanu.sesli' versionCode='120' versionName='2.0.8'"
`,{mode:0o755});
    const env={...process.env,PATH:bin+':'+process.env.PATH,GH_TOKEN:'mock-secret',
      GITHUB_REPOSITORY_OWNER:'kanunal99-jpg',GITHUB_RUN_NUMBER:'120',OTA_APK:apk,OTA_VERSION:'2.0.8',
      LANU_OTA_MANIFEST_URL:'https://raw.githubusercontent.com/kanunal99-jpg/LANU-LENS-OTA/main/latest.json',
      LANU_RELEASE_CERT_SHA256:'a'.repeat(64),MOCK_CALLS:record};
    for(const [code,name] of [['403','Forbidden'],['500','Server Error'],['404','Not Found']]){
      fs.writeFileSync(record,'');
      const p=cp.spawnSync('bash',['scripts/publish-ota.sh'],{env:{...env,MOCK_CODE:code,MOCK_ERROR:name},encoding:'utf8'});
      assert.notEqual(p.status,0,'Expected mock publisher to fail before completion');
      const calls=fs.readFileSync(record,'utf8');
      if(code==='404'){
        assert.match(calls,/release create/,'Only genuine 404 may allow bootstrap');
      }else{
        assert.doesNotMatch(calls,/release create/,'HTTP '+code+' must never publish');
        assert.match(p.stdout+p.stderr,/Cannot verify previous public OTA manifest/);
      }
    }
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
