(function(root){
 'use strict';
 // Offline/dormant until a user-approved HTTPS broker endpoint exists.
 // This module never modifies PeerJS or the PIN vault automatically.
 const AUTH=root.LanuAuthProtocol || (typeof module!=='undefined' ? require('./auth-protocol.js') : null);
 const KEY_STORE=root.LanuDeviceKeyStore || (typeof module!=='undefined' ? require('./auth-keystore.js') : null);
 const id=/^[a-f0-9]{64}$/,nonce=/^[a-f0-9]{32}$/;
 function create({baseUrl,fetchApi,cryptoApi,indexedDb,clock=()=>Date.now()}={}){
   if(typeof baseUrl!=='string'||!/^https:\/\/[a-z0-9.-]+(?::443)?\/$/.test(baseUrl)||
      baseUrl.includes('..')||baseUrl.includes('appassets.androidplatform.net')||
      baseUrl.length>160)
     throw Error('Pinned HTTPS broker origin required');
   if(typeof fetchApi!=='function'||!(cryptoApi && cryptoApi.subtle)||!indexedDb||!AUTH||!KEY_STORE)
     throw Error('Secure browser and device identity required');
   const store=KEY_STORE.create(indexedDb);
   let token=null,deviceId=null;
   function expire(){token=null;deviceId=null;}
   async function request(path,body,bearer){
     if(!/^\/v1\/[a-z/]+$/.test(path))throw Error('Invalid broker API route');
     if(bearer && !token)throw Error('Authentication required');
     const url=baseUrl.slice(0,-1)+path;
     const res=await fetchApi(url,{
       method:'POST',mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',
       referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json',
         ...(bearer?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)
     });
     if(!res||res.redirected||res.status!==200||
        !/^application\/json(?:;|$)/i.test((res.headers && res.headers.get('content-type'))||'')){
       if(bearer)expire();
       throw Error('Secure broker request was rejected');
     }
     const raw=await res.text();
     if(typeof raw!=='string'||raw.length>16*1024)throw Error('Broker response too large');
     const data=JSON.parse(raw);
     if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid broker response');
     return data;
   }
   function assertChallenge(challenge,purpose,expectedId){
     if(!challenge||challenge.purpose!==purpose||challenge.deviceId!==expectedId||
        !nonce.test(challenge.nonce)||!Number.isSafeInteger(challenge.expiresAt)||
        challenge.expiresAt<clock()||challenge.expiresAt>clock()+65000)
       throw Error('Broker challenge rejected');
   }
   async function enroll(identity){
     if(!identity || !id.test(identity.deviceId) || !identity.publicKey || !identity.privateKey)
       throw Error('Invalid device identity');
     const raw=Array.from(new Uint8Array(await cryptoApi.subtle.exportKey('raw',identity.publicKey)),
       value=>value.toString(16).padStart(2,'0')).join('');
     const challenge=await request('/v1/enroll/challenge',{publicKey:raw},false);
     assertChallenge(challenge,'ENROLL',identity.deviceId);
     const signature=await AUTH.signChallenge(cryptoApi,identity,'ENROLL',challenge.nonce);
     const result=await request('/v1/enroll/complete',{publicKey:raw,nonce:challenge.nonce,signature},false);
     if(result.deviceId!==identity.deviceId)throw Error('Enrollment identity mismatch');
     return identity.deviceId;
   }
   async function signIn(){
     expire();
     const identity=await store.load();
     if(!identity||(!identity.privateKey || identity.privateKey.extractable!==false) ||
        !id.test(identity.deviceId))throw Error('Device enrollment missing');
     const challenge=await request('/v1/session/challenge',{deviceId:identity.deviceId},false);
     assertChallenge(challenge,'LOGIN',identity.deviceId);
     const signature=await AUTH.signChallenge(cryptoApi,identity,'LOGIN',challenge.nonce);
     const result=await request('/v1/session/complete',{deviceId:identity.deviceId,nonce:challenge.nonce,signature},false);
     if(typeof result.token!=='string'||!id.test(result.token)||result.ttlSeconds!==900)
       throw Error('Invalid session');
     token=result.token;deviceId=identity.deviceId;
     return identity.deviceId;
   }
   function ensure(){if(!deviceId||!token)throw Error('Authentication required');}
   async function pendingPairings(){ensure();return (await request('/v1/pairs/pending',{},true)).requests;}
   async function requestPairing(recipientId){ensure();if(!id.test(recipientId)||recipientId===deviceId)throw Error('Invalid recipient');return request('/v1/pairs/request',{recipientId},true);}
   async function approvePairing(requestId,expectedRequesterFingerprint){
     ensure();if(!nonce.test(requestId)||!id.test(expectedRequesterFingerprint)||expectedRequesterFingerprint===deviceId)
       throw Error('Recipient consent verification required');
     return request('/v1/pairs/approve',{requestId,expectedRequesterFingerprint},true);
   }
   async function submitCall(recipientId){
     ensure();if(!id.test(recipientId)||recipientId===deviceId)throw Error('Invalid recipient');
     const identity=await store.load();
     if(!identity||identity.deviceId!==deviceId)throw Error('Device identity changed');
     const envelope=await AUTH.signInvite(cryptoApi,identity,recipientId,clock());
     return request('/v1/calls/invite',{envelope},true);
   }
   async function pendingCalls(){ensure();return (await request('/v1/calls/pending',{},true)).invites;}
   async function revoke(){ensure();const r=await request('/v1/devices/revoke',{},true);expire();return r.revoked===true;}
   return Object.freeze({enroll,signIn,expire,pendingPairings,requestPairing,approvePairing,submitCall,pendingCalls,revoke});
 }
 const api=Object.freeze({create});
 root.LanuBrokerClient=api;
 if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
