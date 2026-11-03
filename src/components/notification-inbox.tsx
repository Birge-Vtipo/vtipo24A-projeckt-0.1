import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useApp } from '../store';
import { mediaUri } from '../lib/social-api';
import { BirgeNotification, markNotificationsRead, notificationInbox, NotificationInbox } from '../lib/notification-api';
import { Button, Empty, Icon, Row, Txt, useAction } from './ui';

function dateLabel(value: string, kk: boolean) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(kk ? 'kk-KZ' : 'ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
}

export function NotificationInboxScreen() {
  const app = useApp(), { colors, setError } = app, kk = app.language === 'kk', { busy, run } = useAction();
  const [inbox, setInbox] = useState<NotificationInbox | null>(null), [loading, setLoading] = useState(true);
  const focused = useRef(false), requestId = useRef(0);
  const canLoad = !!app.userId && app.phoneAuthEnabled;
  const load = useCallback(async () => {
    if (!canLoad) return;
    const id = ++requestId.current;
    try { const next = await notificationInbox(); if (focused.current && id === requestId.current) setInbox(next); }
    finally { if (focused.current && id === requestId.current) setLoading(false); }
  }, [canLoad]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    void load().catch(error => setError(error.message));
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void load().catch(() => {}); });
    return () => { focused.current = false; requestId.current++; subscription.remove(); };
  }, [load, setError]));
  useEffect(() => {
    if (!focused.current || AppState.currentState !== 'active') return;
    // Real-time social snapshots also carry follow/login changes through this mounted screen.
    const timer = setTimeout(() => { void load().catch(() => {}); }, 200);
    return () => clearTimeout(timer);
  }, [app.messages, app.profiles, load]);

  async function mark(item?: BirgeNotification) {
    await markNotificationsRead(item ? [item.id] : undefined);
    const now = new Date().toISOString();
    setInbox(previous => previous ? { ...previous, unread_count: item ? Math.max(0, previous.unread_count - (item.read_at ? 0 : 1)) : 0, notifications: previous.notifications.map(n => (!item || n.id === item.id) && !n.read_at ? { ...n, read_at: now } : n) } : previous);
  }
  async function open(item: BirgeNotification) {
    if (!item.read_at) await mark(item);
    if (item.type === 'message' && item.conversation_id) router.push({ pathname: '/messages', params: { conversation: item.conversation_id } });
    else if (item.type === 'follow' && item.actor_id) router.push(`/user/${item.actor_id}`);
    else if (item.type === 'login') router.push('/settings');
  }
  if (!app.userId) return <Empty title={app.t('needLogin')}><Button onPress={() => router.push('/auth')}>{app.t('login')}</Button></Empty>;
  if (!app.phoneAuthEnabled) return <Empty icon="bell" title={kk ? 'Хабарландырулар' : 'Уведомления'} subtitle={kk ? 'Бұл бөлім Birge аккаунтына кіргенде ашылады.' : 'Этот раздел доступен для аккаунта Birge.'}/>;

  return <View style={{ gap: 18, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
    <Row><Button secondary small icon="back" onPress={() => router.push('/profile')}>{app.t('back')}</Button><View style={{ flex: 1 }}/><Button secondary small icon="settings" onPress={() => router.push('/settings')}>{kk ? 'Баптау' : 'Настройки'}</Button></Row>
    <View style={{ gap: 9, padding: 22, borderRadius: 24, backgroundColor: '#30265E' }}>
      <Txt bold size={10} color="#D2AE6D" style={{ letterSpacing: 3 }}>BIRGE / PULSE</Txt>
      <Row style={{ justifyContent: 'space-between' }}><Txt bold size={25} color="#FFFFFF" style={{ flex: 1 }}>{kk ? 'Хабарландырулар' : 'Уведомления'}</Txt><View style={{ minWidth: 35, height: 35, paddingHorizontal: 8, borderRadius: 12, backgroundColor: '#D2AE6D', alignItems: 'center', justifyContent: 'center' }}><Txt color="#30265E" bold>{inbox?.unread_count || 0}</Txt></View></Row>
      <Txt size={12} color="#DCD5ED">{kk ? 'Жаңа хабарламалар, жазылушылар және аккаунтқа кіру.' : 'Сообщения, подписчики и входы в аккаунт.'}</Txt>
    </View>
    <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}><Button secondary small icon="refresh" loading={busy} onPress={() => void run(load)}>{app.t('retry')}</Button><Button secondary small icon="checks" disabled={!inbox?.unread_count} loading={busy} onPress={() => void run(() => mark())}>{kk ? 'Бәрін оқылды деп белгілеу' : 'Прочитать все'}</Button></Row>
    {loading ? <ActivityIndicator size="large" color={colors.primary}/> : !inbox?.notifications.length ? <Empty icon="bell" title={kk ? 'Әзірге жаңалық жоқ' : 'Пока ничего нового'} subtitle={kk ? 'Жаңа әрекеттер осы жерде көрінеді.' : 'Новые события появятся здесь.'}/> : inbox.notifications.map(item => {
      const name = item.actor_name || 'Birge', uri = mediaUri(item.actor_avatar_url);
      const title = item.type === 'follow' ? (kk ? `${name} саған жазылды` : `${name} подписался на вас`) : item.type === 'login' ? (kk ? 'Аккаунтқа жаңа кіру' : 'Новый вход в аккаунт') : (kk ? `${name} хабарлама жіберді` : `${name} отправил сообщение`);
      const detail = item.type === 'login' ? (item.device_label || (kk ? 'Құрылғыларды баптауда тексеруге болады.' : 'Проверьте устройства в настройках.')) : item.preview || (item.type === 'message' ? (item.message_kind === 'audio' ? (kk ? 'Дауыстық хабарлама' : 'Голосовое сообщение') : item.message_kind === 'video' ? 'Видео' : item.message_kind === 'image' ? 'Фото' : (kk ? 'Чатты ашу' : 'Открыть чат')) : (kk ? 'Профильді ашу' : 'Открыть профиль'));
      return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${title}. ${detail}`} disabled={busy} onPress={() => void run(() => open(item))} style={({ pressed }) => ({ flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 16, borderRadius: 21, backgroundColor: colors.surface, borderWidth: 1, borderColor: item.read_at ? colors.line : '#D2AE6D88', opacity: pressed ? .7 : 1 })}>
        {uri && item.type !== 'login' ? <Image source={{ uri }} style={{ width: 42, height: 42, borderRadius: 15 }}/> : <View style={{ width: 42, height: 42, borderRadius: 15, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}><Icon name={item.type === 'login' ? 'shield' : item.type === 'follow' ? 'users' : 'messages'} color={colors.primary}/></View>}
        <View style={{ flex: 1, gap: 5 }}><Txt bold size={14}>{title}</Txt><Txt color={colors.muted} size={12} lines={3}>{detail}</Txt><Txt color={colors.muted} size={10}>{dateLabel(item.created_at, kk)}</Txt></View>
        {!item.read_at && <View accessibilityLabel={kk ? 'Жаңа' : 'Новое'} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#D2AE6D', marginTop: 5 }}/>}
      </Pressable>;
    })}
  </View>;
}
