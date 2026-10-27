'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {Broker}=require('../server/identity-broker.cjs');
const Auth=require('../app/src/main/assets/auth-protocol.js');
const hex=x=>Buffer.from(x).toString('hex');
async function enroll(b,i){
 const raw=hex(await webcrypto.subtle.exportKey('raw',i.publicKey));
 const c=await b.issueEnrollment(raw);
 await b.enroll(raw,c.nonce,await Auth.signChallenge(webcrypto,i,'ENROLL',c.nonce));
}
async function token(b,i){const c=b.issueLogin(i.deviceId);return b.login(i.deviceId,c.nonce,await Auth.signChallenge(webcrypto,i,'LOGIN',c.nonce));}
test('revocation while ECDSA verifies must never mint a fresh bearer token',async()=>{
 let release,entered;const gate=new Promise(r=>{release=r;});
 const started=new Promise(r=>{entered=r;});
 let block=false;
 const subtle=new Proxy(webcrypto.subtle,{get(target,k){if(k==='verify')return (...a)=>block?(entered(),gate.then(()=>target.verify(...a))):target.verify(...a);const v=target[k];return typeof v==='function'?v.bind(target):v;}});
 const crypto={getRandomValues:v=>webcrypto.getRandomValues(v),subtle};
 const b=new Broker({crypto}),i=await Auth.generate(webcrypto);
 await enroll(b,i);
 const previous=await token(b,i);
 const c=b.issueLogin(i.deviceId);
 const proof=await Auth.signChallenge(webcrypto,i,'LOGIN',c.nonce);
 block=true;
 const pending=b.login(i.deviceId,c.nonce,proof);
 await started;
 assert.equal(b.revoke(previous),true);
 release();
 await assert.rejects(pending,/Authentication denied/);
 assert.equal(b.sessions.size,0);
});
test('full call inbox refuses new invitations before consuming replay nonce',async()=>{
 const b=new Broker(),target=await Auth.generate(webcrypto);
 await enroll(b,target);
 const bt=await token(b,target);
 // Spread ten queued calls over three separately trusted callers so each
 // stays below its own 5-per-minute rate limit.
 const senders=[];
 for(const count of [4,4,2]){
   const identity=await Auth.generate(webcrypto);
   await enroll(b,identity);
   const session=await token(b,identity);
   const approval=b.requestPairing(session,target.deviceId);
   b.approvePairing(bt,approval.requestId,identity.deviceId);
   senders.push({identity,session,count});
 }
 for(const {identity,session,count} of senders){
   for(let n=0;n<count;n++)
     assert.equal((await b.submitInvite(session,await Auth.signInvite(webcrypto,identity,target.deviceId))).accepted,true);
 }
 const third=senders[2];
 const next=await Auth.signInvite(webcrypto,third.identity,target.deviceId);
 const consumed=b.replay.records.size;
 await assert.rejects(()=>b.submitInvite(third.session,next),/Recipient busy/);
 assert.equal(b.replay.records.size,consumed);
 assert.equal(b.takeInvites(bt).length,10);
});
