// One optional @ is presentation syntax; a second one remains invalid.
export function normalizeLogin(value: string) { return value.trim().replace(/^@(?=[a-z0-9_]{3,24}$)/i, '').toLowerCase(); }
export function isValidUsername(value: string) { return /^[a-z0-9_]{3,24}$/.test(normalizeLogin(value)); }

// Existing UUIDs/phone numbers are login aliases, never new usernames.
export function isValidLoginAlias(value: string) {
  const login = normalizeLogin(value);
  if (isValidUsername(login) || /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(login)) return true;
  return /^\+?[\d ()-]+$/.test(login) && /^\+?[1-9]\d{7,14}$/.test(login.replace(/[ ()-]/g, ''));
}
export function normalizeRecoveryCode(value: string) { return value.replace(/[\s-]/g, '').toUpperCase(); }
export function isValidRecoveryCode(value: string) { return /^BRG[0-9A-F]{40}$/.test(normalizeRecoveryCode(value)); }
export const usernameHint = (kk: boolean) => kk
  ? 'Бірегей @аты: 3–24 латын әрпі a–z, 0–9 немесе _. @ белгісін жазсаң да болады. Бұл атпен аккаунтқа кіресің.'
  : 'Уникальное @имя: 3–24 латинские буквы a–z, цифры 0–9 или _. Можно вводить с @. Это также логин для входа.';
