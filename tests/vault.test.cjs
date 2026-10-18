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
