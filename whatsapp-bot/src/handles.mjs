import {randomBytes} from 'node:crypto';
import {AuthError} from './auth-core.mjs';

export function normalizeHandle(value){
  if(typeof value!=='string'||value.length>80)throw new AuthError('INVALID_LOGIN');
  const handle=value.trim().replace(/^@/,'').toLowerCase();
  if(!/^[a-z0-9_]{3,24}$/.test(handle))throw new AuthError('INVALID_LOGIN');
  return handle;
}
export const profileSearch=(name,handle)=>`${name} ${handle}`.toLocaleLowerCase('kk-KZ');

// One public namespace for credentials and migrated accounts. Only this module
// writes handles; IDs, phone aliases, passwords and sessions remain untouched.
export function createHandles({db,transaction,randomSuffix=()=>randomBytes(8).toString('hex')}){
  db.exec(`CREATE TABLE IF NOT EXISTS auth_handles(user_id TEXT PRIMARY KEY,handle TEXT NOT NULL UNIQUE
    CHECK(length(handle) BETWEEN 3 AND 24 AND handle=lower(handle) AND handle NOT GLOB '*[^a-z0-9_]*'));`);
  const one=(sql,...args)=>db.prepare(sql).get(...args),all=(sql,...args)=>db.prepare(sql).all(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
  const hasTable=name=>!!one("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",name);
  const baseTransaction=transaction||(typeof db.transaction==='function'?callback=>db.transaction(callback):callback=>{
    db.exec('BEGIN IMMEDIATE');try{const result=callback();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}
  });
  let transactionDepth=0,profileSearchReady=false,backfilled=false;
  const transact=callback=>transactionDepth?callback():baseTransaction(()=>{transactionDepth++;try{return callback();}finally{transactionDepth--;}});
  const current=userId=>one('SELECT handle FROM auth_handles WHERE user_id=?',userId)?.handle;
  function syncProfile(userId,handle){
    if(!hasTable('social_profiles'))return;
    if(!profileSearchReady){if(!all('PRAGMA table_info(social_profiles)').some(column=>column.name==='search'))db.exec('ALTER TABLE social_profiles ADD COLUMN search TEXT');profileSearchReady=true;}
    const row=one('SELECT data,search FROM social_profiles WHERE id=?',userId);if(!row)return;
    const profile=JSON.parse(row.data),search=profileSearch(profile.name,handle);
    if(profile.handle!==handle||row.search!==search)run('UPDATE social_profiles SET data=?,search=? WHERE id=?',JSON.stringify({...profile,handle}),search,userId);
  }
  function allocate(userId,reserved=new Set()){
    const existing=current(userId);if(existing)return existing;
    for(let attempt=0;attempt<32;attempt++){
      const handle='birge_'+randomSuffix();
      if(!/^[a-z0-9_]{3,24}$/.test(handle)||reserved.has(handle)||one('SELECT 1 FROM auth_handles WHERE handle=?',handle)||(hasTable('auth_credentials')&&one('SELECT 1 FROM auth_credentials WHERE login=?',handle)))continue;
      run('INSERT INTO auth_handles VALUES(?,?)',userId,handle);syncProfile(userId,handle);return handle;
    }
    throw new AuthError('HANDLE_ALLOCATION_FAILED',503);
  }
  function adoptCredential(userId,value,reserved=new Set()){
    const handle=normalizeHandle(value),occupant=one('SELECT user_id FROM auth_handles WHERE handle=?',handle);
    if(occupant&&occupant.user_id!==userId){run('DELETE FROM auth_handles WHERE user_id=?',occupant.user_id);allocate(occupant.user_id,reserved);}
    if(current(userId)!==handle)run('INSERT INTO auth_handles VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET handle=excluded.handle',userId,handle);
    syncProfile(userId,handle);return handle;
  }
  function backfill(){
    if(backfilled)return;
    const credentials=hasTable('auth_credentials')?all('SELECT user_id,login FROM auth_credentials'):[];
    const users=hasTable('users')?all('SELECT id FROM users'):[];
    const profiles=hasTable('social_profiles')?all('SELECT id FROM social_profiles'):[];
    if(!credentials.length&&!users.length&&!profiles.length){backfilled=true;return;}
    const result=transact(()=>{
      const reserved=new Set(credentials.map(row=>normalizeHandle(row.login)));
      // Existing credential owners win during migration, before legacy handles
      // are allocated. An earlier provisional legacy claim is safely moved.
      for(const {user_id,login}of credentials){
        adoptCredential(user_id,login,reserved);
      }
      for(const {id}of [...users,...profiles])syncProfile(id,current(id)||allocate(id,reserved));
    });
    backfilled=true;return result;
  }
  function assertAvailable(value,userId=''){
    const handle=normalizeHandle(value);backfill();
    const owner=one('SELECT user_id FROM auth_handles WHERE handle=?',handle);
    if(owner&&owner.user_id!==userId)throw new AuthError('LOGIN_TAKEN',409);
    const credential=hasTable('auth_credentials')&&one('SELECT user_id FROM auth_credentials WHERE login=?',handle);
    if(credential&&credential.user_id!==userId)throw new AuthError('LOGIN_TAKEN',409);
    return handle;
  }
  function claim(userId,value){
    return transact(()=>{
      const handle=assertAvailable(value,userId);
      run('INSERT INTO auth_handles VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET handle=excluded.handle',userId,handle);syncProfile(userId,handle);return handle;
    });
  }
  backfill();
  return {
    backfill,assertAvailable,claim,
    ensure(userId){
      const existing=current(userId);if(existing)return existing;
      return transact(()=>{
        const credential=hasTable('auth_credentials')&&one('SELECT login FROM auth_credentials WHERE user_id=?',userId);
        return credential?adoptCredential(userId,credential.login):allocate(userId);
      });
    },
    lookup(value){backfill();return one('SELECT user_id FROM auth_handles WHERE handle=?',normalizeHandle(value))?.user_id;},
  };
}
