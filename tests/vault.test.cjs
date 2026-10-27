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


function gatedCrypto(method, delayedCall=1) {
 let resume, notify, count=0;
 const entered=new Promise(resolve=>{notify=resolve;});
 const intercept=(kind,args)=>{
  if(kind!==method || ++count!==delayedCall) return webcrypto.subtle[kind](...args);
  return new Promise((resolve,reject)=>{
   resume=()=>webcrypto.subtle[kind](...args).then(resolve,reject);
   notify();
  });
 };
 return {
  crypto:{
   getRandomValues(bytes){return webcrypto.getRandomValues(bytes);},
   subtle:{
    importKey(...args){return webcrypto.subtle.importKey(...args);},
    deriveKey(...args){return webcrypto.subtle.deriveKey(...args);},
    encrypt(...args){return intercept('encrypt',args);},
    decrypt(...args){return intercept('decrypt',args);}
   }
  },
  entered,
  release(){if(!resume)throw Error('crypto was not delayed');resume();}
 };
}

test('locking during an in-flight encrypted write cannot restore old contacts or a session',async()=>{
 const db=storage(),original=new LensVault(db,webcrypto);
 await original.create('741963');original.data.contacts.push({code:'654321',name:'Original'});await original.write(original.data);
 const before=db.getItem('lens-vault-v1');original.lock();
 const gate=gatedCrypto('encrypt'),vault=new LensVault(db,gate.crypto);
 await vault.unlock('741963');
 const pending=vault.write({...vault.data,contacts:[{code:'654321',name:'Stale'}]});
 await gate.entered;
 vault.lock();gate.release();
 await assert.rejects(pending,/Cancelled/);
 assert.equal(vault.key,null);assert.equal(vault.data,null);
 assert.equal(db.getItem('lens-vault-v1'),before);
 await original.unlock('741963');assert.equal(original.data.contacts[0].name,'Original');
});

test('a slow earlier vault write cannot overwrite a newer successful write',async()=>{
 const db=storage(),initial=new LensVault(db,webcrypto);await initial.create('741963');initial.lock();
 const gate=gatedCrypto('encrypt'),vault=new LensVault(db,gate.crypto);await vault.unlock('741963');
 const older=vault.write({...vault.data,contacts:[{code:'654321',name:'Older'}]});
 await gate.entered;
 await vault.write({...vault.data,contacts:[{code:'654321',name:'Newer'}]});
 const newerCipher=db.getItem('lens-vault-v1');gate.release();
 await assert.rejects(older,/Cancelled/);
 assert.equal(db.getItem('lens-vault-v1'),newerCipher);
 vault.lock();await vault.unlock('741963');assert.equal(vault.data.contacts[0].name,'Newer');
});

test('a locked PIN rotation cannot overwrite the old PIN or unlock the vault',async()=>{
 const db=storage(),initial=new LensVault(db,webcrypto);await initial.create('741963');initial.lock();
 const before=db.getItem('lens-vault-v1');
 const gate=gatedCrypto('encrypt'),vault=new LensVault(db,gate.crypto);await vault.unlock('741963');
 const pending=vault.create('852963');
 await gate.entered;vault.lock();gate.release();
 await assert.rejects(pending,/Cancelled/);
 assert.equal(db.getItem('lens-vault-v1'),before);assert.equal(vault.key,null);
 await assert.rejects(vault.unlock('852963'));await vault.unlock('741963');
});

test('a late decrypt cannot reopen the private vault after the user locks it',async()=>{
 const db=storage(),initial=new LensVault(db,webcrypto);await initial.create('741963');initial.lock();
 const gate=gatedCrypto('decrypt'),vault=new LensVault(db,gate.crypto);
 const pending=vault.unlock('741963');
 await gate.entered;vault.lock();gate.release();
 await assert.rejects(pending,/Cancelled/);
 assert.equal(vault.key,null);assert.equal(vault.salt,null);assert.equal(vault.data,null);
});

test('PIN protected drafts are encrypted, survive restart and do not leak on lock',async()=>{
 const db=storage(),v=new LensVault(db,webcrypto);
 await v.create('741963');
 const id='a'.repeat(32),message={id,peer:'654321',text:'Şifreli özel mesaj',createdAt:1760000000000};
 v.data.messages.push(message);
 await v.write(v.data);
 const raw=db.getItem('lens-vault-v1');
 assert.equal(raw.includes(message.text),false);
 assert.equal(raw.includes(message.peer),false);
 v.lock();assert.equal(v.data,null);
 const reopened=new LensVault(db,webcrypto);
 await reopened.unlock('741963');
 assert.deepEqual(reopened.data.messages,[message]);
});
test('invalid or oversized private messages cannot replace valid AES-GCM vault',async()=>{
 const db=storage(),v=new LensVault(db,webcrypto);await v.create('741963');
 const original=db.getItem('lens-vault-v1');
 const valid={id:'b'.repeat(32),peer:'654321',text:'test',createdAt:1760000000000};
 const bad=[
  [ {...valid,text:'x'.repeat(1001)} ],
  [ {...valid,peer:'000000'} ],
  [ {...valid,id:'abc'} ],
  [ {...valid,createdAt:NaN} ],
  [ {...valid,text:' '} ],
  [valid,valid],
  Array.from({length:81},(_,i)=>({...valid,id:i.toString(16).padStart(32,'0')})),
  [{...valid,html:'<script>'}]
 ];
 for (const messages of bad) {
  await assert.rejects(()=>v.write({...v.data,messages}),/şifreli mesaj|mesaj taslak/i);
  assert.equal(db.getItem('lens-vault-v1'),original);
 }
});
test('legacy PIN vaults with no messages field remain readable',async()=>{
 const db=storage(),v=new LensVault(db,webcrypto);
 await v.create('741963');
 const original={contactsEnabled:true,contacts:[],incomingEnabled:false};
 await v.write(original);v.lock();
 const reopened=new LensVault(db,webcrypto);
 await reopened.unlock('741963');
 assert.equal(reopened.data.messages,undefined);
 assert.deepEqual(reopened.data,original);
});
