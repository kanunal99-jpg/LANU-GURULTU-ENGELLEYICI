const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const gitignore=fs.readFileSync('.gitignore','utf8').split(/\r?\n/).map(x=>x.trim());
test('permanent OTA signing secret material never becomes a normal tracked file',()=>{
 for(const pattern of ['*.jks','*.keystore','*.zip','private-credentials.env',
  'lanu-lens-release-keystore-base64.txt','**/signing-secrets.env',
  '**/release-signing.properties']){
  assert.ok(gitignore.includes(pattern),'missing: '+pattern);
 }
});
test('no new private signing key or credential file was added to source tree',()=>{
 for(const p of ['lanu-lens-release.jks','private-credentials.env','lanu-lens-release-keystore-base64.txt']){
  assert.equal(fs.existsSync(p),false,'unexpected private material: '+p);
 }
});
