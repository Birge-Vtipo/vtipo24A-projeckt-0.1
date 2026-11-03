import React, { useState } from 'react';
import { View } from 'react-native';
import { Switch } from 'react-native-paper';
import { router } from 'expo-router';
import { useApp } from '../src/store';
import { Button, Empty, Field, Icon, Notice, Row, Txt, useAction } from '../src/components/ui';
import { ListingCard } from '../src/components/listing-card';
import { supabase, unwrap } from '../src/lib/supabase';
import { SocialProfile } from '../src/components/social-profile';
export default function Profile() {
  const app = useApp();
  if(app.phoneAuthEnabled) return <SocialProfile/>;
  return <ProfileForm key={`${app.userId || 'guest'}:${app.profile?.name || ''}`} />;
}
function ProfileForm() {
  const app = useApp(), { t, colors } = app; const [name, setName] = useState(app.profile?.name || '');
  const [deleteOpen, setDeleteOpen] = useState(false), [confirmation, setConfirmation] = useState('');
  const { busy, run } = useAction();
  if (!app.userId) return <Empty title={t('needLogin')} icon="user"><Button onPress={() => router.push('/auth')}>{app.phoneAuthEnabled ? (app.language === 'kk' ? 'Кіру / Тіркелу' : 'Войти / Зарегистрироваться') : t('login')}</Button></Empty>;
  const mine = app.listings.filter(l => l.owner_id === app.userId);
  return <View style={{ gap: 24, maxWidth: 850, width: '100%', alignSelf: 'center' }}>
    <Row><View style={{ width: 68, height: 68, backgroundColor: colors.soft, borderRadius: 34, alignItems: 'center', justifyContent: 'center' }}><Icon name="user" size={30} color={colors.primary} /></View><View style={{ flex: 1 }}><Txt bold size={26}>{app.profile?.name || t('profile')}</Txt><Txt color={colors.muted}>{app.phoneUser?.phone || (app.isDemo ? t('demoProfile') : app.session?.user.email)}</Txt></View></Row>
    {app.phoneUser && <Notice>{app.language === 'kk' ? 'Аккаунтың бұлтта сақталады. Логин мен құпиясөз арқылы басқа құрылғыдан да кіре аласың.' : 'Аккаунт хранится в облаке. На другом устройстве можно войти с логином и паролем.'}</Notice>}
    {app.isDemo && <Notice>{t('demoNote')}</Notice>}
    <View style={{ backgroundColor: colors.surface, padding: 24, borderRadius: 20, gap: 18 }}>
      <Txt bold size={20}>{t('settings')}</Txt><Field label={t('name')} value={name} onChangeText={setName} maxLength={80} />
      <Row style={{ justifyContent: 'space-between' }}><Txt>{t('language')}</Txt><Button secondary small onPress={() => app.setLanguage(app.language === 'kk' ? 'ru' : 'kk')}>{app.language === 'kk' ? 'Қазақша → Русский' : 'Русский → Қазақша'}</Button></Row>
      <Row style={{ justifyContent: 'space-between' }}><Txt>{t('dark')}</Txt><Switch value={app.darkMode} onValueChange={app.setDarkMode} color={colors.primary} accessibilityLabel={t('dark')} /></Row>
      <Button loading={busy} onPress={() => void run(() => app.updateProfile(name))}>{t('save')}</Button>
    </View>
    <Row style={{ flexWrap: 'wrap' }}><Button secondary icon="heart" onPress={() => router.push('/search?favorites=1')}>{t('favorites')} · {app.favorites.length}</Button>{app.roles.some(x => ['admin', 'moderator'].includes(x)) && <Button secondary icon="shield" onPress={() => router.push('/admin')}>{t('admin')}</Button>}{app.isDemo ? <Button secondary icon="refresh" onPress={() => void run(app.resetDemo)}>{t('demoReset')}</Button> : <Button secondary icon="logout" loading={busy} onPress={() => void run(app.signOut)}>{t('logout')}</Button>}</Row>
    <Txt bold size={22}>{t('myListings')} · {mine.length}</Txt>
    {app.phoneUser && <Button secondary icon="logout" loading={busy} onPress={() => void run(app.signOut)}>{t('logout')}</Button>}
    {mine.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>{mine.map(item => <View key={item.id} style={{ width: '100%', maxWidth: 360 }}><ListingCard item={item} /></View>)}</View> : <Empty title={t('empty')}><Button icon="plus" onPress={() => router.push('/create')}>{t('create')}</Button></Empty>}
    {!app.isDemo && <><Button secondary danger icon="trash" onPress={() => setDeleteOpen(!deleteOpen)}>{t('deleteAccount')}</Button>{deleteOpen && <View style={{ gap: 12 }}><Notice error>{t('deleteWarning')}</Notice><Field label="DELETE" value={confirmation} onChangeText={setConfirmation} /><Button danger secondary disabled={confirmation !== 'DELETE'} loading={busy} onPress={() => void run(async () => { unwrap(await supabase!.rpc('request_account_deletion')); app.setToast(app.language === 'kk' ? 'Жою сұрауы әкімшіге жіберілді' : 'Запрос на удаление отправлен администратору'); setDeleteOpen(false); })}>{app.language === 'kk' ? 'Жою сұрауын жіберу' : 'Отправить запрос на удаление'}</Button></View>}</>}
  </View>;
}
