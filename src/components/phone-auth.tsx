import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '../store';
import { PhoneAuthError } from '../lib/phone-auth';
import { CredentialSession, loginCredentials, recoverCredentials, registerCredentials } from '../lib/credentials-api';
import { isValidLoginAlias, isValidRecoveryCode, isValidUsername, normalizeLogin, usernameHint } from '../lib/credentials-policy';
import { isValidLoginPassword, isValidNewPassword, passwordPolicyHint } from '../lib/password-policy';
import { Button, Chip, Field, Icon, Notice, Row, Txt } from './ui';
import { RecoveryCode } from './recovery-code';
import { TelegramCodeForm } from './telegram-code-form';

type Mode = 'login' | 'register' | 'recover';
export function PhoneAuth() {
  const app = useApp(), kk = app.language === 'kk', [method, setMethod] = useState<'phone' | 'credentials'>('phone'), [locked, setLocked] = useState(false);
  if (app.phoneUser) return <View style={{ gap: 18 }}><Notice>{kk ? 'Аккаунтың ашық.' : 'Вы уже вошли в аккаунт.'}</Notice><Button onPress={() => router.replace('/profile')}>{app.t('profile')}</Button></View>;
  return <View style={{ width: '100%', maxWidth: 460, alignSelf: 'center', gap: 16 }}>
    <Row style={{ flexWrap: 'wrap' }}><Button secondary small disabled={locked} style={{ borderWidth: 1, borderColor: method === 'phone' ? app.colors.primary : app.colors.line }} onPress={() => setMethod('phone')}>Telegram {kk ? 'коды' : 'код'}</Button><Button secondary small disabled={locked} style={{ borderWidth: 1, borderColor: method === 'credentials' ? app.colors.primary : app.colors.line }} onPress={() => setMethod('credentials')}>@{kk ? 'логин / құпиясөз' : 'логин / пароль'}</Button></Row>
    {method === 'phone' ? <View style={{ backgroundColor: app.colors.surface, borderRadius: 24, padding: 24, gap: 19, borderWidth: 1, borderColor: app.colors.line }}><TelegramCodeForm onBusyChange={setLocked} onCredential={() => setMethod('credentials')}/></View> : <CredentialAuth onLockedChange={setLocked}/>}
  </View>;
}
function CredentialAuth({ onLockedChange }: { onLockedChange: (locked: boolean) => void }) {
  const app = useApp(), { colors } = app, kk = app.language === 'kk';
  const [mode, setMode] = useState<Mode>('login'), [login, setLogin] = useState(''), [name, setName] = useState('');
  const [password, setPassword] = useState(''), [repeat, setRepeat] = useState(''), [recoveryCode, setRecoveryCode] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [retryAt, setRetryAt] = useState(0);
  const [pending, setPending] = useState<{ session: CredentialSession; server: string; login: string } | null>(null);
  useEffect(() => { onLockedChange(busy || !!pending); }, [busy, pending, onLockedChange]);
  const isNew = mode !== 'login';
  const valid = (mode === 'register' ? isValidUsername(login) && (!name.trim() || name.trim().length >= 2) : isValidLoginAlias(login))
    && (isNew ? isValidNewPassword(password) && password === repeat : isValidLoginPassword(password))
    && (mode !== 'recover' || isValidRecoveryCode(recoveryCode));
  function changeMode(value: Mode) { if (busy || pending) return; setMode(value); setPassword(''); setRepeat(''); setRecoveryCode(''); setError(''); }
  async function accept(session: CredentialSession, server: string) {
    await app.acceptPhoneSession(session, server);
    router.replace('/profile');
  }
  async function submit() {
    if (busy || !valid) return;
    setError('');
    if (Date.now() < retryAt) { setError(kk ? 'Сәл күтіп, қайта көр.' : 'Подождите немного и повторите.'); return; }
    setBusy(true);
    try {
      const server = app.phoneServerUrl;
      const session = mode === 'register' ? await registerCredentials({ login, password, name }, server)
        : mode === 'recover' ? await recoverCredentials({ login, password, recoveryCode }, server)
          : await loginCredentials({ login, password }, server);
      setPassword(''); setRepeat(''); setRecoveryCode('');
      if (session.recoveryCode) setPending({ session, server, login: session.user.login || normalizeLogin(login) });
      else await accept(session, server);
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof PhoneAuthError && e.retryAfter) setRetryAt(Date.now() + e.retryAfter * 1000);
    } finally { setBusy(false); }
  }
  if (app.phoneUser) return <View style={{ gap: 18 }}><Notice>{kk ? 'Аккаунтың ашық.' : 'Вы уже вошли в аккаунт.'}</Notice><Button onPress={() => router.replace('/profile')}>{app.t('profile')}</Button></View>;
  return <View style={{ width: '100%', maxWidth: 460, alignSelf: 'center', backgroundColor: colors.surface, borderRadius: 24, padding: 24, gap: 19, borderWidth: 1, borderColor: colors.line }}>
    <Row><Icon name="shield" size={32} color={colors.primary}/><Txt bold size={28}>Birge</Txt><View style={{ flex: 1 }}/><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#D2AE6D' }}/></Row>
    <Row style={{ flexWrap: 'wrap' }}><Chip active={mode === 'login'} onPress={() => changeMode('login')}>{app.t('login')}</Chip><Chip active={mode === 'register'} onPress={() => changeMode('register')}>{app.t('signup')}</Chip></Row>
    <Txt bold size={25}>{mode === 'recover' ? (kk ? 'Аккаунтты қайтару' : 'Вернуть аккаунт') : mode === 'register' ? (kk ? 'Бірге бастайық' : 'Начнём вместе') : (kk ? 'Қайта қош келдің!' : 'С возвращением!')}</Txt>
    <Txt color={colors.muted} size={13}>{mode === 'recover' ? (kk ? 'Сақтаған қалпына келтіру кодын енгізіп, жаңа құпиясөз жаса. Басқа құрылғылардағы кірулер жабылады.' : 'Введите сохранённый код восстановления и задайте новый пароль. Сеансы на других устройствах завершатся.') : mode === 'register' ? (kk ? 'Өзіңе логин таңда. Телефон нөмірі мен email қажет емес.' : 'Выберите свой логин. Номер телефона и email не нужны.') : (kk ? 'Логинді немесе @аты мен құпиясөзді енгіз. Бұрынғы аккаунтқа ескі нөмірмен де кіруге болады.' : 'Введите логин или @имя и пароль. Для прежнего аккаунта также подойдёт старый номер.')}</Txt>
    {!!error && <Notice error>{error}</Notice>}
    {mode === 'register' && <Field label={kk ? 'Атың (міндетті емес)' : 'Имя (необязательно)'} value={name} onChangeText={setName} maxLength={80} autoComplete="name" editable={!busy}/>}
    <Field label={mode === 'register' ? (kk ? 'Жаңа логин' : 'Новый логин') : (kk ? 'Логин немесе @аты' : 'Логин или @имя')} value={login} onChangeText={setLogin} autoCapitalize="none" autoCorrect={false} autoComplete="username" maxLength={mode === 'register' ? 25 : 80} editable={!busy} placeholder="@birge_user"/>
    {mode === 'register' && <Txt size={11} color={colors.muted}>{usernameHint(kk)}</Txt>}
    {mode === 'recover' && <Field label={kk ? 'Қалпына келтіру коды' : 'Код восстановления'} value={recoveryCode} onChangeText={setRecoveryCode} maxLength={100} autoCapitalize="characters" autoCorrect={false} placeholder="BRG-…" editable={!busy}/>}
    <Field label={isNew ? (kk ? 'Жаңа құпиясөз' : 'Новый пароль') : app.t('password')} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={isNew ? 'new-password' : 'current-password'} maxLength={256} editable={!busy} onSubmitEditing={() => { if (mode === 'login') void submit(); }}/>
    {isNew && <><Txt size={11} color={colors.muted}>{passwordPolicyHint(app.language)}</Txt><Field label={kk ? 'Құпиясөзді қайтала' : 'Повторите пароль'} value={repeat} onChangeText={setRepeat} secureTextEntry autoComplete="new-password" maxLength={256} editable={!busy}/>{!!repeat && password !== repeat && <Txt size={12} color={colors.danger}>{kk ? 'Құпиясөздер сәйкес емес' : 'Пароли не совпадают'}</Txt>}</>}
    <Button icon={mode === 'recover' ? 'shield' : 'arrow'} loading={busy} disabled={!valid} onPress={() => void submit()}>{mode === 'recover' ? (kk ? 'Қалпына келтіру' : 'Восстановить') : app.t(mode === 'register' ? 'signup' : 'login')}</Button>
    {mode === 'login' && <Button secondary disabled={busy} onPress={() => changeMode('recover')}>{kk ? 'Құпиясөзді ұмыттым' : 'Забыл пароль'}</Button>}
    {mode === 'recover' && <Button secondary disabled={busy} onPress={() => changeMode('login')}>{kk ? 'Кіруге оралу' : 'Вернуться ко входу'}</Button>}
    <Txt size={11} color={colors.muted}>{kk ? 'Аккаунт деректері бұлтта сақталады. Қалпына келтіру кодын қауіпсіз жерде ұста.' : 'Данные аккаунта хранятся в облаке. Держите код восстановления в надёжном месте.'}</Txt>
    {pending?.session.recoveryCode && <RecoveryCode code={pending.session.recoveryCode} login={pending.login} onSaved={() => accept(pending.session, pending.server)}/>}
  </View>;
}
