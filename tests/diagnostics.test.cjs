const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {snapshot,render}=require('../app/src/main/assets/diagnostics.js');
const html=fs.readFileSync('app/src/main/assets/index.html','utf8');
const lens=fs.readFileSync('app/src/main/assets/lens.js','utf8');
const css=fs.readFileSync('app/src/main/assets/style.css','utf8');
function mockDocument(locked=false){
  const elements=new Map();
  function el(id){if(!elements.has(id))elements.set(id,{id,hidden:false,textContent:'',children:[],replaceChildren(){this.children=[];},append(...children){this.children.push(...children);},setAttribute(name,value){this[name]=value;}});return elements.get(id);}
  el('diagnosticsPane').hidden=locked;el('privateView').hidden=locked;el('diagnosticsResults');el('diagnosticsSummary');
  return {getElementById:el,createElement:tag=>({tagName:tag,textContent:'',dataset:{},children:[],append(...children){this.children.push(...children);}})};
}
test('device diagnostics are pure booleans; do not collect identities or microphone samples',()=>{
 const env={navigator:{onLine:false,mediaDevices:{}},isSecureContext:true,crypto:{subtle:{deriveKey(){}}},RTCPeerConnection(){}};
 const result=snapshot(env);
 assert.deepEqual(Object.keys(result),['online','secure','crypto','webrtc','microphone','android']);
 assert.equal(result.online,false);assert.equal(result.secure,true);
 assert.equal(result.crypto,true);assert.equal(result.webrtc,true);
 assert.equal(result.microphone,false);assert.equal(result.android,false);
 const source=fs.readFileSync('app/src/main/assets/diagnostics.js','utf8');
 assert.doesNotMatch(source,/getUserMedia\s*\(/);
 assert.doesNotMatch(source,/localStorage\.(setItem|getItem)/);
 assert.doesNotMatch(source,/(fetch|sendBeacon|XMLHttpRequest)\s*\(/);
});
test('diagnostics never render before PIN unlock and always clear old results',()=>{
 const doc=mockDocument(true);
 const env={navigator:{onLine:true},isSecureContext:false};
 assert.equal(render(doc,env),false);assert.equal(doc.getElementById('diagnosticsResults').children.length,0);
 doc.getElementById('privateView').hidden=false;doc.getElementById('diagnosticsPane').hidden=false;
 assert.equal(render(doc,env),true);
 assert.equal(doc.getElementById('diagnosticsResults').children.length,6);
 render(doc,env);assert.equal(doc.getElementById('diagnosticsResults').children.length,6);
 assert.match(doc.getElementById('diagnosticsSummary').textContent,/Bazı özellikler/);
});
test('diagnostic tab has semantic roles, keyboard and isolated private panel',()=>{
 assert.match(html,/role="tablist"/);
 for(const id of ['callsTab','updatesTab','diagnosticsTab'])assert.match(html,new RegExp('id="'+id+'" role="tab"'));
 assert.match(html,/id="diagnosticsPane" role="tabpanel"[^>]*hidden/);
 assert.match(html,/src="diagnostics\.js"/);
 assert.match(lens,/function showDiagnostics\(\)/);
 assert.match(lens,/if \(!opened\) return;/);
 assert.match(lens,/\['online','offline'\]/);
 assert.match(lens,/event\.key==='ArrowRight'/);
 assert.match(lens,/event\.key==='ArrowLeft'/);
 assert.match(lens,/event\.key==='Home'/);
 assert.match(lens,/event\.key==='End'/);
 assert.match(lens,/\$\('diagnosticsPane'\)\.hidden=true/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/max-width:340px/);
});
