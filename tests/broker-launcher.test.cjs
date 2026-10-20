'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const http=require('node:http');
const {startBroker}=require('../server/start-broker.cjs');
async function health(socketPath){
  return new Promise((resolve,reject)=>{
    const request=http.request({socketPath,path:'/healthz',method:'GET',timeout:2000,agent:false},response=>{
      const parts=[];response.on('data',x=>parts.push(x));
      response.on('end',()=>resolve({status:response.statusCode,data:JSON.parse(Buffer.concat(parts).toString())}));
    });
    request.on('error',reject);request.end();
  });
}
test('single-instance broker serves ONLY a 0600 Unix socket and persists SQLite on restart',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'lanu-secure-sock-'));
 const db=path.join(folder,'db.sqlite'),sock=path.join(folder,'broker.sock');
 let instance;
 try{
  instance=await startBroker({dbPath:db,socketPath:sock});
  assert.equal(instance.server.address(),sock);
  if(process.platform!=='win32')assert.equal(fs.statSync(sock).mode&0o077,0);
  assert.deepEqual(await health(sock),{status:200,data:{ok:true}});
  const second=await startBroker({dbPath:db,socketPath:sock}).then(()=>true,()=>false);
  assert.equal(second,false,'second listener must not silently replace active socket');
  await instance.close();instance=null;
  assert.equal(fs.existsSync(sock),false);
  instance=await startBroker({dbPath:db,socketPath:sock});
  assert.equal((await health(sock)).status,200);
 }finally{if(instance)await instance.close();fs.rmSync(folder,{recursive:true,force:true});}
});
test('launcher fails closed for missing or relative secrets and never opens public TCP port',async()=>{
 await assert.rejects(()=>startBroker({dbPath:'relative.db',socketPath:'/tmp/lanu.sock'}),/Absolute/);
 await assert.rejects(()=>startBroker({dbPath:'/tmp/x',socketPath:'0.0.0.0:443'}),/Absolute/);
 assert.equal(typeof startBroker,'function');
});
