const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
const script='scripts/publish-ota.sh';
const source=fs.readFileSync(script,'utf8');
const workflow=fs.readFileSync('.github/workflows/build.yml','utf8');
test('public publisher shell syntax is valid',()=>{
 const r=cp.spawnSync('bash',['-n',script],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
test('publisher refuses missing scoped public release token without side effects',()=>{
 const r=cp.spawnSync('bash',[script],{encoding:'utf8',env:{...process.env,GH_TOKEN:'',OTA_APK:'dist/fake.apk',LANU_RELEASE_CERT_SHA256:'abc'}});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/LANU_OTA_PUBLISH_TOKEN/);
});
test('publisher only uploads verified signed APKs to binary-only public destination',()=>{
 assert.match(source,/LANU-LENS-OTA/);
 assert.match(source,/gh repo view.*visibility/);
 assert.match(source,/PUBLIC/);
 assert.match(source,/apksigner verify --print-certs/);
 assert.match(source,/expected_cert/);
 assert.match(source,/gh release download/);
 assert.match(source,/sha256sum -c/);
 assert.ok(source.indexOf('gh release download')<source.indexOf('gh api "${args[@]}"'));
 assert.match(source,/old_code >= GITHUB_RUN_NUMBER/);
});
test('production publishing has explicit fail-closed signing prerequisite and no source repo release exposure',()=>{
 assert.match(workflow,/LANU_OTA_PUBLISH_TOKEN/);
 assert.match(workflow,/LANU_RELEASE_CERT_SHA256/);
 assert.match(workflow,/LANU_OTA_MANIFEST_URL/);
 assert.match(workflow,/OTA imzalama koşulları/);
 assert.match(workflow,/steps\.signing\.outputs\.signed == 'true'/);
 assert.doesNotMatch(source,/gh release create .*GITHUB_REPOSITORY(?=\s|$)/m);
});
