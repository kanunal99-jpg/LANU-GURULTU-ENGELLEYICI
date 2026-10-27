const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const assets=['app/src/main/assets/vendor/peerjs.min.js','app/src/main/assets/diagnostics.js'];
test('Android 10 WebView boot-critical bundles avoid optional chaining syntax',()=>{
 for(const file of assets){
   const text=fs.readFileSync(file,'utf8');
   assert.doesNotMatch(text,/\?\.(?![0-9])/,file+' has unsupported optional chaining');
 }
});
test('Android 10 vendor compatibility patch is pinned to its exact SHA-256 in CI',()=>{
 const contents=fs.readFileSync(assets[0]);
 const hash=crypto.createHash('sha256').update(contents).digest('hex');
 const workflow=fs.readFileSync('.github/workflows/build.yml','utf8');
 assert.ok(workflow.includes(hash+'  '+assets[0]),'bundled PeerJS SHA-256 must be checked by CI');
 assert.match(workflow,/sha256sum -c -/);
});
test('Android 10 and 15 retain separate emulator smoke gates',()=>{
 const workflow=fs.readFileSync('.github/workflows/build.yml','utf8');
 assert.match(workflow,/ota-android10:/);
 assert.match(workflow,/api-level: 29/);
 assert.match(workflow,/api-level: 35/);
 assert.match(workflow,/connectedDebugAndroidTest/);
});
