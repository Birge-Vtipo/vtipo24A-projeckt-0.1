import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

export class AuthError extends Error {
  constructor(code, status = 400, retryAfter = 0) { super(code); this.code = code; this.status = status; this.retryAfter = retryAfter; }
}
export function normalizePhone(value) {
  if (typeof value !== 'string' || value.length > 30 || !/^\+?[\d ()-]+$/.test(value)) throw new AuthError('INVALID_PHONE');
  let phone = value.replace(/[ ()-]/g, '');
  if (/^8\d{10}$/.test(phone)) phone = '+7' + phone.slice(1);
  if (/^7\d{10}$/.test(phone)) phone = '+' + phone;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new AuthError('INVALID_PHONE');
  return phone;
}
const sha = value => createHash('sha256').update(value).digest('hex');
export function createAuthCore({ db, secret, sender = {ready:()=>false}, now = Date.now, onLogin }) {
  if (!secret || secret.length < 32) throw new Error('A strong server secret is required');
  if (!db?.exec || !db?.prepare) throw new Error('A synchronous SQLite-compatible database is required');
  db.exec(`CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY, phone TEXT NOT NULL, name TEXT NOT NULL, digest TEXT NOT NULL,
      created INTEGER NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS challenge_phone ON challenges(phone,created);
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, phone TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(digest TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_strength(digest TEXT PRIMARY KEY, method TEXT, created INTEGER);
    CREATE TABLE IF NOT EXISTS auth_devices(digest TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      platform TEXT NOT NULL, created INTEGER NOT NULL, last_seen INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_login_events(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_name TEXT NOT NULL,
      platform TEXT NOT NULL, created INTEGER NOT NULL, read_at INTEGER);
    CREATE INDEX IF NOT EXISTS auth_login_event_user ON auth_login_events(user_id,created);
    CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, address TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS request_time ON requests(created);`);
  // A crash while sending must never leave a challenge verifiable.
  db.prepare("UPDATE challenges SET state='failed' WHERE state='sending'").run();
  // Separate metadata preserves existing session schema/tokens during an upgrade.
  for (const session of db.prepare('SELECT s.digest,s.expires,a.created FROM sessions s LEFT JOIN auth_strength a ON a.digest=s.digest LEFT JOIN auth_devices d ON d.digest=s.digest WHERE d.digest IS NULL').all()) {
    const created = session.created ?? Math.max(0, session.expires - 7 * 86400000);
    db.prepare('INSERT INTO auth_devices VALUES(?,?,?,?,?,?)').run(session.digest, randomUUID(), 'Белгісіз құрылғы / Неизвестное устройство', 'unknown', created, created);
  }
  const digest = (id, code) => createHmac('sha256', secret).update(id + ':' + code).digest('hex');
  const cleanName = value => {
    if (typeof value !== 'string' || value.trim().length < 2 || value.trim().length > 80) throw new AuthError('INVALID_NAME');
    return value.trim();
  };
  const iso = value => new Date(value).toISOString();
  let decorateUser = user => user, transactionDepth = 0, afterCommit = [];
  function transaction(callback) {
    if (transactionDepth) return callback();
    const execute = () => {
      transactionDepth = 1;
      try { const value = callback(); if (value?.then) throw new Error('Auth transactions must be synchronous'); return value; }
      finally { transactionDepth = 0; }
    };
    let result;
    try {
      if (typeof db.transaction === 'function') result = db.transaction(execute);
      else {
        db.exec('BEGIN IMMEDIATE');
        try { result = execute(); db.exec('COMMIT'); }
        catch (error) { db.exec('ROLLBACK'); throw error; }
      }
    } catch (error) { afterCommit = []; throw error; }
    const callbacks = afterCommit; afterCommit = [];
    for (const callback of callbacks) callback();
    return result;
  }
  function cleanDevice(device = {}) {
    const input = device && typeof device === 'object' && !Array.isArray(device) ? device : {};
    // Metadata is a display hint supplied by a client, never an authentication factor.
    const text = value => typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim() : '';
    const agent = text(input.userAgent).slice(0, 200), supplied = text(input.platform).toLowerCase();
    const detected = /android/i.test(agent) ? 'android' : /iphone|ipad|ipod/i.test(agent) ? 'ios' : /windows/i.test(agent) ? 'windows' : /macintosh|mac os/i.test(agent) ? 'macos' : /linux/i.test(agent) ? 'linux' : agent ? 'web' : 'unknown';
    const platform = ['android','ios','windows','macos','linux','web','unknown'].includes(supplied) ? supplied : detected;
    const labels = { android:'Android',ios:'iPhone / iPad',windows:'Windows',macos:'Mac',linux:'Linux',web:'Браузер',unknown:'Белгісіз құрылғы / Неизвестное устройство' };
    return { name: text(input.name).slice(0, 80) || labels[platform], platform };
  }
  function publicEvent(event) {
    return { id:event.id, type:'login', title:'Жаңа кіру / Новый вход', body:event.device_name,
      device_name:event.device_name, platform:event.platform, created_at:iso(event.created), read_at:event.read_at == null ? null : iso(event.read_at) };
  }
  function notifyLogin(event) {
    if (transactionDepth) { afterCommit.push(()=>notifyLogin(event)); return; }
    // The durable event remains available even if a consumer hook is unavailable.
    try { if (typeof onLogin === 'function') Promise.resolve(onLogin({ ...publicEvent(event), user_id:event.user_id,
      user:event.user, session_id:event.session_id, device_label:event.device_name, method:event.method })).catch(() => {}); }
    catch { /* Notification hooks cannot invalidate an already committed login. */ }
  }
  function writeSession(user, method, device, time) {
    user = decorateUser(user);
    const token = randomBytes(32).toString('base64url'), tokenHash = sha(token), expiresAt = time + 7 * 86400000;
    const metadata = cleanDevice(device), sessionId = randomUUID();
    const event = { id:randomUUID(), user_id:user.id, user, session_id:sessionId, method,
      device_name:metadata.name, platform:metadata.platform, created:time, read_at:null };
    db.prepare('INSERT INTO sessions(digest,user_id,expires) VALUES(?,?,?)').run(tokenHash, user.id, expiresAt);
    db.prepare('INSERT INTO auth_strength VALUES(?,?,?)').run(tokenHash, method, time);
    db.prepare('INSERT INTO auth_devices VALUES(?,?,?,?,?,?)').run(tokenHash, sessionId, metadata.name, metadata.platform, time, time);
    db.prepare('INSERT INTO auth_login_events VALUES(?,?,?,?,?,?)').run(event.id, user.id, event.device_name, event.platform, time, null);
    db.prepare('DELETE FROM auth_login_events WHERE user_id=? AND id NOT IN(SELECT id FROM auth_login_events WHERE user_id=? ORDER BY created DESC,rowid DESC LIMIT 100)').run(user.id, user.id);
    return { result:{token,expiresAt,user}, event };
  }
  function issueSession(userId, method, device = {}) {
    if (!['otp','password','telegram','guest'].includes(method)) throw new AuthError('INVALID_LOGIN_METHOD');
    const user = db.prepare('SELECT id,phone,name FROM users WHERE id=?').get(userId);
    if (!user) throw new AuthError('USER_NOT_FOUND',404);
    const issued = transaction(()=>writeSession(user, method, device, now()));
    notifyLogin(issued.event);
    return issued.result;
  }
  function checkSession(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AuthError('SESSION_EXPIRED', 401);
    const row = db.prepare('SELECT u.id,u.phone,u.name,s.expires FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.digest=? AND s.expires>?').get(sha(token), now());
    if (!row) throw new AuthError('SESSION_EXPIRED', 401);
    // Foreground API calls update recency at most once a minute, without storing IPs.
    db.prepare('UPDATE auth_devices SET last_seen=? WHERE digest=? AND last_seen<?').run(now(),sha(token),now()-60000);
    return decorateUser({ id: row.id, phone: row.phone, name: row.name });
  }
  function cleanup(time) {
    db.prepare('DELETE FROM requests WHERE created<?').run(time - 86400000);
    db.prepare('DELETE FROM challenges WHERE created<?').run(time - 86400000);
    db.prepare('DELETE FROM sessions WHERE expires<?').run(time);
    db.prepare('DELETE FROM auth_strength WHERE digest NOT IN (SELECT digest FROM sessions)').run();
    db.prepare('DELETE FROM auth_devices WHERE digest NOT IN (SELECT digest FROM sessions)').run();
  }
  function removeSessions(digests) {
    transaction(()=>{
      for (const tokenHash of digests) {
        db.prepare('DELETE FROM auth_devices WHERE digest=?').run(tokenHash);
        db.prepare('DELETE FROM auth_strength WHERE digest=?').run(tokenHash);
        db.prepare('DELETE FROM sessions WHERE digest=?').run(tokenHash);
      }
    });
  }
  return {
    db,
    issueSession,
    transaction,
    setUserDecorator(decorator) { if (typeof decorator !== 'function') throw new TypeError('A user decorator is required'); decorateUser = decorator; },
    summary: () => ({
      sentLast24h: db.prepare("SELECT count(*) n FROM challenges WHERE created>? AND state IN ('sent','replaced','used')").get(now() - 86400000).n,
      failedLast24h: db.prepare("SELECT count(*) n FROM challenges WHERE created>? AND state='failed'").get(now() - 86400000).n,
      accounts: db.prepare('SELECT count(*) n FROM users').get().n,
    }),
    async send({ phone: input, name: inputName, language = 'kk' }, address = 'unknown') {
      const phone = normalizePhone(input), name = cleanName(inputName), time = now();
      cleanup(time);
      if (!sender.ready()) throw new AuthError('BOT_OFFLINE', 503);
      const latest = db.prepare('SELECT created FROM challenges WHERE phone=? ORDER BY created DESC LIMIT 1').get(phone);
      if (latest && time - latest.created < 60000) throw new AuthError('WAIT_BEFORE_RESEND', 429, Math.ceil((60000 - time + latest.created) / 1000));
      const hourly = db.prepare('SELECT count(*) n FROM challenges WHERE phone=? AND created>?').get(phone, time - 3600000).n;
      const daily = db.prepare('SELECT count(*) n FROM challenges WHERE phone=?').get(phone).n;
      const addressHash = sha(String(address).slice(0, 100));
      const byAddress = db.prepare('SELECT count(*) n FROM requests WHERE address=? AND created>?').get(addressHash, time - 3600000).n;
      const total = db.prepare('SELECT count(*) n FROM requests WHERE created>?').get(time - 3600000).n;
      if (hourly >= 3 || daily >= 10 || byAddress >= 10 || total >= 20) throw new AuthError('SEND_LIMIT', 429, 3600);
      const id = randomUUID(), code = String(randomInt(0, 1000000)).padStart(6, '0'), expires = time + 300000;
      // Reserve before awaiting transport so concurrent requests cannot evade the cooldown.
      db.prepare('INSERT INTO challenges(id,phone,name,digest,created,expires,state) VALUES(?,?,?,?,?,?,?)').run(id, phone, name, digest(id, code), time, expires, 'sending');
      db.prepare('INSERT INTO requests VALUES(?,?,?)').run(id, addressHash, time);
      try {
        await sender.send(phone, language === 'ru'
          ? `Birge: ваш код входа — ${code}. Действует 5 минут. Никому не сообщайте код. Если вы не запрашивали вход, проигнорируйте сообщение.`
          : `Birge: кіру коды — ${code}. 5 минут жарамды. Кодты ешкімге бермеңіз. Кіруді сұрамаған болсаңыз, хабарламаны елемеңіз.`,
          {challengeId:id,code,expiresAt:expires,language:language==='ru'?'ru':'kk',purpose:'login'});
        if (now() >= expires) throw new Error('Delivery timed out');
        db.prepare("UPDATE challenges SET state='replaced' WHERE phone=? AND state='sent'").run(phone);
        db.prepare("UPDATE challenges SET state='sent' WHERE id=?").run(id);
        return { challengeId: id, expiresAt: expires, resendAfter: 60 };
      } catch {
        db.prepare("UPDATE challenges SET state='failed' WHERE id=?").run(id);
        throw new AuthError('DELIVERY_FAILED', 503);
      }
    },
    verify({ challengeId, code }, device = {}) {
      if (typeof challengeId !== 'string' || challengeId.length > 50 || typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new AuthError('INVALID_CODE');
      const row = db.prepare('SELECT * FROM challenges WHERE id=?').get(challengeId), time = now();
      if (!row || row.state !== 'sent' || row.expires <= time || row.attempts >= 5) throw new AuthError('CODE_EXPIRED');
      db.prepare('UPDATE challenges SET attempts=attempts+1 WHERE id=?').run(challengeId);
      if (!timingSafeEqual(Buffer.from(row.digest, 'hex'), Buffer.from(digest(challengeId, code), 'hex'))) throw new AuthError('INVALID_CODE');
      let issued;
      transaction(()=>{
        db.prepare("UPDATE challenges SET state='used' WHERE id=?").run(challengeId);
        db.prepare('INSERT OR IGNORE INTO users VALUES(?,?,?,?)').run(randomUUID(), row.phone, row.name, time);
        const user = db.prepare('SELECT id,phone,name FROM users WHERE phone=?').get(row.phone);
        issued = writeSession(user, 'otp', device, time);
      });
      notifyLogin(issued.event);
      return issued.result;
    },
    me: checkSession,
    listSessions(token) {
      const user = checkSession(token), current = sha(token);
      const devices = db.prepare('SELECT d.*,s.expires,a.method FROM sessions s JOIN auth_devices d ON d.digest=s.digest LEFT JOIN auth_strength a ON a.digest=s.digest WHERE s.user_id=? AND s.expires>? ORDER BY d.last_seen DESC,d.created DESC').all(user.id,now());
      return {devices:devices.map(d=>({id:d.id,name:d.name,platform:d.platform,created_at:iso(d.created),last_seen_at:iso(d.last_seen),expires_at:iso(d.expires),current:d.digest===current,method:d.method||'legacy'}))};
    },
    revokeSession(token, id) {
      const user = checkSession(token);
      if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) throw new AuthError('DEVICE_NOT_FOUND',404);
      const row = db.prepare('SELECT s.digest FROM sessions s JOIN auth_devices d ON d.digest=s.digest WHERE s.user_id=? AND d.id=? AND s.expires>?').get(user.id,id,now());
      if (!row) throw new AuthError('DEVICE_NOT_FOUND',404);
      removeSessions([row.digest]);
      return {ok:true,current:row.digest===sha(token)};
    },
    revokeOtherSessions(token) {
      const user = checkSession(token), current = sha(token);
      const rows = db.prepare('SELECT digest FROM sessions WHERE user_id=? AND digest<>? AND expires>?').all(user.id,current,now());
      removeSessions(rows.map(row=>row.digest));
      return {ok:true,revoked:rows.length};
    },
    loginEvents(token) {
      const user = checkSession(token);
      return {events:db.prepare('SELECT * FROM auth_login_events WHERE user_id=? ORDER BY created DESC,rowid DESC LIMIT 100').all(user.id).map(publicEvent)};
    },
    readLoginEvents(token, ids) {
      const user = checkSession(token);
      if (!Array.isArray(ids) || ids.length > 100 || ids.some(id=>typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id))) throw new AuthError('INVALID_NOTIFICATIONS');
      const update = db.prepare('UPDATE auth_login_events SET read_at=COALESCE(read_at,?) WHERE user_id=? AND id=?');
      for (const id of ids) update.run(now(),user.id,id);
      return {ok:true};
    },
    updateName(token, name) { const user = checkSession(token); const valid = cleanName(name); db.prepare('UPDATE users SET name=? WHERE id=?').run(valid, user.id); return { ...user, name: valid }; },
    logout(token) { checkSession(token); removeSessions([sha(token)]); },
    close() { db.close?.(); },
  };
}
