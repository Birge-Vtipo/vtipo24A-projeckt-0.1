import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session } from '@supabase/supabase-js';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { Conversation, Language, Listing, Message, NewListing, Profile, Report } from './types';
import { demoListings, demoProfile } from './data/demo';
import { configurationError, isDemo, supabase, unwrap } from './lib/supabase';
import { translate, Word } from './i18n';
import { validateListing } from './lib/validation';
import { usePhoneSession } from './phone-session';
import { useSocialState } from './social-state';
import {webGuestMode} from './lib/web-guest';

type LocalState = { listings: Listing[]; profile: Profile; favorites: string[]; conversations: Conversation[]; messages: Message[]; reports: Report[]; blocked: string[]; imported: string[] };
const fresh = (): LocalState => ({ listings: demoListings, profile: demoProfile, favorites: [], conversations: [], messages: [], reports: [], blocked: [], imported: [] });
const localKey = 'birge-demo-v1';
const uid = () => `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const light = { bg: '#F5F3FA', surface: '#FFFFFF', text: '#241E43', muted: '#7D7691', line: '#E9E4F2', primary: '#393185', soft: '#EDE9F7', danger: '#B44B4B' };
const dark = { bg: '#141122', surface: '#221D34', text: '#F2EFFA', muted: '#B3AAC9', line: '#3B3353', primary: '#C7BBFF', soft: '#352B50', danger: '#F6A3A3' };

function useAppState(phone: ReturnType<typeof usePhoneSession>) {
  const social = useSocialState(phone.enabled ? phone.user?.id : undefined);
  const freshForUser = (): LocalState => ({ ...fresh(), profile: phone.user ? { ...demoProfile, id: phone.user.id, name: phone.user.name } : demoProfile });
  const persistenceKey = phone.enabled ? (phone.user ? `birge-phone-demo-v1-${phone.user.id}` : null) : localKey;
  const [local, setLocal] = useState<LocalState>(freshForUser);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(isDemo ? demoProfile : null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [language, setLanguage] = useState<Language>('kk');
  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(configurationError || '');
  const [toast, setToast] = useState('');
  const [recovery, setRecovery] = useState(false);
  const hydrated = useRef(false);
  const request = useRef(0);
  const t = (key: Word) => translate(language, key);
  const userId = isDemo ? (phone.enabled ? phone.user?.id : demoProfile.id) : session?.user.id;
  const authUserId = session?.user.id;
  const current = phone.enabled ? social.state : isDemo ? local : { listings, profile, favorites, conversations, messages, reports, blocked };

  useEffect(() => {
    (async () => {
      try {
        const prefs = await AsyncStorage.getItem('birge-preferences');
        if (prefs) { const p = JSON.parse(prefs); setLanguage(p.language === 'ru' ? 'ru' : 'kk'); setDarkMode(!!p.dark); }
        if (isDemo && persistenceKey) {
          const saved = await AsyncStorage.getItem(persistenceKey);
          if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed.listings) && parsed.profile?.id === (phone.user?.id || demoProfile.id)) setLocal({ ...freshForUser(), ...parsed }); }
        }
      } catch { setError('Сақталған деректерді оқу мүмкін болмады / Не удалось прочитать локальные данные'); }
      finally { hydrated.current = true; if (isDemo || configurationError) setLoading(false); }
    })();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data, error }) => { if (error) setError(error.message); setSession(data.session); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, value) => {
      setSession(value);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    const handleURL = async (url: string) => {
      if (Platform.OS === 'web') return;
      try {
        const params = new URLSearchParams(url.split('#')[1] || '');
        const access_token = params.get('access_token'), refresh_token = params.get('refresh_token');
        if (access_token && refresh_token) {
          unwrap(await supabase!.auth.setSession({ access_token, refresh_token }));
          if (params.get('type') === 'recovery') { setRecovery(true); router.push('/auth'); }
        }
      } catch (e) { setError((e as Error).message); }
    };
    Linking.getInitialURL().then(url => { if (url) void handleURL(url); });
    const listener = Linking.addEventListener('url', ({ url }) => void handleURL(url));
    return () => { subscription.unsubscribe(); listener.remove(); };
    // This provider is remounted for every verified identity; hydrate only its own cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isDemo && hydrated.current && persistenceKey) AsyncStorage.setItem(persistenceKey, JSON.stringify(local)).catch(() => setError('Деректер сақталмады / Данные не сохранены'));
  }, [local, persistenceKey]);
  useEffect(() => {
    if (hydrated.current) AsyncStorage.setItem('birge-preferences', JSON.stringify({ language, dark: darkMode })).catch(() => {});
  }, [language, darkMode]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); } }, [toast]);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const version = ++request.current;
    try {
      setError('');
      const newListings = unwrap(await supabase.from('listings').select('*').order('created_at', { ascending: false }).limit(1000)) as Listing[];
      if (version !== request.current) return;
      setListings(newListings);
      if (authUserId) {
        const [p, f, c, m, r, b] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', authUserId).single(),
          supabase.from('favorites').select('listing_id').eq('user_id', authUserId),
          supabase.from('conversations').select('*').order('created_at', { ascending: false }),
          supabase.from('messages').select('*').order('created_at', { ascending: true }).limit(1000),
          supabase.from('user_roles').select('role').eq('user_id', authUserId),
          supabase.from('blocks').select('blocked_id').eq('user_id', authUserId),
        ]);
        if (version !== request.current) return;
        setProfile(unwrap(p)); setFavorites(unwrap(f).map(x => x.listing_id));
        setConversations(unwrap(c)); setMessages(unwrap(m)); setBlocked(unwrap(b).map(x => x.blocked_id));
        const ownRoles = unwrap(r).map(x => x.role); setRoles(ownRoles);
        if (ownRoles.some(x => ['admin', 'moderator'].includes(x))) {
          const fetchedReports = unwrap(await supabase.from('reports').select('*').order('created_at', { ascending: false }));
          if (version === request.current) setReports(fetchedReports);
        } else setReports([]);
      } else {
        setProfile(null); setFavorites([]); setConversations([]); setMessages([]); setRoles([]); setReports([]); setBlocked([]);
      }
    } catch (e) { if (version === request.current) setError((e as Error).message); }
    finally { if (version === request.current) setLoading(false); }
  }, [authUserId]);
  useEffect(() => {
    // Do not retain another session's private data while the next request runs.
    if (!isDemo) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear private caches immediately when the authenticated identity changes.
      setProfile(null); setFavorites([]); setConversations([]); setMessages([]);
      setRoles([]); setReports([]); setBlocked([]);
    }
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!supabase || !authUserId) return;
    let timer: ReturnType<typeof setTimeout>;
    const channel = supabase.channel(`birge-${authUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => { clearTimeout(timer); timer = setTimeout(() => void refresh(), 150); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => { clearTimeout(timer); timer = setTimeout(() => void refresh(), 150); })
      .subscribe();
    return () => { clearTimeout(timer); void supabase!.removeChannel(channel); };
  }, [authUserId, refresh]);

  function requireUser(): string {
    // Event-time guard: backgrounded phones can suspend the session-expiry timer.
    if (!userId || (phone.enabled && (!phone.expiresAt || phone.expiresAt <= Date.now()))) { router.push('/auth'); throw new Error(t('needLogin')); }
    return userId;
  }
  async function toggleFavorite(id: string) {
    const user = requireUser(), exists = current.favorites.includes(id);
    if (phone.enabled) { await social.mutate('favorite',{id,enabled:!exists}); return; }
    if (isDemo) setLocal(s => ({ ...s, favorites: exists ? s.favorites.filter(x => x !== id) : [...s.favorites, id] }));
    else {
      if (exists) unwrap(await supabase!.from('favorites').delete().eq('user_id', user).eq('listing_id', id));
      else unwrap(await supabase!.from('favorites').insert({ user_id: user, listing_id: id }));
      setFavorites(f => exists ? f.filter(x => x !== id) : [...f, id]);
    }
  }
  async function saveListing(input: NewListing, id?: string) {
    const user = requireUser(), validation = validateListing(input);
    if (validation) throw new Error(validation);
    if (phone.enabled) return (await social.mutate<{id:string}>('listing',{...input,id})).id;
    if (isDemo) {
      const listing: Listing = { ...input, id: id || uid(), owner_id: user, status: 'open', moderation: input.module === 'study' ? 'pending' : 'approved', created_at: new Date().toISOString(), is_demo: true };
      setLocal(s => ({ ...s, listings: id ? s.listings.map(x => x.id === id ? { ...listing, created_at: x.created_at } : x) : [listing, ...s.listings] }));
      return listing.id;
    }
    // Only editable columns are sent; lifecycle and moderation are owned by database functions.
    const payload = { ...input, title: input.title.trim(), description: input.description.trim() };
    const { module: immutableModule, ...editablePayload } = payload;
    const result = id
      ? await supabase!.from('listings').update(editablePayload).eq('id', id).eq('owner_id', user).select('id').single()
      : await supabase!.from('listings').insert({ ...payload, owner_id: user }).select('id').single();
    const row = unwrap(result); await refresh(); return row.id as string;
  }
  async function closeListing(id: string) {
    requireUser();
    if (phone.enabled) { await social.mutate('close',{id}); return; }
    if (isDemo) setLocal(s => ({ ...s, listings: s.listings.map(x => x.id === id && x.owner_id === userId ? { ...x, status: 'cancelled' } : x) }));
    else { unwrap(await supabase!.rpc('close_listing', { target: id })); await refresh(); }
  }
  async function startConversation(listing: Listing) {
    const user = requireUser();
    if (listing.owner_id === user) throw new Error('Өз жарияланымыңа жауап бере алмайсың / Это ваша публикация');
    if (phone.enabled) { const result=await social.mutate<{id:string}>('conversation',{listing_id:listing.id}); router.push({pathname:'/messages',params:{conversation:result.id}}); return; }
    let id: string;
    if (isDemo) {
      const existing = local.conversations.find(c => c.listing_id === listing.id && c.responder_id === user);
      if (existing) id = existing.id;
      else {
        id = uid();
        setLocal(s => ({ ...s, conversations: [{ id, listing_id: listing.id, owner_id: listing.owner_id, responder_id: user, owner_confirmed: false, responder_confirmed: false, accepted: false, created_at: new Date().toISOString() }, ...s.conversations] }));
      }
    } else {
      id = unwrap(await supabase!.rpc('start_conversation', { target: listing.id }));
      await refresh();
    }
    router.push({ pathname: '/messages', params: { conversation: id } });
  }
  async function sendMessage(conversationId: string, text: string, mediaId?: string, audio?:{waveform?:number[];duration_ms?:number},preview?:Pick<Message,'kind'|'media_url'>) {
    const user = requireUser(), body = text.trim();
    if (phone.enabled) { await social.sendMessage({conversation_id:conversationId,body,media_id:mediaId,...audio},{...preview,...audio}); return; }
    if (!body || body.length > 2000) throw new Error('Хабарлама / Сообщение: 1–2000');
    if (isDemo) setLocal(s => ({ ...s, messages: [...s.messages, { id: uid(), conversation_id: conversationId, sender_id: user, body, created_at: new Date().toISOString() }] }));
    else { unwrap(await supabase!.from('messages').insert({ conversation_id: conversationId, sender_id: user, body })); await refresh(); }
  }
  async function transaction(id: string, action: 'accept' | 'confirm') {
    requireUser();
    if (phone.enabled) { await social.mutate('transaction',{id,action}); return; }
    if (isDemo) {
      // A demo user cannot act for the other participant or fabricate bilateral completion.
      if (action === 'accept') throw new Error(t('demoChat'));
      setLocal(s => ({ ...s, conversations: s.conversations.map(c => c.id === id ? { ...c, responder_confirmed: true } : c) }));
    } else { unwrap(await supabase!.rpc(action === 'accept' ? 'accept_offer' : 'confirm_completion', { target: id })); await refresh(); }
  }
  async function reportListing(id: string, reason: string) {
    const user = requireUser();
    if (reason.trim().length < 5) throw new Error('Кемінде 5 таңба / Минимум 5 символов');
    if (phone.enabled) { await social.mutate('report',{id,reason}); setToast(t('reportSent')); return; }
    if (isDemo) setLocal(s => ({ ...s, reports: [...s.reports, { id: uid(), listing_id: id, reason: reason.trim(), status: 'open', created_at: new Date().toISOString() }] }));
    else unwrap(await supabase!.from('reports').insert({ reporter_id: user, listing_id: id, reason: reason.trim() }));
    setToast(t('reportSent'));
  }
  async function blockUser(id: string) {
    const user = requireUser();
    if (phone.enabled) { await social.mutate('block',{target:id}); setToast(t('blocked')); return; }
    if (isDemo) setLocal(s => ({ ...s, blocked: [...new Set([...s.blocked, id])] }));
    else { unwrap(await supabase!.from('blocks').insert({ user_id: user, blocked_id: id })); await refresh(); }
    setToast(t('blocked'));
  }
  async function updateProfile(name: string, changes: Partial<Profile> = {}) {
    const user = requireUser();
    if (name.trim().length < 2 || name.trim().length > 80) throw new Error('Аты / Имя: 2–80');
    if (phone.enabled) { await social.mutate('profile',{...social.state.profile,...changes,name,language}); setToast(t('saved')); return; }
    if (isDemo) { if (phone.enabled) await phone.updateName(name.trim()); setLocal(s => ({ ...s, profile: { ...s.profile, name: name.trim(), language } })); }
    else { unwrap(await supabase!.from('profiles').update({ name: name.trim(), language }).eq('id', user)); await refresh(); }
    setToast(t('saved'));
  }
  async function moderate(id: string, decision: 'approved' | 'rejected') {
    unwrap(await supabase!.rpc('moderate_listing', { target: id, decision })); await refresh();
  }
  async function resetDemo() { setLocal(freshForUser()); setToast(t('saved')); }
  async function signOut() { if (phone.enabled) await phone.signOut(); else unwrap(await supabase!.auth.signOut()); setRecovery(false); router.replace('/'); }

  async function startDirect(target: string) { requireUser(); const result=await social.mutate<{id:string}>('conversation',{target});router.push({pathname:'/messages',params:{conversation:result.id}}); }
  async function createGroup(title:string,members:string[]) { requireUser(); const result=await social.mutate<{id:string}>('conversation',{kind:'group',title,members});router.push({pathname:'/messages',params:{conversation:result.id}}); }
  async function follow(target:string,enabled:boolean) { requireUser();await social.mutate('follow',{target,enabled}); }

  return {
    ...current, listings: current.listings.filter(x => !current.blocked.includes(x.owner_id)), isDemo: isDemo && !phone.enabled, userId, session,
    profiles: social.state.profiles, startDirect, createGroup, follow, markConversationRead: social.markRead,
    retryMessage:social.retryMessage, realtimeConnection:social.connection, notificationCount:social.state.notification_count||0,
    legacyListings: phone.enabled ? local.listings.filter(l=>l.owner_id===userId&&!local.imported.includes(l.id)) : [],
    markLegacyPublished: (id:string)=>setLocal(s=>({...s,imported:[...new Set([...s.imported,id])]})),
    language, setLanguage, darkMode, setDarkMode, colors: darkMode ? dark : light, t,
    loading: phone.enabled ? social.loading : loading, error: error || social.error || phone.error, setError: (value: string) => { setError(value);social.setError(value); phone.clearError(); }, toast, setToast, recovery, setRecovery, refresh: phone.enabled ? social.refresh : refresh, roles,
    phoneAuthEnabled: phone.enabled, phoneUser: phone.user, acceptPhoneSession: phone.accept, refreshPhoneSession: phone.restore,
    phoneServerUrl: phone.serverUrl, changePhoneServer: phone.changeServer,
    toggleFavorite, saveListing, closeListing, startConversation, sendMessage, transaction,
    reportListing, blockUser, updateProfile, moderate, resetDemo, signOut, requireUser,
  };
}
const AppContext = createContext<ReturnType<typeof useAppState> | null>(null);
function IdentityProvider({ children, phone }: { children: React.ReactNode; phone: ReturnType<typeof usePhoneSession> }) { return <AppContext.Provider value={useAppState(phone)}>{children}</AppContext.Provider>; }
export function AppProvider({ children }: { children: React.ReactNode }) {
  const phone = usePhoneSession();
  if (phone.loading) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: '#F7F8F4' }}><ActivityIndicator size="large" color="#216D5C" accessibilityLabel="Birge" /></View>;
  if(webGuestMode&&phone.enabled&&!phone.user)return <View style={{flex:1,justifyContent:'center',alignItems:'center',padding:24,gap:20,backgroundColor:'#F5F3FA'}}>
    <Text style={{fontSize:30,fontWeight:'700',color:'#393185'}}>Birge</Text>
    <Text style={{fontSize:16,textAlign:'center',color:'#241E43'}}>Қызметтерді ашу мүмкін болмады. Интернетті тексеріп, қайта көріңіз.</Text>
    {!!phone.error&&<Text style={{fontSize:12,textAlign:'center',color:'#7D7691'}}>{phone.error}</Text>}
    <Pressable accessibilityRole="button" onPress={()=>void phone.restore()} style={{padding:16,borderRadius:12,backgroundColor:'#393185'}}><Text style={{color:'#FFFFFF',fontWeight:'700'}}>Қайта ашу</Text></Pressable>
  </View>;
  return <IdentityProvider key={phone.user?.id || 'guest'} phone={phone}>{children}</IdentityProvider>;
}
export function useApp() { const value = useContext(AppContext); if (!value) throw new Error('AppProvider missing'); return value; }
