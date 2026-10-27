(function (root) {
  'use strict';
  // v1 is intentionally retained: migration must never silently erase a PIN,
  // the encrypted contacts or an existing per-device call identity.
  const KEY = 'lens-vault-v1';
  const MAX_RECORD = 256 * 1024;
  const MAX_PLAINTEXT = 128 * 1024;
  const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const decode = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
  const validObject = value => value && typeof value === 'object' && !Array.isArray(value);
  function validData(data) {
    if (!validObject(data) || !Array.isArray(data.contacts) || data.contacts.length > 200 ||
        typeof data.contactsEnabled !== 'boolean' ||
        (data.incomingEnabled !== undefined && typeof data.incomingEnabled !== 'boolean')) {
      throw new Error('Şifreli kayıt yapısı geçersiz.');
    }
    for (const contact of data.contacts) {
      if (!validObject(contact) || !/^[1-9]\d{5}$/.test(contact.code) ||
          typeof contact.name !== 'string' || contact.name.length > 40) {
        throw new Error('Şifreli rehber kaydı geçersiz.');
      }
    }
    // Optional for backward compatibility with existing v1 encrypted vaults.
    // Private drafts are never written to an unencrypted localStorage key.
    if (data.messages !== undefined) {
      if (!Array.isArray(data.messages) || data.messages.length > 80)
        throw Error('Şifreli mesaj taslakları sınırı aşıldı.');
      const ids = new Set();
      for (const item of data.messages) {
        if (!validObject(item) || Object.keys(item).sort().join(',')!=='createdAt,id,peer,text' ||
            typeof item.id !== 'string' || !/^[a-f0-9]{32}$/.test(item.id) ||
            ids.has(item.id) || typeof item.peer !== 'string' ||
            !/^[1-9][0-9]{5}$/.test(item.peer) ||
            typeof item.text !== 'string' || !item.text.trim() || item.text.length > 1000 ||
            !Number.isSafeInteger(item.createdAt) || item.createdAt < 1)
          throw Error('Geçersiz şifreli mesaj taslağı.');
        ids.add(item.id);
      }
    }
    return data;
  }
  function parseRecord(raw) {
    if (typeof raw !== 'string' || raw.length > MAX_RECORD) throw new Error('Kayıt çok büyük veya bulunamadı.');
    const record = JSON.parse(raw);
    if (!validObject(record) || record.v !== 1 ||
        ![record.salt, record.iv, record.cipher].every(x => typeof x === 'string' && x.length <= MAX_RECORD && /^[A-Za-z0-9+/]*={0,2}$/.test(x))) {
      throw new Error('Şifreli kayıt başlığı geçersiz.');
    }
    const salt = decode(record.salt), iv = decode(record.iv), cipher = decode(record.cipher);
    if (salt.length !== 16 || iv.length !== 12 || cipher.length < 16 || cipher.length > MAX_PLAINTEXT + 16) {
      throw new Error('Şifreli kayıt alanları geçersiz.');
    }
    return {salt,iv,cipher};
  }
  class LensVault {
    constructor(storage, cryptoAPI) { this.storage = storage; this.crypto = cryptoAPI; this.key = null; this.data = null; this.salt = null; this.epoch = 0; this.operation = 0; }
    exists() { return this.storage.getItem(KEY) !== null; }
    async derive(pin, salt) {
      if (!/^\d{6,12}$/.test(pin)) throw new Error('PIN 6–12 rakam olmalı.');
      const material = await this.crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
      return this.crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:310000, hash:'SHA-256'}, material, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
    }
    async unlock(pin) {
      // Fail closed: a rejected PIN must never leave an earlier key in memory.
      this.lock();
      const epoch = this.epoch;
      const {salt,iv,cipher} = parseRecord(this.storage.getItem(KEY));
      const key = await this.derive(pin,salt);
      const raw = await this.crypto.subtle.decrypt({name:'AES-GCM',iv},key,cipher);
      if (raw.byteLength > MAX_PLAINTEXT) throw new Error('Şifreli kayıt çok büyük.');
      const data = validData(JSON.parse(new TextDecoder().decode(raw)));
      // A lifecycle lock during slow PBKDF2/decrypt revokes this unlock.
      if (epoch !== this.epoch) throw new Error('Cancelled');
      this.key = key; this.salt = salt; this.data = data; return data;
    }
    async create(pin, canCommit = () => true) {
      const epoch = this.epoch, operation = ++this.operation;
      const salt = this.crypto.getRandomValues(new Uint8Array(16)), key = await this.derive(pin,salt);
      const data = this.data || {contactsEnabled:false,contacts:[],incomingEnabled:true,messages:[]};
      await this.persist(data,key,salt,canCommit,epoch,operation);
      this.key = key; this.salt = salt; this.data = data; return data;
    }
    async write(data, key = this.key, salt = this.salt, canCommit = () => true) {
      if (!key || !salt) throw new Error('Önce kilidi aç.');
      const epoch = this.epoch, operation = ++this.operation;
      return this.persist(data,key,salt,canCommit,epoch,operation);
    }
    async persist(data,key,salt,canCommit,epoch,operation) {
      validData(data);
      const plaintext = new TextEncoder().encode(JSON.stringify(data));
      if (plaintext.length > MAX_PLAINTEXT) throw new Error('Rehber kayıt sınırı aşıldı.');
      const iv = this.crypto.getRandomValues(new Uint8Array(12));
      const cipher = await this.crypto.subtle.encrypt({name:'AES-GCM',iv},key,plaintext);
      // Reject late encryption after lock, another write, or cancelled PIN gate.
      // Never resurrect a session or overwrite a newer encrypted record.
      if (epoch !== this.epoch || operation !== this.operation || !canCommit()) throw new Error('Cancelled');
      // One atomic localStorage assignment; a thrown quota error preserves the
      // previous ciphertext. This API cannot silently reset or self-heal data.
      this.storage.setItem(KEY,JSON.stringify({v:1,salt:encode(salt),iv:encode(iv),cipher:encode(cipher)}));
    }
    lock() { this.epoch++; this.operation++; this.key = null; this.data = null; this.salt = null; }
  }
  root.LensVault = LensVault;
  if (typeof module !== 'undefined') module.exports = LensVault;
})(typeof window !== 'undefined' ? window : globalThis);
