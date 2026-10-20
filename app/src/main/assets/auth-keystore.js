(function (root) {
  'use strict';
  // Staged local storage for proof-of-possession CryptoKeys.
  // Not hardware-backed Android Keystore and NOT live server authentication.
  // The current six-digit PeerJS routing identity remains separate.
  const NAME = 'lanu-device-auth-v1', STORE = 'identities', KEY = 'primary';
  function create(indexedDb) {
    if (!indexedDb || typeof indexedDb.open !== 'function')
      throw new Error('IndexedDB unavailable; device identity cannot be created');
    function open() {
      return new Promise((resolve,reject) => {
        let request;
        try { request=indexedDb.open(NAME,1); }
        catch(error){reject(error);return;}
        request.onupgradeneeded = () => {
          const db=request.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Identity database unavailable'));
        request.onblocked = () => reject(new Error('Identity database locked'));
      });
    }
    async function transaction(mode, writeValue) {
      const db=await open();
      try {
        return await new Promise((resolve,reject) => {
          let tx, req, value=null, done=false;
          const fail=error=>{if(done)return;done=true;reject(error || new Error('Identity storage failed'));};
          try {
            tx=db.transaction(STORE,mode);
            tx.oncomplete=()=>{if(!done){done=true;resolve(value);}};
            tx.onabort=()=>fail(tx.error || new Error('Identity storage aborted'));
            tx.onerror=()=>fail(tx.error || new Error('Identity storage transaction failed'));
            const store=tx.objectStore(STORE);
            // add(), not put(): an interrupted or concurrent initial enrollment
            // must never silently replace an existing device private key.
            req=mode==='readwrite' ? store.add(writeValue,KEY) : store.get(KEY);
            req.onsuccess=()=>{if(mode==='readonly')value=req.result || null;};
          } catch(error) {
            try { if(tx) tx.abort(); } catch(_) {}
            fail(error);
          }
        });
      } finally { db.close(); }
    }
    return Object.freeze({
      load:()=>transaction('readonly'),
      save:identity=>{
        if (!identity || !/^[0-9a-f]{64}$/.test(identity.deviceId) ||
            !identity.privateKey || identity.privateKey.extractable !== false ||
            !identity.publicKey) throw new Error('Unsafe device identity');
        return transaction('readwrite',identity);
      }
    });
  }
  const api=Object.freeze({create});
  root.LanuDeviceKeyStore=api;
  if (typeof module !== 'undefined') module.exports=api;
})(typeof window !== 'undefined' ? window : globalThis);
