import type { Language } from '../types';

export function passwordRules(password: string) {
  const characters = [...password].length;
  return {
    length: characters >= 8 && characters <= 128,
    uppercase: /\p{Lu}/u.test(password),
    digit: /[0-9]/.test(password),
    symbol: /[\p{P}\p{S}]/u.test(password),
  };
}

export function isValidNewPassword(password: string) {
  return Object.values(passwordRules(password)).every(Boolean);
}

// Existing credentials remain usable even if they do not satisfy the new set/reset policy.
export function isValidLoginPassword(password: string) {
  return password.length >= 8 && [...password].length <= 128;
}

export function passwordPolicyHint(language: Language) {
  return language === 'kk'
    ? '8–128 таңба: кемінде бір бас әріп, бір 0–9 цифры және бір арнайы таңба. Бос орын арнайы таңба болып саналмайды.'
    : '8–128 символов: минимум одна заглавная буква, одна цифра 0–9 и один специальный символ. Пробел не считается специальным символом.';
}
