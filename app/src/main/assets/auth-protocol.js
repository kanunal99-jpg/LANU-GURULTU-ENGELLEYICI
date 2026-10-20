(function (root) {
  'use strict';
  // Proof-of-possession protocol for a future authenticated signaling broker.
  // NOT wired to legacy six-digit PeerJS routing; do not label it production auth.
  const text = value => new TextEncoder().encode(value);
  const hex = bytes => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
  const isId = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
  const isNonce = value => typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
  const keyAlgorithm = {name: 'ECDSA', namedCurve: 'P-256'};
  function requireCrypto(api) {
    if (!api || !api.subtle || typeof api.getRandomValues !== 'function')
      throw new Error('Secure device cryptography is unavailable');
  }
  function randomNonce(api) {
    return hex(api.getRandomValues(new Uint8Array(16)));
  }
  async function fingerprint(api, publicKey) {
    return hex(await api.subtle.digest('SHA-256', await api.subtle.exportKey('raw', publicKey)));
  }
  async function generate(api) {
    requireCrypto(api);
    // Private key is NONEXTRACTABLE. Browser IndexedDB can structured-clone
    // CryptoKey without writing plaintext key material to localStorage.
    const pair = await api.subtle.generateKey(keyAlgorithm, false, ['sign', 'verify']);
    if (pair.privateKey.extractable) throw new Error('Exportable device key refused');
    const id = await fingerprint(api, pair.publicKey);
    return {deviceId:id, privateKey:pair.privateKey, publicKey:pair.publicKey};
  }
  async function loadOrCreate(api, store) {
    requireCrypto(api);
    if (!store || typeof store.load !== 'function' || typeof store.save !== 'function')
      throw new Error('Secure persistent key store required');
    const existing = await store.load();
    if (existing) {
      if (!existing.privateKey || existing.privateKey.extractable ||
          !existing.publicKey || existing.deviceId !== await fingerprint(api, existing.publicKey))
        throw new Error('Device identity record corrupt; refusing silent reset');
      return existing;
    }
    const created = await generate(api);
    await store.save(created); // Fail closed on storage failures; never silently rotate.
    return created;
  }
  function message(body) {
    return text(['LANU_CALL_INVITE_V1', body.from, body.to,
      body.callId, body.nonce, body.issuedAt, body.expiresAt].join('\n'));
  }
  function validBody(body, now) {
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).sort().join(',') !== 'callId,expiresAt,from,issuedAt,nonce,to' ||
        !isId(body.from) || !isId(body.to) || !isNonce(body.callId) || !isNonce(body.nonce) ||
        !Number.isSafeInteger(body.issuedAt) || !Number.isSafeInteger(body.expiresAt) ||
        body.issuedAt > now + 5000 || body.expiresAt < now ||
        body.expiresAt <= body.issuedAt || body.expiresAt - body.issuedAt > 30000)
      throw new Error('Call invitation invalid or expired');
  }
  async function signInvite(api, identity, to, now = Date.now()) {
    requireCrypto(api);
    if (!identity || !isId(identity.deviceId) || !isId(to)) throw new Error('Device IDs required');
    const body = {from:identity.deviceId,to,callId:randomNonce(api),
      nonce:randomNonce(api),issuedAt:now,expiresAt:now+30000};
    validBody(body,now);
    const bytes = await api.subtle.sign({name:'ECDSA',hash:'SHA-256'},identity.privateKey,message(body));
    return {body,signature:hex(bytes)};
  }
  async function signChallenge(api, identity, purpose, nonce) {
    requireCrypto(api);
    if (!identity || !identity.privateKey || !identity.publicKey ||
        !isId(identity.deviceId) || !isNonce(nonce) ||
        !['ENROLL','LOGIN'].includes(purpose) ||
        await fingerprint(api,identity.publicKey) !== identity.deviceId)
      throw new Error('Invalid device challenge');
    const payload=text('LANU_DEVICE_'+purpose+'_V1\n'+identity.deviceId+'\n'+nonce);
    const signature=await api.subtle.sign({name:'ECDSA',hash:'SHA-256'},identity.privateKey,payload);
    return hex(signature);
  }
  class ReplayCache {
    constructor(limit = 1024) { this.records = new Map(); this.limit=limit; }
    accept(key, expiry, now) {
      for (const [nonce,ends] of this.records) if (ends < now) this.records.delete(nonce);
      if (this.records.has(key) || this.records.size >= this.limit) return false;
      this.records.set(key,expiry);return true;
    }
  }
  async function verifyInvite(api, envelope, publicKey, expectedFrom, expectedTo, replay, now = Date.now()) {
    requireCrypto(api);
    if (!envelope || !replay || !isId(expectedFrom) || !isId(expectedTo)) return false;
    try {
      const b = envelope.body;
      validBody(b,now);
      if (b.from !== expectedFrom || b.to !== expectedTo ||
          typeof envelope.signature !== 'string' || !/^[0-9a-f]{128}$/.test(envelope.signature) ||
          await fingerprint(api,publicKey) !== expectedFrom) return false;
      const sig = new Uint8Array(envelope.signature.match(/.{2}/g).map(v=>parseInt(v,16)));
      const valid = await api.subtle.verify({name:'ECDSA',hash:'SHA-256'},publicKey,sig,message(b));
      if (!valid) return false;
      return replay.accept(b.from+':'+b.nonce,b.expiresAt,now);
    } catch (_) { return false; }
  }
  const api=Object.freeze({generate,loadOrCreate,signInvite,signChallenge,verifyInvite,ReplayCache});
  root.LanuAuthProtocol=api;
  if (typeof module !== 'undefined') module.exports=api;
})(typeof window !== 'undefined' ? window : globalThis);
