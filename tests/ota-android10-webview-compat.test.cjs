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

test('Android 10 private diagnostics can render and refresh without replaceChildren()',()=>{
 const diagnostics=require('../app/src/main/assets/diagnostics.js');
 const list={
   nodes:[],
   get firstChild(){return this.nodes[0]||null},
   removeChild(child){const i=this.nodes.indexOf(child);if(i!==-1)this.nodes.splice(i,1);return child},
   append(...children){this.nodes.push(...children)}
 };
 const other={diagnosticsPane:{hidden:false},privateView:{hidden:false},
   diagnosticsResults:list,diagnosticsSummary:{textContent:''}};
 const doc={
   getElementById(id){return other[id]||null},
   createElement(tag){return {tagName:tag,children:[],dataset:{},append(...nodes){this.children.push(...nodes)}}}
 };
 const env={navigator:{onLine:true},isSecureContext:true};
 assert.equal(diagnostics.render(doc,env),true);
 assert.equal(list.nodes.length,6);
 assert.equal(diagnostics.render(doc,env),true);
 assert.equal(list.nodes.length,6,'refresh must replace rather than duplicate old rows');
});
test('Android 10 PIN screen replaces DOM children safely before OTA panel opens',()=>{
 const source=fs.readFileSync('app/src/main/assets/lens.js','utf8');
 assert.match(source,/function replaceChildrenCompat\(node/);
 assert.match(source,/while \(node\.firstChild\) node\.removeChild\(node\.firstChild\)/);
 assert.match(source,/replaceChildrenCompat\(\$\('contactList'\)\)/);
 assert.match(source,/replaceChildrenCompat\(\$\('draftList'\)\)/);
});
