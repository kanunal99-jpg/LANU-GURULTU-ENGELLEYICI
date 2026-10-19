(function (root) {
  'use strict';
  const KEY = 'lens-vault-v1';
  const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const decode = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
  class LensVault {
    constructor(storage, cryptoAPI) { this.storage = storage; this.crypto = cryptoAPI; this.key = null; this.data = null; this.salt = null; }
    exists() { return this.storage.getItem(KEY) !== null; }
    async derive(pin, salt) {
      if (!/^\d{6,12}$/.test(pin)) throw new Error('PIN 6–12 rakam olmalı.');
      const material = await this.crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
      return this.crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:310000, hash:'SHA-256'}, material, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
    }
    async unlock(pin) {
      const record = JSON.parse(this.storage.getItem(KEY));
      if (!record || record.v !== 1) throw new Error('Kayıt açılamadı.');
      const salt = decode(record.salt), key = await this.derive(pin, salt);
      const raw = await this.crypto.subtle.decrypt({name:'AES-GCM',iv:decode(record.iv)}, key, decode(record.cipher));
      const data = JSON.parse(new TextDecoder().decode(raw));
      if (!Array.isArray(data.contacts) || data.contacts.length > 200) throw new Error('Kayıt açılamadı.');
      this.key = key; this.salt = salt; this.data = data; return data;
    }
    async create(pin, canCommit = () => true) {
      const salt = this.crypto.getRandomValues(new Uint8Array(16)), key = await this.derive(pin,salt);
      const data = this.data || {contactsEnabled:false,contacts:[],incomingEnabled:true};
      await this.write(data,key,salt,canCommit); this.key = key; this.salt = salt; this.data = data; return data;
    }
    async write(data, key = this.key, salt = this.salt, canCommit = () => true) {
      if (!key || !salt) throw new Error('Önce kilidi aç.');
      const iv = this.crypto.getRandomValues(new Uint8Array(12));
      const cipher = await this.crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(data)));
      // Encrypt is asynchronous. A user may cancel, lock or background the app
      // while it is pending. Never commit a canceled PIN replacement.
      if (!canCommit()) throw new Error('Cancelled');
      this.storage.setItem(KEY,JSON.stringify({v:1,salt:encode(salt),iv:encode(iv),cipher:encode(cipher)}));
    }
    lock() { this.key = null; this.data = null; this.salt = null; }
  }
  root.LensVault = LensVault;
  if (typeof module !== 'undefined') module.exports = LensVault;
})(typeof window !== 'undefined' ? window : globalThis);
