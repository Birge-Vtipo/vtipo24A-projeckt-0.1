import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { AuthError, normalizePhone } from '../whatsapp-bot/src/auth-core.mjs';
import { derivePassword, loginPasswordValid, passwordMatches, strongPassword } from '../whatsapp-bot/src/passwords.mjs';
import { createHandles,normalizeHandle } from '../whatsapp-bot/src/handles.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (code, status=400, retryAfter=0) => { throw new AuthError(code,status,retryAfter); };
export function normalizeLogin(value) {
  return normalizeHandle(value);
}
const cleanName = (value, fallback) => {
  if(value===undefined)return fallback;
  if(typeof value!=='string'||value.trim().length<2||value.trim().length>80)fail('INVALID_NAME');
  return value.trim();
};
function recoveryValue(value) {
  if(typeof value!=='string'||value.length>120)return '';
  const normalized=value.replace(/[\s-]/gu,'').toUpperCase();
  return /^BRG[0-9A-F]{40}$/.test(normalized)?normalized:'';
}
function createRecovery(userId) {
  const encoded=randomBytes(20).toString('hex').toUpperCase();
  return {code:'BRG-'+encoded.match(/.{4}/g).join('-'),digest:hash(userId+':BRG'+encoded)};
}
function recoveryMatches(userId, input, expected) {
  const received=Buffer.from(hash(userId+':'+recoveryValue(input)),'hex');
  const stored=typeof expected==='string'&&/^[a-f0-9]{64}$/.test(expected)?Buffer.from(expected,'hex'):Buffer.alloc(32);
  return timingSafeEqual(received,stored)&&!!recoveryValue(input)&&!!expected;
}
const unchanged = (before,after) => !before&&!after||!!before&&!!after&&before.salt===after.salt&&before.digest===after.digest;

