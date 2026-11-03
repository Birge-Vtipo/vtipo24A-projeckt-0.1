import { phoneRequest, readPhoneSession } from './phone-auth';

export type AccountDevice = {
  id: string; name: string; platform: string; current: boolean; method: string;
  created_at: string; last_seen_at: string; expires_at: string;
};

async function request<T>(path: string, body?: unknown) {
  const session = await readPhoneSession();
  if (!session) throw new Error('Сессия аяқталды. Қайта кіріңіз / Войдите снова');
  return phoneRequest<T>(path, body, session.token, session.server);
}
export function accountDevices() { return request<{ devices: AccountDevice[] }>('/auth/sessions'); }
export function revokeDevice(id: string) { return request<{ ok: boolean; current: boolean }>('/auth/sessions/revoke', { id }); }
export function revokeOtherDevices() { return request<{ ok: boolean; revoked: number }>('/auth/sessions/revoke-others', {}); }
