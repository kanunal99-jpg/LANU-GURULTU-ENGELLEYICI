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
