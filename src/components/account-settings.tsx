import React, { useCallback, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Modal, Platform, Pressable, Switch, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useApp } from '../store';
import { accountDevices, AccountDevice, revokeDevice, revokeOtherDevices } from '../lib/account-api';
import { defaultNotificationPreferences, notificationInbox, NotificationPreferences, saveNotificationPreferences } from '../lib/notification-api';
import { notificationPermission, requestNotificationPermission } from '../lib/live-notifications';
import { Button, Empty, Icon, Notice, Row, Txt, useAction } from './ui';
import { PasswordSettings } from './password-form';
import { ProfileIdentity } from './profile-identity';
import { TelegramBindingSettings } from './telegram-code-form';
import { webGuestMode } from '../lib/web-guest';

type Permission = 'granted' | 'denied' | 'undetermined' | 'unsupported';
function when(value: string, kk: boolean) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(kk ? 'kk-KZ' : 'ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}

export function AccountSettings() {
  const app = useApp(), { colors, setError } = app, kk = app.language === 'kk', { busy, run } = useAction();
  const [devices, setDevices] = useState<AccountDevice[]>([]), [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultNotificationPreferences), [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [permission, setPermission] = useState<Permission>('undetermined');
  const [confirm, setConfirm] = useState<AccountDevice | 'others' | null>(null);
  const canLoad = app.phoneAuthEnabled && !!app.userId;
  const load = useCallback(async () => {
    if (!canLoad) return;
    const results = await Promise.allSettled([
      ...(!webGuestMode ? [accountDevices().then(result => setDevices(result.devices))] : []),
      notificationInbox().then(result => { setPreferences(result.preferences); setPreferencesLoaded(true); }),
      notificationPermission().then(setPermission),
    ]);
    setLoading(false);
    const failed = results.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }, [canLoad]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void load().catch(error => setError(error.message));
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active' || Platform.OS === 'web') return;
      void notificationPermission().then(value => { if (active) setPermission(value); }).catch(error => { if (active) setError(error.message); });
    });
    return () => { active = false; subscription.remove(); };
  }, [load, setError]));

  async function setPreference(key: keyof NotificationPreferences, value: boolean) {
    const next = { ...preferences, [key]: value };
    const result = await saveNotificationPreferences(next);
    setPreferences(result.preferences || next);
  }
  async function revoke() {
    if (!confirm) return;
    if (confirm === 'others') await revokeOtherDevices();
    else await revokeDevice(confirm.id);
    setConfirm(null);
    await load();
    app.setToast(kk ? 'Сессия аяқталды' : 'Сеанс завершён');
  }
  if (!app.userId) return webGuestMode ? <Empty title={app.t('loading')}><Button onPress={() => void app.refresh()}>{app.t('retry')}</Button></Empty> : <Empty title={app.t('needLogin')}><Button onPress={() => router.push('/auth')}>{app.t('login')}</Button></Empty>;

  return <View style={{ gap: 20, maxWidth: 800, width: '100%', alignSelf: 'center' }}>
    <Row><Button secondary small icon="back" onPress={() => router.push('/profile')}>{app.t('back')}</Button><View style={{ flex: 1 }}/>{app.phoneAuthEnabled && <Button secondary small icon="bell" onPress={() => router.push('/notifications')}>{kk ? 'Хабарландырулар' : 'Уведомления'}</Button>}</Row>
    <View style={{ gap: 9, backgroundColor: '#30265E', borderRadius: 25, padding: 23 }}><Txt bold size={10} color="#D2AE6D" style={{ letterSpacing: 3 }}>{webGuestMode ? 'BIRGE / GUEST' : 'BIRGE / ACCOUNT'}</Txt><Txt bold size={28} color="#FFFFFF">{webGuestMode ? (kk ? 'Баптаулар' : 'Настройки') : (kk ? 'Аккаунт баптаулары' : 'Настройки аккаунта')}</Txt><Txt size={12} color="#DCD5ED">{webGuestMode ? (kk ? 'Өзіңе ыңғайлы көрініс пен хабарландырулар.' : 'Удобное оформление и уведомления.') : (kk ? 'Қауіпсіздік, құрылғылар және өзіңе ыңғайлы хабарландырулар.' : 'Безопасность, устройства и удобные вам уведомления.')}</Txt></View>
    <View style={{ gap: 14, padding: 20, backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.line }}>
      <Row><Icon name="user" color={colors.primary}/><Txt bold size={19}>{webGuestMode ? (kk ? 'Қонақ профилі' : 'Гостевой профиль') : 'Аккаунт'}</Txt></Row>
      <Txt bold size={20}>{app.profile?.name || 'Birge'}</Txt>
      <ProfileIdentity handle={app.phoneUser?.handle || app.profile?.handle}/>
      {webGuestMode && <Notice>{kk ? 'Қызметтерді тіркелусіз қолданасың. Қонақ сессиясы осы браузер қойындысында сақталады. Сессия жойылса, осы профильге қайта кіру мүмкін болмайды.' : 'Пользуйтесь сервисами без регистрации. Гостевой сеанс хранится в этой вкладке браузера. После удаления сеанса вернуться в этот профиль не получится.'}</Notice>}
      {app.phoneAuthEnabled && !webGuestMode && <Txt size={12} color={colors.muted}>{kk ? 'Бұл бірегей @аты. Өзгерту үшін «Логин мен құпиясөз» бөлімін аш. Келесі жолы жаңа логинмен кіресің.' : 'Это уникальное @имя. Измените его в разделе «Логин и пароль». В следующий раз входите с новым логином.'}</Txt>}
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}><Txt>{app.t('language')}</Txt><Button secondary small onPress={() => app.setLanguage(kk ? 'ru' : 'kk')}>{kk ? 'Қазақша → Русский' : 'Русский → Қазақша'}</Button></Row>
      <Row style={{ justifyContent: 'space-between' }}><Txt>{app.t('dark')}</Txt><Switch accessibilityLabel={app.t('dark')} value={app.darkMode} onValueChange={app.setDarkMode} thumbColor={app.darkMode ? '#D2AE6D' : '#FFFFFF'} trackColor={{ false: colors.line, true: '#393185' }}/></Row>
      {app.phoneAuthEnabled && !webGuestMode && <><TelegramBindingSettings/><PasswordSettings/></>}
    </View>
    {app.phoneAuthEnabled && <>
      <View style={{ gap: 15, padding: 20, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
        <Row><Icon name="bell" color={colors.primary}/><Txt bold size={19}>{kk ? 'Хабарландырулар' : 'Уведомления'}</Txt></Row>
        {Platform.OS !== 'web' && permission !== 'unsupported' && <View style={{ gap: 10 }}><Txt size={12} color={colors.muted}>{permission === 'granted' ? (kk ? 'Телефонға хабарландыру жіберуге рұқсат берілген.' : 'Уведомления на телефоне разрешены.') : permission === 'denied' ? (kk ? 'Телефон баптауларында Birge хабарландыруларын қос.' : 'Включите уведомления Birge в настройках телефона.') : (kk ? 'Жаңа хабарламаларды телефоннан бірден көру үшін рұқсат бер.' : 'Разрешите уведомления, чтобы сразу видеть новые сообщения на телефоне.')}</Txt>{permission === 'denied' ? <Button secondary small icon="settings" loading={busy} onPress={() => void run(() => Linking.openSettings())}>{kk ? 'Телефон баптауларын ашу' : 'Открыть настройки телефона'}</Button> : permission === 'undetermined' && <Button secondary small icon="bell" loading={busy} onPress={() => void run(async () => { setPermission(await requestNotificationPermission()); })}>{kk ? 'Хабарландыруға рұқсат беру' : 'Разрешить уведомления'}</Button>}</View>}
        {Platform.OS === 'android' && permission !== 'unsupported' && <Txt size={11} color={colors.muted}>{kk ? 'Фондық хабарландыру үшін Birge байланысының тұрақты белгісі көрінеді. Қуат үнемдеу режимі байланысты үзуі мүмкін. Қолданбаны мәжбүрлеп тоқтатқаннан немесе телефон қайта қосылғаннан кейін Birge-ні қайта аш.' : 'Для фоновых уведомлений виден постоянный значок соединения Birge. Энергосбережение может прервать связь. После принудительной остановки или перезагрузки телефона откройте Birge снова.'}</Txt>}
        {(webGuestMode ? ['messages', 'follows'] as const : ['messages', 'follows', 'logins'] as const).map((key, index) => <Row key={key} style={{ justifyContent: 'space-between', gap: 14 }}><View style={{ flex: 1, gap: 3 }}><Txt bold size={14}>{(kk ? ['Жаңа хабарламалар', 'Жаңа жазылушылар', 'Аккаунтқа кіру'] : ['Новые сообщения', 'Новые подписчики', 'Входы в аккаунт'])[index]}</Txt><Txt size={11} color={colors.muted}>{(kk ? ['Жеке және топтық чаттар', 'Саған біреу жазылғанда', 'Басқа құрылғыдан кіргенде'] : ['Личные и групповые чаты', 'Когда на вас подписались', 'Когда вошли с другого устройства'])[index]}</Txt></View><Switch accessibilityLabel={(kk ? ['Жаңа хабарламалар', 'Жаңа жазылушылар', 'Аккаунтқа кіру'] : ['Новые сообщения', 'Новые подписчики', 'Входы в аккаунт'])[index]} disabled={busy || !preferencesLoaded} value={preferences[key]} onValueChange={value => void run(() => setPreference(key, value))} thumbColor={preferences[key] ? '#D2AE6D' : '#FFFFFF'} trackColor={{ false: colors.line, true: '#393185' }}/></Row>)}
        <Button secondary small onPress={() => router.push('/notifications')}>{kk ? 'Барлық хабарландыруды ашу' : 'Открыть все уведомления'}</Button>
      </View>
      {!webGuestMode && <View style={{ gap: 14, padding: 20, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
        <Row style={{ justifyContent: 'space-between' }}><Row><Icon name="shield" color={colors.primary}/><Txt bold size={19}>{kk ? 'Құрылғылар' : 'Устройства'}</Txt></Row><Button secondary small icon="refresh" loading={busy} onPress={() => void run(load)}>{kk ? 'Жаңарту' : 'Обновить'}</Button></Row>
        <Txt size={12} color={colors.muted}>{kk ? 'Аккаунтың ашық тұрған құрылғылар. Әр құрылғының сессиясын осы жерден жаба аласың.' : 'Устройства с открытым аккаунтом. Здесь можно завершить отдельный сеанс.'}</Txt>
        {loading ? <ActivityIndicator color={colors.primary}/> : !devices.length ? <Notice>{kk ? 'Құрылғылар тізімі жүктелмеді. Қайта жаңарт.' : 'Не удалось загрузить устройства. Нажмите «Обновить».'}</Notice> : devices.map(device => <View key={device.id} style={{ gap: 10, padding: 14, borderRadius: 17, backgroundColor: colors.bg, borderWidth: 1, borderColor: device.current ? '#D2AE6D88' : colors.line }}>
          <Row style={{ alignItems: 'flex-start' }}><View style={{ width: 44, minHeight: 44, padding: 5, borderRadius: 13, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}><Txt size={9} bold color={colors.primary}>{device.platform?.toUpperCase() || 'BIRGE'}</Txt></View><View style={{ flex: 1, gap: 4 }}><Txt bold size={14}>{device.name}</Txt>{device.current && <Txt size={11} color={colors.primary} bold>{kk ? 'Осы құрылғы' : 'Это устройство'}</Txt>}</View></Row>
          <Txt size={11} color={colors.muted}>{kk ? 'Кірген уақыты' : 'Вход'} · {when(device.created_at, kk)}</Txt>
          <Txt size={11} color={colors.muted}>{kk ? 'Соңғы белсенділік' : 'Последняя активность'} · {when(device.last_seen_at, kk)}</Txt>
          <Txt size={11} color={colors.muted}>{kk ? 'Кіру тәсілі' : 'Способ входа'} · {['password','credentials'].includes(device.method) ? (kk ? 'Құпиясөз' : 'Пароль') : device.method === 'telegram' ? (kk ? 'Telegram коды' : 'Код Telegram') : device.method === 'otp' ? (kk ? 'WhatsApp коды' : 'Код WhatsApp') : device.method === 'recovery' ? (kk ? 'Қалпына келтіру коды' : 'Код восстановления') : (kk ? 'Бұрынғы сессия' : 'Прежний сеанс')}</Txt>
          {!device.current && <Button secondary small danger icon="logout" disabled={busy} onPress={() => setConfirm(device)}>{kk ? 'Бұл сессияны жабу' : 'Завершить этот сеанс'}</Button>}
        </View>)}
        {!!devices.some(device => !device.current) && <Button secondary danger icon="logout" disabled={busy} onPress={() => setConfirm('others')}>{kk ? 'Басқа құрылғылардан шығу' : 'Выйти на других устройствах'}</Button>}
      </View>}
    </>}
    {!webGuestMode && <Button secondary icon="logout" loading={busy} onPress={() => void run(app.signOut)}>{app.t('logout')}</Button>}
    <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => { if (!busy) setConfirm(null); }}>
      <View style={{ flex: 1, backgroundColor: '#141122B3', alignItems: 'center', justifyContent: 'center', padding: 22 }}><View style={{ width: '100%', maxWidth: 430, padding: 24, gap: 17, backgroundColor: colors.surface, borderRadius: 24 }}><Txt bold size={22}>{kk ? 'Сессияны жабу' : 'Завершить сеанс'}</Txt><Txt>{confirm === 'others' ? (kk ? 'Басқа құрылғылардағы аккаунт жабылады. Осы құрылғыда кіріп тұрасың.' : 'На других устройствах потребуется войти заново. На этом устройстве аккаунт останется открыт.') : (kk ? `${confirm?.name || ''} құрылғысынан қайта кіру қажет болады.` : `На устройстве ${confirm?.name || ''} потребуется войти заново.`)}</Txt><Button danger loading={busy} icon="logout" onPress={() => void run(revoke)}>{kk ? 'Сессияны жабу' : 'Завершить сеанс'}</Button><Pressable accessibilityRole="button" disabled={busy} onPress={() => setConfirm(null)} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Txt bold color={colors.muted}>{app.t('cancel')}</Txt></Pressable></View></View>
    </Modal>
  </View>;
}
