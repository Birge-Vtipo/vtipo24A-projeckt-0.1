import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { phoneAuthUrl, readPhoneSession } from './phone-auth';
import { Conversation, Listing, Message, Profile, Report } from '../types';

export type SocialState = { profile: Profile | null; profiles: Profile[]; listings: Listing[]; favorites: string[]; conversations: Conversation[]; messages: Message[]; reports: Report[]; blocked: string[]; notification_count?:number };
export const emptySocial: SocialState = { profile: null, profiles: [], listings: [], favorites: [], conversations: [], messages: [], reports: [], blocked: [] };
const errors: Record<string,string> = {
  SESSION_EXPIRED:'Сессия аяқталды. Қайта кіріңіз / Войдите снова',
  FORBIDDEN:'Бұл әрекетке рұқсат жоқ / Нет доступа', CHAT_NOT_FOUND:'Чат табылмады / Чат не найден',
  LISTING_CLOSED:'Жарияланым жабылған / Объявление закрыто', USER_BLOCKED:'Қолданушы бұғатталған / Пользователь заблокирован',
  DESCRIPTION_TOO_SHORT:'Сипаттама: кемінде 5 сөз / Описание: минимум 5 слов',
  SLOW_DOWN:'Сәл күтіңіз / Подождите немного', MEDIA_TOO_LARGE:'Файл 20 МБ-тан аспауы керек / Файл до 20 МБ',
  STORAGE_FULL:'Медиа сақтау орны толды / Хранилище заполнено', INVALID_MEDIA:'Медиа файлын қайта таңдаңыз / Выберите файл заново',
  UNSUPPORTED_MEDIA:'JPEG, PNG, GIF, WebP, MP4, M4A файлдарын таңдаңыз', USER_NOT_FOUND:'Қолданушы табылмады / Пользователь не найден',
};
export async function socialRequest<T>(route: string, data?: unknown): Promise<T> {
  const session = await readPhoneSession();
  if (!session) throw new Error(errors.SESSION_EXPIRED);
  const origin = phoneAuthUrl, controller = new AbortController(), timer = setTimeout(()=>controller.abort(),20000);
  try {
    const r = await fetch(origin+'/social/'+route,{method:data===undefined?'GET':'POST', headers:{Authorization:`Bearer ${session.token}`,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:controller.signal});
    const result=await r.json(); if(!r.ok) throw new Error(errors[result.error] || 'Сервер сұрауды орындай алмады / Не удалось выполнить запрос');
    if (origin !== phoneAuthUrl) throw new Error('Қосылым өзгерді / Подключение изменилось');
    return result as T;
  } catch(e) { if(e instanceof TypeError || (e as Error).name==='AbortError') throw new Error('Серверге қосылмады. Интернетті тексеріңіз / Нет связи с сервером'); throw e; }
  finally { clearTimeout(timer); }
}
export function mediaUri(value?: string | null) { return value?.startsWith('/media/') ? phoneAuthUrl + value : value || undefined; }
export async function uploadMedia(uri: string, mime: string, scope: 'profile'|'listing'|'chat', conversation = '') {
  const session=await readPhoneSession(); if(!session) throw new Error(errors.SESSION_EXPIRED);
  const content=Platform.OS==='web'?await (await fetch(uri)).blob():new File(uri);
  if(content.size>20*1024*1024) throw new Error(errors.MEDIA_TOO_LARGE);
  // Expo's Blob/File transport replaces Content-Type with the OS-inferred type.
  // Send bytes so an Android M4A keeps the recorder's explicit audio/mp4 type.
  const bytes=await content.arrayBuffer();
  const origin=phoneAuthUrl, controller=new AbortController(), timer=setTimeout(()=>controller.abort(),60000);
  try {
    const response=await expoFetch(`${origin}/social/upload?scope=${scope}&conversation=${encodeURIComponent(conversation)}`,{method:'POST',headers:{Authorization:`Bearer ${session.token}`,'Content-Type':mime},body:bytes,signal:controller.signal});
    const result=await response.json(); if(!response.ok) throw new Error(errors[result.error] || 'Файл жіберілмеді / Файл не отправлен');
    if(origin!==phoneAuthUrl) throw new Error('Қосылым өзгерді / Подключение изменилось');
    return result as {id:string;kind:'image'|'video'|'audio';url:string};
  } finally { clearTimeout(timer); }
}
