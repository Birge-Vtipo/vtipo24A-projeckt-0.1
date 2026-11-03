import {AuthError} from '../whatsapp-bot/src/auth-core.mjs';
import {faqKeyboard,telegramFaqReply} from './telegram-faq.mjs';

const unavailable=()=>new AuthError('TELEGRAM_UNAVAILABLE',503);
const deliveryFailed=()=>new AuthError('DELIVERY_FAILED',503);
const MAX_RESPONSE_BYTES=32*1024;
const privateChat=id=>Number.isSafeInteger(id)&&id>0;
const validLanguage=language=>language==='kk'||language==='ru';

// Telegram Bot API, using only private-chat sendMessage and native contact
// sharing. Contact ownership is verified by the webhook/auth service, not here.
// https://core.telegram.org/bots/api#sendmessage
// https://core.telegram.org/bots/api#keyboardbutton
// https://core.telegram.org/bots/api#replykeyboardmarkup
export function createTelegramSender(env={}, {fetch:fetchImpl=globalThis.fetch,timeoutMs=10000}={}){
  const enabled=env.TELEGRAM_OTP_ENABLED==='1',token=env.TELEGRAM_BOT_TOKEN,username=env.TELEGRAM_BOT_USERNAME;
  const configured=typeof fetchImpl==='function'&&Number.isSafeInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=10000
    &&typeof token==='string'&&/^[1-9][0-9]{0,19}:[A-Za-z0-9_-]{30,256}$/.test(token)
    &&typeof username==='string'&&/^[A-Za-z0-9_]{2,29}bot$/i.test(username)
    &&typeof env.TELEGRAM_WEBHOOK_SECRET==='string'&&/^[A-Za-z0-9_-]{32,256}$/.test(env.TELEGRAM_WEBHOOK_SECRET);
  const ready=()=>enabled&&configured;

  async function readJson(response){
    if(!response?.ok||response.redirected||!/^application\/json(?:\s*;|$)/i.test(response.headers?.get('content-type')||''))throw deliveryFailed();
    const length=response.headers.get('content-length');
    if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_RESPONSE_BYTES))throw deliveryFailed();
    if(!response.body)throw deliveryFailed();
    const reader=response.body.getReader(),parts=[];let size=0;
    try{
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_RESPONSE_BYTES)throw deliveryFailed();parts.push(value);}
    }catch(error){void reader.cancel().catch(()=>{});throw error;}
    finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;
    for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }

  async function send(payload,expiresAt){
    const controller=new AbortController();let timer;
    try{
      const limit=expiresAt===undefined?timeoutMs:Math.min(timeoutMs,expiresAt-Date.now());
      if(limit<=0)throw deliveryFailed();
      const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(deliveryFailed());},limit);});
      const operation=(async()=>{
        const response=await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`,{
          method:'POST',redirect:'manual',signal:controller.signal,
          headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),
        });
        // Never follow a redirect: this endpoint contains the secret bot token.
        if(!response?.ok){void response?.body?.cancel().catch(()=>{});throw deliveryFailed();}
        const result=await readJson(response),message=result?.result;
        if(!result||typeof result!=='object'||Array.isArray(result)||result.ok!==true
          ||!message||typeof message!=='object'||Array.isArray(message)
          ||!Number.isSafeInteger(message.message_id)||message.message_id<=0
          ||message.chat?.id!==payload.chat_id||message.chat?.type!=='private'
          ||controller.signal.aborted||(expiresAt!==undefined&&Date.now()>=expiresAt))throw deliveryFailed();
        return {accepted:true,messageId:message.message_id};
      })();
      // Single attempt, including when the provider accepted a request whose
      // response was lost. The auth layer alone decides whether to issue a code.
      return await Promise.race([operation,timeout]);
    }catch{
      controller.abort();throw deliveryFailed();
    }finally{clearTimeout(timer);}
  }

  async function sendPrompt(chatId,language){
    if(!ready())throw unavailable();
    if(!privateChat(chatId)||!validLanguage(language))throw deliveryFailed();
    const kk=language==='kk';
    return send({chat_id:chatId,text:kk
      ? 'Birge үшін Telegram аккаунтыңдағы өз телефон нөміріңді раста. Төмендегі «Өз нөмірімді жіберу» батырмасын бас. Басқа адамның контактін немесе нөмірді мәтінмен жіберме.'
      : 'Подтвердите собственный номер вашего аккаунта Telegram для Birge. Нажмите кнопку «Отправить мой номер» ниже. Не отправляйте чужой контакт или номер обычным сообщением.',
    reply_markup:{keyboard:[[{text:kk?'Өз нөмірімді жіберу':'Отправить мой номер',request_contact:true}]],resize_keyboard:true,one_time_keyboard:true}});
  }

  async function sendAnswer(chatId,language,reply,{preserveKeyboard=false}={}){
    if(!ready())throw unavailable();
    if(!privateChat(chatId)||!validLanguage(language)||typeof reply?.text!=='string'||!reply.text.trim()||reply.text.length>4096||typeof preserveKeyboard!=='boolean')throw deliveryFailed();
    return send({chat_id:chatId,text:reply.text,link_preview_options:{is_disabled:true},...(preserveKeyboard?{}:{reply_markup:faqKeyboard(language)})});
  }
  async function sendHelp(chatId,language,options){
    return sendAnswer(chatId,language,telegramFaqReply('/start',language),options);
  }

  async function sendCode(chatId,code,expiresAt,language){
    if(!ready())throw unavailable();
    if(!privateChat(chatId)||!validLanguage(language)||typeof code!=='string'||!/^\d{6}$/.test(code)
      ||!Number.isSafeInteger(expiresAt)||expiresAt<=Date.now())throw deliveryFailed();
    return send({chat_id:chatId,text:language==='kk'
      ? `Birge коды: ${code}.\nОны тек Birge қолданбасына енгіз. Ешкімге жіберме.\nКод Birge-дегі бастапқы сұраудың мерзімі біткенше ғана жарамды. Telegram-ға өту бұл мерзімді ұзартпайды.`
      : `Код Birge: ${code}.\nВведите его только в приложении Birge. Никому не передавайте.\nКод действует лишь до окончания исходного запроса в Birge. Переход в Telegram не продлевает этот срок.`,
    protect_content:true,reply_markup:{remove_keyboard:true}},expiresAt);
  }

  return {enabled,ready,botUsername:ready()?username:'',sendPrompt,sendCode,sendHelp,sendAnswer};
}
