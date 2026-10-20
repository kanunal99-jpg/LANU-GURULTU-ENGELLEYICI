'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {Broker}=require('../server/identity-broker.cjs');
const {handlerFor,TRUSTED_ORIGIN}=require('../server/broker-http.cjs');
async function withServer(callback){
 const server=http.createServer(handlerFor(new Broker()));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  return await callback((path,method='OPTIONS',headers={})=>new Promise((resolve,reject)=>{
   const req=http.request({hostname:'127.0.0.1',port:server.address().port,path,method,headers},
    res=>{let data='';res.on('data',v=>data+=v);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(data),headers:res.headers}));});
   req.on('error',reject);req.end();
  }));
 }finally{await new Promise(resolve=>server.close(resolve));}
}
test('unknown route, untrusted origin, wrong method and extra header fail CORS preflight closed',async()=>{
 await withServer(async send=>{
  const cors={Origin:TRUSTED_ORIGIN,'Access-Control-Request-Method':'POST'};
  for(const args of [
   ['/v1/evil','OPTIONS',cors],
   ['/v1/pairs/pending','OPTIONS',{'Access-Control-Request-Method':'POST'}],
   ['/v1/pairs/pending','OPTIONS',{...cors,Origin:'https://evil.example'}],
   ['/v1/pairs/pending','OPTIONS',{...cors,'Access-Control-Request-Method':'DELETE'}],
   ['/v1/pairs/pending','OPTIONS',{...cors,'Access-Control-Request-Headers':'X-Unsafe'}]
  ]){
   assert.equal((await send(...args)).status,403,args[0]);
  }
  const good=await send('/v1/pairs/pending','OPTIONS',{...cors,'Access-Control-Request-Headers':'authorization, content-type'});
  assert.equal(good.status,200);
  assert.equal(good.headers['access-control-allow-origin'],TRUSTED_ORIGIN);
  assert.equal(good.headers['access-control-allow-methods'],'POST');
 });
});
test('declared large or ambiguous JSON bodies rejected without waiting to read',async()=>{
 await withServer(async send=>{
  const req={'Content-Type':'application/json','Content-Length':'99999999'};
  const blocked=await send('/v1/enroll/challenge','POST',req);
  assert.equal(blocked.status,413);
  assert.equal(blocked.body.error,'request_too_large');
 });
});
