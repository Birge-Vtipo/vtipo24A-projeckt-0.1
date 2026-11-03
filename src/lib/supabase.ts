import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
// A partial configuration is an error, never an automatic fallback to demo data.
export const configurationError = process.env.EXPO_PUBLIC_WHATSAPP_AUTH_URL && (url || key)
  ? 'Бір кіру тәсілін таңда: Birge API немесе Supabase / Выберите один способ входа: Birge API или Supabase.'
  : (!!url !== !!key) ? 'Supabase: URL және publishable key екеуін де толтырыңыз / заполните оба значения.' : null;
export const isDemo = !url && !key;
export const supabase = url && key && !configurationError ? createClient(url, key, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: Platform.OS === 'web', flowType: 'implicit' },
}) : null;
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', state => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
export function unwrap<T extends { data?: unknown; error: { message: string } | null }>(result: T): NonNullable<T['data']> {
  if (result.error) throw new Error(result.error.message);
  return result.data as NonNullable<T['data']>;
}
