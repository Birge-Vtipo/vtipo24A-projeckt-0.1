import { AuthError } from '../whatsapp-bot/src/auth-core.mjs';

const unavailable=()=>new AuthError('OTP_UNAVAILABLE',503);
const deliveryFailed=()=>new AuthError('DELIVERY_FAILED',503);
const languageCode=value=>typeof value==='string'&&/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(value);
const MAX_RESPONSE_BYTES=16*1024;

// Uses the already approved AUTHENTICATION template with a COPY_CODE OTP
// button, not an arbitrary text message or an Android one-tap integration.
// Meta's official request/response reference:
// https://www.postman.com/meta/whatsapp-business-platform/request/lwtlz1k/send-message-template-interactive
// https://www.postman.com/meta/whatsapp-business-platform/request/6vkv46u/create-authentication-template-w-otp-copy-code-button
// Acceptance is not proof of delivery; delivery receipts require webhooks.
export function createWhatsAppOtpSender(env={}, {fetch:fetchImpl=globalThis.fetch,timeoutMs=10000}={}) {
  const enabled=env.WHATSAPP_OTP_ENABLED==='1';
  const accessToken=env.WHATSAPP_ACCESS_TOKEN,numberId=env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName=env.WHATSAPP_TEMPLATE_NAME,version=env.WHATSAPP_API_VERSION;
  const defaultLanguage=env.WHATSAPP_TEMPLATE_LANGUAGE;
  const configuredLanguages=[defaultLanguage,env.WHATSAPP_TEMPLATE_LANGUAGE_KK,env.WHATSAPP_TEMPLATE_LANGUAGE_RU];
  const languages={kk:env.WHATSAPP_TEMPLATE_LANGUAGE_KK||defaultLanguage,ru:env.WHATSAPP_TEMPLATE_LANGUAGE_RU||defaultLanguage};
  const configured=typeof fetchImpl==='function'&&Number.isSafeInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=30000
    &&typeof accessToken==='string'&&/^[\x21-\x7E]{16,4096}$/.test(accessToken)
    &&typeof numberId==='string'&&/^[1-9][0-9]{0,24}$/.test(numberId)
    &&typeof templateName==='string'&&/^[a-z0-9_]{1,512}$/.test(templateName)
    &&typeof version==='string'&&/^v[1-9][0-9]{0,2}\.0$/.test(version)
    &&configuredLanguages.every(value=>value===undefined||languageCode(value))
    &&Object.values(languages).every(languageCode);
  const ready=()=>enabled&&configured;

  async function responseJson(response){
    if(!response?.ok||response.redirected||!/^application\/json(?:\s*;|$)/i.test(response.headers?.get('content-type')||''))throw deliveryFailed();
    const contentLength=response.headers.get('content-length');
    if(contentLength!==null&&(!/^\d+$/.test(contentLength)||Number(contentLength)>MAX_RESPONSE_BYTES))throw deliveryFailed();
    if(!response.body)throw deliveryFailed();
    const reader=response.body.getReader(),parts=[];let size=0;
    try{
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_RESPONSE_BYTES)throw deliveryFailed();parts.push(value);}
    }catch(error){void reader.cancel().catch(()=>{});throw error;}
    finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }

  async function send(phone,_text,metadata={}){
    if(!ready())throw unavailable();
    // Never recover a code from the free-form text argument. The server must
    // supply the exact challenge code and scope in structured metadata.
    const {code,challengeId,expiresAt,language,purpose}=metadata||{};
    if(typeof phone!=='string'||!/^\+[1-9][0-9]{7,14}$/.test(phone)
      ||typeof code!=='string'||!/^\d{6}$/.test(code)
      ||typeof challengeId!=='string'||!challengeId||challengeId.length>100
      ||!Number.isSafeInteger(expiresAt)||expiresAt<=Date.now()
      ||!['kk','ru'].includes(language)||!['login','bind'].includes(purpose))throw deliveryFailed();
    const body={messaging_product:'whatsapp',recipient_type:'individual',to:phone.slice(1),type:'template',template:{
      name:templateName,language:{code:languages[language]},components:[
        {type:'body',parameters:[{type:'text',text:code}]},
        {type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:code}]},
      ],
    }};
    const controller=new AbortController();let timer;
    try{
      // One attempt only. Retrying a timed-out paid request can send a duplicate
      // OTP even when the first response never reached this invocation.
      const operation=(async()=>{
        const response=await fetchImpl(`https://graph.facebook.com/${version}/${numberId}/messages`,{
          // workerd supports manual/follow, not redirect:'error'. Refuse all
          // non2xx below so credentials and OTPs never follow a redirect.
          method:'POST',redirect:'manual',signal:controller.signal,
          headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify(body),
        });
        if(!response?.ok){void response?.body?.cancel().catch(()=>{});throw deliveryFailed();}
        const result=await responseJson(response),messageId=result?.messages?.[0]?.id;
        if(!result||typeof result!=='object'||Array.isArray(result)||result.error
          ||result.messaging_product!=='whatsapp'||!Array.isArray(result.messages)||result.messages.length!==1
          ||typeof messageId!=='string'||!/^wamid\.[A-Za-z0-9._~+/=-]{1,512}$/.test(messageId)
          ||controller.signal.aborted||Date.now()>=expiresAt)throw deliveryFailed();
        return {accepted:true,messageId};
      })();
      const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(deliveryFailed());},Math.min(timeoutMs,expiresAt-Date.now()));});
      return await Promise.race([operation,timeout]);
    }catch{
      // Do not expose provider bodies, token/recipient/code, exception causes,
      // or fetch URLs. Even a provider timeout has an unknown delivery outcome.
      controller.abort();throw deliveryFailed();
    }finally{clearTimeout(timer);}
  }

  return {enabled,ready,send};
}
