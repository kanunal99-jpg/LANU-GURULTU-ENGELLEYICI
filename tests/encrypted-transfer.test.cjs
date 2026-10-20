const test=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const LensVault=require('../app/src/main/assets/vault.js');
const transfer=require('../app/src/main/assets/encrypted-transfer.js');
function storage(){
 const map=new Map();
 return {getItem:k=>map.get(k)??null,setItem:(k,v)=>{map.set(k,v);},removeItem:k=>map.delete(k),map};
}
async function prepared(){
 const db=storage(),v=new LensVault(db,webcrypto);
 await v.create('741963');
 await v.write({contactsEnabled:true,incomingEnabled:true,contacts:[{code:'654321',name:'Sensitive Contact'}]});
 db.setItem('lanuId','987654');
 return db;
}
const passphrase='my separate strong passphrase 2026';
test('encrypted export/import preserves PIN, private contacts and six-digit device code without plaintext leakage',async()=>{
 const source=await prepared();
 const original=source.getItem('lens-vault-v1');
 const bundle=await transfer.exportBackup({storage:source,crypto:webcrypto,pin:'741963',passphrase});
 assert.ok(bundle.length<400*1024);
 for(const privateValue of ['Sensitive Contact','654321','741963','987654','lens-vault-v1'])
   assert.equal(bundle.includes(privateValue),false,'backup exposed '+privateValue);
 const dst=storage();
 const restored=await transfer.importBackup({storage:dst,crypto:webcrypto,pin:'741963',passphrase,serialized:bundle});
 assert.deepEqual(restored,{contactsRestored:true,routingIdRestored:true});
 assert.equal(dst.getItem('lanuId'),'987654');
 assert.equal(dst.getItem('lens-vault-v1'),original);
 const v=new LensVault(dst,webcrypto);
 await v.unlock('741963');
 assert.equal(v.data.contacts[0].name,'Sensitive Contact');
 assert.equal(v.data.contactsEnabled,true);
});
test('wrong PIN and wrong backup passphrase never overwrite destination or expose secret',async()=>{
 const source=await prepared(),target=storage();
 await assert.rejects(()=>transfer.exportBackup({storage:source,crypto:webcrypto,pin:'000000',passphrase}));
 const good=await transfer.exportBackup({storage:source,crypto:webcrypto,pin:'741963',passphrase});
 await assert.rejects(()=>transfer.importBackup({storage:target,crypto:webcrypto,pin:'741963',passphrase:'wrong passphrase 123456',serialized:good}));
 await assert.rejects(()=>transfer.importBackup({storage:target,crypto:webcrypto,pin:'000000',passphrase,serialized:good}));
 assert.equal(target.getItem('lens-vault-v1'),null);
 assert.equal(target.getItem('lanuId'),null);
});
test('existing PIN vault is immutable: restore refuses overwriting even with valid data and password',async()=>{
 const source=await prepared(),bundle=await transfer.exportBackup({storage:source,crypto:webcrypto,pin:'741963',passphrase});
 const target=storage(),v=new LensVault(target,webcrypto);
 await v.create('852963');const existing=target.getItem('lens-vault-v1');
 await assert.rejects(()=>transfer.importBackup({storage:target,crypto:webcrypto,pin:'741963',passphrase,serialized:bundle}),/never be overwritten/);
 assert.equal(target.getItem('lens-vault-v1'),existing);
 await v.unlock('852963');
});
test('tampered backup fields, ciphertext, oversized input and malicious routing IDs are rejected',async()=>{
 const source=await prepared(),bundle=await transfer.exportBackup({storage:source,crypto:webcrypto,pin:'741963',passphrase});
 const json=JSON.parse(bundle);
 for(const changed of [
  {...json,v:2},{...json,iterations:1},{...json,kdf:'none'},
  {...json,salt:'AA=='},{...json,iv:'AA=='},
  {...json,ciphertext:json.ciphertext.slice(0,-5)+'ZZZZZ'},
  {...json,extra:'forbidden'}
 ]){
  const target=storage();
  await assert.rejects(()=>transfer.importBackup({storage:target,crypto:webcrypto,pin:'741963',passphrase,serialized:JSON.stringify(changed)}));
  assert.equal(target.getItem('lens-vault-v1'),null);
 }
 await assert.rejects(()=>transfer.importBackup({storage:storage(),crypto:webcrypto,pin:'741963',passphrase,serialized:'x'.repeat(400*1024+1)}),/too large/);
 source.setItem('lanuId','<script>alert(1)</script>');
 await assert.rejects(()=>transfer.exportBackup({storage:source,crypto:webcrypto,pin:'741963',passphrase}),/routing identity/);
});
test('storage quota error cannot leave restored route behind when vault write fails',async()=>{
 const source=await prepared(),bundle=await transfer.exportBackup({storage:source,crypto:webcrypto,pin:'741963',passphrase});
 const dest=storage();dest.setItem('lanuId','111111');
 const originalSet=dest.setItem.bind(dest);
 dest.setItem=(key,value)=>{if(key==='lens-vault-v1')throw Error('QuotaExceeded');originalSet(key,value);};
 await assert.rejects(()=>transfer.importBackup({storage:dest,crypto:webcrypto,pin:'741963',passphrase,serialized:bundle}),/QuotaExceeded/);
 assert.equal(dest.getItem('lens-vault-v1'),null);
 assert.equal(dest.getItem('lanuId'),'111111');
});

test('background/PIN-gate cancellation after slow KDF prevents writing any restored data',async()=>{
 const source=await prepared(),bundle=await transfer.exportBackup({storage:source,crypto:webcrypto,pin:'741963',passphrase});
 const target=storage();target.setItem('lanuId','123456');
 let checks=0;
 await assert.rejects(()=>transfer.importBackup({
   storage:target,crypto:webcrypto,pin:'741963',passphrase,serialized:bundle,
   canCommit:()=>{checks++;return false;}
 }),/Cancelled/);
 assert.equal(checks,1);
 assert.equal(target.getItem('lens-vault-v1'),null);
 assert.equal(target.getItem('lanuId'),'123456');
});
test('Android SAF backup bridge is PIN-gated, limited and uses system document picker',()=>{
 const fs=require('node:fs');
 const main=fs.readFileSync('app/src/main/java/com/lanu/sesli/MainActivity.java','utf8');
 const html=fs.readFileSync('app/src/main/assets/index.html','utf8');
 const lens=fs.readFileSync('app/src/main/assets/lens.js','utf8');
 assert.ok(main.includes('SAVE_BACKUP = 15, LOAD_BACKUP = 16'));
 assert.ok(main.includes('MAX_BACKUP_BYTES = 400 * 1024'));
 assert.ok(main.includes('new BackupBridge(), "LanuBackup"'));
 assert.ok(main.includes('if(!canShowUpdater() || backupBytes != null'));
 assert.ok(main.includes('Intent.ACTION_CREATE_DOCUMENT'));
 assert.ok(main.includes('Intent.ACTION_OPEN_DOCUMENT'));
 assert.ok(main.includes('if(resultBytes.size()+n>MAX_BACKUP_BYTES)'));
 assert.ok(main.includes('org.json.JSONObject.quote(encryptedJson)'));
 assert.ok(html.includes('id="exportBackup"'));
 assert.ok(html.includes('id="restoreSubmit"'));
 assert.ok(lens.includes('canCommit:()=>token===gateEpoch && !opened && !document.hidden'));
 assert.ok(lens.includes('window.location.reload()'));
 assert.ok(lens.includes('window.lanuBackupLoaded'));
});
