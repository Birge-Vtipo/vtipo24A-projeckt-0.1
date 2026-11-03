import { PhoneAuthError, PhoneChallenge, PhoneSession, PhoneUser, phoneRequest, readPhoneSession } from './phone-auth';
import { normalizeCodePhone, phoneCodeCapability, validPhoneCode } from './phone-code-policy';

export type WhatsAppChallenge = PhoneChallenge & { channel: 'whatsapp'; delivery: 'accepted' };
type SendCode = { phone: string; name?: string; language: 'kk' | 'ru' };
export type PhoneBindingProof = { currentPassword?: string; recoveryCode?: string };
function normalizedPhone(phone: string) {
  const normalized = normalizeCodePhone(phone);
  if (!normalized) throw new PhoneAuthError('INVALID_PHONE');
  return normalized;
}
function challenge(value: WhatsAppChallenge) {
  if (!value || typeof value.challengeId !== 'string' || !value.challengeId || value.challengeId.length > 100
    || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()
    || !Number.isFinite(value.resendAfter) || value.resendAfter < 0 || value.resendAfter > 3600
    || value.channel !== 'whatsapp' || value.delivery !== 'accepted') throw new PhoneAuthError('OTP_UNAVAILABLE');
  return value;
}
function verification(challengeId: string, code: string) {
  if (!challengeId || !validPhoneCode(code)) throw new PhoneAuthError('INVALID_CODE');
  return { challengeId, code };
}
async function bindingSession(server: string) {
  const saved = await readPhoneSession();
  if (!saved || saved.server !== server) throw new PhoneAuthError('SESSION_EXPIRED');
  return saved;
}
export async function phoneCodeStatus(server: string) {
  const health = await phoneRequest<{ service: string; ready?: unknown; authMethods?: unknown; otp?: unknown }>('/health', undefined, undefined, server);
  if (health.service !== 'birge-whatsapp-auth') throw new PhoneAuthError('WRONG_SERVER');
  return phoneCodeCapability(health);
}
export async function sendPhoneCode(data: SendCode, server: string) {
  return challenge(await phoneRequest<WhatsAppChallenge>('/auth/send', { ...data, phone: normalizedPhone(data.phone), name: data.name?.trim() || undefined }, undefined, server));
}
export function verifyPhoneCode(challengeId: string, code: string, server: string) {
  return phoneRequest<PhoneSession>('/auth/verify', verification(challengeId, code), undefined, server);
}
export async function sendPhoneBinding(data: Omit<SendCode, 'name'> & PhoneBindingProof, server: string) {
  const saved = await bindingSession(server);
  return challenge(await phoneRequest<WhatsAppChallenge>('/auth/phone/send', { ...data, phone: normalizedPhone(data.phone) }, saved.token, saved.server));
}
export async function verifyPhoneBinding(challengeId: string, code: string, server: string, userId: string) {
  const saved = await bindingSession(server);
  const result = await phoneRequest<{ ok: boolean; user: PhoneUser }>('/auth/phone/verify', verification(challengeId, code), saved.token, saved.server);
  // Binding never accepts a replacement session/account, even from a malformed
  // response. The server must retain this account's opaque internal ID.
  if (result.ok !== true || result.user?.id !== userId) throw new PhoneAuthError('WRONG_ACCOUNT');
  return result;
}
