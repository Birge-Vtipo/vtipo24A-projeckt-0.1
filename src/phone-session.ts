import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { changePhoneServer, phoneAuthUrl, PhoneAuthError, phoneAuthEnabled, phoneRequest, PhoneSession, PhoneUser, readPhoneSession, savePhoneSession,onPhoneSessionExpired } from './lib/phone-auth';
import { isDemo } from './lib/supabase';
import { ConnectionProof } from './lib/connection-link';
import {webGuestMode} from './lib/web-guest';
import {requestGuestSession} from './lib/guest-api';

export function usePhoneSession() {
  const enabled = phoneAuthEnabled && isDemo;
  const [session, setSession] = useState<(PhoneSession & { server: string }) | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  const [serverUrl, setServerUrl] = useState(phoneAuthUrl);
  const generation = useRef(0);
  const restore = useCallback(async () => {
    const version = ++generation.current;
    try {
      setError('');
      let saved = await readPhoneSession();
      if (version !== generation.current) return;
      if (version === generation.current) setServerUrl(phoneAuthUrl);
      if(saved){
        try{
          const {user}=await phoneRequest<{user:PhoneUser}>('/auth/me',undefined,saved.token,saved.server);
          if(version===generation.current){setSession({...saved,user});setError('');}
          return;
        }catch(e){
          if(version!==generation.current)return;
          if(!(e instanceof PhoneAuthError)||e.code!=='SESSION_EXPIRED')throw e;
          await savePhoneSession(null);saved=null;setSession(null);
        }
      }
      if(!saved&&webGuestMode){
        const server=phoneAuthUrl,value=await requestGuestSession(server);
        if(version!==generation.current||server!==phoneAuthUrl)return;
        await savePhoneSession(value);
        if(version===generation.current&&server===phoneAuthUrl){setSession({...value,server});setError('');}
      }else if(version===generation.current)setSession(null);
    } catch (e) {
      if (version !== generation.current) return;
      if (e instanceof PhoneAuthError && e.code === 'SESSION_EXPIRED') { await savePhoneSession(null); setSession(null); }
      setError((e as Error).message);
    } finally { if (version === generation.current) setLoading(false); }
  }, []);
  useEffect(()=>onPhoneSessionExpired(()=>{generation.current++;setSession(null);if(webGuestMode)void restore();else setError('Сессия аяқталды. Қайта кір / Сессия завершена. Войдите снова.');}),[restore]);
  useEffect(() => {
    if (!enabled) return;
    // Restoration reads Keychain and validates with the server before updating state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void restore();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void restore(); });
    // This is a cancellation counter, not a DOM reference; invalidate pending requests at cleanup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { generation.current++; listener.remove(); };
  }, [enabled, restore]);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => { generation.current++; setSession(null); void savePhoneSession(null).then(()=>{if(webGuestMode)void restore();}); }, Math.max(0, session.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [session,restore]);
  async function accept(value: PhoneSession, expectedServer: string) {
    if (expectedServer !== phoneAuthUrl) throw new PhoneAuthError('SESSION_EXPIRED');
    const version = ++generation.current;
    await savePhoneSession(value);
    if (version !== generation.current || expectedServer !== phoneAuthUrl) throw new PhoneAuthError('SESSION_EXPIRED');
    setSession({ ...value, server: expectedServer }); setError('');
  }
  async function signOut() {
    // Clear this device even if the server is temporarily offline. The remote session expires after seven days.
    generation.current++;
    let failure: unknown;
    try { if (session) await phoneRequest('/auth/logout', {}, session.token, session.server); } catch (e) { failure = e; }
    await savePhoneSession(null); setSession(null);
    if (failure && !(failure instanceof PhoneAuthError && failure.code === 'SESSION_EXPIRED')) setError('Құрылғыдан шықтың. Сервердегі сессияны жабу мүмкін болмады / Вы вышли на этом устройстве. Серверная сессия не отозвана.');
  }
  async function updateName(name: string) {
    if (!session) throw new PhoneAuthError('SESSION_EXPIRED');
    const version = generation.current;
    const { user } = await phoneRequest<{ user: PhoneUser }>('/auth/profile', { name }, session.token, session.server);
    if (version !== generation.current || session.server !== phoneAuthUrl) throw new PhoneAuthError('SESSION_EXPIRED');
    setSession({ ...session, user });
  }
  async function changeServer(value: ConnectionProof) {
    const previous = phoneAuthUrl;
    generation.current++;
    const next = await changePhoneServer(value);
    generation.current++;
    if (next !== previous) setSession(null);
    setServerUrl(next); setError('');
  }
  return { enabled, user: session?.user, expiresAt: session?.expiresAt, loading, error, serverUrl, changeServer, clearError: () => setError(''), accept, signOut, updateName, restore };
}
