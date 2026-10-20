'use strict';
// Transport boundary for the not-yet-deployed LANU identity broker.
// Must run behind a correctly configured HTTPS reverse proxy; never bind
// this handler directly to a public plaintext TCP socket.
const MAX_BODY=16*1024;
const TRUSTED_ORIGIN='https://appassets.androidplatform.net';
function handlerFor(broker){
  if(!broker || typeof broker.issueEnrollment!=='function')
    throw Error('Broker instance required');
  const routes={
    '/v1/enroll/challenge':{fields:['publicKey'],run:b=>broker.issueEnrollment(b.publicKey)},
    '/v1/enroll/complete':{fields:['publicKey','nonce','signature'],run:async b=>({deviceId:await broker.enroll(b.publicKey,b.nonce,b.signature)})},
    '/v1/session/challenge':{fields:['deviceId'],run:b=>broker.issueLogin(b.deviceId)},
    '/v1/session/complete':{fields:['deviceId','nonce','signature'],run:async b=>({token:await broker.login(b.deviceId,b.nonce,b.signature),ttlSeconds:900})},
    '/v1/pairs/request':{auth:true,fields:['recipientId'],run:(b,t)=>broker.requestPairing(t,b.recipientId)},
    '/v1/pairs/pending':{auth:true,fields:[],run:(b,t)=>({requests:broker.listPairRequests(t)})},
    '/v1/pairs/approve':{auth:true,fields:['requestId','expectedRequesterFingerprint'],run:(b,t)=>({accepted:broker.approvePairing(t,b.requestId,b.expectedRequesterFingerprint)})},
    '/v1/pairs/reject':{auth:true,fields:['requestId'],run:(b,t)=>({rejected:broker.rejectPairing(t,b.requestId)})},
    '/v1/pairs/remove':{auth:true,fields:['otherId'],run:(b,t)=>({removed:broker.removePairing(t,b.otherId)})},
    '/v1/calls/invite':{auth:true,fields:['envelope'],run:(b,t)=>broker.submitInvite(t,b.envelope)},
    '/v1/calls/pending':{auth:true,fields:[],run:(b,t)=>({invites:broker.takeInvites(t)})},
    '/v1/devices/revoke':{auth:true,fields:[],run:(b,t)=>({revoked:broker.revoke(t)})}
  };
  const respond=(res,status,data)=>{
    if(res.headersSent)return;
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store, max-age=0','Pragma':'no-cache',
      'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
      'Content-Security-Policy':"default-src 'none'",'X-Frame-Options':'DENY'});
    res.end(JSON.stringify(data));
  };
  return async(req,res)=>{
    const origin=req.headers.origin;
    if(origin!==undefined && origin!==TRUSTED_ORIGIN){
      respond(res,403,{error:'forbidden_origin'});return;
    }
    // Explicit allowlist, never wildcard and never cookie-based auth.
    if(origin===TRUSTED_ORIGIN){
      res.setHeader('Access-Control-Allow-Origin',TRUSTED_ORIGIN);
      res.setHeader('Vary','Origin');
    }
    if(req.method==='OPTIONS'){
      res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
      res.setHeader('Access-Control-Max-Age','600');
      respond(res,200,{ok:true});return;
    }
    if(req.method==='GET' && req.url==='/healthz'){
      respond(res,200,{ok:true});return;
    }
    if(req.method!=='POST'||!Object.hasOwn(routes,req.url||'')){
      respond(res,404,{error:'not_found'});return;
    }
    const route=routes[req.url];
    const contentType=req.headers['content-type']||'';
    if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(contentType)){
      respond(res,415,{error:'json_required'});return;
    }
    let token;
    if(route.auth){
      const authorization=req.headers.authorization||'';
      if(!/^Bearer [0-9a-f]{64}$/.test(authorization)){
        respond(res,401,{error:'unauthorized'});return;
      }
      token=authorization.slice(7);
    }
    try{
      let size=0;const pieces=[];
      for await(const piece of req){
        size+=piece.length;
        if(size>MAX_BODY)throw Error('Body too large');
        pieces.push(piece);
      }
      const raw=Buffer.concat(pieces).toString('utf8');
      if(!raw || Buffer.byteLength(raw,'utf8')>MAX_BODY)throw Error('Invalid body');
      const body=JSON.parse(raw);
      if(!body||Array.isArray(body)||typeof body!=='object'||
         Object.keys(body).sort().join(',')!==[...route.fields].sort().join(','))
        throw Error('Invalid request fields');
      const value=await route.run(body,token);
      respond(res,200,value);
    }catch(error){
      // Do not reflect PINs, bearer tokens, public keys, file paths,
      // device identifiers or internal SQL errors to callers/logs.
      const message=String(error?.message||'');
      const status=/Body too large/.test(message)?413:
        /Unauthorized|Authentication denied|Unknown device|Challenge expired/.test(message)?401:
        /Rate limited/.test(message)?429:
        /Pairing approval required|Pairing consent denied/.test(message)?403:
        /SQLITE_|database|DB unavailable|capacity|Disk error/.test(message)?503:400;
      respond(res,status,{error:status===413?'request_too_large':
        status===401?'unauthorized':status===429?'rate_limited':
        status===403?'forbidden':status===503?'service_unavailable':'bad_request'});
    }
  };
}
module.exports={handlerFor,TRUSTED_ORIGIN};
