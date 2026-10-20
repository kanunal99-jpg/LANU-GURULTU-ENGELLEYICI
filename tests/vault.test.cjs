const test=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const LensVault=require('../app/src/main/assets/vault.js');
function storage(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),map};}
test('PIN encrypts contacts, survives reopen, rejects wrong PIN and clears keys on lock',async()=>{
 const db=storage(),v=new LensVault(db,webcrypto);assert.equal(v.exists(),false);
 await v.create('741963');v.data.contactsEnabled=true;v.data.contacts.push({code:'654321',name:'Test Person'});await v.write(v.data);
 const saved=[...db.map.values()][0];assert.ok(!saved.includes('654321'));assert.ok(!saved.includes('Test Person'));assert.ok(!saved.includes('741963'));
 v.lock();assert.equal(v.key,null);assert.equal(v.data,null);
 await assert.rejects(()=>v.unlock('111111'));assert.equal(v.data,null);
 await v.unlock('741963');assert.deepEqual(v.data.contacts,[{code:'654321',name:'Test Person'}]);
 await v.create('963741');v.lock();await assert.rejects(()=>v.unlock('741963'));await v.unlock('963741');assert.equal(v.data.contacts.length,1);
});
test('failed writes retain the original PIN and ciphertext',async()=>{
 const db=storage(),v=new LensVault(db,webcrypto);await v.create('741963');const key=v.key;
 const raw=db.getItem('lens-vault-v1');db.setItem=()=>{throw Error('Quota');};
 await assert.rejects(()=>v.create('963741'));assert.equal(v.key,key);assert.equal(db.getItem('lens-vault-v1'),raw);
});
test('tampered ciphertext cannot unlock and invalid PINs are rejected',async()=>{
 const db=storage(),v=new LensVault(db,webcrypto);for(const pin of ['2011.','12345','abcdef','1234567890123'])await assert.rejects(()=>v.create(pin));
 await v.create('741963');v.lock();const record=JSON.parse(db.getItem('lens-vault-v1'));record.cipher=record.cipher.replace(/^./,record.cipher[0]==='A'?'B':'A');db.setItem('lens-vault-v1',JSON.stringify(record));await assert.rejects(()=>v.unlock('741963'));assert.equal(v.key,null);
});

test('cancelled initial PIN creation never writes a vault record',async()=>{
 const db=storage(),v=new LensVault(db,webcrypto);
 await assert.rejects(v.create('741963',()=>false),/Cancelled/);
 assert.equal(v.exists(),false);
 assert.equal(v.key,null);
});

test('cancelling a PIN change during encryption preserves the previous PIN and contacts',async()=>{
 const db=storage(),v=new LensVault(db,webcrypto);
 await v.create('741963');
 v.data.contacts.push({code:'654321',name:'Contact'});
 await v.write(v.data);
 const ciphertext=db.getItem('lens-vault-v1');
 let releaseEncryption, encryptionStarted;
 const entered=new Promise(resolve=>{encryptionStarted=resolve;});
 const delayedCrypto={
   getRandomValues(bytes){return webcrypto.getRandomValues(bytes);},
   subtle:{
     importKey(...args){return webcrypto.subtle.importKey(...args);},
     deriveKey(...args){return webcrypto.subtle.deriveKey(...args);},
     decrypt(...args){return webcrypto.subtle.decrypt(...args);},
     encrypt(...args){
       return new Promise((resolve,reject)=>{
         releaseEncryption=()=>webcrypto.subtle.encrypt(...args).then(resolve,reject);
         encryptionStarted();
       });
     }
   }
 };
 const pending=new LensVault(db,delayedCrypto);
 await pending.unlock('741963');
 let authorized=true;
 const change=pending.create('852963',()=>authorized);
 await entered;
 authorized=false; // UI cancelled the gate while encryption was still pending.
 releaseEncryption();
 await assert.rejects(change,/Cancelled/);
 assert.equal(db.getItem('lens-vault-v1'),ciphertext);
 assert.deepEqual(pending.data.contacts,[{code:'654321',name:'Contact'}]);
 pending.lock();
 await assert.rejects(pending.unlock('852963'));
 await pending.unlock('741963');
 assert.equal(pending.data.contacts.length,1);
});

test('a bad PIN locks any previously held key and blocks stale decrypted contacts',async()=>{
 const db=storage(),v=new LensVault(db,webcrypto);
 await v.create('741963');v.data.contacts.push({code:'654321',name:'Private'});await v.write(v.data);
 await assert.rejects(v.unlock('111111'));
 assert.equal(v.key,null);assert.equal(v.salt,null);assert.equal(v.data,null);
 await v.unlock('741963');assert.equal(v.data.contacts[0].name,'Private');
});
test('malformed or oversized ciphertext envelopes fail before PBKDF2 and preserve the record',async()=>{
 const db=storage(),v=new LensVault(db,webcrypto);await v.create('741963');
 const previous=db.getItem('lens-vault-v1');v.lock();
 for(const changes of [{iv:'AA=='},{salt:'AA=='},{cipher:'AA=='},{v:2},{cipher:'a'.repeat(262145)}, {salt:'!!!'}]){
  const corrupted=JSON.stringify({...JSON.parse(previous),...changes});
  db.setItem('lens-vault-v1',corrupted);
  await assert.rejects(v.unlock('741963'));
  assert.equal(v.key,null);assert.equal(db.getItem('lens-vault-v1'),corrupted);
 }
 db.setItem('lens-vault-v1',previous);await v.unlock('741963');
});
test('invalid contacts or malicious field types never overwrite a valid encrypted vault',async()=>{
 const db=storage(),v=new LensVault(db,webcrypto);await v.create('741963');
 const original=db.getItem('lens-vault-v1');
 const invalid=[
  {...v.data,contacts:[{code:'0'+'23456',name:'Invalid'}]},
  {...v.data,contacts:[{code:'654321',name:'N'.repeat(41)}]},
  {...v.data,contactsEnabled:'yes'},
  {...v.data,contacts:Array.from({length:201},(_,i)=>({code:String(100000+i),name:'N'}))},
 ];
 for(const data of invalid) {
  await assert.rejects(v.write(data));
  assert.equal(db.getItem('lens-vault-v1'),original);
 }
 await v.unlock('741963');assert.equal(v.data.contacts.length,0);
});
test('v1 encrypted vault remains interoperable without schema reset',async()=>{
 const db=storage(),v=new LensVault(db,webcrypto);await v.create('741963');
 const backup=db.getItem('lens-vault-v1');v.lock();
 const other=new LensVault(db,webcrypto);await other.unlock('741963');assert.equal(db.getItem('lens-vault-v1'),backup);
 assert.equal(other.data.incomingEnabled,true);
});
