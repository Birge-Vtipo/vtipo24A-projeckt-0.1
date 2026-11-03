import { createHash, randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { AuthError, normalizePhone } from './auth-core.mjs';
const scrypt=promisify(derive),hash=s=>createHash('sha256').update(s).digest('hex');
// Login accepts older credentials without applying the new creation policy.
// Its lower bound remains UTF-16 compatible; the upper bound also fits every
// new 128-codepoint password containing supplementary Unicode symbols.
export const loginPasswordValid=p=>typeof p==='string'&&p.length>=8&&p.length<=256&&[...p].length<=128;
export const strongPassword=p=>loginPasswordValid(p)&&[...p].length>=8&&/\p{Lu}/u.test(p)&&/[0-9]/.test(p)&&/[\p{P}\p{S}]/u.test(p);
export async function passwordMatches(password,row) { const digest=await scrypt(password,row?.salt||'birge-unregistered',64);return !!row&&Buffer.from(row.digest,'hex').length===digest.length&&timingSafeEqual(digest,Buffer.from(row.digest,'hex')); }
export async function derivePassword(password) { const salt=randomBytes(16).toString('hex'),digest=await scrypt(password,salt,64);return {salt,digest:digest.toString('hex')}; }
export function createPasswords(auth,now=Date.now) {
  const db=auth.db;
  db.exec(`CREATE TABLE IF NOT EXISTS passwords(user_id TEXT PRIMARY KEY,salt TEXT,digest TEXT);
    CREATE TABLE IF NOT EXISTS password_attempts(phone TEXT,address TEXT,created INTEGER);
    CREATE INDEX IF NOT EXISTS password_phone ON password_attempts(phone,created);
    CREATE INDEX IF NOT EXISTS password_address ON password_attempts(address,created);`);
  return {
    async login(data,address,device={}) {
      const phone=normalizePhone(data.phone),t=now(),pHash=hash(phone),aHash=hash(address);
      db.prepare('DELETE FROM password_attempts WHERE created<?').run(t-3600000);
      if(db.prepare('SELECT count(*) n FROM password_attempts WHERE phone=? AND created>?').get(pHash,t-900000).n>=10||db.prepare('SELECT count(*) n FROM password_attempts WHERE address=? AND created>?').get(aHash,t-900000).n>=30||db.prepare('SELECT count(*) n FROM password_attempts').get().n>=300)throw new AuthError('WAIT_BEFORE_RESEND',429,900);
      db.prepare('INSERT INTO password_attempts VALUES(?,?,?)').run(pHash,aHash,t);
      if(!loginPasswordValid(data.password))throw new AuthError('INVALID_PASSWORD',401);
      const row=db.prepare('SELECT p.*,u.id,u.phone,u.name FROM passwords p JOIN users u ON u.id=p.user_id WHERE u.phone=?').get(phone);
      if(!await passwordMatches(data.password,row))throw new AuthError('INVALID_PASSWORD',401);
      // A reset may finish while scrypt runs; do not issue a session from stale credentials.
      const current=db.prepare('SELECT salt,digest FROM passwords WHERE user_id=?').get(row.id);
      if(!current||current.salt!==row.salt||current.digest!==row.digest)throw new AuthError('INVALID_PASSWORD',401);
      return auth.issueSession(row.id,'password',device);
    },
    async set(token,data) {
      const user=auth.me(token),t=now(),strength=db.prepare('SELECT * FROM auth_strength WHERE digest=?').get(hash(token));
      if(!strongPassword(data.password))throw new AuthError('WEAK_PASSWORD');
      // Password setup and recovery require a recently verified WhatsApp code.
      if(!strength||strength.method!=='otp'||t-strength.created>600000)throw new AuthError('REAUTH_REQUIRED',401);
      const {salt,digest}=await derivePassword(data.password);
      auth.me(token);
      return auth.transaction(()=>{
        db.prepare('INSERT INTO passwords VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET salt=excluded.salt,digest=excluded.digest').run(user.id,salt,digest);
        db.prepare('DELETE FROM auth_strength WHERE digest IN(SELECT digest FROM sessions WHERE user_id=? AND digest<>?)').run(user.id,hash(token));
        db.prepare('DELETE FROM auth_devices WHERE digest IN(SELECT digest FROM sessions WHERE user_id=? AND digest<>?)').run(user.id,hash(token));
        db.prepare('DELETE FROM sessions WHERE user_id=? AND digest<>?').run(user.id,hash(token));
        return {ok:true};
      });
    }
  };
}
