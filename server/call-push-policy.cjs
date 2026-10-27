'use strict';
// Abstract push authorization policy only: NOT a working FCM/HMS sender.
// An external server transport and platform credentials are required.
// Never put PINs, contacts, device public keys or message text in push.
const ID=/^[a-f0-9]{64}$/;
const NONCE=/^[a-f0-9]{32}$/;
async function dispatchAuthenticatedCall({broker,sessionToken,envelope,send,clock=()=>Date.now()}={}){
 if(!broker||typeof broker.submitInvite!=='function'||typeof send!=='function')
   throw Error('Secure broker and push transport required');
 const body=envelope&&envelope.body;
 if(!body||!ID.test(body.from)||!ID.test(body.to)||!NONCE.test(body.callId)||
    !Number.isSafeInteger(body.expiresAt)||body.expiresAt<=clock()||
    body.expiresAt>clock()+30000)
   throw Error('Invalid or expired call signal');
 // The caller's live session, signature, consent, anti-replay and revocation
 // are validated by broker BEFORE a transport can receive any push payload.
 const accepted=await broker.submitInvite(sessionToken,envelope);
 // Consent or the device can be revoked while the async signature/nonce
 // validation resolves. A queued invite is never permission to wake a
 // device after its pairing has been removed.
 let stillAllowed=false;
 try{
   const caller=broker.authorize(sessionToken);
   const recipient=broker.devices.get(body.to);
   stillAllowed=caller===body.from && recipient && !recipient.revoked &&
     broker.trustedPairs.has(broker.pairKey(body.from,body.to));
 }catch(_){}
 if(!stillAllowed)return {accepted:false,notified:false,delivery:'cancelled'};
 const ttl=Math.max(0,Math.min(30,Math.ceil((accepted.expiresAt-clock())/1000)));
 if(ttl===0)return {accepted:true,notified:false,delivery:'poll'};
 const payload=Object.freeze({type:'LANU_CALL_WAKE_V1',callId:body.callId,expiresAt:accepted.expiresAt});
 try{
  // send MUST be server injected. No client-supplied push token is accepted.
  const result=await send(body.to,payload,{ttlSeconds:ttl,priority:'high'});
  return {accepted:true,notified:result===true,delivery:result===true?'push':'poll'};
 }catch(_){
  // Call remains in broker's authenticated recipient inbox, where it can
  // be polled. No unauthorized push and no exception details to the client.
  return {accepted:true,notified:false,delivery:'poll'};
 }
}
module.exports={dispatchAuthenticatedCall};
