import {createHash,createHmac,randomBytes,randomInt,randomUUID,timingSafeEqual} from 'node:crypto';
import {AuthError,normalizePhone} from '../whatsapp-bot/src/auth-core.mjs';
import {telegramFaqReply} from './telegram-faq.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(code,status=400,retryAfter=0)=>{throw new AuthError(code,status,retryAfter);};
const validId=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value);
const humanId=value=>Number.isSafeInteger(value)&&value>0;
export const TELEGRAM_WEBHOOK_PATH='/auth/telegram/webhook';
export function telegramWebhookAuthorized(request,env={}){
  const expected=env.TELEGRAM_WEBHOOK_SECRET,supplied=request.headers.get('x-telegram-bot-api-secret-token');
  return env.TELEGRAM_OTP_ENABLED==='1'&&typeof expected==='string'&&/^[A-Za-z0-9_-]{32,256}$/.test(expected)&&
    typeof supplied==='string'&&supplied.length<=256&&timingSafeEqual(Buffer.from(hash(expected),'hex'),Buffer.from(hash(supplied),'hex'));
}

// Telegram's authenticated own-contact object proves the requested number.
// A chat ID, typed telephone number, username or shared third-party contact does not.
export function createTelegramAuth({auth,credentials,sender,secret,now=Date.now,onPhoneChanged}){
  if(typeof secret!=='string'||secret.length<32)throw new TypeError('Strong OTP secret required');
  const db=auth.db,one=(sql,...args)=>db.prepare(sql).get(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
  db.exec(`CREATE TABLE IF NOT EXISTS auth_telegram_challenges(id TEXT PRIMARY KEY,phone TEXT NOT NULL,name TEXT NOT NULL,
    ticket_digest TEXT NOT NULL UNIQUE,digest TEXT NOT NULL DEFAULT '',created INTEGER NOT NULL,expires INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL,purpose TEXT NOT NULL,target_user TEXT NOT NULL,
    session_digest TEXT NOT NULL,credential_version TEXT NOT NULL,previous_phone TEXT NOT NULL,language TEXT NOT NULL,
    telegram_user INTEGER,prompt_pending INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS telegram_challenge_phone ON auth_telegram_challenges(phone,created);
    CREATE INDEX IF NOT EXISTS telegram_challenge_user ON auth_telegram_challenges(telegram_user,state);
    CREATE TABLE IF NOT EXISTS auth_telegram_updates(update_id INTEGER PRIMARY KEY,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_telegram_help(chat_id INTEGER PRIMARY KEY,created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS telegram_help_created ON auth_telegram_help(created);
    CREATE TABLE IF NOT EXISTS auth_telegram_replies(chat_id INTEGER NOT NULL,topic TEXT NOT NULL,created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS telegram_replies_created ON auth_telegram_replies(created);
    CREATE INDEX IF NOT EXISTS telegram_replies_chat ON auth_telegram_replies(chat_id,created);`);
  // Unknown delivery outcomes fail closed across DO evictions/restarts.
  run("UPDATE auth_telegram_challenges SET state='failed',prompt_pending=0 WHERE state='sending' OR prompt_pending=1");
  const digest=(id,code)=>createHmac('sha256',secret).update('telegram:'+id+':'+code).digest('hex');
  const userRow=id=>one('SELECT id,phone,name FROM users WHERE id=?',id);
  const phoneOwner=phone=>one('SELECT id,phone,name FROM users WHERE phone=?',phone);
  const ready=()=>!!sender?.ready();
  function cleanup(){
    const time=now();
    run('DELETE FROM auth_telegram_challenges WHERE created<?',time-86400000);
    run('DELETE FROM auth_telegram_updates WHERE created<?',time-86400000);
    run('DELETE FROM auth_telegram_help WHERE created<=?',time-60000);
    run('DELETE FROM auth_telegram_replies WHERE created<=?',time-60000);
    run('DELETE FROM requests WHERE created<?',time-86400000);
  }
  function available(phone,userId=''){
    const owner=phoneOwner(phone);if(owner&&owner.id!==userId)fail('PHONE_UNAVAILABLE',409);
    const aliases=phone.startsWith('+7')&&phone.length===12?[phone.slice(1),'8'+phone.slice(2)]:[];
    for(const alias of aliases){const owner=one('SELECT user_id FROM auth_handles WHERE handle=?',alias);if(owner&&owner.user_id!==userId)fail('PHONE_UNAVAILABLE',409);}
  }
  function checkProof(row,token){
    if(row.purpose==='login'){
      const owner=phoneOwner(row.phone);if((owner?.id||'')!==row.target_user)fail('CODE_EXPIRED');
      available(row.phone,owner?.id);return owner;
    }
    const session=one('SELECT s.user_id,u.phone FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.digest=? AND s.expires>?',row.session_digest,now());
    if(!session||session.user_id!==row.target_user||!session.phone.startsWith('id:')||session.phone!==row.previous_phone||
      !row.credential_version||credentials.bindingVersion(row.target_user)!==row.credential_version||
      token!==undefined&&hash(token)!==row.session_digest)fail('REAUTH_REQUIRED',401);
    available(row.phone,row.target_user);return userRow(row.target_user);
  }
  function current(id,state){
    const row=one('SELECT * FROM auth_telegram_challenges WHERE id=?',id);
    if(!row||row.expires<=now()||!state.includes(row.state))return;
    checkProof(row);return row;
  }
  async function send(data,address,token){
    if(!ready())fail('TELEGRAM_UNAVAILABLE',503);
    const phone=normalizePhone(data.phone),language=data.language??'kk';
    if(!['kk','ru'].includes(language))fail('INVALID_INPUT');
    let name=phoneOwner(phone)?.name||'Birge',proof;
    if(data.name!==undefined){if(typeof data.name!=='string'||data.name.trim().length<2||data.name.trim().length>80)fail('INVALID_NAME');name=data.name.trim();}
    if(token){
      const user=auth.me(token),row=userRow(user.id);if(!row.phone.startsWith('id:'))fail('PHONE_ALREADY_BOUND',409);
      available(phone,user.id);const stepped=await credentials.authorizePhoneBinding(token,data,address);
      proof={purpose:'bind',phone,target_user:stepped.userId,session_digest:hash(token),credential_version:stepped.credentialVersion,previous_phone:row.phone};
      checkProof(proof,token);name=row.name;
    }else available(phone,phoneOwner(phone)?.id);
    const time=now(),ticket=randomBytes(32).toString('base64url'),id=randomUUID(),expires=time+300000;
    auth.transaction(()=>{
      cleanup();const latest=one('SELECT created FROM auth_telegram_challenges WHERE phone=? ORDER BY created DESC,rowid DESC LIMIT 1',phone);
      if(latest&&time-latest.created<60000)fail('WAIT_BEFORE_RESEND',429,Math.ceil((60000-time+latest.created)/1000));
      const count=(sql,...args)=>one(sql,...args).n,addressHash=hash(String(address).slice(0,100));
      if(count('SELECT count(*) n FROM auth_telegram_challenges WHERE phone=? AND created>?',phone,time-3600000)>=3||
        count('SELECT count(*) n FROM auth_telegram_challenges WHERE phone=?',phone)>=10||
        count('SELECT count(*) n FROM requests WHERE address=? AND created>?',addressHash,time-3600000)>=10||
        count('SELECT count(*) n FROM requests WHERE created>?',time-3600000)>=20||count('SELECT count(*) n FROM requests')>=100)fail('SEND_LIMIT',429,3600);
      if(proof)checkProof(proof,token);else available(phone,phoneOwner(phone)?.id);
      run("UPDATE auth_telegram_challenges SET state='replaced',prompt_pending=0 WHERE phone=? AND state IN('waiting','awaiting_contact','sending','sent')",phone);
      run('INSERT INTO auth_telegram_challenges(id,phone,name,ticket_digest,created,expires,state,purpose,target_user,session_digest,credential_version,previous_phone,language) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
        id,phone,name,hash(ticket),time,expires,'waiting',proof?'bind':'login',proof?.target_user||phoneOwner(phone)?.id||'',proof?.session_digest||'',proof?.credential_version||'',proof?.previous_phone||'',language);
      run('INSERT INTO requests VALUES(?,?,?)',id,addressHash,time);
    });
    return {challengeId:id,expiresAt:expires,resendAfter:60,channel:'telegram',delivery:'pending',botUrl:`https://t.me/${sender.botUsername}?start=t_${ticket}`};
  }
  function recordUpdate(update){
    if(!update||!Number.isSafeInteger(update.update_id)||update.update_id<0)return false;
    return auth.transaction(()=>{
      cleanup();if(one('SELECT 1 FROM auth_telegram_updates WHERE update_id=?',update.update_id))return false;
      run('INSERT INTO auth_telegram_updates VALUES(?,?)',update.update_id,now());
      run('DELETE FROM auth_telegram_updates WHERE update_id NOT IN(SELECT update_id FROM auth_telegram_updates ORDER BY created DESC,rowid DESC LIMIT 2000)');return true;
    });
  }
  function preserveContactKeyboard(chatId){
    const row=one("SELECT * FROM auth_telegram_challenges WHERE telegram_user=? AND state='awaiting_contact' AND expires>? ORDER BY created DESC,rowid DESC LIMIT 1",chatId,now());
    try{return !!(row&&current(row.id,['awaiting_contact']));}catch{return false;}
  }
  function reserveReply(chatId,topic){
    // Separate from OTP requests: ordinary questions cannot consume code quotas.
    const time=now(),last=one('SELECT created FROM auth_telegram_replies WHERE chat_id=? ORDER BY created DESC,rowid DESC LIMIT 1',chatId);
    if(last&&time-last.created<1000)return false;
    if(one('SELECT 1 FROM auth_telegram_replies WHERE chat_id=? AND topic=? AND created>?',chatId,topic,time-10000))return false;
    if(one('SELECT count(*) n FROM auth_telegram_replies WHERE chat_id=?',chatId).n>=12||one('SELECT count(*) n FROM auth_telegram_replies').n>=100)return false;
    run('INSERT INTO auth_telegram_replies VALUES(?,?,?)',chatId,topic,time);return true;
  }
  async function help(chatId,language){
    const reserved=auth.transaction(()=>{
      cleanup();
      if(one('SELECT 1 FROM auth_telegram_help WHERE chat_id=?',chatId))return false;
      // Do not evict a recent chat and accidentally permit another send in its minute.
      if(one('SELECT count(*) n FROM auth_telegram_help').n>=2000)return false;
      if(!reserveReply(chatId,'welcome'))return false;
      run('INSERT INTO auth_telegram_help VALUES(?,?)',chatId,now());return true;
    });
    if(reserved)try{await sender.sendHelp(chatId,language,{preserveKeyboard:preserveContactKeyboard(chatId)});}catch{}
    return {ok:true};
  }
  async function answer(chatId,language,text){
    const reply=telegramFaqReply(text,language);if(!reply)return {ok:true};
    const reserved=auth.transaction(()=>{cleanup();return reserveReply(chatId,reply.topic);});
    // Reserve before awaiting and never retry an ambiguous provider outcome.
    if(reserved)try{await sender.sendAnswer(chatId,language,reply,{preserveKeyboard:preserveContactKeyboard(chatId)});}catch{}
    return {ok:true};
  }
  function webhookCurrent(row,states){
    if(!row)return;
    try{return current(row.id,states);}catch{
      run("UPDATE auth_telegram_challenges SET state='failed',prompt_pending=0 WHERE id=? AND state IN('waiting','awaiting_contact','sending')",row.id);
    }
  }
  async function webhook(update){
    if(!ready())return {ok:true};
    if(!recordUpdate(update))return {ok:true};
    const message=update.message,from=message?.from,chat=message?.chat;
    if(!message||chat?.type!=='private'||!humanId(chat.id)||!humanId(from?.id)||from.is_bot!==false||from.id!==chat.id)return {ok:true};
    const language=typeof from.language_code==='string'&&/^ru(?:[-_]|$)/i.test(from.language_code)?'ru':'kk';
    const commandTarget=typeof message.text==='string'?/^\/\w+@([A-Za-z0-9_]+)(?:\s|$)/.exec(message.text):null;
    if(commandTarget&&commandTarget[1].toLowerCase()!==String(sender.botUsername).toLowerCase())return {ok:true};
    let active;
    const start=typeof message.text==='string'?/^\/start(?:@[A-Za-z0-9_]{5,32})? t_([A-Za-z0-9_-]{43})$/.exec(message.text):null;
    try{
      if(start){
        active=one('SELECT * FROM auth_telegram_challenges WHERE ticket_digest=?',hash(start[1]));
        if(!webhookCurrent(active,['waiting']))return help(chat.id,language);
        auth.transaction(()=>{
          if(!current(active.id,['waiting']))fail('CODE_EXPIRED');
          run("UPDATE auth_telegram_challenges SET state='replaced',prompt_pending=0 WHERE telegram_user=? AND id<>? AND state IN('awaiting_contact','sending','sent')",from.id,active.id);
          run("UPDATE auth_telegram_challenges SET state='awaiting_contact',telegram_user=?,prompt_pending=1 WHERE id=? AND state='waiting'",from.id,active.id);
        });
        await sender.sendPrompt(chat.id,active.language);
        run("UPDATE auth_telegram_challenges SET prompt_pending=0 WHERE id=? AND state='awaiting_contact'",active.id);
        return {ok:true};
      }
      if(typeof message.text==='string'&&/^\/start(?:@[A-Za-z0-9_]{5,32})?(?:\s|$)/.test(message.text))return help(chat.id,language);
      if(!message.contact)return typeof message.text==='string'?answer(chat.id,language,message.text):{ok:true};
      active=one("SELECT * FROM auth_telegram_challenges WHERE telegram_user=? AND state='awaiting_contact' ORDER BY created DESC,rowid DESC LIMIT 1",from.id);
      if(!webhookCurrent(active,['awaiting_contact']))return help(chat.id,language);
      let contactPhone;
      try{const raw=message.contact.phone_number;contactPhone=normalizePhone(typeof raw==='string'&&/^\d{8,15}$/.test(raw)?'+'+raw:raw);}catch{return {ok:true};}
      if(message.contact.user_id!==from.id||contactPhone!==active.phone)return {ok:true};
      const code=String(randomInt(0,1000000)).padStart(6,'0');
      auth.transaction(()=>{
        if(!current(active.id,['awaiting_contact']))fail('CODE_EXPIRED');
        run("UPDATE auth_telegram_challenges SET state='sending',digest=?,prompt_pending=0 WHERE id=? AND state='awaiting_contact'",digest(active.id,code),active.id);
      });
      await sender.sendCode(chat.id,code,active.expires,active.language);
      auth.transaction(()=>{
        if(!current(active.id,['sending']))fail('CODE_EXPIRED');
        run("UPDATE auth_telegram_challenges SET state='sent' WHERE id=? AND state='sending'",active.id);
      });
    }catch{
      if(active)run("UPDATE auth_telegram_challenges SET state='failed',prompt_pending=0 WHERE id=? AND state IN('waiting','awaiting_contact','sending')",active.id);
      // A duplicate Telegram retry must never repeat an unknown send outcome.
    }
    return {ok:true};
  }
  function challenge(data,purpose,token){
    if(!ready())fail('TELEGRAM_UNAVAILABLE',503);
    if(!validId(data.challengeId)||typeof data.code!=='string'||!/^\d{6}$/.test(data.code))fail('INVALID_CODE');
    const row=one('SELECT * FROM auth_telegram_challenges WHERE id=?',data.challengeId);
    if(!row||row.purpose!==purpose||row.expires<=now()||row.attempts>=5||['failed','used','replaced'].includes(row.state))fail('CODE_EXPIRED');
    checkProof(row,token);
    if(row.state!=='sent')fail('DELIVERY_PENDING',409);
    run('UPDATE auth_telegram_challenges SET attempts=attempts+1 WHERE id=?',row.id);
    if(!timingSafeEqual(Buffer.from(row.digest,'hex'),Buffer.from(digest(row.id,data.code),'hex')))fail('INVALID_CODE');return row;
  }
  function consume(row){if(run("UPDATE auth_telegram_challenges SET state='used' WHERE id=? AND state='sent' AND expires>?",row.id,now()).changes!==1)fail('CODE_EXPIRED');}
  return {
    health:()=>({enabled:sender?.enabled===true,ready:ready(),channel:'telegram',botUsername:ready()?sender.botUsername:''}),
    send:(data,address='unknown')=>send(data,address),
    sendBinding:(token,data,address='unknown')=>{auth.me(token);return send(data,address,token);},
    webhook,
    verify(data,device={}){
      const row=challenge(data,'login');
      return auth.transaction(()=>{
        const owner=checkProof(row);consume(row);let id=owner?.id;
        if(!id){id=randomUUID();run('INSERT INTO users VALUES(?,?,?,?)',id,row.phone,row.name,now());}
        return auth.issueSession(id,'telegram',device);
      });
    },
    verifyBinding(token,data){
      auth.me(token);const row=challenge(data,'bind',token);
      const result=auth.transaction(()=>{
        const user=checkProof(row,token);consume(row);
        if(run('UPDATE users SET phone=? WHERE id=? AND phone=?',row.phone,user.id,row.previous_phone).changes!==1)fail('REAUTH_REQUIRED',401);
        return {ok:true,user:auth.me(token)};
      });
      try{Promise.resolve(onPhoneChanged?.(result.user.id)).catch(()=>{});}catch{}return result;
    },
  };
}
