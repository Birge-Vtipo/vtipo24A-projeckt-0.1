import { PhoneAuthError, PhoneChallenge, PhoneSession, PhoneUser, phoneRequest, readPhoneSession } from './phone-auth';
import { normalizeCodePhone, telegramCodeCapability, trustedTelegramBotUrl, validPhoneCode, validTelegramBotUsername } from './telegram-code-policy';

export type TelegramChallenge = PhoneChallenge & { channel: 'telegram'; delivery: 'pending'; botUrl: string };
type SendCode = { phone: string; name?: string; language: 'kk' | 'ru' };
type BindingCode = Omit<SendCode, 'name'> & { currentPassword?: string; recoveryCode?: string };
function normalizedPhone(phone: string) {
  const normalized = normalizeCodePhone(phone);
  if (!normalized) throw new PhoneAuthError('INVALID_PHONE');
  return normalized;
}
function challenge(value: TelegramChallenge, botUsername: string): TelegramChallenge {
  const botUrl = trustedTelegramBotUrl(value?.botUrl, botUsername);
  if (!value || typeof value.challengeId !== 'string' || !value.challengeId.trim() || value.challengeId.length > 100
    || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()
    || !Number.isInteger(value.resendAfter) || value.resendAfter < 60 || value.resendAfter > 3600
    || value.channel !== 'telegram' || value.delivery !== 'pending' || !botUrl) throw new PhoneAuthError('TELEGRAM_UNAVAILABLE');
  return { challengeId: value.challengeId, expiresAt: value.expiresAt, resendAfter: value.resendAfter, channel: 'telegram', delivery: 'pending', botUrl };
}
function verification(challengeId: string, code: string) {
  if (!challengeId || !validPhoneCode(code)) throw new PhoneAuthError('INVALID_CODE');
  return { challengeId, code };
}
function configuredBot(botUsername: string) {
  if (!validTelegramBotUsername(botUsername)) throw new PhoneAuthError('TELEGRAM_UNAVAILABLE');
}
async function bindingSession(server: string) {
  const saved = await readPhoneSession();
  if (!saved || saved.server !== server) throw new PhoneAuthError('SESSION_EXPIRED');
  return saved;
}
export async function telegramCodeStatus(server: string) {
  const health = await phoneRequest<{ service: string; ready?: unknown; authMethods?: unknown; telegram?: unknown }>('/health', undefined, undefined, server);
  if (health?.service !== 'birge-whatsapp-auth') throw new PhoneAuthError('WRONG_SERVER');
  return telegramCodeCapability(health);
}
export async function sendTelegramCode(data: SendCode, server: string, botUsername: string) {
  configuredBot(botUsername);
  return challenge(await phoneRequest<TelegramChallenge>('/auth/telegram/send', { ...data, phone: normalizedPhone(data.phone), name: data.name?.trim() || undefined }, undefined, server), botUsername);
}
export function verifyTelegramCode(challengeId: string, code: string, server: string) {
  return phoneRequest<PhoneSession>('/auth/telegram/verify', verification(challengeId, code), undefined, server);
}
export async function sendTelegramBinding(data: BindingCode, server: string, botUsername: string) {
  configuredBot(botUsername);
  const saved = await bindingSession(server);
  return challenge(await phoneRequest<TelegramChallenge>('/auth/telegram/phone/send', { ...data, phone: normalizedPhone(data.phone) }, saved.token, saved.server), botUsername);
}
export async function verifyTelegramBinding(challengeId: string, code: string, server: string, userId: string) {
  const saved = await bindingSession(server);
  const result = await phoneRequest<{ ok: boolean; user: PhoneUser }>('/auth/telegram/phone/verify', verification(challengeId, code), saved.token, saved.server);
  if (result?.ok !== true || result.user?.id !== userId) throw new PhoneAuthError('WRONG_ACCOUNT');
  return { ok: true, user: result.user };
}
