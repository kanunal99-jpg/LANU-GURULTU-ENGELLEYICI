const test=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {Broker}=require('../server/identity-broker.cjs');
const Auth=require('../app/src/main/assets/auth-protocol.js');
const hex=bytes=>Buffer.from(bytes).toString('hex');
async function enroll(broker,identity){
  const pub=hex(await webcrypto.subtle.exportKey('raw',identity.publicKey));
  const challenge=await broker.issueEnrollment(pub);
  const proof=await Auth.signChallenge(webcrypto,identity,'ENROLL',challenge.nonce);
  return broker.enroll(pub,challenge.nonce,proof);
}
async function login(broker,identity){
  const challenge=broker.issueLogin(identity.deviceId);
  const proof=await Auth.signChallenge(webcrypto,identity,'LOGIN',challenge.nonce);
  return broker.login(identity.deviceId,challenge.nonce,proof);
}
test('device enrollment requires a valid nonce and a private-key signature',async()=>{
 const broker=new Broker(),a=await Auth.generate(webcrypto),b=await Auth.generate(webcrypto);
 const pub=hex(await webcrypto.subtle.exportKey('raw',a.publicKey));
 const challenge=await broker.issueEnrollment(pub);
 const bad=await Auth.signChallenge(webcrypto,b,'ENROLL',challenge.nonce);
 await assert.rejects(()=>broker.enroll(pub,challenge.nonce,bad),/denied/i);
 const good=await Auth.signChallenge(webcrypto,a,'ENROLL',challenge.nonce);
 await assert.rejects(()=>broker.enroll(pub,challenge.nonce,good),/invalid|expired/i);
 assert.equal(await enroll(broker,a),a.deviceId);
 await assert.rejects(()=>broker.issueEnrollment(pub),/Already enrolled/);
});
test('login challenge cannot be replayed; other device signature cannot log in',async()=>{
 const broker=new Broker(),a=await Auth.generate(webcrypto),b=await Auth.generate(webcrypto);
 await enroll(broker,a);
 const challenge=broker.issueLogin(a.deviceId);
 const wrong=await Auth.signChallenge(webcrypto,b,'LOGIN',challenge.nonce);
 await assert.rejects(()=>broker.login(a.deviceId,challenge.nonce,wrong),/denied/i);
 const correct=await Auth.signChallenge(webcrypto,a,'LOGIN',challenge.nonce);
 await assert.rejects(()=>broker.login(a.deviceId,challenge.nonce,correct),/expired|invalid/i);
 const token=await login(broker,a);
 assert.equal(broker.authorize(token),a.deviceId);
 assert.throws(()=>broker.authorize('0'.repeat(64)),/Unauthorized/);
});
test('registered caller can submit signed short-lived call only to registered recipient',async()=>{
 let now=Date.now();
 const broker=new Broker({clock:()=>now});
 const alice=await Auth.generate(webcrypto),bob=await Auth.generate(webcrypto);
 await enroll(broker,alice);await enroll(broker,bob);
 const at=await login(broker,alice),bt=await login(broker,bob);
 const permission=broker.requestPairing(at,bob.deviceId);
 broker.approvePairing(bt,permission.requestId,alice.deviceId);
 const signed=await Auth.signInvite(webcrypto,alice,bob.deviceId,now);
 assert.deepEqual(await broker.submitInvite(at,signed),{accepted:true,expiresAt:now+30000});
 await assert.rejects(()=>broker.submitInvite(at,signed),/Rejected invitation/);
 assert.equal(broker.takeInvites(bt).length,1);
 assert.deepEqual(broker.takeInvites(bt),[]);
 const second=await Auth.signInvite(webcrypto,alice,bob.deviceId,now);
 await assert.rejects(()=>broker.submitInvite(bt,second),/Unauthorized invitation/);
 const forged={...second,body:{...second.body,to:alice.deviceId}};
 await assert.rejects(()=>broker.submitInvite(at,forged),/Unknown recipient|Rejected invitation/);
 now+=31000;
 await assert.rejects(()=>broker.submitInvite(at,second),/Rejected invitation/);
});
test('revoked device cannot authorize, receive or send invites',async()=>{
 const broker=new Broker(),alice=await Auth.generate(webcrypto),bob=await Auth.generate(webcrypto);
 await enroll(broker,alice);await enroll(broker,bob);
 const at=await login(broker,alice),bt=await login(broker,bob);
 assert.equal(broker.revoke(bt),true);
 assert.throws(()=>broker.authorize(bt),/Unauthorized/);
 assert.throws(()=>broker.issueLogin(bob.deviceId),/Unknown device/);
 const invitation=await Auth.signInvite(webcrypto,alice,bob.deviceId);
 await assert.rejects(()=>broker.submitInvite(at,invitation),/Unknown recipient/);
});
test('enrollment and login proofs expire; bad encoding and queue flooding fail closed',async()=>{
 let now=Date.now();const broker=new Broker({clock:()=>now});
 const a=await Auth.generate(webcrypto);
 const pub=hex(await webcrypto.subtle.exportKey('raw',a.publicKey));
 assert.throws(()=>broker.issueLogin(a.deviceId),/Unknown device/);
 await assert.rejects(()=>broker.issueEnrollment('04'+'z'.repeat(128)),/Invalid public key/);
 const c=await broker.issueEnrollment(pub);
 const proof=await Auth.signChallenge(webcrypto,a,'ENROLL',c.nonce);
 now+=61000;
 await assert.rejects(()=>broker.enroll(pub,c.nonce,proof),/expired|invalid/i);
 await assert.rejects(()=>Auth.signChallenge(webcrypto,a,'OTHER',c.nonce),/Invalid device challenge/);
});

