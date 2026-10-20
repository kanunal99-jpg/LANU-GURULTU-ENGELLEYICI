'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Broker}=require('../server/identity-broker.cjs');
const {BrokerSqliteStore}=require('../server/broker-sqlite-store.cjs');
const Auth=require('../app/src/main/assets/auth-protocol.js');
const pub=async identity=>Buffer.from(await webcrypto.subtle.exportKey('raw',identity.publicKey)).toString('hex');
async function enrollment(broker,identity){
 const raw=await pub(identity),c=await broker.issueEnrollment(raw);
 return broker.enroll(raw,c.nonce,await Auth.signChallenge(webcrypto,identity,'ENROLL',c.nonce));
}
async function session(broker,identity){
 const c=broker.issueLogin(identity.deviceId);
 return broker.login(identity.deviceId,c.nonce,await Auth.signChallenge(webcrypto,identity,'LOGIN',c.nonce));
}
function disk(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lanu-broker-db-'));
 return {name:path.join(dir,'broker.sqlite'),close:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('real SQLite survives process restart with public devices, consent and rejected reused call nonce',async()=>{
 const temp=disk();let store;
 try{
  const alice=await Auth.generate(webcrypto),bob=await Auth.generate(webcrypto);
  store=new BrokerSqliteStore(temp.name);
  let broker=await Broker.openPersistent(store);
  await enrollment(broker,alice);await enrollment(broker,bob);
  let a=await session(broker,alice),b=await session(broker,bob);
  const consent=broker.requestPairing(a,bob.deviceId);
  broker.approvePairing(b,consent.requestId,alice.deviceId);
  const invite=await Auth.signInvite(webcrypto,alice,bob.deviceId);
  assert.equal((await broker.submitInvite(a,invite)).accepted,true);
  store.close();store=null;
  store=new BrokerSqliteStore(temp.name);
  broker=await Broker.openPersistent(store);
  assert.equal(broker.devices.size,2);
  assert.equal(broker.trustedPairs.size,1);
  assert.throws(()=>broker.authorize(a),/Unauthorized/);
  assert.equal(broker.pending.size,0);
  assert.equal(broker.pairRequests.size,0);
  a=await session(broker,alice);b=await session(broker,bob);
  await assert.rejects(()=>broker.submitInvite(a,invite),/Rejected invitation/);
  assert.equal((await broker.submitInvite(a,await Auth.signInvite(webcrypto,alice,bob.deviceId))).accepted,true);
  assert.equal(broker.takeInvites(b).length,1);
  assert.equal(broker.revoke(a),true);
  store.close();store=null;
  store=new BrokerSqliteStore(temp.name);
  broker=await Broker.openPersistent(store);
  assert.equal(broker.devices.get(alice.deviceId).revoked,true);
  assert.equal(broker.trustedPairs.size,0);
  assert.throws(()=>broker.issueLogin(alice.deviceId),/Unknown device/);
  assert.equal(broker.devices.get(bob.deviceId).revoked,false);
 }finally{if(store)store.close();temp.close();}
});
test('failed durable writes never enroll a ghost device, grant consent or revoke a live identity',async()=>{
 const temp=disk();let store;
 try{
  store=new BrokerSqliteStore(temp.name);
  const broker=await Broker.openPersistent(store);
  const alice=await Auth.generate(webcrypto),bob=await Auth.generate(webcrypto);
  const originalInsert=store.insertDevice.bind(store);
  store.insertDevice=()=>{throw Error('Disk error');};
  await assert.rejects(()=>enrollment(broker,alice),/Disk error/);
  assert.equal(broker.devices.has(alice.deviceId),false);
  store.insertDevice=originalInsert;
  await enrollment(broker,alice);await enrollment(broker,bob);
  const a=await session(broker,alice),b=await session(broker,bob);
  const req=broker.requestPairing(a,bob.deviceId);
  const add=store.addPair.bind(store);
  store.addPair=()=>{throw Error('DB unavailable');};
  assert.throws(()=>broker.approvePairing(b,req.requestId,alice.deviceId),/DB unavailable/);
  assert.equal(broker.trustedPairs.size,0);
  store.addPair=add;
  broker.approvePairing(b,req.requestId,alice.deviceId);
  const revoke=store.revoke.bind(store);
  store.revoke=()=>{throw Error('DB unavailable');};
  assert.throws(()=>broker.revoke(a),/DB unavailable/);
  assert.equal(broker.devices.get(alice.deviceId).revoked,false);
  store.revoke=revoke;
  const nonce=store.consumeInviteNonce.bind(store);
  store.consumeInviteNonce=()=>{throw Error('DB unavailable');};
  await assert.rejects(async()=>broker.submitInvite(a,await Auth.signInvite(webcrypto,alice,bob.deviceId)),/DB unavailable/);
  assert.equal(broker.pending.size,0);
  store.consumeInviteNonce=nonce;
 }finally{if(store)store.close();temp.close();}
});
test('corrupt durable public-key fingerprint and symlink file are rejected before account use',async()=>{
 const temp=disk();let store;
 try{
  store=new BrokerSqliteStore(temp.name);
  store.db.prepare('INSERT INTO devices(id,keyhex,revoked) VALUES(?,?,?)').run('a'.repeat(64),'04'+'b'.repeat(128),0);
  await assert.rejects(()=>Broker.openPersistent(store),/Corrupt persisted device identity/);
  store.close();store=null;
  const link=path.join(path.dirname(temp.name),'evil.sqlite');
  fs.symlinkSync(temp.name,link);
  assert.throws(()=>new BrokerSqliteStore(link),/Symlink database/);
 }finally{if(store)store.close();temp.close();}
});
test('duplicate persistent public identities fail closed, SQLite data is restricted and no private key serialized',async()=>{
 const temp=disk();let store;
 try{
  store=new BrokerSqliteStore(temp.name);
  const identity=await Auth.generate(webcrypto),broker=await Broker.openPersistent(store);
  await enrollment(broker,identity);
  const stat=fs.statSync(temp.name);
  if(process.platform!=='win32')assert.equal(stat.mode&0o077,0);
  const rows=store.load();
  assert.equal(rows.devices.length,1);
  assert.equal(rows.devices[0].id,identity.deviceId);
  assert.equal(rows.devices[0].keyhex,await pub(identity));
  assert.equal(Object.hasOwn(rows.devices[0],'privateKey'),false);
  assert.throws(()=>store.insertDevice(identity.deviceId,rows.devices[0].keyhex),/UNIQUE|constraint/i);
 }finally{if(store)store.close();temp.close();}
});
