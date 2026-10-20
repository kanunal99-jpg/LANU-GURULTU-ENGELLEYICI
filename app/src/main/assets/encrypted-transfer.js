(function (root) {
  'use strict';
  // Staged, opt-in export format for a future Android Storage Access Framework
  // picker. Not yet wired to UI; never automatically restore/overwrite data.
  const ROOT='lens-vault-v1',ROUTE='lanuId',MAX_FILE=400*1024,MAX_RAW=256*1024;
  const Vault=(typeof module!=='undefined'&&module.exports)
    ? require('./vault.js') : root.LensVault;
  const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const decode=value=>{
    if(typeof value!=='string'||value.length>MAX_FILE||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))
      throw Error('Invalid backup encoding');
    return Uint8Array.from(atob(value),v=>v.charCodeAt(0));
  };
  function preflight(storage,crypto,passphrase){
    if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function'||
       !crypto||typeof crypto.getRandomValues!=='function'||!crypto.subtle)
      throw Error('Secure backup storage unavailable');
    if(typeof passphrase!=='string'||passphrase.length<12||passphrase.length>128)
      throw Error('Use a dedicated 12–128 character backup passphrase');
  }
  async function derive(crypto,passphrase,salt){
    const source=await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},
      source,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function verifyPin(crypto,raw,pin){
    if(typeof raw!=='string'||raw.length>MAX_RAW)throw Error('Invalid encrypted PIN vault');
    const temp=new Vault({getItem:key=>key===ROOT?raw:null},crypto);
    try{await temp.unlock(pin);}finally{temp.lock();}
  }
  function verifyRoute(route){
    if(route!==null&&(typeof route!=='string'||!/^[1-9][0-9]{5}$/.test(route)))
      throw Error('Invalid routing identity');
  }
  async function exportBackup({storage,crypto,pin,passphrase}){
    preflight(storage,crypto,passphrase);
    const raw=storage.getItem(ROOT),route=storage.getItem(ROUTE);
    verifyRoute(route);
    await verifyPin(crypto,raw,pin);
    const plain=new TextEncoder().encode(JSON.stringify({v:1,vaultCipher:raw,routingId:route}));
    if(plain.byteLength>MAX_RAW+1024)throw Error('Backup data exceeds limit');
    const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
    const key=await derive(crypto,passphrase,salt);
    const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain);
    const bundle=JSON.stringify({v:1,kdf:'PBKDF2-SHA256',iterations:310000,
      salt:encode(salt),iv:encode(iv),ciphertext:encode(ciphertext)});
    if(bundle.length>MAX_FILE)throw Error('Encrypted backup exceeds limit');
    return bundle;
  }
  async function importBackup({storage,crypto,pin,passphrase,serialized}){
    preflight(storage,crypto,passphrase);
    if(storage.getItem(ROOT)!==null)throw Error('Existing PIN vault must never be overwritten');
    if(typeof serialized!=='string'||serialized.length>MAX_FILE)throw Error('Backup file too large');
    const obj=JSON.parse(serialized);
    if(!obj||typeof obj!=='object'||Array.isArray(obj)||
      Object.keys(obj).sort().join(',')!=='ciphertext,iterations,iv,kdf,salt,v'||
      obj.v!==1||obj.kdf!=='PBKDF2-SHA256'||obj.iterations!==310000)
      throw Error('Unsupported encrypted backup format');
    const salt=decode(obj.salt),iv=decode(obj.iv),ciphertext=decode(obj.ciphertext);
    if(salt.length!==16||iv.length!==12||ciphertext.length<16||
       ciphertext.length>MAX_RAW+1040)throw Error('Invalid backup envelope');
    const key=await derive(crypto,passphrase,salt);
    const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,ciphertext);
    if(clear.byteLength>MAX_RAW+1024)throw Error('Backup payload too large');
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(clear));
    if(!data||typeof data!=='object'||Array.isArray(data)||
       Object.keys(data).sort().join(',')!=='routingId,v,vaultCipher'||data.v!==1)
      throw Error('Invalid backup contents');
    verifyRoute(data.routingId);
    await verifyPin(crypto,data.vaultCipher,pin);
    // Recheck destination after expensive KDFs: this must not race an
    // existing or newly-created PIN vault.
    if(storage.getItem(ROOT)!==null)throw Error('Existing PIN vault must never be overwritten');
    const previousRoute=storage.getItem(ROUTE);
    try{
      if(data.routingId!==null)storage.setItem(ROUTE,data.routingId);
      storage.setItem(ROOT,data.vaultCipher); // Write the validated vault last.
    }catch(error){
      try{
        if(previousRoute===null)storage.removeItem(ROUTE);
        else storage.setItem(ROUTE,previousRoute);
      }catch(_){}
      throw error;
    }
    return {contactsRestored:true,routingIdRestored:data.routingId!==null};
  }
  const api=Object.freeze({exportBackup,importBackup});
  root.LanuEncryptedTransfer=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
