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
  constructor({crypto=webcrypto,clock=()=>Date.now()}={}){
    this.crypto=crypto;this.clock=clock;
    this.devices=new Map();this.challenges=new Map();this.sessions=new Map();
    this.pending=new Map();this.attempts=new Map();this.replay=new Auth.ReplayCache(1024);
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
  async submitInvite(token,envelope){
    const from=this.authorize(token);
    if(!envelope||!envelope.body||envelope.body.from!==from)
      throw Error('Unauthorized invitation');
    this.throttle('invite:'+from,5);
    const to=envelope.body.to,recipient=this.devices.get(to),sender=this.devices.get(from);
    if(!recipient||recipient.revoked||!sender||sender.revoked||to===from)
      throw Error('Unknown recipient');
    const now=this.clock();
    if(!await Auth.verifyInvite(this.crypto,envelope,sender.publicKey,from,to,this.replay,now))
      throw Error('Rejected invitation');
    const pending=this.pending.get(to)||[];
    const active=pending.filter(e=>e.body.expiresAt>=now);
    if(active.length>=10)throw Error('Recipient busy');
    active.push(envelope);this.pending.set(to,active);
    return {accepted:true,expiresAt:envelope.body.expiresAt};
  }
  takeInvites(token){
    const id=this.authorize(token);
    const items=(this.pending.get(id)||[]).filter(e=>e.body.expiresAt>=this.clock());
    this.pending.delete(id);
    return items;
  }
  revoke(token){
    const id=this.authorize(token);
    this.devices.get(id).revoked=true;
    this.pending.delete(id);
    for(const [key,value] of this.sessions) if(value.id===id)this.sessions.delete(key);
    return true;
  }
}
module.exports={Broker,signingBytes};
