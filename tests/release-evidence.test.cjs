'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {verifyReleaseEvidence}=require('../scripts/verify-release-evidence.cjs');
test('release evidence proves four uploaded assets, expected commit and the real APK digest',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lanu-evidence-'));
 try{
  const name='Lanu-Lens-2.0.10.apk',apk=Buffer.from('fake binary exclusively for test');
  fs.writeFileSync(path.join(dir,name),apk);
  const sha=crypto.createHash('sha256').update(apk).digest('hex');
  fs.writeFileSync(path.join(dir,'SHA256SUMS.txt'),sha+'  '+name+'\n');
  fs.writeFileSync(path.join(dir,'APK-BILGILERI.txt'),'package: name=com.lanu.sesli\n');
  fs.writeFileSync(path.join(dir,'APK-IMZA-DURUMU.txt'),'SIGNING_MODE=DEBUG\nAPK_PACKAGE=com.lanu.sesli\nAPK_CERT_SHA256='+'a'.repeat(64)+'\nOTA_COMPATIBLE=NO\n');
  const commit='b'.repeat(40);
  const release={target_commitish:commit,assets:[name,'SHA256SUMS.txt','APK-BILGILERI.txt','APK-IMZA-DURUMU.txt'].map(n=>({name:n,size:fs.statSync(path.join(dir,n)).size}))};
  assert.equal(verifyReleaseEvidence(release,dir,commit).releaseVerified,true);
  assert.throws(()=>verifyReleaseEvidence({...release,target_commitish:'c'.repeat(40)},dir,commit),/commit/);
  assert.throws(()=>verifyReleaseEvidence({...release,assets:release.assets.slice(0,3)},dir,commit),/asset count/);
  assert.throws(()=>verifyReleaseEvidence({...release,assets:[...release.assets,{name:'other',size:1}]},dir,commit),/asset count/);
  assert.throws(()=>verifyReleaseEvidence({...release,assets:release.assets.map(x=>x.name===name?{...x,size:x.size-1}:x)},dir,commit),/truncated/);
  fs.writeFileSync(path.join(dir,'SHA256SUMS.txt'),'0'.repeat(64)+'  '+name);
  assert.throws(()=>verifyReleaseEvidence(release,dir,commit),/SHA256/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
