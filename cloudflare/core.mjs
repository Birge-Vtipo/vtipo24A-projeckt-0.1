import { createPrivateKey } from 'node:crypto';
import { AuthError, createAuthCore } from '../whatsapp-bot/src/auth-core.mjs';
import { createSocial } from '../whatsapp-bot/src/social.mjs';
import { signConnection, connectionDeepLink, connectionPage } from '../whatsapp-bot/src/connection.mjs';
import { createSqlDatabase } from './sql-db.mjs';
import { createSqlMediaStorage } from './media-store.mjs';
import { createCloudAuth } from './auth.mjs';
import { createMigration } from './migration.mjs';
import { createPasswords } from '../whatsapp-bot/src/passwords.mjs';
import { requestCors } from './cors.mjs';
import { createWhatsAppOtpSender } from './otp-delivery.mjs';
import { createPhoneAuth } from './phone-auth.mjs';
import { createTelegramSender } from './telegram-delivery.mjs';
import { createTelegramAuth,telegramWebhookAuthorized,TELEGRAM_WEBHOOK_PATH } from './telegram-auth.mjs';

export const allowedPath=path=>/^\/download\/Birge-\d+\.\d+\.\d+\.apk$/.test(path)||/^\/media\/[a-f0-9-]{36}$/.test(path)||['/health','/connect','/auth/guest','/auth/register','/auth/login','/auth/recover','/auth/credentials','/auth/me','/auth/profile','/auth/logout','/auth/password-login','/auth/password','/auth/sessions','/auth/sessions/revoke','/auth/sessions/revoke-others','/auth/send','/auth/verify','/auth/phone/send','/auth/phone/verify','/auth/telegram/send','/auth/telegram/verify','/auth/telegram/phone/send','/auth/telegram/phone/verify',TELEGRAM_WEBHOOK_PATH].includes(path)||/^\/social\/(snapshot|users|profile|follow|block|favorite|listing|close|conversation|message|transaction|report|upload|read|events|notifications|notifications-read|notification-preferences)$/.test(path);
const json=(status,value,extra={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
const asNodeRequest=request=>({method:request.method,headers:Object.fromEntries(request.headers),async *[Symbol.asyncIterator](){if(request.body)for await(const chunk of request.body)yield Buffer.from(chunk);}});
async function readJson(request,max=8192){
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new AuthError('JSON_REQUIRED',415);
  const chunks=[];let size=0;if(request.body)for await(const chunk of request.body){size+=chunk.length;if(size>max)throw new AuthError('BODY_TOO_LARGE',413);chunks.push(chunk);}
  try{const data=JSON.parse(Buffer.concat(chunks).toString());if(!data||typeof data!=='object'||Array.isArray(data))throw new Error();return data;}catch{throw new AuthError('INVALID_JSON');}
}
async function nodeResponse(run){let status=200,body;const headers=new Headers();const res={setHeader(name,value){headers.set(name,String(value));},writeHead(code,values){status=code;for(const [name,value]of Object.entries(values||{}))headers.set(name,String(value));},end(value){body=value;}};await run(res);return new Response(body,{status,headers});}

export class BirgeCore {
  constructor(ctx,env){
    this.ctx=ctx;this.env=env;this.cryptoBusy=false;this.uploadBusy=false;
    this.ready=ctx.blockConcurrencyWhile(async()=>{
      this.db=createSqlDatabase(ctx.storage);let social;
      this.auth=createAuthCore({db:this.db,secret:env.OTP_SECRET,onLogin:event=>social?.notifyLogin(event.user,{session_id:event.session_id,device_label:event.device_label})});
      createPasswords(this.auth); // Preserve the imported legacy password-attempt schema.
      this.credentials=createCloudAuth(this.auth,{onHandleChanged:id=>social?.identityChanged(id)});
      this.media=createSqlMediaStorage({db:this.db});
      social=this.social=createSocial({db:this.db,secret:env.OTP_SECRET,mediaStorage:this.media});
      this.phoneAuth=createPhoneAuth({auth:this.auth,credentials:this.credentials,sender:createWhatsAppOtpSender(env),secret:env.OTP_SECRET,onPhoneChanged:id=>social.identityChanged(id)});
      this.telegramAuth=createTelegramAuth({auth:this.auth,credentials:this.credentials,sender:createTelegramSender(env),secret:env.OTP_SECRET,onPhoneChanged:id=>social.identityChanged(id)});
      this.migration=createMigration(this.db,this.media,env);
      this.key=createPrivateKey(env.CONNECTION_PRIVATE_KEY);
    });
  }
  async crypto(run){if(this.cryptoBusy)throw new AuthError('SLOW_DOWN',429,2);this.cryptoBusy=true;try{return await run();}finally{this.cryptoBusy=false;}}
  async poll(request,url,token,user){
    const after=url.searchParams.get('after');if(after!==null&&!/^\d{1,16}$/.test(after))throw new AuthError('INVALID_INPUT');
    let settled=false,started=false,initial,heartbeat,timeout,unsubscribe=()=>{};
    return new Promise((resolve,reject)=>{
      const cleanup=()=>{clearInterval(heartbeat);clearTimeout(timeout);unsubscribe();request.signal.removeEventListener('abort',cancel);};
      const finish=event=>{if(settled)return;settled=true;cleanup();try{this.auth.me(token);resolve(json(200,event));}catch(error){resolve(this.error(error));}};
      const cancel=()=>{if(settled)return;settled=true;cleanup();resolve(new Response(null,{status:499}));};
      try{unsubscribe=this.social.subscribe(user,event=>{if(started)finish(event);else initial=event;},{afterId:after===null?undefined:Number(after)});}catch(error){reject(error);return;}
      started=true;if(initial){finish(initial);return;}
      request.signal.addEventListener('abort',cancel,{once:true});
      heartbeat=setInterval(()=>{try{this.auth.me(token);}catch(error){if(settled)return;settled=true;cleanup();resolve(this.error(error));}},15000);
      timeout=setTimeout(()=>finish({id:Number(after||0),type:'heartbeat'}),55000);
      if(request.signal.aborted)cancel();
    });
  }
  error(error){const known=error instanceof AuthError;return json(known?error.status:500,{error:known?error.code:'SERVER_ERROR',...(known&&error.retryAfter?{retryAfter:error.retryAfter}:{})},known&&error.retryAfter?{'Retry-After':String(error.retryAfter)}:{});}
  async handle(request,url){
    const path=url.pathname,method=request.method,token=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
    if(path.startsWith('/__migration/')||path.startsWith('/__release/'))return this.migration.handle(request,url);
    if(method==='GET'&&path==='/health'){
      const otp=this.phoneAuth.health(),telegram=this.telegramAuth?.health()||{enabled:false,ready:false,channel:'telegram',botUsername:''};
      return json(200,{service:'birge-whatsapp-auth',ready:this.migration.ready(),authMode:'credentials',authMethods:['credentials',...(otp.enabled?['phone']:[]),...(telegram.enabled?['telegram']:[])],guest:{enabled:true},otp,telegram,telegramFaq:{enabled:telegram.ready,languages:['kk','ru']},hosting:this.env.BIRGE_LOCAL_WEB==='1'?'local':'cloudflare',version:'2.5.0'});
    }
    if(!this.migration.ready())throw new AuthError('SERVER_MIGRATING',503);
    if(path===TELEGRAM_WEBHOOK_PATH){
      if(method!=='POST'||!telegramWebhookAuthorized(request,this.env))throw new AuthError('NOT_FOUND',404);
      return json(200,await this.telegramAuth.webhook(await readJson(request,32768)));
    }
    if(['GET','HEAD'].includes(method)&&path.startsWith('/download/'))return this.migration.download(request,url);
    if(method==='GET'&&path==='/connect'){
      const proof=signConnection(this.env.PUBLIC_ORIGIN,this.key);
      return new Response(connectionPage(connectionDeepLink(proof)),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"}});
    }
    if(['GET','HEAD'].includes(method)&&path.startsWith('/media/'))return nodeResponse(res=>this.social.serveMedia(path.slice(7),url.searchParams,asNodeRequest(request),res));
    if(path.startsWith('/social/')){
      const user=this.auth.me(token);
      if(method==='GET'&&path==='/social/events')return this.poll(request,url,token,user);
      if(method==='GET'&&path==='/social/snapshot')return json(200,this.social.snapshot(user));
      if(method==='GET'&&path==='/social/users')return json(200,{users:this.social.search(user,url.searchParams.get('q'))});
      if(method==='GET'&&path==='/social/notifications')return json(200,this.social.notifications(user,{limit:Number(url.searchParams.get('limit')||50)}));
      if(method==='POST'&&path==='/social/upload'){
        if(this.uploadBusy)throw new AuthError('SLOW_DOWN',429,2);this.uploadBusy=true;
        try{return json(201,await this.social.upload(user,asNodeRequest(request),url.searchParams));}finally{this.uploadBusy=false;}
      }
      if(method==='POST')return json(200,this.social.mutate(user,path.slice(8),await readJson(request,32768)));
      throw new AuthError('NOT_FOUND',404);
    }
    if(method==='GET'&&path==='/auth/me')return json(200,{user:this.auth.me(token)});
    if(method==='GET'&&path==='/auth/sessions')return json(200,this.auth.listSessions(token));
    if(method!=='POST')throw new AuthError('NOT_FOUND',404);
    const data=await readJson(request);
    data.device={...(data.device&&typeof data.device==='object'&&!Array.isArray(data.device)?data.device:{}),userAgent:(request.headers.get('user-agent')||'').slice(0,256)};
    // Only Cloudflare sets this header; the public Worker removes any supplied copy.
    const address=request.headers.get('x-birge-edge-ip')||'unknown';
    if(path==='/auth/guest')return json(201,this.credentials.guest(data,address));
    if(path==='/auth/telegram/send')return json(200,await this.telegramAuth.send(data,address));
    if(path==='/auth/telegram/verify')return json(200,this.telegramAuth.verify(data,data.device));
    if(path==='/auth/telegram/phone/send')return json(200,await this.crypto(()=>this.telegramAuth.sendBinding(token,data,address)));
    if(path==='/auth/telegram/phone/verify')return json(200,this.telegramAuth.verifyBinding(token,data));
    if(path==='/auth/send')return json(200,await this.phoneAuth.send(data,address));
    if(path==='/auth/verify')return json(200,this.phoneAuth.verify(data,data.device));
    if(path==='/auth/phone/send')return json(200,await this.crypto(()=>this.phoneAuth.sendBinding(token,data,address)));
    if(path==='/auth/phone/verify')return json(200,this.phoneAuth.verifyBinding(token,data));
    if(path==='/auth/register')return json(201,await this.crypto(()=>this.credentials.register(data,address)));
    if(path==='/auth/login'||path==='/auth/password-login')return json(200,await this.crypto(()=>this.credentials.login({...data,login:data.login??data.phone},address)));
    if(path==='/auth/recover')return json(200,await this.crypto(()=>this.credentials.recover(data,address)));
    if(path==='/auth/credentials'||path==='/auth/password')return json(200,await this.crypto(()=>this.credentials.setCredentials(token,data,address)));
    if(path==='/auth/sessions/revoke')return json(200,this.auth.revokeSession(token,data.id));
    if(path==='/auth/sessions/revoke-others')return json(200,this.auth.revokeOtherSessions(token));
    if(path==='/auth/profile')return json(200,{user:this.auth.updateName(token,data.name)});
    if(path==='/auth/logout'){this.auth.logout(token);return json(200,{ok:true});}
    throw new AuthError('NOT_FOUND',404);
  }
  async fetch(request){
    const url=new URL(request.url),cors=requestCors(request,this.env);
    try{
      if(!cors.accepted)throw new AuthError('ORIGIN_NOT_ALLOWED',403);
      if(url.pathname===TELEGRAM_WEBHOOK_PATH&&(request.method!=='POST'||!telegramWebhookAuthorized(request,this.env)))throw new AuthError('NOT_FOUND',404);
      await this.ready;
      if(!['GET','HEAD','POST','OPTIONS'].includes(request.method))throw new AuthError('NOT_FOUND',404);
      if(!allowedPath(url.pathname)&&!/^\/__(migration|release)\/[a-z-]+$/.test(url.pathname))throw new AuthError('NOT_FOUND',404);
      if(Number(request.headers.get('content-length')||0)>20*1024*1024)throw new AuthError('BODY_TOO_LARGE',413);
      if(request.method==='OPTIONS')return cors.wrap(new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':'GET, HEAD, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, Last-Event-ID'}}));
      return cors.wrap(await this.handle(request,url));
    }catch(error){return cors.wrap(this.error(error));}
  }
}
