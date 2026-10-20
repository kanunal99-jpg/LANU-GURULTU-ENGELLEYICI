'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
test('all bundled WebView scripts avoid optional chaining and nullish coalescing on Chrome 74',()=>{
 const directory='app/src/main/assets';
 const files=fs.readdirSync(directory).filter(name=>name.endsWith('.js'))
  .map(name=>path.join(directory,name)).concat(path.join(directory,'vendor/peerjs.min.js'));
 for(const file of files){
  const content=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(content,/\?\.(?!\d)|\?\?/,file+' requires newer WebView parser');
 }
});
test('diagnostics capability probes return strict booleans without private storage writes',()=>{
 const diagnostics=require('../app/src/main/assets/diagnostics.js');
 const unsupported=diagnostics.snapshot({navigator:{onLine:false},crypto:{},LanuAudio:null});
 assert.equal(unsupported.crypto,false);
 assert.equal(unsupported.microphone,false);
 assert.equal(unsupported.android,false);
 const supported=diagnostics.snapshot({navigator:{onLine:true,mediaDevices:{getUserMedia(){}}},
  isSecureContext:true,crypto:{subtle:{deriveKey(){}}},LanuAudio:{setCallActive(){}},
  RTCPeerConnection:function(){}});
 assert.deepEqual(Object.values(supported),[true,true,true,true,true,true]);
});
