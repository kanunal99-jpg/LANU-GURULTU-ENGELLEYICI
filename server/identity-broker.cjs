'use strict';
// Security core for a future LANU authentication/FCM service. It deliberately
// does not listen on a port: TLS, durable storage, authenticated pairing,
// device recovery and push delivery are required before production exposure.
const {webcrypto} = require('node:crypto');
const Auth = require('../app/src/main/assets/auth-protocol.js');
const te=new TextEncoder();
const hex=bytes=>Buffer.from(bytes).toString('hex');
const unhex=value=>{
  if(typeof value!=='string' || value.length%2!==0 || !/^[a-f0-9]+$/.test(value))
    throw Error('Invalid encoding');
  return new Uint8Array(Buffer.from(value,'hex'));
};
const publicKeyFormat=value=>typeof value==='string' && /^04[0-9a-f]{128}$/.test(value);
const nonceFormat=value=>typeof value==='string' && /^[a-f0-9]{32}$/.test(value);
const idFormat=value=>typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
function signingBytes(purpose,id,nonce){
  return te.encode('LANU_DEVICE_'+purpose+'_V1\n'+id+'\n'+nonce);
}
class Broker {
  constructor({crypto=webcrypto,clock=()=>Date.now(),persistence=null}={}){
    this.crypto=crypto;this.clock=clock;this.persistence=persistence;
    this.devices=new Map();this.challenges=new Map();this.sessions=new Map();
    this.pending=new Map();this.attempts=new Map();this.replay=new Auth.ReplayCache(1024);
    this.pairRequests=new Map();this.trustedPairs=new Set();
  }
  // A restart invalidates pending login/enrollment challenges and session
  // tokens. Only public device identities, consent and replay history survive.
  static async openPersistent(store,options={}){
    if(!store || typeof store.load!=='function')throw Error('Durable store unavailable');
    const broker=new Broker({...options,persistence:store});
    const snapshot=store.load();
    if(!snapshot || !Array.isArray(snapshot.devices)||!Array.isArray(snapshot.pairs))
      throw Error('Corrupt durable identity state');
    for(const row of snapshot.devices){
      if(!row || !idFormat(row.id) || !publicKeyFormat(row.keyhex) ||
         (row.revoked!==0 && row.revoked!==1) ||
         await broker.fingerprint(row.keyhex)!==row.id)
        throw Error('Corrupt persisted device identity');
      const key=await broker.crypto.subtle.importKey('raw',unhex(row.keyhex),
        {name:'ECDSA',namedCurve:'P-256'},true,['verify']);
      broker.devices.set(row.id,{publicKey:key,revoked:row.revoked===1});
    }
    for(const pair of snapshot.pairs){
      if(!pair || !idFormat(pair.a)||!idFormat(pair.b)||
         pair.a>=pair.b || !broker.devices.has(pair.a)||!broker.devices.has(pair.b)||
         broker.devices.get(pair.a).revoked||broker.devices.get(pair.b).revoked)
        throw Error('Corrupt persisted trust relation');
      broker.trustedPairs.add(broker.pairKey(pair.a,pair.b));
    }
    return broker;
  }
  random(bytes=16){return hex(this.crypto.getRandomValues(new Uint8Array(bytes)));}
  throttle(key,max=6){
    const now=this.clock(),times=(this.attempts.get(key)||[]).filter(t=>now-t<60000);
    if(times.length>=max)throw Error('Rate limited');
    times.push(now);this.attempts.set(key,times);
    if(this.attempts.size>1024) {
      for(const [k,v] of this.attempts) if(!v.some(t=>now-t<60000)) this.attempts.delete(k);
      while(this.attempts.size>1024)this.attempts.delete(this.attempts.keys().next().value);
    }
  }
  async fingerprint(raw){
    if(!publicKeyFormat(raw))throw Error('Invalid public key');
    return hex(await this.crypto.subtle.digest('SHA-256',unhex(raw)));
  }
  async issueEnrollment(raw){
    const id=await this.fingerprint(raw);
    this.throttle('enroll:'+id,3);
    if(this.devices.has(id))throw Error('Already enrolled');
    return this.challenge('ENROLL',id,raw);
  }
  issueLogin(id){
    if(!idFormat(id)||!this.devices.has(id)||this.devices.get(id).revoked)
      throw Error('Unknown device');
    this.throttle('login:'+id);
    return this.challenge('LOGIN',id);
  }
  challenge(purpose,id,publicKeyHex=null){
    // Old, unused challenge records must not permanently exhaust the service.
    for(const [k,record] of this.challenges) {
      if(record.expiresAt<this.clock())this.challenges.delete(k);
    }
    if(this.challenges.size>=1024)throw Error('Challenge capacity exhausted');
    const nonce=this.random(), expiresAt=this.clock()+60000;
    this.challenges.set(nonce,{purpose,id,publicKeyHex,expiresAt});
    return Object.freeze({deviceId:id,nonce,expiresAt,purpose});
  }
  takeChallenge(nonce,purpose,id){
    if(!nonceFormat(nonce))throw Error('Invalid challenge');
    const challenge=this.challenges.get(nonce);
    this.challenges.delete(nonce); // single-use even on a bad signature
    if(!challenge||challenge.id!==id||challenge.purpose!==purpose||
       challenge.expiresAt<this.clock())throw Error('Challenge expired or invalid');
    return challenge;
  }
  async verifyProof(key,signature,purpose,id,nonce){
    const signed=unhex(signature);
    if(signed.length!==64)throw Error('Invalid proof');
    return this.crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,signed,signingBytes(purpose,id,nonce));
  }
  async enroll(raw,nonce,signature){
    const id=await this.fingerprint(raw);
    const challenge=this.takeChallenge(nonce,'ENROLL',id);
    if(challenge.publicKeyHex!==raw || this.devices.has(id))throw Error('Enrollment denied');
    const key=await this.crypto.subtle.importKey('raw',unhex(raw),{name:'ECDSA',namedCurve:'P-256'},true,['verify']);
    if(!await this.verifyProof(key,signature,'ENROLL',id,nonce))throw Error('Enrollment denied');
    if(this.devices.size>=10000)throw Error('Registration capacity exhausted');
    // Write through first: never tell a client enrollment succeeded when
    // durable state refused the commit.
    if(this.persistence)this.persistence.insertDevice(id,raw);
    this.devices.set(id,{publicKey:key,revoked:false});
    return id;
  }
  async login(id,nonce,signature){
    const challenge=this.takeChallenge(nonce,'LOGIN',id);
    const device=this.devices.get(id);
    if(!device||device.revoked||!await this.verifyProof(device.publicKey,signature,'LOGIN',id,nonce))
      throw Error('Authentication denied');
    const token=this.random(32);
    for(const [old,session] of this.sessions)if(session.expiresAt<this.clock())this.sessions.delete(old);
    if(this.sessions.size>=10000)throw Error('Session capacity exhausted');
    this.sessions.set(token,{id,expiresAt:this.clock()+15*60000});
    return token;
  }
  authorize(token){
    const session=typeof token==='string'?this.sessions.get(token):null;
    if(!session||session.expiresAt<this.clock()||
       !this.devices.has(session.id)||this.devices.get(session.id).revoked)
      throw Error('Unauthorized');
    return session.id;
  }
  pairKey(a,b) {
    return [a,b].sort().join(':');
  }
  prunePairRequests() {
    for(const [id,req] of this.pairRequests)
      if(req.expiresAt<this.clock() ||
         !this.devices.has(req.from) || this.devices.get(req.from).revoked ||
         !this.devices.has(req.to) || this.devices.get(req.to).revoked)
        this.pairRequests.delete(id);
  }
  requestPairing(token,recipientId) {
    const from=this.authorize(token);
    if(!idFormat(recipientId) || recipientId===from ||
       !this.devices.has(recipientId) || this.devices.get(recipientId).revoked)
      throw Error('Unknown pairing recipient');
    this.throttle('pair:'+from,3);
    this.prunePairRequests();
    if(this.pairRequests.size>=1024)throw Error('Pairing capacity exhausted');
    if(this.trustedPairs.has(this.pairKey(from,recipientId)))
      throw Error('Devices already paired');
    const requestId=this.random(),expiresAt=this.clock()+120000;
    this.pairRequests.set(requestId,{from,to:recipientId,expiresAt});
    return Object.freeze({requestId,expiresAt});
  }
  listPairRequests(token) {
    const to=this.authorize(token);
    this.prunePairRequests();
    return [...this.pairRequests].filter(([,value])=>value.to===to)
      .slice(0,10).map(([requestId,value])=>Object.freeze({
        requestId,from:value.from,expiresAt:value.expiresAt
      }));
  }
  approvePairing(token,requestId,expectedRequesterFingerprint) {
    const to=this.authorize(token);
    this.prunePairRequests();
    const req=nonceFormat(requestId)?this.pairRequests.get(requestId):null;
    if(!req || req.to!==to || req.from!==expectedRequesterFingerprint ||
       !idFormat(expectedRequesterFingerprint))
      throw Error('Pairing consent denied');
    if(!this.devices.has(req.from)||this.devices.get(req.from).revoked)
      throw Error('Requester revoked');
    if(this.trustedPairs.size>=10000)throw Error('Pairing capacity exhausted');
    if(this.persistence)this.persistence.addPair(req.from,to);
    this.pairRequests.delete(requestId); // One-time consent after DB commit.
    this.trustedPairs.add(this.pairKey(req.from,to));
    return true;
  }
  rejectPairing(token,requestId) {
    const to=this.authorize(token);
    const req=nonceFormat(requestId)?this.pairRequests.get(requestId):null;
    if(!req || req.to!==to)throw Error('Pairing consent denied');
    this.pairRequests.delete(requestId);
    return true;
  }
  removePairing(token,otherId) {
    const device=this.authorize(token);
    if(!idFormat(otherId))throw Error('Invalid device');
    if(this.persistence)this.persistence.removePair(device,otherId);
    this.trustedPairs.delete(this.pairKey(device,otherId));
    // Any already queued invitation from this revoked pairing is invalidated.
    for(const id of [device,otherId])
      this.pending.set(id,(this.pending.get(id)||[]).filter(invite=>
        this.trustedPairs.has(this.pairKey(invite.body.from,invite.body.to))));
    return true;
  }
  async submitInvite(token,envelope){
    const from=this.authorize(token);
    if(!envelope||!envelope.body||envelope.body.from!==from)
      throw Error('Unauthorized invitation');
    this.throttle('invite:'+from,5);
    const to=envelope.body.to,recipient=this.devices.get(to),sender=this.devices.get(from);
    if(!recipient||recipient.revoked||!sender||sender.revoked||to===from)
      throw Error('Unknown recipient');
    if(!this.trustedPairs.has(this.pairKey(from,to)))throw Error('Pairing approval required');
    const now=this.clock();
    if(!await Auth.verifyInvite(this.crypto,envelope,sender.publicKey,from,to,this.replay,now))
      throw Error('Rejected invitation');
    // Signature verification is asynchronous; recheck authorization/consent
    // after it resolves so revocation while verifying cannot enqueue a call.
    if(this.authorize(token)!==from || !this.devices.has(to) ||
       this.devices.get(to).revoked ||
       !this.trustedPairs.has(this.pairKey(from,to)))
      throw Error('Pairing approval required');
    if(this.persistence && !this.persistence.consumeInviteNonce(from+':'+envelope.body.nonce,
        envelope.body.expiresAt,now))throw Error('Rejected invitation');
    const pending=this.pending.get(to)||[];
    const active=pending.filter(e=>e.body.expiresAt>=now);
    if(active.length>=10)throw Error('Recipient busy');
    active.push(envelope);this.pending.set(to,active);
    return {accepted:true,expiresAt:envelope.body.expiresAt};
  }
  takeInvites(token){
    const id=this.authorize(token);
    const items=(this.pending.get(id)||[]).filter(e=>e.body.expiresAt>=this.clock() &&
      this.devices.has(e.body.from) && !this.devices.get(e.body.from).revoked &&
      this.trustedPairs.has(this.pairKey(e.body.from,id)));
    this.pending.delete(id);
    return items;
  }
  revoke(token){
    const id=this.authorize(token);
    if(this.persistence)this.persistence.revoke(id);
    this.devices.get(id).revoked=true;
    this.pending.delete(id);
    for(const pair of this.trustedPairs)if(pair.split(':').includes(id))this.trustedPairs.delete(pair);
    for(const [requestId,req] of this.pairRequests)
      if(req.from===id || req.to===id)this.pairRequests.delete(requestId);
    for(const [target,items] of this.pending)
      this.pending.set(target,items.filter(invite=>invite.body.from!==id));
    for(const [key,value] of this.sessions) if(value.id===id)this.sessions.delete(key);
    return true;
  }
}
module.exports={Broker,signingBytes};
