'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {Broker}=require('../server/identity-broker.cjs');
const Auth=require('../app/src/main/assets/auth-protocol.js');
const {dispatchAuthenticatedCall}=require('../server/call-push-policy.cjs');
const hex=a=>Buffer.from(a).toString('hex');
async function enroll(b,i){const pub=hex(await webcrypto.subtle.exportKey('raw',i.publicKey));
 const c=await b.issueEnrollment(pub);await b.enroll(pub,c.nonce,await Auth.signChallenge(webcrypto,i,'ENROLL',c.nonce));}
async function token(b,i){const c=b.issueLogin(i.deviceId);return b.login(i.deviceId,c.nonce,await Auth.signChallenge(webcrypto,i,'LOGIN',c.nonce));}
test('an unpaired or unauthenticated caller cannot trigger any push transport',async()=>{
 const broker=new Broker(),a=await Auth.generate(webcrypto),b=await Auth.generate(webcrypto);
 await enroll(broker,a);await enroll(broker,b);
 const at=await token(broker,a);
 const env=await Auth.signInvite(webcrypto,a,b.deviceId);
 let sends=0;const send=async()=>{sends++;return true;};
 await assert.rejects(()=>dispatchAuthenticatedCall({broker,sessionToken:at,envelope:env,send}),/Pairing approval required/);
 await assert.rejects(()=>dispatchAuthenticatedCall({broker,sessionToken:'bad',envelope:env,send}),/Unauthorized/);
 assert.equal(sends,0);
});
test('authorized paired call sends only a minimal wakeup, with short TTL',async()=>{
 const broker=new Broker(),a=await Auth.generate(webcrypto),b=await Auth.generate(webcrypto);
 await enroll(broker,a);await enroll(broker,b);
 const at=await token(broker,a),bt=await token(broker,b);
 const req=broker.requestPairing(at,b.deviceId);
 broker.approvePairing(bt,req.requestId,a.deviceId);
 const envelope=await Auth.signInvite(webcrypto,a,b.deviceId);
 const sent=[];
 const result=await dispatchAuthenticatedCall({broker,sessionToken:at,envelope,
  send:async(...parts)=>{sent.push(parts);return true;}});
 assert.deepEqual(result,{accepted:true,notified:true,delivery:'push'});
 assert.equal(sent.length,1);
 assert.equal(sent[0][0],b.deviceId);
 assert.deepEqual(Object.keys(sent[0][1]).sort(),['callId','expiresAt','type']);
 assert.equal(sent[0][1].type,'LANU_CALL_WAKE_V1');
 assert.ok(sent[0][2].ttlSeconds>=1&&sent[0][2].ttlSeconds<=30);
 assert.equal(sent[0][2].priority,'high');
 await assert.rejects(()=>dispatchAuthenticatedCall({broker,sessionToken:at,envelope,send:async()=>true}),/Rejected invitation/);
});
test('failed external push transport retains authenticated inbox polling fallback',async()=>{
 const broker=new Broker(),a=await Auth.generate(webcrypto),b=await Auth.generate(webcrypto);
 await enroll(broker,a);await enroll(broker,b);
 const at=await token(broker,a),bt=await token(broker,b);
 const pairing=broker.requestPairing(at,b.deviceId);
 broker.approvePairing(bt,pairing.requestId,a.deviceId);
 const env=await Auth.signInvite(webcrypto,a,b.deviceId);
 const result=await dispatchAuthenticatedCall({broker,sessionToken:at,envelope:env,
  send:async()=>{throw Error('sensitive provider credential failure');}});
 assert.deepEqual(result,{accepted:true,notified:false,delivery:'poll'});
 assert.equal(broker.takeInvites(bt).length,1);
 assert.equal(JSON.stringify(result).includes('credential'),false);
});
