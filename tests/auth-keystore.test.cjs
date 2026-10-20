const test=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {create}=require('../app/src/main/assets/auth-keystore.js');
const {generate,loadOrCreate,signInvite,verifyInvite,ReplayCache}=
  require('../app/src/main/assets/auth-protocol.js');

function fakeIndexedDB({failOpen=false,failWrite=false}={}){
  const records=new Map();let closed=0;
  const db={
    objectStoreNames:{contains:name=>name==='identities'},
    createObjectStore(name){if(name!=='identities')throw Error('Invalid store');},
    close(){closed++;},
    transaction(name,mode){
      if(name!=='identities')throw Error('Invalid store');
      const tx={error:null,abort(){tx.error=Error('Abort');queueMicrotask(()=>tx.onabort?.());}};
      function request(operation){
        const req={result:null,error:null};
        setImmediate(()=>{
          try {
            req.result=operation();
            req.onsuccess?.({target:req});
            setImmediate(()=>tx.oncomplete?.({target:tx}));
          } catch(error){
            tx.error=error;req.error=error;
            req.onerror?.({target:req});
            tx.onabort?.({target:tx});
          }
        });
        return req;
      }
      tx.objectStore=()=>({
        get(key){return request(()=>records.get(key)??null);},
        add(value,key){return request(()=>{
          if(failWrite)throw Error('QuotaExceeded');
          if(records.has(key))throw Error('ConstraintError');
          records.set(key,value);return key;
        });}
      });
      return tx;
    }
  };
  return {
    records,get closed(){return closed;},
    open(){
      if(failOpen)throw Error('IndexedDB denied');
      const req={result:null,error:null};
      setImmediate(()=>{req.result=db;req.onsuccess?.({target:req});});
      return req;
    }
  };
}
test('nonextractable identity persists across reloads and verifies signed invitations',async()=>{
 const fake=fakeIndexedDB(),store=create(fake);
 assert.equal(await store.load(),null);
 const first=await loadOrCreate(webcrypto,store);
 assert.equal(first.privateKey.extractable,false);
 const second=await loadOrCreate(webcrypto,create(fake));
 assert.equal(first.deviceId,second.deviceId);
 const remote=await generate(webcrypto),invite=await signInvite(webcrypto,second,remote.deviceId);
 assert.equal(await verifyInvite(webcrypto,invite,second.publicKey,first.deviceId,remote.deviceId,new ReplayCache()),true);
 assert.ok(fake.closed>=3);
});
test('duplicate enrollment never silently overwrites the first device key',async()=>{
 const fake=fakeIndexedDB(),store=create(fake);
 const first=await generate(webcrypto),second=await generate(webcrypto);
 await store.save(first);
 await assert.rejects(()=>store.save(second),/ConstraintError/);
 assert.equal((await store.load()).deviceId,first.deviceId);
});
test('concurrent first enrollments fail closed instead of replacing keys',async()=>{
 const fake=fakeIndexedDB(),store=create(fake);
 const ids=await Promise.all([generate(webcrypto),generate(webcrypto)]);
 const attempts=await Promise.allSettled(ids.map(id=>store.save(id)));
 assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(attempts.filter(x=>x.status==='rejected').length,1);
 assert.ok(ids.some(x=>x.deviceId===fake.records.get('primary').deviceId));
});
test('missing IndexedDB and write denial do not silently create or rotate identity',async()=>{
 assert.throws(()=>create(null),/IndexedDB unavailable/);
 await assert.rejects(()=>create(fakeIndexedDB({failOpen:true})).load(),/IndexedDB denied/);
 const store=create(fakeIndexedDB({failWrite:true}));
 await assert.rejects(()=>loadOrCreate(webcrypto,store),/QuotaExceeded/);
 assert.equal(await store.load(),null);
 await assert.rejects(()=>store.save({deviceId:'0'.repeat(64),privateKey:{extractable:true},publicKey:{}}),/Unsafe/);
});
