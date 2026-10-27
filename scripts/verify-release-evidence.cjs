'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const REQUIRED=['Lanu-Lens-2.0.10.apk','SHA256SUMS.txt','APK-BILGILERI.txt','APK-IMZA-DURUMU.txt'];
function verifyReleaseEvidence(release,dist,expectedCommit){
 if(!release||typeof release!=='object'||!Array.isArray(release.assets)||
    typeof expectedCommit!=='string'||!/^[a-f0-9]{40}$/.test(expectedCommit)||
    release.target_commitish!==expectedCommit)
   throw Error('Release target commit mismatch');
 const tag=/^v2\.0\.10-build([1-9][0-9]*)$/.exec(release.tag_name||'');
 if(!tag)throw Error('Release tag/version format mismatch');
 const byName=new Map();
 for(const asset of release.assets){
  if(!asset||typeof asset.name!=='string'||!Number.isSafeInteger(asset.size)||
     byName.has(asset.name))throw Error('Invalid or duplicate release asset');
  byName.set(asset.name,asset.size);
 }
 if(byName.size!==REQUIRED.length)throw Error('Unexpected release asset count');
 for(const file of REQUIRED){
  const full=path.join(dist,file);
  const actual=fs.statSync(full).size;
  if(!byName.has(file)||actual<1||byName.get(file)!==actual)
    throw Error('Missing, empty or truncated release asset: '+file);
 }
 const apk=fs.readFileSync(path.join(dist,REQUIRED[0]));
 const sha=crypto.createHash('sha256').update(apk).digest('hex');
 const sum=fs.readFileSync(path.join(dist,REQUIRED[1]),'utf8').trim();
 if(sum!==sha+'  '+REQUIRED[0]&&sum!==sha+' '+REQUIRED[0])
   throw Error('SHA256SUMS does not match attached APK');
 const signer=fs.readFileSync(path.join(dist,'APK-IMZA-DURUMU.txt'),'utf8');
 const lines=signer.split(/\r?\n/);
 if(!lines.some(v=>v==='SIGNING_MODE=DEBUG'||v==='SIGNING_MODE=PRODUCTION')||
    !lines.includes('APK_PACKAGE=com.lanu.sesli')||
    !lines.some(v=>/^APK_CERT_SHA256=[a-f0-9]{64}$/.test(v))||
    !lines.includes('APK_VERSION_CODE='+tag[1])||
    !lines.includes('APK_VERSION_NAME=2.0.10'))
   throw Error('Missing or mismatched APK signing evidence');
 if(lines.includes('SIGNING_MODE=DEBUG')&&!lines.includes('OTA_COMPATIBLE=NO'))
   throw Error('Debug APK incorrectly claims OTA support');
 return {releaseVerified:true,sha256:sha,size:apk.length};
}
module.exports={verifyReleaseEvidence};
if(require.main===module){
 try{
  const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  verifyReleaseEvidence(input,process.argv[3],process.argv[4]);
  process.stdout.write('APK asset sizes, SHA-256, signer, tag and release commit verified\n');
 }catch(error){
  process.stderr.write('Release evidence verification failed: '+error.message+'\n');
  process.exitCode=1;
 }
}
