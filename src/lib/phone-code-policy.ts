// Match the API's international-number normalization without accepting letters,
// WhatsApp chat IDs or pasted URLs as a telephone number.
export function normalizeCodePhone(value: string) {
  if (value.length > 30 || !/^\+?[\d ()-]+$/.test(value)) return undefined;
  let phone = value.replace(/[ ()-]/g, '');
  if (/^8\d{10}$/.test(phone)) phone = '+7' + phone.slice(1);
  if (/^7\d{10}$/.test(phone)) phone = '+' + phone;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : undefined;
}
export const validPhoneCode = (value: string) => /^\d{6}$/.test(value);
export function secondsUntil(deadline: number, now: number) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
export function codeClock(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
export type PhoneCodeCapability = { enabled: boolean; ready: boolean; channel: 'whatsapp' };
// Capability absence is an unavailable method, never permission to pretend a
// message was sent. Credential sign-in does not depend on this capability.
export function phoneCodeCapability(health: { ready?: unknown; authMethods?: unknown; otp?: unknown }): PhoneCodeCapability {
  const otp = health.otp && typeof health.otp === 'object' ? health.otp as Record<string, unknown> : {};
  const enabled = Array.isArray(health.authMethods) && health.authMethods.includes('phone') && otp.enabled === true && otp.channel === 'whatsapp';
  return { enabled, ready: enabled && health.ready === true && otp.ready === true, channel: 'whatsapp' };
}
