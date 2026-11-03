import {createHash,createHmac,randomInt,randomUUID,timingSafeEqual} from 'node:crypto';
import {AuthError,normalizePhone} from '../whatsapp-bot/src/auth-core.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(code,status=400,retryAfter=0)=>{throw new AuthError(code,status,retryAfter);};
const validId=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value);

// Identity and OTP state stay in the existing cloud database. A transport only
// receives the one code being sent; it cannot create accounts or issue sessions.
export function createPhoneAuth({auth,credentials,sender,secret,now=Date.now,onPhoneChanged}) {
  if(typeof secret!=='string'||secret.length<32)throw new TypeError('Strong OTP secret required');
  const db=auth.db,one=(sql,...args)=>db.prepare(sql).get(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
  db.exec(`CREATE TABLE IF NOT EXISTS auth_phone_challenges(id TEXT PRIMARY KEY,phone TEXT NOT NULL,name TEXT NOT NULL,
    digest TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL,
    purpose TEXT NOT NULL,target_user TEXT NOT NULL,session_digest TEXT NOT NULL,credential_version TEXT NOT NULL,previous_phone TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS phone_challenge_phone ON auth_phone_challenges(phone,created);`);
  // A constructor restart cannot turn an interrupted, unconfirmed send into a login.
  run("UPDATE auth_phone_challenges SET state='failed' WHERE state='sending'");
  const digest=(id,code)=>createHmac('sha256',secret).update(id+':'+code).digest('hex');
  const userRow=id=>one('SELECT id,phone,name FROM users WHERE id=?',id);
  const phoneOwner=phone=>one('SELECT id,phone,name FROM users WHERE phone=?',phone);
  function changed(userId){try{Promise.resolve(onPhoneChanged?.(userId)).catch(()=>{});}catch{}}
  function available(phone,userId=''){
    const owner=phoneOwner(phone);if(owner&&owner.id!==userId)fail('PHONE_UNAVAILABLE',409);
    // Bare7... and8... are valid phone aliases and valid numeric usernames.
    // Reject new aliases that would resolve to another person's @handle first.
    const aliases=phone.startsWith('+7')&&phone.length===12?[phone.slice(1),'8'+phone.slice(2)]:[];
    for(const alias of aliases){
      const identity=one('SELECT user_id FROM auth_handles WHERE handle=?',alias);
      if(identity&&identity.user_id!==userId)fail('PHONE_UNAVAILABLE',409);
    }
  }
  function checkBinding(token,proof){
    const user=auth.me(token),row=userRow(user.id);
    if(user.id!==proof.target_user||hash(token)!==proof.session_digest||!row?.phone?.startsWith('id:')||row.phone!==proof.previous_phone||
      !proof.credential_version||credentials.bindingVersion(user.id)!==proof.credential_version)fail('REAUTH_REQUIRED',401);
    available(proof.phone,user.id);return user;
  }
  function reserve(phone,name,purpose,address,binding){
    const time=now();
    return auth.transaction(()=>{
      run('DELETE FROM auth_phone_challenges WHERE created<?',time-86400000);
      run('DELETE FROM requests WHERE created<?',time-86400000);
      const latest=one('SELECT created FROM auth_phone_challenges WHERE phone=? ORDER BY created DESC LIMIT 1',phone);
      if(latest&&time-latest.created<60000)fail('WAIT_BEFORE_RESEND',429,Math.ceil((60000-time+latest.created)/1000));
      const count=(sql,...args)=>one(sql,...args).n;
      const addressHash=hash(String(address).slice(0,100));
      if(count('SELECT count(*) n FROM auth_phone_challenges WHERE phone=? AND created>?',phone,time-3600000)>=3||
        count('SELECT count(*) n FROM auth_phone_challenges WHERE phone=?',phone)>=10||
        count('SELECT count(*) n FROM requests WHERE address=? AND created>?',addressHash,time-3600000)>=10||
        count('SELECT count(*) n FROM requests WHERE created>?',time-3600000)>=20||count('SELECT count(*) n FROM requests')>=100)fail('SEND_LIMIT',429,3600);
      const id=randomUUID(),code=String(randomInt(0,1000000)).padStart(6,'0'),expires=time+300000;
      const target=binding?.target_user||phoneOwner(phone)?.id||'';
      run('INSERT INTO auth_phone_challenges(id,phone,name,digest,created,expires,state,purpose,target_user,session_digest,credential_version,previous_phone) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
        id,phone,name,digest(id,code),time,expires,'sending',purpose,target,binding?.session_digest||'',binding?.credential_version||'',binding?.previous_phone||'');
      run('INSERT INTO requests VALUES(?,?,?)',id,addressHash,time);
      return {id,code,expires};
    });
  }
  async function send(data,address,token){
    if(!sender?.ready())fail('OTP_UNAVAILABLE',503);
    const phone=normalizePhone(data.phone),language=data.language===undefined?'kk':data.language;
    if(!['kk','ru'].includes(language))fail('INVALID_INPUT');
    const purpose=token?'bind':'login';let binding;
    let name=phoneOwner(phone)?.name||'Birge';
    if(data.name!==undefined){if(typeof data.name!=='string'||data.name.trim().length<2||data.name.trim().length>80)fail('INVALID_NAME');name=data.name.trim();}
    if(token){
      const user=auth.me(token),row=userRow(user.id);
      if(!row?.phone?.startsWith('id:'))fail('PHONE_ALREADY_BOUND',409);
      available(phone,user.id);
      const proof=await credentials.authorizePhoneBinding(token,data,address);
      binding={target_user:proof.userId,session_digest:hash(token),credential_version:proof.credentialVersion,previous_phone:row.phone,phone};
      checkBinding(token,binding);name=row.name;
    }else available(phone,phoneOwner(phone)?.id);
    const challenge=reserve(phone,name,purpose,address,binding);
    try{
      await sender.send(phone,'',{challengeId:challenge.id,code:challenge.code,expiresAt:challenge.expires,language,purpose});
      if(now()>=challenge.expires)fail('DELIVERY_FAILED',503);
      if(token)checkBinding(token,binding);
      auth.transaction(()=>{
        const current=one('SELECT state FROM auth_phone_challenges WHERE id=?',challenge.id);
        const latest=one('SELECT id FROM auth_phone_challenges WHERE phone=? ORDER BY created DESC,rowid DESC LIMIT 1',phone);
        if(current?.state!=='sending'||latest?.id!==challenge.id)fail('DELIVERY_FAILED',503);
        run("UPDATE auth_phone_challenges SET state='replaced' WHERE phone=? AND state='sent'",phone);
        run("UPDATE auth_phone_challenges SET state='sent' WHERE id=?",challenge.id);
      });
      return {challengeId:challenge.id,expiresAt:challenge.expires,resendAfter:60,delivery:'accepted',channel:'whatsapp'};
    }catch{
      run("UPDATE auth_phone_challenges SET state='failed' WHERE id=? AND state='sending'",challenge.id);
      fail('DELIVERY_FAILED',503);
    }
  }
  function challenge(data,purpose,token){
    if(!validId(data.challengeId)||typeof data.code!=='string'||!/^\d{6}$/.test(data.code))fail('INVALID_CODE');
    const row=one('SELECT * FROM auth_phone_challenges WHERE id=?',data.challengeId);
    if(!row||row.purpose!==purpose||row.state!=='sent'||row.expires<=now()||row.attempts>=5)fail('CODE_EXPIRED');
    if(purpose==='bind')checkBinding(token,row);
    run('UPDATE auth_phone_challenges SET attempts=attempts+1 WHERE id=?',row.id);
    if(!timingSafeEqual(Buffer.from(row.digest,'hex'),Buffer.from(digest(row.id,data.code),'hex')))fail('INVALID_CODE');
    return row;
  }
  function consume(row){
    if(run("UPDATE auth_phone_challenges SET state='used' WHERE id=? AND state='sent' AND expires>?",row.id,now()).changes!==1)fail('CODE_EXPIRED');
  }
  return {
    health:()=>({enabled:sender?.enabled===true,channel:'whatsapp',ready:!!sender?.ready()}),
    send:(data,address='unknown')=>send(data,address),
    sendBinding:(token,data,address='unknown')=>{auth.me(token);return send(data,address,token);},
    verify(data,device={}){
      if(!sender?.ready())fail('OTP_UNAVAILABLE',503);
      const row=challenge(data,'login');
      return auth.transaction(()=>{
        const owner=phoneOwner(row.phone);
        if((owner?.id||'')!==row.target_user)fail('CODE_EXPIRED');
        available(row.phone,owner?.id);
        consume(row);
        let id=owner?.id;
        if(!id){id=randomUUID();run('INSERT INTO users VALUES(?,?,?,?)',id,row.phone,row.name,now());}
        return auth.issueSession(id,'otp',device);
      });
    },
    verifyBinding(token,data){
      auth.me(token);if(!sender?.ready())fail('OTP_UNAVAILABLE',503);const row=challenge(data,'bind',token);
      const result=auth.transaction(()=>{
        const user=checkBinding(token,row);consume(row);
        if(run('UPDATE users SET phone=? WHERE id=? AND phone=?',row.phone,user.id,row.previous_phone).changes!==1)fail('REAUTH_REQUIRED',401);
        return {ok:true,user:auth.me(token)};
      });
      changed(result.user.id);return result;
    },
  };
}
