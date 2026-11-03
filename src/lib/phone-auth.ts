import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { normalizePhoneServer } from './phone-server';
import { ConnectionProof, verifyConnection } from './connection-link';
import { loginDeviceMetadata, stopLiveNotifications } from './live-notifications';

const defaultServer = (process.env.EXPO_PUBLIC_WHATSAPP_AUTH_URL || '').trim().replace(/\/$/, '');
const connectionKey = process.env.EXPO_PUBLIC_CONNECTION_KEY || '';
export let phoneAuthUrl = defaultServer;
export const phoneAuthEnabled = !!phoneAuthUrl;
export type PhoneUser = { id: string; phone: string; name: string; login?: string; handle?: string; hasPassword?: boolean; hasCredentials?: boolean; isGuest?: boolean };
export type PhoneSession = { token: string; expiresAt: number; user: PhoneUser };
export type PhoneChallenge = { challengeId: string; expiresAt: number; resendAfter: number };
type SavedSession = { token: string; expiresAt: number; server: string };
const storageKey = 'birge.whatsapp.session.v1';
const serverKey = 'birge.whatsapp.connection.v2';
let serverLoading: Promise<void> | undefined;
let savedProof: ConnectionProof | undefined;
let changing = false;
// Some private/browser policies throw even when reading the sessionStorage
// property. Keep this page usable without moving credentials to another store.
const webSessionMemory = new Map<string, string | null>();
let webStorageUnavailable = false;
function readWebSessionValue(key: string) {
  if (webSessionMemory.has(key)) return webSessionMemory.get(key) ?? null;
  if (webStorageUnavailable) return null;
  try {
    if (typeof sessionStorage === 'undefined') { webStorageUnavailable = true; return null; }
    const value = sessionStorage.getItem(key);
    webSessionMemory.set(key, value);
    return value;
  } catch { webStorageUnavailable = true; return null; }
}
function writeWebSessionValue(key: string, value: string | null) {
  // A null entry is a tombstone, so a blocked remove cannot restore an old token.
  webSessionMemory.set(key, value);
  if (webStorageUnavailable) return;
  try {
    if (typeof sessionStorage === 'undefined') { webStorageUnavailable = true; return; }
    if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value);
  } catch { webStorageUnavailable = true; }
}
const expiryListeners=new Set<()=>void>();
export function onPhoneSessionExpired(listener:()=>void){expiryListeners.add(listener);return()=>{expiryListeners.delete(listener);};}
export async function expirePhoneSession(token:string,server:string){
  const current=await readPhoneSession();
  if(current?.token!==token||current.server!==server)return;
  await savePhoneSession(null);expiryListeners.forEach(listener=>listener());
}
const errors: Record<string, string> = {
  WEAK_PASSWORD:'Құпиясөз: 8–128 таңба, бір бас әріп, бір 0–9 цифры және арнайы таңба / Пароль: 8–128 символов, заглавная буква, цифра 0–9 и специальный символ',
  INVALID_PASSWORD:'Логин немесе құпиясөз қате / Неверный логин или пароль',
  INVALID_CREDENTIALS:'Логин немесе құпиясөз қате / Неверный логин или пароль',
  INVALID_LOGIN:'Логинді тексер: жаңа логин 3–24 латын әрпінен, цифрдан не _ таңбасынан тұрады / Проверьте логин: новый логин содержит 3–24 латинских буквы, цифры или _',
  LOGIN_TAKEN:'Бұл логин бос емес. Басқасын таңда / Этот логин занят. Выберите другой',
  INVALID_RECOVERY_CODE:'Логин немесе қалпына келтіру коды қате / Неверный логин или код восстановления',
  REAUTH_REQUIRED:'Ағымдағы құпиясөзді немесе қалпына келтіру кодын енгіз / Введите текущий пароль или код восстановления',
  SERVER_OFFLINE:'Сервер уақытша қолжетімсіз / Сервер временно недоступен',
  OTP_UNAVAILABLE:'WhatsApp арқылы код жіберу әзірге қолжетімсіз. Логин мен құпиясөзді қолдан / Отправка кода в WhatsApp пока недоступна. Используйте логин и пароль',
  TELEGRAM_UNAVAILABLE:'Telegram арқылы кіру әзірге қолжетімсіз. Логин мен құпиясөзді қолдан / Вход через Telegram пока недоступен. Используйте логин и пароль',
  TELEGRAM_OPEN_FAILED:'Telegram ашылмады. Telegram қолданбасын орнатып, «Telegram ашу» батырмасын қайта бас / Не удалось открыть Telegram. Установите приложение и нажмите «Открыть Telegram» ещё раз',
  DELIVERY_PENDING:'Алдымен Telegram ботын ашып, Start бас та, өз нөміріңді жібер / Сначала откройте Telegram-бота, нажмите Start и отправьте свой номер',
  AUTH_METHOD_CHANGED:'Бұл кіру тәсілі қазір қолжетімсіз. Логин мен құпиясөзді қолдан / Этот способ входа сейчас недоступен. Используйте логин и пароль',
  PHONE_UNAVAILABLE:'Бұл нөмірді байланыстыру мүмкін болмады. Басқа нөмірді тексер / Не удалось привязать этот номер. Проверьте другой номер',
  PHONE_ALREADY_BOUND:'Аккаунтта нөмір бұрыннан бар. Оны басқа нөмірге ауыстыру қолжетімсіз / В аккаунте уже есть номер. Смена номера недоступна',
  WRONG_ACCOUNT:'Аккаунт өзгерді. Парақты қайта аш / Аккаунт изменился. Откройте страницу заново',
  INVALID_PHONE: 'Нөмірді +7 7XX XXX XX XX түрінде енгіз / Введите номер в международном формате.',
  INVALID_NAME: 'Аты-жөні: 2–80 таңба / Имя: 2–80 символов.',
  PHONE_NOT_ALLOWED: 'Бұл кіру тәсілі қолжетімсіз / Этот способ входа недоступен.',
  BOT_OFFLINE: 'Бұл кіру тәсілі қолжетімсіз. Логин мен құпиясөзді қолдан / Этот способ входа недоступен. Используйте логин и пароль.',
  WAIT_BEFORE_RESEND: 'Кодты қайта сұрамас бұрын күте тұр / Подождите перед повторной отправкой.',
  SEND_LIMIT: 'Код сұрау шегіне жеттің. Кейінірек қайтала / Лимит отправки. Попробуйте позже.',
  DELIVERY_FAILED: 'Кодтың жіберілгені расталмады. Кейінірек жаңа код сұра / Отправка не подтверждена. Позже запросите новый код.',
  INVALID_CODE: 'Код қате / Неверный код.',
  CODE_EXPIRED: 'Код жарамсыз немесе мерзімі өтті. Жаңа код сұра / Код недействителен или истёк. Запросите новый.',
  SESSION_EXPIRED: 'Сессия аяқталды. Қайта кір / Сессия завершена. Войдите снова.',
  NETWORK_ERROR: 'Қосылым жоқ. Интернетті тексеріп, қайта көр / Нет соединения. Проверьте интернет и повторите.',
  INVALID_CONFIG: 'Birge API: HTTPS мекенжайы қажет / Нужен HTTPS адрес сервера Birge.',
  WRONG_SERVER: 'Бұл Birge сервері емес. Ресми қосылым сілтемесін қолдан / Это не сервер Birge. Используйте официальную ссылку подключения.',
  CHANGE_REQUIRES_LOGOUT: 'Қосылымды өзгерту үшін алдымен аккаунттан шық / Сначала выйдите из аккаунта.',
  INVALID_CONNECTION: 'Қосылу сілтемесі жарамсыз немесе ескірген. Ресми Birge сілтемесін қайта аш / Ссылка подключения недействительна или устарела. Откройте официальную ссылку Birge снова.',
};
export class PhoneAuthError extends Error {
  constructor(public code: string, public retryAfter = 0) { super(errors[code] || 'Сервер қатесі. Қайталап көр / Ошибка сервера. Попробуйте ещё раз.'); }
}
export async function phoneRequest<T>(path: string, data?: unknown, token?: string, expectedServer?: string): Promise<T> {
  // Capture the origin before awaiting: a settings change cannot redirect an old token.
  const server = phoneAuthUrl;
  if ((token && expectedServer !== server) || (expectedServer !== undefined && expectedServer !== server)) throw new PhoneAuthError('SESSION_EXPIRED');
  if (!/^https:\/\/[^/]+/.test(server) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(server)) throw new PhoneAuthError('INVALID_CONFIG');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), ['/auth/send','/auth/phone/send'].includes(path) ? 45000 : 10000);
  try {
    const requestData=['/auth/register','/auth/login','/auth/recover','/auth/verify','/auth/telegram/verify','/auth/password-login','/auth/guest'].includes(path)&&data&&typeof data==='object'?{...data,device:await loginDeviceMetadata()}:data;
    const response = await fetch(server + path, {
      method: data === undefined ? 'GET' : 'POST', signal: controller.signal,
      headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(data === undefined ? {} : { body: JSON.stringify(requestData) }),
    });
    const result = await response.json();
    if (server !== phoneAuthUrl) throw new PhoneAuthError('SESSION_EXPIRED');
    if (!response.ok) throw new PhoneAuthError(result.error, result.retryAfter || 0);
    return result as T;
  } catch (error) { if (error instanceof PhoneAuthError) throw error; throw new PhoneAuthError('NETWORK_ERROR'); }
  finally { clearTimeout(timer); }
}
export async function loadPhoneServer() {
  if (!serverLoading) serverLoading = (async () => {
    const saved = Platform.OS === 'web' ? readWebSessionValue(serverKey) : await SecureStore.getItemAsync(serverKey);
    if (saved) {
      try {
        const stored = JSON.parse(saved);
        // A new APK's built-in address replaces settings belonging to an older build.
        if (stored.base === defaultServer) {
          savedProof = verifyConnection(stored.proof, connectionKey, Date.now(), true);
          phoneAuthUrl = savedProof.server;
        }
      } catch { /* Invalid/legacy settings cannot override the built-in address. */ }
    }
  })().catch(error => { serverLoading = undefined; throw error; });
  await serverLoading;
}
export async function changePhoneServer(input: ConnectionProof) {
  await loadPhoneServer();
  let proof: ConnectionProof;
  try { proof = verifyConnection(input, connectionKey); } catch { throw new PhoneAuthError('INVALID_CONNECTION'); }
  if (savedProof && Number(proof.issued) < Number(savedProof.issued)) throw new PhoneAuthError('INVALID_CONNECTION');
  if (changing) throw new PhoneAuthError('INVALID_CONNECTION');
  changing = true;
  try { return await applyConnection(proof); } finally { changing = false; }
}
async function applyConnection(proof: ConnectionProof) {
  const next = normalizePhoneServer(proof.server);
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
  try {
    // Probe without a token, name or phone number before trusting this address.
    const response = await fetch(next + '/health', { signal: controller.signal });
    const health = await response.json();
    if (!response.ok || health.service !== 'birge-whatsapp-auth') throw new PhoneAuthError('WRONG_SERVER');
  } catch (e) { if (e instanceof PhoneAuthError) throw e; throw new PhoneAuthError('NETWORK_ERROR'); }
  finally { clearTimeout(timer); }
  const stored = JSON.stringify({ base: defaultServer, proof });
  if (Platform.OS === 'web') writeWebSessionValue(serverKey, stored);
  else await SecureStore.setItemAsync(serverKey, stored);
  if (phoneAuthUrl !== next) await savePhoneSession(null);
  phoneAuthUrl = next;
  savedProof = proof;
  return next;
}
// Native tokens use Keychain/Keystore. Web preview keeps them only for this tab.
export async function savePhoneSession(value: PhoneSession | null) {
  if(!value)await stopLiveNotifications().catch(()=>{});
  const text = value ? JSON.stringify({ token: value.token, expiresAt: value.expiresAt, server: phoneAuthUrl }) : null;
  if (Platform.OS === 'web') {
    writeWebSessionValue(storageKey, text);
  } else if (text) await SecureStore.setItemAsync(storageKey, text);
  else await SecureStore.deleteItemAsync(storageKey);
}
export async function readPhoneSession(): Promise<SavedSession | null> {
  await loadPhoneServer();
  const text = Platform.OS === 'web' ? readWebSessionValue(storageKey) : await SecureStore.getItemAsync(storageKey);
  if (!text) return null;
  try {
    const value = JSON.parse(text);
    if (value.server !== phoneAuthUrl || typeof value.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.token) || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) { await savePhoneSession(null); return null; }
    return value;
  } catch { await savePhoneSession(null); return null; }
}