test('login token expires, and rate limiting refuses repeated invitation abuse',async()=>{
 let now=Date.now();const broker=new Broker({clock:()=>now});
 const alice=await Auth.generate(webcrypto),bob=await Auth.generate(webcrypto);
 await enroll(broker,alice);await enroll(broker,bob);
 const token=await login(broker,alice),target=await login(broker,bob);
 const permission=broker.requestPairing(token,bob.deviceId);
 broker.approvePairing(target,permission.requestId,alice.deviceId);
 for(let i=0;i<5;i++) {
   const invite=await Auth.signInvite(webcrypto,alice,bob.deviceId,now);
   assert.equal((await broker.submitInvite(token,invite)).accepted,true);
 }
 const sixth=await Auth.signInvite(webcrypto,alice,bob.deviceId,now);
 await assert.rejects(()=>broker.submitInvite(token,sixth),/Rate limited/);
 now+=15*60000+1;
 assert.throws(()=>broker.authorize(token),/Unauthorized/);
});

test('unpaired signed caller is denied until recipient approves exact fingerprint',async()=>{
 const broker=new Broker(),a=await Auth.generate(webcrypto),b=await Auth.generate(webcrypto),c=await Auth.generate(webcrypto);
 await enroll(broker,a);await enroll(broker,b);await enroll(broker,c);
 const at=await login(broker,a),bt=await login(broker,b),ct=await login(broker,c);
 const invite=await Auth.signInvite(webcrypto,a,b.deviceId);
 await assert.rejects(()=>broker.submitInvite(at,invite),/Pairing approval required/);
 const req=broker.requestPairing(at,b.deviceId);
 assert.equal(broker.listPairRequests(ct).length,0);
 assert.equal(broker.listPairRequests(bt)[0].from,a.deviceId);
 assert.throws(()=>broker.approvePairing(ct,req.requestId,a.deviceId),/consent denied/);
 assert.throws(()=>broker.approvePairing(bt,req.requestId,c.deviceId),/consent denied/);
 assert.equal(broker.approvePairing(bt,req.requestId,a.deviceId),true);
 assert.throws(()=>broker.approvePairing(bt,req.requestId,a.deviceId),/consent denied/);
 assert.equal((await broker.submitInvite(at,invite)).accepted,true);
 assert.equal(broker.takeInvites(bt).length,1);
});
test('rejected and expired pairing requests cannot silently establish trust',async()=>{
 let now=Date.now();const broker=new Broker({clock:()=>now});
 const a=await Auth.generate(webcrypto),b=await Auth.generate(webcrypto);
 await enroll(broker,a);await enroll(broker,b);
 const at=await login(broker,a),bt=await login(broker,b);
 const req=broker.requestPairing(at,b.deviceId);
 assert.equal(broker.rejectPairing(bt,req.requestId),true);
 assert.throws(()=>broker.approvePairing(bt,req.requestId,a.deviceId),/consent denied/);
 const second=broker.requestPairing(at,b.deviceId);
 now+=120001;
 assert.deepEqual(broker.listPairRequests(bt),[]);
 assert.throws(()=>broker.approvePairing(bt,second.requestId,a.deviceId),/consent denied/);
 await assert.rejects(()=>broker.submitInvite(at,await Auth.signInvite(webcrypto,a,b.deviceId,now)),/Pairing approval required/);
});
test('removing pairing and device revocation invalidate queued invitations',async()=>{
 const broker=new Broker(),a=await Auth.generate(webcrypto),b=await Auth.generate(webcrypto);
 await enroll(broker,a);await enroll(broker,b);
 const at=await login(broker,a),bt=await login(broker,b);
 let req=broker.requestPairing(at,b.deviceId);
 broker.approvePairing(bt,req.requestId,a.deviceId);
 await broker.submitInvite(at,await Auth.signInvite(webcrypto,a,b.deviceId));
 assert.equal(broker.removePairing(bt,a.deviceId),true);
 assert.deepEqual(broker.takeInvites(bt),[]);
 await assert.rejects(()=>broker.submitInvite(at,await Auth.signInvite(webcrypto,a,b.deviceId)),/Pairing approval required/);
 req=broker.requestPairing(at,b.deviceId);broker.approvePairing(bt,req.requestId,a.deviceId);
 await broker.submitInvite(at,await Auth.signInvite(webcrypto,a,b.deviceId));
 assert.equal(broker.revoke(at),true);
 assert.deepEqual(broker.takeInvites(bt),[]);
 assert.throws(()=>broker.requestPairing(bt,a.deviceId),/Unknown pairing recipient/);
});
test('pairing attempts are limited by device within a minute',async()=>{
 const broker=new Broker(),a=await Auth.generate(webcrypto),b=await Auth.generate(webcrypto);
 await enroll(broker,a);await enroll(broker,b);
 const at=await login(broker,a),bt=await login(broker,b);
 for(let i=0;i<3;i++)assert.ok(broker.requestPairing(at,b.deviceId).requestId);
 assert.throws(()=>broker.requestPairing(at,b.deviceId),/Rate limited/);
 assert.equal(broker.listPairRequests(bt).length,3);
});
