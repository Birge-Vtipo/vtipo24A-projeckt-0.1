import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { AuthError } from './auth-core.mjs';
import { createHandles,normalizeHandle,profileSearch } from './handles.mjs';

const fail = (code = 'INVALID_INPUT', status = 400) => { throw new AuthError(code, status); };
const text = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max ? value.trim() : fail();
const parse = row => row ? JSON.parse(row.data) : null;
const now = () => new Date().toISOString();
const uuid = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
const description = value => {
  const result=text(value,1,4000);
  if(result.split(/\s+/u).filter(token=>/[\p{L}\p{N}]/u.test(token)).length<5)fail('DESCRIPTION_TOO_SHORT');
  return result;
};

// Uses the existing authenticated account ID; phone numbers never enter public profiles.
export function createSocial({ db, directory, secret, mediaStorage }) {
  const media=mediaStorage||{
    async write(id,bytes){await mkdir(directory,{recursive:true});await writeFile(path.join(directory,id),bytes,{flag:'wx'});},
    read:id=>readFile(path.join(directory,id)),
    remove:id=>unlink(path.join(directory,id)),
  };
  db.exec(`CREATE TABLE IF NOT EXISTS social_profiles(id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS social_listings(id TEXT PRIMARY KEY, owner TEXT NOT NULL, data TEXT NOT NULL, created TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS social_listing_owner ON social_listings(owner);
    CREATE TABLE IF NOT EXISTS social_follows(actor TEXT, target TEXT, PRIMARY KEY(actor,target));
    CREATE INDEX IF NOT EXISTS social_follower_target ON social_follows(target);
    CREATE TABLE IF NOT EXISTS social_blocks(actor TEXT, target TEXT, PRIMARY KEY(actor,target));
    CREATE TABLE IF NOT EXISTS social_favorites(actor TEXT, target TEXT, PRIMARY KEY(actor,target));
    CREATE TABLE IF NOT EXISTS social_rooms(id TEXT PRIMARY KEY, pair TEXT UNIQUE, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS social_members(room TEXT, user TEXT, PRIMARY KEY(room,user));
    CREATE INDEX IF NOT EXISTS social_member_user ON social_members(user,room);
    CREATE TABLE IF NOT EXISTS social_messages(id TEXT PRIMARY KEY, room TEXT, sender TEXT, data TEXT NOT NULL, created TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS social_message_room ON social_messages(room,created);
    CREATE TABLE IF NOT EXISTS social_message_clients(sender TEXT, client TEXT, message TEXT NOT NULL, PRIMARY KEY(sender,client));
    CREATE TABLE IF NOT EXISTS social_reads(room TEXT, user TEXT, last_message TEXT NOT NULL, message_order INTEGER NOT NULL, PRIMARY KEY(room,user));
    CREATE TABLE IF NOT EXISTS social_notifications(id TEXT PRIMARY KEY, recipient TEXT NOT NULL, actor TEXT, kind TEXT NOT NULL, room TEXT, message TEXT, data TEXT NOT NULL, created TEXT NOT NULL, read_at TEXT, dedupe TEXT);
    CREATE INDEX IF NOT EXISTS social_notification_recipient ON social_notifications(recipient,created);
    CREATE UNIQUE INDEX IF NOT EXISTS social_notification_dedupe ON social_notifications(recipient,kind,dedupe);
    CREATE TABLE IF NOT EXISTS social_notification_preferences(user TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS social_event_heads(user TEXT PRIMARY KEY, sequence INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS social_events(user TEXT, sequence INTEGER, created INTEGER NOT NULL, PRIMARY KEY(user,sequence));
    CREATE TABLE IF NOT EXISTS social_media(id TEXT PRIMARY KEY, owner TEXT, scope TEXT, room TEXT, mime TEXT, size INTEGER, created INTEGER);
    CREATE INDEX IF NOT EXISTS social_media_owner ON social_media(owner);
    CREATE TABLE IF NOT EXISTS social_limits(actor TEXT, action TEXT, created INTEGER);
    CREATE INDEX IF NOT EXISTS social_limit_lookup ON social_limits(actor,action,created);
    CREATE TABLE IF NOT EXISTS social_reports(id TEXT PRIMARY KEY, actor TEXT, target TEXT, reason TEXT, created TEXT);`);
  if (!db.prepare('PRAGMA table_info(social_profiles)').all().some(c=>c.name==='search')) db.exec('ALTER TABLE social_profiles ADD COLUMN search TEXT');
  for (const p of db.prepare('SELECT id,data FROM social_profiles WHERE search IS NULL').all()) db.prepare('UPDATE social_profiles SET search=? WHERE id=?').run(JSON.parse(p.data).name.toLocaleLowerCase('kk-KZ'),p.id);
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  function transaction(fn) { if(typeof db.transaction==='function')return db.transaction(fn);db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; } }
  const handles=createHandles({db,transaction});
  function limit(actor, action, count, window = 60000) {
    const t = Date.now();
    run('DELETE FROM social_limits WHERE created<?', t - 86400000);
    if (one('SELECT count(*) n FROM social_limits WHERE actor=? AND action=? AND created>?', actor, action, t-window).n >= count) fail('SLOW_DOWN', 429);
    run('INSERT INTO social_limits VALUES(?,?,?)', actor, action, t);
  }
  function ensure(user) {
    const handle=handles.ensure(user.id);
    if (!one('SELECT id FROM social_profiles WHERE id=?', user.id)) run('INSERT INTO social_profiles(id,data,search) VALUES(?,?,?)', user.id, JSON.stringify({ id: user.id, handle, name: user.name, city: 'Астана', language: 'kk', bio: '', accent: '#393185', avatar: null, cover: null, cover_kind: 'image', wallpaper: null, wallpaper_kind: 'image' }),profileSearch(user.name,handle));
  }
  const listeners=new Map();
  const quiet=Symbol('unchanged-social-result');
  const defaultPreferences={messages:true,follows:true,logins:true};
  const preferences=user=>({...defaultPreferences,...parse(one('SELECT data FROM social_notification_preferences WHERE user=?',user))});
  function invalidate(users) {
    for(const user of new Set(users.filter(Boolean))) {
      run('INSERT INTO social_event_heads VALUES(?,1) ON CONFLICT(user) DO UPDATE SET sequence=sequence+1',user);
      const {sequence}=one('SELECT sequence FROM social_event_heads WHERE user=?',user);
      run('INSERT INTO social_events VALUES(?,?,?)',user,sequence,Date.now());
      run('DELETE FROM social_events WHERE user=? AND (sequence<=? OR created<?)',user,sequence-200,Date.now()-7*86400000);
      // These are invalidations, never private messages. One slow/broken connection
      // cannot interrupt a successful mutation or another device's subscription.
      for(const listener of listeners.get(user)||[])try{listener({id:sequence,type:'change'});}catch{}
    }
  }
  function subscribe(user,listener,{afterId}={}) {
    ensure(user);
    if(typeof listener!=='function')fail();
    const current=listeners.get(user.id)||new Set();
    if(current.size>=8)fail('SLOW_DOWN',429);
    current.add(listener);listeners.set(user.id,current);
    const head=one('SELECT sequence FROM social_event_heads WHERE user=?',user.id)?.sequence||0;
    // Coalesce missed generic invalidations into one fresh snapshot request.
    if(afterId===undefined||Number(afterId)!==head)try{listener({id:head,type:'change'});}catch{}
    let closed=false;
    return()=>{if(closed)return;closed=true;current.delete(listener);if(!current.size)listeners.delete(user.id);};
  }
  function recordNotification({recipient,actor=null,type,room=null,message=null,details={},dedupe=null}) {
    if((actor===recipient&&type!=='login')||(actor&&blocked(recipient,actor)))return;
    const key={message:'messages',follow:'follows',login:'logins'}[type];
    if(!key||!preferences(recipient)[key])return;
    if(type==='message'&&!one('SELECT 1 FROM social_members WHERE room=? AND user=?',room,recipient))return;
    run('INSERT OR IGNORE INTO social_notifications VALUES(?,?,?,?,?,?,?,?,?,?)',randomUUID(),recipient,actor,type,room,message,JSON.stringify(details),now(),null,dedupe);
    run('DELETE FROM social_notifications WHERE recipient=? AND (rowid NOT IN(SELECT rowid FROM social_notifications WHERE recipient=? ORDER BY rowid DESC LIMIT 1000) OR created<?)',recipient,recipient,new Date(Date.now()-90*86400000).toISOString());
  }
  const notificationVisible=`n.recipient=? AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.actor=n.recipient AND b.target=n.actor) OR (b.target=n.recipient AND b.actor=n.actor)) AND (n.kind<>'message' OR EXISTS(SELECT 1 FROM social_members m WHERE m.room=n.room AND m.user=n.recipient))`;
  const notificationCount=user=>one(`SELECT count(*) n FROM social_notifications n WHERE ${notificationVisible} AND n.read_at IS NULL`,user).n;
  function notifications(user,{limit:requested=50}={}) {
    ensure(user);
    const maximum=Number(requested);
    if(!Number.isSafeInteger(maximum)||maximum<1||maximum>100)fail();
    const rows=all(`SELECT n.* FROM social_notifications n WHERE ${notificationVisible} ORDER BY n.rowid DESC LIMIT ?`,user.id,maximum);
    const ru=parse(one('SELECT data FROM social_profiles WHERE id=?',user.id))?.language==='ru';
    return {notifications:rows.map(n=>{
      const actor=n.actor?parse(one('SELECT data FROM social_profiles WHERE id=?',n.actor)):null;
      const details=JSON.parse(n.data),actorName=actor?.name||'Birge';
      const title=n.kind==='message'?actorName:n.kind==='follow'?(ru?'Новый подписчик':'Жаңа жазылушы'):(ru?'Вход в аккаунт':'Аккаунтқа кіру');
      const attachment={audio:ru?'Голосовое сообщение':'Дауыстық хабарлама',image:ru?'Фото':'Фото',video:ru?'Видео':'Видео'}[details.message_kind]||'Birge';
      const body=n.kind==='message'?(details.preview||attachment):n.kind==='follow'?(ru?`${actorName} подписался на вас`:`${actorName} саған жазылды`):(ru?`Вход: ${details.device_label||'Новое устройство'}`:`Кіру: ${details.device_label||'Жаңа құрылғы'}`);
      return {...details,id:n.id,type:n.kind,title,body,created_at:n.created,read_at:n.read_at,
        ...(n.actor?{actor_id:n.actor,actor_handle:handles.ensure(n.actor),actor_name:actor?.name||'Birge',actor_avatar_url:mediaUrl(actor?.avatar)}:{}),
        ...(n.room?{conversation_id:n.room}:{}),...(n.message?{message_id:n.message}:{})};
    }),unread_count:notificationCount(user.id),preferences:preferences(user.id)};
  }
  function notifyLogin(user,{session_id,device_label}={}) {
    ensure(user);
    const details={};
    if(session_id!==undefined)details.session_id=text(session_id,1,100);
    if(device_label!==undefined)details.device_label=text(device_label,1,160);
    recordNotification({recipient:user.id,type:'login',details,dedupe:details.session_id||null});
    invalidate([user.id]);
  }
  const blocked = (a,b) => !!one('SELECT 1 FROM social_blocks WHERE (actor=? AND target=?) OR (actor=? AND target=?)',a,b,b,a);
  function member(user, room) {
    const r = parse(one('SELECT data FROM social_rooms WHERE id=?', room));
    if (!r || !one('SELECT 1 FROM social_members WHERE room=? AND user=?', room,user)) fail('CHAT_NOT_FOUND',404);
    return r;
  }
  function mediaRef(id, owner, scope, room = '') {
    if (id === null || id === '' || id === undefined) return null;
    if (!uuid(id)) fail('INVALID_MEDIA');
    const m = one('SELECT * FROM social_media WHERE id=?', id);
    if (!m || m.owner !== owner || m.scope !== scope || m.room !== room || m.size < 1) fail('INVALID_MEDIA');
    return m;
  }
  const signature = (id, exp) => createHmac('sha256', secret).update(`birge-media-v1:${id}:${exp}`).digest('hex');
  function mediaUrl(id) {
    if (!id) return null;
    const exp = Math.ceil(Date.now()/1800000)*1800000 + 1800000;
    return `/media/${id}?expires=${exp}&signature=${signature(id,exp)}`;
  }
  function profileView(p, actor) {
    return { ...p, handle:handles.ensure(p.id), avatar_url: mediaUrl(p.avatar), cover_url: mediaUrl(p.cover), wallpaper_url: mediaUrl(p.wallpaper),
      followers: one('SELECT count(*) n FROM social_follows WHERE target=?',p.id).n,
      following_count: one('SELECT count(*) n FROM social_follows WHERE actor=?',p.id).n,
      followed: !!one('SELECT 1 FROM social_follows WHERE actor=? AND target=?',actor,p.id) };
  }
  function listingView(l) { return { ...l, image_url: mediaUrl(l.image_path) }; }
  function messageView(id) {
    const row=one('SELECT data,rowid AS sequence FROM social_messages WHERE id=?',id),message=parse(row);
    return {...message,sequence:row.sequence,media_url:mediaUrl(message.media_id)};
  }
  function snapshot(user) {
    ensure(user);
    const rooms = all('SELECT r.data FROM social_rooms r JOIN social_members m ON m.room=r.id WHERE m.user=?',user.id).map(parse);
    const messages = all('SELECT msg.data,msg.rowid AS sequence FROM social_messages msg JOIN social_members m ON m.room=msg.room WHERE m.user=? ORDER BY msg.rowid DESC LIMIT 500',user.id).map(row=>({...parse(row),sequence:row.sequence})).filter(m=>!blocked(user.id,m.sender_id)).reverse();
    const profiles = all('SELECT data FROM social_profiles ORDER BY rowid DESC LIMIT 200').map(parse).filter(p=>!blocked(user.id,p.id));
    const own = parse(one('SELECT data FROM social_profiles WHERE id=?',user.id));
    return { profile: profileView(own,user.id), profiles: profiles.map(p=>profileView(p,user.id)),
      listings: all('SELECT data FROM social_listings ORDER BY created DESC LIMIT 500').map(parse).filter(l=>!blocked(user.id,l.owner_id)).map(listingView),
      conversations: rooms.map(r=>{
        const reads=all('SELECT seen.user,seen.last_message,seen.message_order FROM social_reads seen JOIN social_members m ON m.room=seen.room AND m.user=seen.user WHERE seen.room=?',r.id);
        return {...r,members:all('SELECT user FROM social_members WHERE room=?',r.id).map(m=>m.user),
          read_by:Object.fromEntries(reads.map(seen=>[seen.user,seen.last_message])),
          read_sequence_by:Object.fromEntries(reads.map(seen=>[seen.user,seen.message_order]))};
      }),
      messages: messages.map(m=>({...m,media_url:mediaUrl(m.media_id)})),
      favorites: all('SELECT target FROM social_favorites WHERE actor=?',user.id).map(r=>r.target),
      blocked: all('SELECT target FROM social_blocks WHERE actor=?',user.id).map(r=>r.target), reports: [], notification_count:notificationCount(user.id) };
  }
  function search(user, query) {
    ensure(user);
    const raw=String(query || '').trim();
    if(raw.startsWith('@')){
      let handle;
      try {handle=normalizeHandle(raw);} catch {return [];}
      return all('SELECT p.data FROM social_profiles p JOIN auth_handles h ON h.user_id=p.id WHERE h.handle=?',handle)
        .map(parse).filter(p=>!blocked(user.id,p.id)).map(p=>profileView(p,user.id));
    }
    const input=raw.toLocaleLowerCase('kk-KZ').slice(0,80);
    let q='',bytes=2;
    for(const character of input){
      const escaped=/[\\%_]/.test(character)?'\\'+character:character;
      const size=Buffer.byteLength(escaped);
      if(bytes+size>(db.maxLikePatternBytes??Infinity))break;
      q+=escaped;bytes+=size;
    }
    return all("SELECT p.data FROM social_profiles p LEFT JOIN auth_handles h ON h.user_id=p.id WHERE p.search LIKE ? ESCAPE '\\' OR h.handle LIKE ? ESCAPE '\\' OR p.id=? LIMIT 60", `%${q}%`,`%${q}%`,input)
      .map(parse).filter(p=>!blocked(user.id,p.id)).map(p=>profileView(p,user.id));
  }
  function mutateAction(user, action, data) {
    ensure(user);
    const actor = user.id;
    limit(actor,'write',120);
    if(action==='notifications-read') {
      let count;
      if(data.all===true)count=run('UPDATE social_notifications SET read_at=? WHERE recipient=? AND read_at IS NULL',now(),actor).changes;
      else {
        if(!Array.isArray(data.ids)||data.ids.length<1||data.ids.length>100||data.ids.some(id=>!uuid(id)))fail();
        count=transaction(()=>{
          let changed=0;const readAt=now();
          // Durable Object SQLite allows at most 100 bindings per statement.
          for(let offset=0;offset<data.ids.length;offset+=98){const ids=data.ids.slice(offset,offset+98);changed+=run(`UPDATE social_notifications SET read_at=? WHERE recipient=? AND read_at IS NULL AND id IN(${ids.map(()=>'?').join(',')})`,readAt,actor,...ids).changes;}
          return changed;
        });
      }
      return {ok:true,updated:count};
    }
    if(action==='notification-preferences') {
      const next=preferences(actor);
      for(const key of Object.keys(defaultPreferences))if(Object.hasOwn(data,key)) {
        if(typeof data[key]!=='boolean')fail();next[key]=data[key];
      }
      run('INSERT INTO social_notification_preferences VALUES(?,?) ON CONFLICT(user) DO UPDATE SET data=excluded.data',actor,JSON.stringify(next));
      return {ok:true,preferences:next};
    }
    if (action === 'profile') {
      const old = parse(one('SELECT data FROM social_profiles WHERE id=?',actor));
      const p = { ...old, handle:handles.ensure(actor), name: text(data.name,2,80), bio: text(data.bio ?? '',0,500), city: text(data.city || 'Астана',1,80), language: data.language === 'ru' ? 'ru':'kk', accent: /^#[0-9a-f]{6}$/i.test(data.accent) ? data.accent : '#393185' };
      for (const key of ['avatar','cover','wallpaper']) {
        const value = Object.hasOwn(data,key) ? data[key] : old[key];
        const m = mediaRef(value,actor,'profile');
        if (key === 'avatar' && m && !m.mime.startsWith('image/')) fail('IMAGE_REQUIRED');
        p[key] = m?.id || null;
        if (key !== 'avatar') p[key+'_kind'] = m?.mime.startsWith('video/') ? 'video':'image';
      }
      run('UPDATE social_profiles SET data=?,search=? WHERE id=?',JSON.stringify(p),profileSearch(p.name,p.handle),actor);
      return { ok:true };
    }
    if (action === 'follow' || action === 'block') {
      const target = text(data.target,1,80);
      if (target === actor || !one('SELECT id FROM social_profiles WHERE id=?',target)) fail('USER_NOT_FOUND',404);
      const table = action === 'follow' ? 'social_follows':'social_blocks';
      if (action === 'follow' && blocked(actor,target)) fail('USER_BLOCKED',403);
      const existed=one(`SELECT 1 FROM ${table} WHERE actor=? AND target=?`,actor,target);
      if (data.enabled === false) run(`DELETE FROM ${table} WHERE actor=? AND target=?`,actor,target);
      else run(`INSERT OR IGNORE INTO ${table} VALUES(?,?)`,actor,target);
      if (action === 'block') run('DELETE FROM social_follows WHERE (actor=? AND target=?) OR (actor=? AND target=?)',actor,target,target,actor);
      if(action==='follow'&&data.enabled!==false&&!existed)recordNotification({recipient:target,actor,type:'follow'});
      return {ok:true};
    }
    if (action === 'favorite') {
      if (!one('SELECT id FROM social_listings WHERE id=?',data.id)) fail('NOT_FOUND',404);
      if(data.enabled === false) run('DELETE FROM social_favorites WHERE actor=? AND target=?',actor,data.id);
      else run('INSERT OR IGNORE INTO social_favorites VALUES(?,?)',actor,data.id);
      return {ok:true};
    }
    if (action === 'listing') {
      const old = data.id ? parse(one('SELECT data FROM social_listings WHERE id=?',data.id)) : null;
      if (data.id && (!old || old.owner_id !== actor)) fail('FORBIDDEN',403);
      if (old && old.status !== 'open') fail('LISTING_CLOSED');
      if (!['swap','help','study','aid'].includes(data.module) || (old && old.module!==data.module)) fail();
      const m = data.metadata || {};
      if(typeof m!=='object'||Array.isArray(m)) fail();
      if (JSON.stringify(m).length > 3000) fail();
      if(m.date && (typeof m.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(m.date)||!Number.isFinite(Date.parse(m.date))||new Date(m.date).toISOString().slice(0,10)!==m.date))fail();
      if(data.module==='aid'&&(!Number.isInteger(m.needed)||m.needed<1||m.needed>100000))fail();
      if (m.reward !== undefined && (!Number.isSafeInteger(m.reward) || m.reward < 100 || m.reward > 10000000 || data.module !== 'help')) fail('INVALID_REWARD');
      if (data.module==='swap') text(m.exchange,1,500);
      if (data.module==='study') { text(m.address,1,300); text(m.hours,1,200); text(m.access,1,300); if(!Number.isFinite(m.lat)||!Number.isFinite(m.lng)||Math.abs(m.lat)>90||Math.abs(m.lng)>180) fail(); }
      const picture = mediaRef(data.image_path,actor,'listing');
      if(picture && !picture.mime.startsWith('image/')) fail('IMAGE_REQUIRED');
      const l = { id:old?.id || randomUUID(), owner_id:actor, module:data.module, title:text(data.title,5,120),description:description(data.description),
        city:text(data.city,1,80),district:text(data.district,1,80),category:text(data.category,1,100),metadata:m,image_path:picture?.id || null,
        status:old?.status || 'open',moderation:'approved',created_at:old?.created_at || now(),is_demo:false };
      run('INSERT INTO social_listings VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',l.id,actor,JSON.stringify(l),l.created_at);
      return {id:l.id};
    }
    if (action === 'close') {
      const l = parse(one('SELECT data FROM social_listings WHERE id=?',data.id));
      if(!l || l.owner_id!==actor) fail('FORBIDDEN',403);
      l.status='cancelled'; run('UPDATE social_listings SET data=? WHERE id=?',JSON.stringify(l),l.id); return {ok:true};
    }
    if (action === 'conversation') {
      let ids, listing=null, title='', kind;
      if(data.listing_id) {
        listing=parse(one('SELECT data FROM social_listings WHERE id=?',data.listing_id));
        if(!listing || listing.status!=='open' || listing.owner_id===actor) fail('LISTING_CLOSED');
        ids=[actor,listing.owner_id]; kind='listing';
      } else if(data.kind==='group') {
        if(!Array.isArray(data.members) || data.members.length<1 || data.members.length>49) fail();
        ids=[...new Set([actor,...data.members])]; title=text(data.title,2,80); kind='group';
      } else { ids=[actor,text(data.target,1,80)]; kind='direct'; }
      for(const id of ids) if(!one('SELECT id FROM social_profiles WHERE id=?',id) || (id!==actor && blocked(actor,id))) fail('USER_NOT_FOUND',404);
      if(new Set(ids).size<2) fail();
      const pair=kind==='group'?null:`${kind}:${listing?.id || ''}:${[...ids].sort().join(':')}`;
      const existing=pair && one('SELECT id FROM social_rooms WHERE pair=?',pair); if(existing) return {id:existing.id};
      limit(actor,'new-room',20,3600000);
      return transaction(()=>{
        const r={id:randomUUID(),kind,title,listing_id:listing?.id || '',owner_id:listing?.owner_id || actor,responder_id:actor,owner_confirmed:false,responder_confirmed:false,accepted:false,created_at:now()};
        run('INSERT INTO social_rooms VALUES(?,?,?)',r.id,pair,JSON.stringify(r)); for(const id of ids) run('INSERT INTO social_members VALUES(?,?)',r.id,id); return {id:r.id};
      });
    }
    if(action==='message') {
      const r=member(actor,data.conversation_id);
      for(const {user:id} of all('SELECT user FROM social_members WHERE room=?',r.id)) if(id!==actor && blocked(actor,id)) fail('USER_BLOCKED',403);
      const body=text(data.body || '',0,2000), m=mediaRef(data.media_id,actor,'chat',r.id);
      if(!body && !m) fail();
      const clientId=data.client_id;
      if(clientId!==undefined&&(typeof clientId!=='string'||!/^[A-Za-z0-9_-]{1,96}$/.test(clientId)))fail('INVALID_CLIENT_ID');
      const audioMeta={};
      if(Object.hasOwn(data,'waveform') || Object.hasOwn(data,'duration_ms')) {
        if(!m?.mime.startsWith('audio/')) fail('INVALID_AUDIO_METADATA');
        if(Object.hasOwn(data,'waveform')) {
          if(!Array.isArray(data.waveform) || data.waveform.length<1 || data.waveform.length>64 || data.waveform.some(value=>typeof value!=='number' || !Number.isFinite(value) || value<0 || value>1)) fail('INVALID_AUDIO_METADATA');
          audioMeta.waveform=[...data.waveform];
        }
        if(Object.hasOwn(data,'duration_ms')) {
          if(typeof data.duration_ms!=='number' || !Number.isFinite(data.duration_ms) || data.duration_ms<0 || data.duration_ms>60000) fail('INVALID_AUDIO_METADATA');
          audioMeta.duration_ms=data.duration_ms;
        }
      }
      if(clientId!==undefined) {
        const previous=one('SELECT message FROM social_message_clients WHERE sender=? AND client=?',actor,clientId);
        if(previous) {
          const message=messageView(previous.message);
          if(message.conversation_id!==r.id||message.body!==body||message.media_id!==(m?.id||null)||JSON.stringify(message.waveform??null)!==JSON.stringify(audioMeta.waveform??null)||(message.duration_ms??null)!==(audioMeta.duration_ms??null))fail('CLIENT_ID_CONFLICT',409);
          return {id:message.id,message,[quiet]:true};
        }
      }
      limit(actor,'message',40);
      const msg={id:randomUUID(),conversation_id:r.id,sender_id:actor,body,created_at:now(),media_id:m?.id || null,
        kind:m ? (m.mime.startsWith('image/')?'image':m.mime.startsWith('video/')?'video':'audio'):'text',...audioMeta,...(clientId!==undefined?{client_id:clientId}:{})};
      return transaction(()=>{
        run('INSERT INTO social_messages VALUES(?,?,?,?,?)',msg.id,r.id,actor,JSON.stringify(msg),msg.created_at);
        if(clientId!==undefined)run('INSERT INTO social_message_clients VALUES(?,?,?)',actor,clientId,msg.id);
        for(const {user:recipient}of all('SELECT user FROM social_members WHERE room=?',r.id))recordNotification({recipient,actor,type:'message',room:r.id,message:msg.id,details:{preview:body.slice(0,160),message_kind:msg.kind},dedupe:msg.id});
        return {id:msg.id,message:messageView(msg.id)};
      });
    }
    if(action==='read') return transaction(()=>{
      const room=member(actor,data.conversation_id);
      // The server's append order, rather than timestamps or UUIDs, defines the read boundary.
      // A boundary can only reference an existing message in this room and never moves back.
      const target=one('SELECT id,rowid AS message_order FROM social_messages WHERE id=? AND room=?',text(data.last_message_id,1,80),room.id);
      if(!target) fail('MESSAGE_NOT_FOUND',404);
      run(`INSERT INTO social_reads(room,user,last_message,message_order) VALUES(?,?,?,?)
        ON CONFLICT(room,user) DO UPDATE SET last_message=excluded.last_message,message_order=excluded.message_order
        WHERE excluded.message_order>social_reads.message_order`,room.id,actor,target.id,target.message_order);
      const seen=one('SELECT last_message,message_order FROM social_reads WHERE room=? AND user=?',room.id,actor);
      return {ok:true,conversation_id:room.id,last_message_id:seen.last_message,sequence:seen.message_order};
    });
    if(action==='transaction') return transaction(()=>{
      const r=member(actor,data.id), l=parse(one('SELECT data FROM social_listings WHERE id=?',r.listing_id));
      if(!l || r.kind!=='listing' || l.status==='cancelled') fail('LISTING_CLOSED');
      if(data.action==='accept') { if(actor!==r.owner_id || l.status!=='open') fail('FORBIDDEN',403); r.accepted=true; l.status='in_progress'; }
      else if(data.action==='confirm' && r.accepted) { r[actor===r.owner_id?'owner_confirmed':'responder_confirmed']=true; if(r.owner_confirmed && r.responder_confirmed) l.status='completed'; }
      else fail();
      run('UPDATE social_rooms SET data=? WHERE id=?',JSON.stringify(r),r.id); run('UPDATE social_listings SET data=? WHERE id=?',JSON.stringify(l),l.id); return {ok:true};
    });
    if(action==='report') { run('INSERT INTO social_reports VALUES(?,?,?,?,?)',randomUUID(),actor,text(data.id,1,80),text(data.reason,5,1000),now()); return {ok:true}; }
    fail('NOT_FOUND',404);
  }
  function mutate(user,action,data) {
    const result=mutateAction(user,action,data);
    if(result[quiet])return result;
    let recipients=[user.id];
    if(['message','read','conversation'].includes(action))recipients=all('SELECT user FROM social_members WHERE room=?',action==='conversation'?result.id:data.conversation_id).map(m=>m.user);
    else if(action==='follow')recipients.push(data.target);
    else if(['profile','listing','close','transaction','block'].includes(action))recipients.push(...listeners.keys());
    invalidate(recipients);
    return result;
  }
  async function upload(user, req, params) {
    ensure(user); const scope=params.get('scope'), room=params.get('conversation') || '';
    if(!['profile','listing','chat'].includes(scope)) fail();
    if(scope==='chat') member(user.id,room); else if(room) fail();
    const mime=String(req.headers['content-type'] || '').split(';')[0];
    if ((scope==='profile' && !/^(image|video)\//.test(mime)) || (scope==='listing' && !mime.startsWith('image/'))) fail('UNSUPPORTED_MEDIA',415);
    if(!['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','audio/mp4','audio/m4a','audio/webm','audio/mpeg'].includes(mime)) fail('UNSUPPORTED_MEDIA',415);
    limit(user.id,'upload',10);
    const max=20*1024*1024, id=randomUUID();
    if(one('SELECT coalesce(sum(size),0) n FROM social_media WHERE owner=?',user.id).n+max>200*1024*1024 || one('SELECT coalesce(sum(size),0) n FROM social_media').n+max>(media.maxBytes??2*1024*1024*1024)) fail('STORAGE_FULL',413);
    // Reserve capacity before awaiting the stream, including concurrent uploads.
    run('INSERT INTO social_media VALUES(?,?,?,?,?,?,?)',id,user.id,scope,room,mime,max,Date.now());
    try {
      const chunks=[]; let size=0;
      for await(const chunk of req) { size+=chunk.length; if(size>max) fail('MEDIA_TOO_LARGE',413); chunks.push(chunk); }
      const bytes=Buffer.concat(chunks);
      const valid=mime==='image/jpeg'?bytes.subarray(0,3).equals(Buffer.from([255,216,255])):mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/gif'?/^GIF8[79]a/.test(bytes.subarray(0,6).toString()):mime==='image/webp'?bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP':mime==='audio/webm'?bytes.subarray(0,4).toString('hex')==='1a45dfa3':mime==='audio/mpeg'?bytes.subarray(0,3).toString()==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224):bytes.subarray(4,8).toString()==='ftyp';
      if(!valid || size<12) fail('INVALID_MEDIA');
      await media.write(id,bytes);
      run('UPDATE social_media SET size=? WHERE id=?',size,id); return {id,kind:mime.startsWith('video/')?'video':mime.startsWith('audio/')?'audio':'image',url:mediaUrl(id)};
    } catch(e) { run('DELETE FROM social_media WHERE id=?',id); try{await media.remove(id);}catch{} throw e; }
  }
  async function serveMedia(id, params, req, res) {
    const expiry=params.get('expires'), sig=params.get('signature');
    if(!uuid(id)||!/^\d{13}$/.test(expiry||'')||Number(expiry)<Date.now()||Number(expiry)>Date.now()+3601000||! /^[a-f0-9]{64}$/.test(sig||'')||!timingSafeEqual(Buffer.from(sig,'hex'),Buffer.from(signature(id,expiry),'hex'))) fail('MEDIA_EXPIRED',403);
    const m=one('SELECT * FROM social_media WHERE id=?',id); if(!m) fail('NOT_FOUND',404);
    const bytes=await media.read(id); let start=0,end=bytes.length-1,status=200;
    const range=req.headers.range;
    if(range) { const match=/^bytes=(\d+)-(\d*)$/.exec(range); if(!match) fail('INVALID_RANGE',416); start=Number(match[1]); end=match[2]?Math.min(Number(match[2]),end):end; if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end) fail('INVALID_RANGE',416); status=206; res.setHeader('Content-Range',`bytes ${start}-${end}/${bytes.length}`); }
    res.writeHead(status,{'Content-Type':m.mime,'Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"});
    res.end(req.method==='HEAD'?undefined:bytes.subarray(start,end+1));
  }
  const identityChanged=userId=>invalidate([userId,...listeners.keys()]);
  return { snapshot, search, mutate, upload, serveMedia, notifications, notifyLogin, subscribe, identityChanged };
}