/** Credential authentication for the cloud. All crypto awaits finish before SQLite transactions. */
export function createCloudAuth(auth,{now=Date.now,onHandleChanged}={}) {
  const db=auth.db;
  db.exec(`CREATE TABLE IF NOT EXISTS passwords(user_id TEXT PRIMARY KEY,salt TEXT,digest TEXT);
    CREATE TABLE IF NOT EXISTS auth_credentials(user_id TEXT PRIMARY KEY,login TEXT NOT NULL UNIQUE,recovery_digest TEXT NOT NULL,updated INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS credentials_login ON auth_credentials(login);
    CREATE TABLE IF NOT EXISTS credential_attempts(kind TEXT,subject TEXT,address TEXT,created INTEGER);
    CREATE INDEX IF NOT EXISTS credential_attempt_time ON credential_attempts(created);
    CREATE INDEX IF NOT EXISTS credential_attempt_subject ON credential_attempts(kind,subject,created);
    CREATE INDEX IF NOT EXISTS credential_attempt_address ON credential_attempts(kind,address,created);`);
  const handles=createHandles({db,transaction:callback=>auth.transaction(callback)});
  const one=(sql,...args)=>db.prepare(sql).get(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
  const credential=userId=>one('SELECT * FROM auth_credentials WHERE user_id=?',userId);
  const password=userId=>one('SELECT * FROM passwords WHERE user_id=?',userId);
  const handleChanged=userId=>{try{Promise.resolve(onHandleChanged?.(userId)).catch(()=>{});}catch{}};
  let pendingCrypto=0;
  async function cryptoTask(callback) {
    if(pendingCrypto>=2)fail('WAIT_BEFORE_RESEND',429,2);
    pendingCrypto++;
    try{return await callback();}finally{pendingCrypto--;}
  }
  function attempt(kind,subject,address) {
    const registration=kind==='register'||kind==='guest';
    const time=now(),window=registration?3600000:900000;
    const subjectHash=hash(String(subject??'').slice(0,160)),addressHash=hash(String(address??'unknown').slice(0,200));
    run('DELETE FROM credential_attempts WHERE created<?',time-86400000);
    const count=(suffix,...args)=>one('SELECT count(*) n FROM credential_attempts WHERE kind=? AND created>? '+suffix,kind,time-window,...args).n;
    const bySubject=registration?100:kind==='recover'?5:10;
    const byAddress=registration?20:kind==='recover'?20:30;
    const total=registration?100:kind==='recover'?150:300;
    if(count('AND subject=?',subjectHash)>=bySubject||count('AND address=?',addressHash)>=byAddress||count('')>=total)fail('WAIT_BEFORE_RESEND',429,Math.ceil(window/1000));
    run('INSERT INTO credential_attempts VALUES(?,?,?,?)',kind,subjectHash,addressHash,time);
  }
  function decorateUser(user) {
    const isGuest=!!user.phone?.startsWith('guest:');
    const credentials=credential(user.id),hasPassword=!!password(user.id);
    return {...user,phone:isGuest||user.phone?.startsWith('id:')?'':user.phone||'',login:credentials?.login||'',handle:handles.ensure(user.id),hasPassword,hasCredentials:!!credentials,...(isGuest?{isGuest:true}:{})};
  }
  auth.setUserDecorator(decorateUser);
  function resolveUser(input) {
    if(typeof input!=='string'||input.length>80)return;
    const value=input.trim().replace(/^@/,'').toLowerCase();
    if(/^[a-z0-9_]{3,24}$/.test(value)) {
      const owner=handles.lookup(value);
      if(owner){const match=one('SELECT id,phone,name FROM users WHERE id=?',owner);if(match&&!match.phone.startsWith('guest:'))return match;}
      const match=one('SELECT u.id,u.phone,u.name FROM users u JOIN auth_credentials c ON c.user_id=u.id WHERE c.login=?',value);
      if(match&&!match.phone.startsWith('guest:'))return match;
    }
    if(/^[a-f0-9-]{36}$/.test(value)) {
      const match=one('SELECT id,phone,name FROM users WHERE id=?',value);
      if(match&&!match.phone.startsWith('guest:'))return match;
    }
    try {return one('SELECT id,phone,name FROM users WHERE phone=?',normalizePhone(input));}catch{return;}
  }
  function clearSessions(userId,keep) {
    const condition=keep?'user_id=? AND digest<>?':'user_id=?',bindings=keep?[userId,keep]:[userId];
    run('DELETE FROM auth_devices WHERE digest IN(SELECT digest FROM sessions WHERE '+condition+')',...bindings);
    run('DELETE FROM auth_strength WHERE digest IN(SELECT digest FROM sessions WHERE '+condition+')',...bindings);
    run('DELETE FROM sessions WHERE '+condition,...bindings);
  }
  function savePassword(userId,value) {run('INSERT INTO passwords VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET salt=excluded.salt,digest=excluded.digest',userId,value.salt,value.digest);}
  // Internal proof version for phone binding. It never leaves the server and
  // invalidates a pending binding after a password/recovery credential change.
  const bindingVersion=userId=>{
    const row=password(userId),identity=credential(userId);
    return row&&identity?hash(JSON.stringify([userId,row.salt,row.digest,identity.recovery_digest,identity.updated])):'';
  };
  function available(login,userId='') {
    handles.assertAvailable(login,userId);
    const owner=one('SELECT user_id FROM auth_credentials WHERE login=?',login);
    if(owner&&owner.user_id!==userId)fail('LOGIN_TAKEN',409);
    const legacy=one('SELECT id FROM users WHERE phone=?','id:'+login);
    if(legacy&&legacy.id!==userId)fail('LOGIN_TAKEN',409);
    // Numeric usernames must not shadow a migrated user's existing phone alias.
    let phone;
    try {phone=normalizePhone(login);}catch{}
    const phoneOwner=phone&&one('SELECT id FROM users WHERE phone=?',phone);
    if(phoneOwner&&phoneOwner.id!==userId)fail('LOGIN_TAKEN',409);
  }
  return {
    decorateUser,
    me:token=>auth.me(token),
    bindingVersion,
    async authorizePhoneBinding(token,data,address='unknown') {
      const user=auth.me(token);if(user.isGuest)fail('REAUTH_REQUIRED',401);
      attempt('phone-binding',user.id,address);
      const before=password(user.id),identity=credential(user.id),version=bindingVersion(user.id);
      if(!before||!identity||!version)fail('REAUTH_REQUIRED',401);
      if(!recoveryMatches(user.id,data.recoveryCode,identity.recovery_digest)){
        if(!data.currentPassword)fail(data.recoveryCode?'INVALID_RECOVERY_CODE':'REAUTH_REQUIRED',401);
        if(!loginPasswordValid(data.currentPassword)||!await cryptoTask(()=>passwordMatches(data.currentPassword,before)))fail('INVALID_CREDENTIALS',401);
      }
      auth.me(token);
      if(version!==bindingVersion(user.id))fail('REAUTH_REQUIRED',401);
      return {userId:user.id,credentialVersion:version};
    },
    guest(data={},address='unknown') {
      // A browser may only supply display hints for its own new session. It
      // cannot select an existing user, public handle, phone or credentials.
      if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(key=>key!=='device'))fail('INVALID_INPUT');
      const id=randomUUID();
      return auth.transaction(()=>{
        // The durable quota, identity, handle and hashed session commit as one
        // transaction, including across simultaneous requests / DO restarts.
        attempt('guest','anonymous',address);
        run('INSERT INTO users(id,phone,name,created) VALUES(?,?,?,?)',id,'guest:'+id,'Қонақ '+id.slice(0,6).toUpperCase(),now());
        return auth.issueSession(id,'guest',data.device);
      });
    },
    async register(data,address='unknown') {
      const login=normalizeLogin(data.login),name=cleanName(data.name,login);
      if(!strongPassword(data.password))fail('WEAK_PASSWORD');
      attempt('register',login,address);available(login);
      const derived=await cryptoTask(()=>derivePassword(data.password));
      const id=randomUUID(),recovery=createRecovery(id);
      const session=auth.transaction(()=>{
        available(login);
        run('INSERT INTO users(id,phone,name,created) VALUES(?,?,?,?)',id,'id:'+login,name,now());
        run('INSERT INTO auth_credentials VALUES(?,?,?,?)',id,login,recovery.digest,now());
        handles.claim(id,login);
        savePassword(id,derived);
        return auth.issueSession(id,'password',data.device);
      });
      handleChanged(id);
      return {...session,recoveryCode:recovery.code};
    },
    async login(data,address='unknown') {
      const input=data.login??data.phone;
      attempt('login',input,address);
      if(!loginPasswordValid(data.password))fail('INVALID_CREDENTIALS',401);
      const user=resolveUser(input),row=user&&password(user.id);
      const matches=await cryptoTask(()=>passwordMatches(data.password,row));
      if(!user||!matches||!unchanged(row,password(user.id)))fail('INVALID_CREDENTIALS',401);
      return auth.issueSession(user.id,'password',data.device);
    },
    async recover(data,address='unknown') {
      attempt('recover',data.login,address);
      if(!strongPassword(data.password))fail('WEAK_PASSWORD');
      const user=resolveUser(data.login),credentials=user&&credential(user.id);
      if(!user||!recoveryMatches(user.id,data.recoveryCode,credentials?.recovery_digest))fail('INVALID_RECOVERY_CODE',401);
      const derived=await cryptoTask(()=>derivePassword(data.password)),recovery=createRecovery(user.id);
      const session=auth.transaction(()=>{
        const latest=credential(user.id);
        if(!latest||latest.recovery_digest!==credentials.recovery_digest)fail('INVALID_RECOVERY_CODE',401);
        savePassword(user.id,derived);
        run('UPDATE auth_credentials SET recovery_digest=?,updated=? WHERE user_id=?',recovery.digest,now(),user.id);
        clearSessions(user.id);
        return auth.issueSession(user.id,'password',data.device);
      });
      return {...session,recoveryCode:recovery.code};
    },
    async setCredentials(token,data,address='unknown') {
      const user=auth.me(token);
      if(user.isGuest)fail('REAUTH_REQUIRED',401);
      attempt('credentials',user.id,address);
      if(!strongPassword(data.password))fail('WEAK_PASSWORD');
      const previous=credential(user.id),before=password(user.id);
      const login=normalizeLogin(data.login===undefined?previous?.login:data.login);
      available(login,user.id);
      if(before) {
        const withRecovery=recoveryMatches(user.id,data.recoveryCode,previous?.recovery_digest);
        if(!withRecovery) {
          if(!data.currentPassword)fail('REAUTH_REQUIRED',401);
          if(!loginPasswordValid(data.currentPassword)||!await cryptoTask(()=>passwordMatches(data.currentPassword,before)))fail('INVALID_CREDENTIALS',401);
        }
      } else if(previous)fail('REAUTH_REQUIRED',401);
      // A migrated session without any password/credentials can bootstrap once.
      // The existing authenticated session proves ownership for this one-time bootstrap.
      const derived=await cryptoTask(()=>derivePassword(data.password)),recovery=createRecovery(user.id);
      const result=auth.transaction(()=>{
        auth.me(token);
        const current=credential(user.id);
        if(!unchanged(before,password(user.id))||(current?.recovery_digest??null)!==(previous?.recovery_digest??null))fail('INVALID_CREDENTIALS',401);
        available(login,user.id);
        run('INSERT INTO auth_credentials VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET login=excluded.login,recovery_digest=excluded.recovery_digest,updated=excluded.updated',user.id,login,recovery.digest,now());
        handles.claim(user.id,login);
        savePassword(user.id,derived);
        clearSessions(user.id,hash(token));
        return {ok:true,user:auth.me(token),recoveryCode:recovery.code};
      });
      // A refresh failure must never hide the newly committed one-time code.
      if(user.handle!==login)handleChanged(user.id);
      return result;
    },
  };
}
