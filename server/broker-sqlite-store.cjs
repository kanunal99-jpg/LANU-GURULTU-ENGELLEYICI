'use strict';
// Single-instance durable state for the LANU identity broker. This is a
// transitional standalone SQLite implementation, not a horizontally-scalable
// deployment. No user PIN, contact names or private keys are stored here.
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path');
const DEVICE=/^[0-9a-f]{64}$/,PUB=/^04[0-9a-f]{128}$/;
// SQLite's quick_check reports corruption as result rows; simply executing
// the pragma is not proof that the persisted authorization state is healthy.
function assertDatabaseHealthy(db){
  const rows=db.prepare('PRAGMA quick_check').all();
  if(!Array.isArray(rows)||rows.length!==1||!rows[0]||
     Object.values(rows[0]).length!==1||Object.values(rows[0])[0]!=='ok')
    throw Error('SQLite integrity check failed');
}
class BrokerSqliteStore {
  constructor(filename){
    if(typeof filename!=='string'||!path.isAbsolute(filename)||filename===':memory:')
      throw Error('Absolute on-disk SQLite location required');
    if(fs.existsSync(filename) && fs.lstatSync(filename).isSymbolicLink())
      throw Error('Symlink database is forbidden');
    const parent=path.dirname(filename);
    if(!fs.existsSync(parent))fs.mkdirSync(parent,{recursive:true,mode:0o700});
    // Restrictive umask applies to new DB, WAL not used. Readable DB files
    // are never an acceptable fallback if the host filesystem rejects chmod.
    const previous=process.umask(0o077);
    try{this.db=new DatabaseSync(filename);}finally{process.umask(previous);}
    try{
      fs.chmodSync(filename,0o600);
      this.db.exec('PRAGMA busy_timeout=1000; PRAGMA journal_mode=DELETE; PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE; COMMIT;');
      this.db.exec(`
        PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS devices (
          id TEXT PRIMARY KEY, keyhex TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS trust (
          a TEXT NOT NULL, b TEXT NOT NULL,
          PRIMARY KEY(a,b), FOREIGN KEY(a) REFERENCES devices(id),
          FOREIGN KEY(b) REFERENCES devices(id)
        );
        CREATE TABLE IF NOT EXISTS seen (
          nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL
        );
      `);
      assertDatabaseHealthy(this.db);
    }catch(e){this.db.close();throw e;}
  }
  transaction(fn){
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const result=fn();
      this.db.exec('COMMIT');return result;
    }catch(error){try{this.db.exec('ROLLBACK');}catch(_){}throw error;}
  }
  load(){
    const devices=this.db.prepare('SELECT id,keyhex,revoked FROM devices ORDER BY id').all();
    const pairs=this.db.prepare('SELECT a,b FROM trust ORDER BY a,b').all();
    return {devices,pairs};
  }
  insertDevice(id,keyhex){
    if(!DEVICE.test(id)||!PUB.test(keyhex))throw Error('Invalid device public identity');
    this.db.prepare('INSERT INTO devices(id,keyhex,revoked) VALUES(?,?,0)').run(id,keyhex);
  }
  addPair(a,b){
    if(!DEVICE.test(a)||!DEVICE.test(b)||a===b)throw Error('Invalid trust pair');
    const [x,y]=[a,b].sort();
    this.db.prepare('INSERT INTO trust(a,b) VALUES(?,?)').run(x,y);
  }
  removePair(a,b){
    if(!DEVICE.test(a)||!DEVICE.test(b))throw Error('Invalid trust pair');
    const [x,y]=[a,b].sort();
    this.db.prepare('DELETE FROM trust WHERE a=? AND b=?').run(x,y);
  }
  revoke(id){
    if(!DEVICE.test(id))throw Error('Invalid revocation ID');
    this.transaction(()=>{
      const result=this.db.prepare('UPDATE devices SET revoked=1 WHERE id=? AND revoked=0').run(id);
      if(result.changes!==1)throw Error('Device revocation refused');
      this.db.prepare('DELETE FROM trust WHERE a=? OR b=?').run(id,id);
    });
  }
  consumeInviteNonce(key,expiresAt,now){
    if(typeof key!=='string'||!/^[0-9a-f]{64}:[0-9a-f]{32}$/.test(key)||
       !Number.isSafeInteger(expiresAt)||!Number.isSafeInteger(now)||expiresAt<now)
      throw Error('Invalid replay record');
    return this.transaction(()=>{
      this.db.prepare('DELETE FROM seen WHERE expires_at < ?').run(now);
      return this.db.prepare('INSERT OR IGNORE INTO seen(nonce,expires_at) VALUES(?,?)')
        .run(key,expiresAt).changes===1;
    });
  }
  close(){this.db.close();}
}
module.exports={BrokerSqliteStore,assertDatabaseHealthy};
