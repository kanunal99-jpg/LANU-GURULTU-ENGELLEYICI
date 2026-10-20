'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const Auth=require('../app/src/main/assets/auth-protocol.js');
const {Broker}=require('../server/identity-broker.cjs');
const Client=require('../app/src/main/assets/broker-client.js');
function fakeIndexedDB(identity){
 const record={primary:identity};
 const db={close(){},transaction(name,mode){
  if(name!=='identities'||mode!=='readonly')throw Error('Unexpected key store access');
  const tx={objectStore:()=>({get(key){
   const req={result:null};
   setImmediate(()=>{req.result=record[key]??null;req.onsuccess?.();setImmediate(()=>tx.oncomplete?.());});
   return req;
  }})};
  return tx;
 }};
 return {open(){const req={result:db};setImmediate(()=>req.onsuccess?.());return req;}};
}
function service(broker){
 const calls=[];
 const api=async(url,request)=>{
  assert.match(url,/^https:\/\/auth\.lanu\.example\/v1\//);
  assert.equal(request.credentials,'omit');
  assert.equal(request.redirect,'error');
  assert.equal(request.cache,'no-store');
  calls.push({url,request});
  const route=new URL(url).pathname,body=JSON.parse(request.body);
  const token=request.headers.Authorization?.slice(7);
  let result;
  try{
   switch(route){
    case '/v1/enroll/challenge':result=await broker.issueEnrollment(body.publicKey);break;
    case '/v1/enroll/complete':result={deviceId:await broker.enroll(body.publicKey,body.nonce,body.signature)};break;
    case '/v1/session/challenge':result=broker.issueLogin(body.deviceId);break;
    case '/v1/session/complete':result={token:await broker.login(body.deviceId,body.nonce,body.signature),ttlSeconds:900};break;
    case '/v1/pairs/request':result=broker.requestPairing(token,body.recipientId);break;
    case '/v1/pairs/pending':result={requests:broker.listPairRequests(token)};break;
    case '/v1/pairs/approve':result={accepted:broker.approvePairing(token,body.requestId,body.expectedRequesterFingerprint)};break;
    case '/v1/calls/invite':result=await broker.submitInvite(token,body.envelope);break;
    case '/v1/calls/pending':result={invites:broker.takeInvites(token)};break;
    case '/v1/devices/revoke':result={revoked:broker.revoke(token)};break;
    default:throw Error('Unknown route');
   }
   return {status:200,redirected:false,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify(result)};
  }catch(error){
   return {status:403,redirected:false,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify({error:'denied'})};
  }
 };
 return {api,calls};
}
const options=(identity,fetchApi)=>({baseUrl:'https://auth.lanu.example/',fetchApi,cryptoApi:webcrypto,indexedDb:fakeIndexedDB(identity)});
test('HTTPS client proves key ownership, pairs only with recipient approval and signs time-bound invitations',async()=>{
 const broker=new Broker(),alice=await Auth.generate(webcrypto),bob=await Auth.generate(webcrypto);
 const mock=service(broker),a=Client.create(options(alice,mock.api)),b=Client.create(options(bob,mock.api));
 assert.equal(await a.enroll(alice),alice.deviceId);
 assert.equal(await b.enroll(bob),bob.deviceId);
 assert.equal(await a.signIn(),alice.deviceId);
 assert.equal(await b.signIn(),bob.deviceId);
 await assert.rejects(()=>a.submitCall(bob.deviceId),/rejected/i);
 // Rejected broker request revokes caller's bearer session in memory.
 await a.signIn();
 const request=await a.requestPairing(bob.deviceId);
 const list=await b.pendingPairings();
 assert.equal(list.length,1);
 assert.equal(list[0].from,alice.deviceId);
 assert.equal((await b.approvePairing(request.requestId,alice.deviceId)).accepted,true);
 assert.equal((await a.submitCall(bob.deviceId)).accepted,true);
 assert.equal((await b.pendingCalls()).length,1);
 assert.equal((await b.pendingCalls()).length,0);
 assert.equal(await b.revoke(),true);
 await assert.rejects(()=>b.pendingCalls(),/Authentication required/);
 assert.equal(mock.calls.some(x=>x.request.headers.Authorization?.startsWith('Bearer ')),true);
 assert.equal(mock.calls.some(x=>JSON.stringify(x.request).includes('privateKey')),false);
});
test('HTTPS client rejects plaintext downgrade, encoded query, untrusted origins and missing crypto',()=>{
 const identity={deviceId:'0'.repeat(64)};
 for(const origin of ['http://auth.lanu.example/','https://auth.lanu.example/path/','https://auth.lanu.example/?token=x',
  'https://appassets.androidplatform.net/','https://auth.lanu.example.evil/../../']){
  assert.throws(()=>Client.create({...options(identity,async()=>{}),baseUrl:origin}),/Pinned HTTPS/);
 }
 assert.throws(()=>Client.create({...options(identity,async()=>{}),fetchApi:null}),/Secure browser/);
});
test('session tokens never survive explicit expiration and failed broker challenge',async()=>{
 const broker=new Broker(),identity=await Auth.generate(webcrypto);
 const mock=service(broker),client=Client.create(options(identity,mock.api));
 await assert.rejects(()=>client.signIn(),/rejected/i);
 await client.enroll(identity);
 await client.signIn();
 client.expire();
 await assert.rejects(()=>client.pendingCalls(),/Authentication required/);
});
test('redirected or oversized broker responses are rejected before using signed challenges',async()=>{
 const i=await Auth.generate(webcrypto);
 for(const response of [
   {status:200,redirected:true,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify({nonce:'x'})},
   {status:200,redirected:false,headers:{get:()=> 'application/json'},text:async()=> 'a'.repeat(17000)},
   {status:200,redirected:false,headers:{get:()=> 'text/html'},text:async()=> '<script>x</script>'}
 ]){
  const client=Client.create(options(i,async()=>response));
  await assert.rejects(()=>client.signIn());
 }
});


test('bundled broker client is parseable by Android 10 Chrome 74',()=>{
 const source=require('node:fs').readFileSync('app/src/main/assets/broker-client.js','utf8');
 assert.doesNotMatch(source,/\?\.(?!\d)|\?\?/);
 assert.ok(source.includes('typeof fetchApi'));
 assert.ok(source.includes('identity.privateKey.extractable'));
});
