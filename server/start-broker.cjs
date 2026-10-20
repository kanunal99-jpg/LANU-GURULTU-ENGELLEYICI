'use strict';
// A fail-closed, single-host launcher. No plaintext TCP listener exists:
// deployment requires an operator-managed TLS reverse proxy connecting to
// a restricted Unix-domain socket. No Firebase or FCM integration is implied.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {Broker}=require('./identity-broker.cjs');
const {BrokerSqliteStore}=require('./broker-sqlite-store.cjs');
const {handlerFor}=require('./broker-http.cjs');
async function startBroker({dbPath,socketPath}={}){
  if(typeof dbPath!=='string'||!path.isAbsolute(dbPath)||
     typeof socketPath!=='string'||!path.isAbsolute(socketPath)||
     dbPath===socketPath)throw Error('Absolute, distinct database and Unix socket paths required');
  try{
    fs.lstatSync(socketPath);
    throw Error('Refusing existing socket path (manual recovery required)');
  }catch(error){if(error.code!=='ENOENT')throw error;}
  const store=new BrokerSqliteStore(dbPath);
  let server;
  try{
    const broker=await Broker.openPersistent(store);
    server=http.createServer(handlerFor(broker));
    server.requestTimeout=10000;
    server.headersTimeout=5000;
    server.keepAliveTimeout=2000;
    server.maxHeadersCount=48;
    const old=process.umask(0o077);
    try{
      await new Promise((resolve,reject)=>{
        server.once('error',reject);
        server.listen(socketPath,()=>{
          server.removeListener('error',reject);
          resolve();
        });
      });
    }finally{process.umask(old);}
    fs.chmodSync(socketPath,0o600);
    let closed=false;
    const close=async()=>{
      if(closed)return;closed=true;
      await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
      store.close();
      try{if(fs.lstatSync(socketPath).isSocket())fs.unlinkSync(socketPath);}catch(error){
        if(error.code!=='ENOENT')throw error;
      }
    };
    return {broker,server,store,socketPath,close};
  }catch(error){
    if(server && server.listening)await new Promise(resolve=>server.close(()=>resolve()));
    store.close();
    throw error;
  }
}
module.exports={startBroker};
if(require.main===module){
  startBroker({dbPath:process.env.LANU_BROKER_SQLITE,
    socketPath:process.env.LANU_BROKER_SOCKET}).then(service=>{
    let terminating=false;
    async function shutdown(){
      if(terminating)return;terminating=true;
      try{await service.close();process.exitCode=0;}catch(_){process.exitCode=1;}
    }
    process.once('SIGTERM',shutdown);
    process.once('SIGINT',shutdown);
    process.stdout.write('LANU broker Unix socket ready; HTTPS termination must be configured separately.\n');
  }).catch(()=>{
    process.stderr.write('LANU broker cannot start securely; inspect local deployment permissions.\n');
    process.exitCode=1;
  });
}
