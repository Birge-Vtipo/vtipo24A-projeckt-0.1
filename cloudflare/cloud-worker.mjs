import { allowedPath } from './core.mjs';
import { requestCors } from './cors.mjs';
import { publicPage } from './public-page.mjs';
import { webApp } from './web-app.mjs';
import { createHash, timingSafeEqual } from 'node:crypto';
import { telegramWebhookAuthorized,TELEGRAM_WEBHOOK_PATH } from './telegram-auth.mjs';
export { BirgeCore } from './core.mjs';
export default {
  async fetch(request,env){
    const cors=requestCors(request,env);
    const error=(code,status)=>cors.wrap(Response.json({error:code},{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}}));
    if(!cors.accepted)return error('ORIGIN_NOT_ALLOWED',403);
    try{
    const path=new URL(request.url).pathname;
    if(path==='/'&&['GET','HEAD'].includes(request.method))return cors.wrap(publicPage(request.method));
    const app=await webApp(request,env);if(app)return cors.wrap(app);
    if(path===TELEGRAM_WEBHOOK_PATH&&(request.method!=='POST'||!telegramWebhookAuthorized(request,env)))return error('NOT_FOUND',404);
    if(/^\/__(migration|release)\//.test(path)){
      // Read the current invocation's binding. A surviving Durable Object may
      // still hold its constructor's previous secret after a binding-only edit.
      const configured=env.MIGRATION_TOKEN,authorization=request.headers.get('authorization')||'';
      const supplied=authorization.startsWith('Bearer ')?authorization.slice(7):'';
      const digest=value=>createHash('sha256').update(value).digest();
      if(typeof configured!=='string'||!configured||!supplied||!timingSafeEqual(digest(supplied),digest(configured)))return error('NOT_FOUND',404);
    }
    if(!allowedPath(path)&&!/^\/__(migration|release)\/[a-z-]+$/.test(path))return error('NOT_FOUND',404);
    const headers=new Headers(request.headers);
    headers.delete('x-birge-edge-ip');
    headers.set('x-birge-edge-ip',request.headers.get('cf-connecting-ip')||'unknown');
    let body;
    if(request.body){
      const maximum=path===TELEGRAM_WEBHOOK_PATH?32768:20*1024*1024;
      if(Number(headers.get('content-length')||0)>maximum)return error('BODY_TOO_LARGE',413);
      // Complete the bounded ingress before crossing a Durable Object RPC. An
      // early room/credential rejection must not leave a client upload stream
      // owned by an invocation whose response has already finished.
      const chunks=[];let size=0;
      for await(const chunk of request.body){size+=chunk.length;if(size>maximum)return error('BODY_TOO_LARGE',413);chunks.push(chunk);}
      body=Buffer.concat(chunks,size);
    }
    const id=env.BIRGE_CORE.idFromName('birge-core-v1');
    return cors.wrap(await env.BIRGE_CORE.get(id).fetch(new Request(request.url,{method:request.method,headers,...(body?{body}:{}),redirect:'manual',signal:request.signal})));
    }catch{return error('SERVER_ERROR',500);}
  },
};
