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
 const dest=storage();dest.setItem('lanuId','987654');
 const originalSet=dest.setItem.bind(dest);
 dest.setItem=(key,value)=>{if(key==='lens-vault-v1')throw Error('QuotaExceeded');originalSet(key,value);};
 await assert.rejects(()=>transfer.importBackup({storage:dest,crypto:webcrypto,pin:'741963',passphrase,serialized:bundle}),/QuotaExceeded/);
 assert.equal(dest.getItem('lens-vault-v1'),null);
 assert.equal(dest.getItem('lanuId'),'987654');
});

test('background/PIN-gate cancellation after slow KDF prevents writing any restored data',async()=>{
 const source=await prepared(),bundle=await transfer.exportBackup({storage:source,crypto:webcrypto,pin:'741963',passphrase});
 const target=storage();target.setItem('lanuId','987654');
 let checks=0;
 await assert.rejects(()=>transfer.importBackup({
   storage:target,crypto:webcrypto,pin:'741963',passphrase,serialized:bundle,
   canCommit:()=>{checks++;return false;}
 }),/Cancelled/);
 assert.equal(checks,1);
 assert.equal(target.getItem('lens-vault-v1'),null);
 assert.equal(target.getItem('lanuId'),'987654');
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


test('backup encryption is independently decrypted and PIN-verified before saving',async()=>{
 const db=await prepared();
 const encrypted=await transfer.exportBackup({storage:db,crypto:webcrypto,pin:'741963',passphrase});
 assert.equal(await transfer.verifyBackup({crypto:webcrypto,pin:'741963',passphrase,serialized:encrypted}),true);
 await assert.rejects(()=>transfer.verifyBackup({crypto:webcrypto,pin:'000000',passphrase,serialized:encrypted}));
 await assert.rejects(()=>transfer.verifyBackup({crypto:webcrypto,pin:'741963',passphrase:'another passphrase 1234',serialized:encrypted}));
 const parsed=JSON.parse(encrypted);
 parsed.ciphertext=parsed.ciphertext.replace(/^./,parsed.ciphertext.startsWith('A')?'B':'A');
 await assert.rejects(()=>transfer.verifyBackup({crypto:webcrypto,pin:'741963',passphrase,serialized:JSON.stringify(parsed)}));
});
test('backup export UI requires matching passphrases and encrypted round-trip verification',()=>{
 const fs=require('node:fs');
 const html=fs.readFileSync('app/src/main/assets/index.html','utf8');
 const js=fs.readFileSync('app/src/main/assets/lens.js','utf8');
 assert.ok(html.includes('id="exportPassphraseConfirm"'));
 assert.ok(js.includes("passphrase!==confirmed || passphrase.length<12"));
 assert.ok(js.includes("window.LanuEncryptedTransfer.verifyBackup"));
 assert.ok(js.includes("if(!verified || !opened || token!==gateEpoch"));
});


test('SAF export verifies full ciphertext by reopening the picked document before reporting success',()=>{
 const fs=require('node:fs'),java=fs.readFileSync('app/src/main/java/com/lanu/sesli/MainActivity.java','utf8');
 const begin=java.indexOf('if(code==SAVE_BACKUP)'),end=java.indexOf('if(code==LOAD_BACKUP)',begin);
 assert.ok(begin>=0&&end>begin);
 const section=java.slice(begin,end);
 assert.ok(section.includes('getContentResolver().openOutputStream(destination,"wt")'));
 assert.ok(section.includes('getContentResolver().openInputStream(destination)'));
 assert.ok(section.includes('total>MAX_BACKUP_BYTES'));
 assert.ok(section.includes('total==bytes.length'));
 assert.ok(section.includes('MessageDigest.isEqual(expected,digest.digest())'));
 assert.ok(section.includes('java.util.Arrays.fill(bytes,(byte)0)'));
 assert.ok(section.includes('backupResult("save",verified)'));
 assert.equal(section.includes('out.flush();ok=true;'),false,'No unverified write-only success');
});


test('restore cannot overwrite a preexisting, different six-digit routing identity',async()=>{
 const source=await prepared();
 const bundle=await transfer.exportBackup({storage:source,crypto:webcrypto,pin:'741963',passphrase});
 const dest=storage();dest.setItem('lanuId','123456');
 await assert.rejects(()=>transfer.importBackup({storage:dest,crypto:webcrypto,
    pin:'741963',passphrase,serialized:bundle}),/Routing identity conflict/);
 assert.equal(dest.getItem('lanuId'),'123456');
 assert.equal(dest.getItem('lens-vault-v1'),null);
});
