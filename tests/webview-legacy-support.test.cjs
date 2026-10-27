const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const vm=require('node:vm');
const script=fs.readFileSync('app/src/main/assets/webview-legacy.js','utf8');
const html=fs.readFileSync('app/src/main/assets/index.html','utf8');
const vendor=fs.readFileSync('app/src/main/assets/vendor/peerjs.min.js','utf8');
const workflow=fs.readFileSync('.github/workflows/build.yml','utf8');
const smoke=fs.readFileSync('app/src/androidTest/java/com/lanu/sesli/SmokeInstrumentation.java','utf8');

class OldElement {
  constructor() {this.nodes=[];}
  get firstChild(){return this.nodes[0] || null;}
  removeChild(node){const i=this.nodes.indexOf(node);if(i>=0)this.nodes.splice(i,1);}
  appendChild(node){this.nodes.push(node);return node;}
}
test('old Chrome74 DOM polyfill supports clearing PIN-only draft and contacts lists',()=>{
  const doc={createTextNode:value=>({kind:'text',value})};
  const context={Element:OldElement,document:doc};
  vm.runInNewContext(script,context);
  const e=new OldElement();
  e.nodes=[{id:1},{id:2}];
  e.replaceChildren({id:3},'Güvenli');
  assert.equal(e.nodes.length,2);
  assert.equal(e.nodes[0].id,3);
  assert.equal(e.nodes[1].value,'Güvenli');
  e.replaceChildren();
  assert.equal(e.nodes.length,0);
});
test('WebView polyfill never overrides native replaceChildren and loads before private scripts',()=>{
  class Modern extends OldElement {replaceChildren(...args){this.native=true;this.nodes=args;}}
  vm.runInNewContext(script,{Element:Modern,document:{createTextNode:s=>s}});
  const m=new Modern();m.replaceChildren('Hello');
  assert.equal(m.native,true);
  const compatIndex=html.indexOf('src="webview-legacy.js"');
  assert.ok(compatIndex>0 && compatIndex<html.indexOf('src="lens.js"'));
  assert.ok(compatIndex<html.indexOf('src="app.js"'));
});
test('reviewed PeerJS legacy syntax patch preserves exact pinned upstream bits',()=>{
  assert.equal((vendor.match(/e&&e\.flush/g)||[]).length,2);
  assert.ok(!vendor.includes('e?.flush'));
  const original=vendor.replaceAll('e&&e.flush','e?.flush');
  const digest=crypto.createHash('sha256').update(original).digest('hex');
  assert.equal(digest,'ad5d8870d1e389914f9cba8d35be313c4327c69ee0a221e482e9bf7621136fe5');
});
test('Android API29 CI tests OS real touches, without fake DOM gestures',()=>{
  assert.match(workflow,/android-api29:/);
  assert.match(workflow,/api-level: 29/);
  assert.match(workflow,/gradle connectedDebugAndroidTest --no-daemon/);
  assert.match(smoke,/document\.hasFocus\(\)/);
  assert.match(smoke,/shellTouch\(/);
  assert.match(smoke,/touchstart/);
  assert.doesNotMatch(smoke,/new TouchEvent\(|dispatchEvent\(new PointerEvent/);
});
