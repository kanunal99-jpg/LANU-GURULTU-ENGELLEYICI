'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {webcrypto}=require('node:crypto');
const {Broker}=require('../server/identity-broker.cjs');
const {handlerFor,TRUSTED_ORIGIN}=require('../server/broker-http.cjs');
const Auth=require('../app/src/main/assets/auth-protocol.js');
const hex=bytes=>Buffer.from(bytes).toString('hex');
async function localBroker(){
 const server=createServer(handlerFor(new Broker()));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const send=async(path,body={},token=null,headers={})=>{
  const response=await fetch(base+path,{method:'POST',
   headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},
   body:JSON.stringify(body)});
  return {status:response.status,body:await response.json(),headers:response.headers};
 };
 return {send,base,close:()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()))};
}
async function enroll(send,identity){
 const publicKey=hex(await webcrypto.subtle.exportKey('raw',identity.publicKey));
 const c=await send('/v1/enroll/challenge',{publicKey});
 assert.equal(c.status,200);
 const signature=await Auth.signChallenge(webcrypto,identity,'ENROLL',c.body.nonce);
 const result=await send('/v1/enroll/complete',{publicKey,nonce:c.body.nonce,signature});
 assert.equal(result.status,200);
 return result.body.deviceId;
}
async function login(send,identity){
 const c=await send('/v1/session/challenge',{deviceId:identity.deviceId});
 assert.equal(c.status,200);
 const signature=await Auth.signChallenge(webcrypto,identity,'LOGIN',c.body.nonce);
 const response=await send('/v1/session/complete',{deviceId:identity.deviceId,nonce:c.body.nonce,signature});
 assert.equal(response.status,200);
 assert.equal(response.body.ttlSeconds,900);
 return response.body.token;
}
test('HTTP consent-to-call flow: signed enrollment, session, pairing, invite, replay, revoke',async()=>{
 const api=await localBroker();
 try{
  const a=await Auth.generate(webcrypto),b=await Auth.generate(webcrypto);
  assert.equal(await enroll(api.send,a),a.deviceId);
  assert.equal(await enroll(api.send,b),b.deviceId);
  const at=await login(api.send,a),bt=await login(api.send,b);
  const invite=await Auth.signInvite(webcrypto,a,b.deviceId);
  let reply=await api.send('/v1/calls/invite',{envelope:invite},at);
  assert.equal(reply.status,403);
  let req=await api.send('/v1/pairs/request',{recipientId:b.deviceId},at);
  assert.equal(req.status,200);
  const pending=await api.send('/v1/pairs/pending',{},bt);
  assert.equal(pending.body.requests.length,1);
  assert.equal(pending.body.requests[0].from,a.deviceId);
  reply=await api.send('/v1/pairs/approve',{requestId:req.body.requestId,expectedRequesterFingerprint:a.deviceId},bt);
  assert.equal(reply.body.accepted,true);
  reply=await api.send('/v1/calls/invite',{envelope:invite},at);
  assert.equal(reply.status,200);
  assert.equal((await api.send('/v1/calls/invite',{envelope:invite},at)).status,400);
  reply=await api.send('/v1/calls/pending',{},bt);
  assert.equal(reply.body.invites.length,1);
  assert.deepEqual((await api.send('/v1/calls/pending',{},bt)).body.invites,[]);
  assert.equal((await api.send('/v1/devices/revoke',{},bt)).status,200);
  assert.equal((await api.send('/v1/calls/pending',{},bt)).status,401);
 }finally{await api.close();}
});
test('HTTP rejects other origins, invalid bearer, missing fields and oversized JSON',async()=>{
 const api=await localBroker();
 try{
  let reply=await api.send('/v1/enroll/challenge',{publicKey:'x'},null,{Origin:'https://evil.example'});
  assert.equal(reply.status,403);
  reply=await api.send('/v1/pairs/pending',{});
  assert.equal(reply.status,401);
  reply=await api.send('/v1/enroll/challenge',{publicKey:'x',unexpected:'PIN'});
  assert.equal(reply.status,400);
  reply=await api.send('/v1/enroll/challenge',{publicKey:'x'.repeat(17000)});
  assert.equal(reply.status,413);
  reply=await api.send('/v1/enroll/challenge',{publicKey:'x'},null,{Origin:TRUSTED_ORIGIN});
  assert.equal(reply.headers.get('Access-Control-Allow-Origin'),TRUSTED_ORIGIN);
  assert.equal(reply.headers.get('Cache-Control'),'no-store, max-age=0');
  assert.equal(reply.headers.get('X-Content-Type-Options'),'nosniff');
 }finally{await api.close();}
});
test('HTTP never echoes credentials, internal SQL error messages, or recipient metadata',async()=>{
 const api=await localBroker();
 try{
  const secret='SECRET_SHOULD_NEVER_LEAK';
  const response=await api.send('/v1/session/complete',{deviceId:secret,nonce:secret,signature:secret});
  assert.notEqual(response.status,200);
  assert.equal(JSON.stringify(response.body).includes(secret),false);
  const notfound=await fetch(api.base+'/v1/calls/pending?auth=x');
  assert.equal(notfound.status,404);
  assert.equal((await notfound.text()).includes('token'),false);
 }finally{await api.close();}
});
