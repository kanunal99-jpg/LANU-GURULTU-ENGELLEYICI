const test=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {generate,loadOrCreate,signInvite,verifyInvite,ReplayCache}=
  require('../app/src/main/assets/auth-protocol.js');
test('device identity uses nonextractable P-256 key and persists without plaintext key export',async()=>{
 const first=await generate(webcrypto), second=await generate(webcrypto);
 assert.equal(first.privateKey.extractable,false);
 assert.match(first.deviceId,/^[0-9a-f]{64}$/);
 assert.notEqual(first.deviceId,second.deviceId);
 const state={value:null},store={async load(){return state.value;},async save(value){state.value=value;}};
 const stored=await loadOrCreate(webcrypto,store);
 assert.equal((await loadOrCreate(webcrypto,store)).deviceId,stored.deviceId);
 assert.equal(stored.privateKey.extractable,false);
 const corrupt={...stored,deviceId:first.deviceId};
 state.value=corrupt;
 await assert.rejects(()=>loadOrCreate(webcrypto,store),/corrupt/);
});
test('signed call invitation authenticates pinned device, recipient, TTL and once-only nonce',async()=>{
 const a=await generate(webcrypto),b=await generate(webcrypto),now=Date.now(),cache=new ReplayCache();
 const signed=await signInvite(webcrypto,a,b.deviceId,now);
 assert.equal(await verifyInvite(webcrypto,signed,a.publicKey,a.deviceId,b.deviceId,cache,now),true);
 assert.equal(await verifyInvite(webcrypto,signed,a.publicKey,a.deviceId,b.deviceId,cache,now),false);
 assert.equal(await verifyInvite(webcrypto,signed,a.publicKey,a.deviceId,b.deviceId,new ReplayCache(),now+31000),false);
 assert.equal(await verifyInvite(webcrypto,signed,b.publicKey,a.deviceId,b.deviceId,new ReplayCache(),now),false);
 assert.equal(await verifyInvite(webcrypto,signed,a.publicKey,b.deviceId,b.deviceId,new ReplayCache(),now),false);
});
test('signed body tampering and signature alteration are rejected without poisoning replay cache',async()=>{
 const a=await generate(webcrypto),b=await generate(webcrypto),now=Date.now(),cache=new ReplayCache();
 const invitation=await signInvite(webcrypto,a,b.deviceId,now);
 const tampered={...invitation,body:{...invitation.body,issuedAt:now-40000}};
 assert.equal(await verifyInvite(webcrypto,tampered,a.publicKey,a.deviceId,b.deviceId,cache,now),false);
 const forged={...invitation,body:{...invitation.body,callId:'f'.repeat(32)}};
 assert.equal(await verifyInvite(webcrypto,forged,a.publicKey,a.deviceId,b.deviceId,cache,now),false);
 assert.equal(await verifyInvite(webcrypto,invitation,a.publicKey,a.deviceId,b.deviceId,cache,now),true);
 const sig={...invitation,signature:'0'.repeat(128)};
 assert.equal(await verifyInvite(webcrypto,sig,a.publicKey,a.deviceId,b.deviceId,new ReplayCache(),now),false);
});
test('identity storage outages do not silently generate disposable identities',async()=>{
 await assert.rejects(()=>loadOrCreate(webcrypto,{async load(){return null;},async save(){throw Error('Quota');}}),/Quota/);
 await assert.rejects(()=>loadOrCreate(webcrypto,{async load(){throw Error('Locked');},async save(){}}),/Locked/);
});
test('replay store fails closed at capacity; expires old entries',()=>{
 const cache=new ReplayCache(1);
 assert.equal(cache.accept('a',100,0),true);
 assert.equal(cache.accept('a',100,0),false);
 assert.equal(cache.accept('b',200,0),false);
 assert.equal(cache.accept('b',200,101),true);
});
