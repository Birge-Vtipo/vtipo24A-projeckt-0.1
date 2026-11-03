import { phoneRequest, PhoneSession, PhoneUser, readPhoneSession, PhoneAuthError } from './phone-auth';
import { normalizeLogin } from './credentials-policy';
export type CredentialSession = PhoneSession & { recoveryCode?: string };
export type CredentialUpdate = { ok: boolean; user: PhoneUser; login?: string; recoveryCode?: string };
export function registerCredentials(data: { login: string; password: string; name?: string }, server: string) {
  return phoneRequest<CredentialSession>('/auth/register', { ...data, login: normalizeLogin(data.login), name: data.name?.trim() || undefined }, undefined, server);
}
export function loginCredentials(data: { login: string; password: string }, server: string) {
  return phoneRequest<CredentialSession>('/auth/login', { ...data, login: normalizeLogin(data.login) }, undefined, server);
}
export function recoverCredentials(data: { login: string; password: string; recoveryCode: string }, server: string) {
  return phoneRequest<CredentialSession>('/auth/recover', { ...data, login: normalizeLogin(data.login) }, undefined, server);
}
export async function updateCredentials(data: { login?: string; password: string; currentPassword?: string; recoveryCode?: string }) {
  const session = await readPhoneSession();
  if (!session) throw new PhoneAuthError('SESSION_EXPIRED');
  return phoneRequest<CredentialUpdate>('/auth/credentials', { ...data, ...(data.login === undefined ? {} : { login: normalizeLogin(data.login) }) }, session.token, session.server);
}
