export { normalizeCodePhone, validPhoneCode, secondsUntil, codeClock } from './phone-code-policy';

export function validTelegramBotUsername(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 5 && value.length <= 32
    && !/[^A-Za-z0-9_]/.test(value) && value.toLowerCase().endsWith('bot');
}
// Validate the raw string, not URL-parser normalization. A ticket is transient
// authority to start this request, so no extra query, escaped path, userinfo,
// fragment, alternate host or guessed bot may leave the app through this link.
export function trustedTelegramBotUrl(value: unknown, botUsername: unknown) {
  if (typeof value !== 'string' || !validTelegramBotUsername(botUsername)) return undefined;
  const prefix = `https://t.me/${botUsername}?start=t_`;
  if (!value.startsWith(prefix)) return undefined;
  const ticket = value.slice(prefix.length);
  return ticket.length === 43 && !/[^A-Za-z0-9_-]/.test(ticket) ? value : undefined;
}
export type TelegramCodeCapability = { enabled: boolean; ready: boolean; channel: 'telegram'; botUsername: string };
export function telegramCodeCapability(health: { ready?: unknown; authMethods?: unknown; telegram?: unknown }): TelegramCodeCapability {
  const telegram = health.telegram && typeof health.telegram === 'object' ? health.telegram as Record<string, unknown> : {};
  const enabled = Array.isArray(health.authMethods) && health.authMethods.includes('telegram') && telegram.enabled === true && telegram.channel === 'telegram';
  const botUsername = validTelegramBotUsername(telegram.botUsername) ? telegram.botUsername : '';
  return { enabled, ready: enabled && health.ready === true && telegram.ready === true && !!botUsername, channel: 'telegram', botUsername };
}
