import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '../store';
import { PhoneAuthError } from '../lib/phone-auth';
import { phoneCodeStatus, sendPhoneBinding, sendPhoneCode, verifyPhoneBinding, verifyPhoneCode, WhatsAppChallenge } from '../lib/phone-code-api';
import { codeClock, normalizeCodePhone, PhoneCodeCapability, secondsUntil, validPhoneCode } from '../lib/phone-code-policy';
import { isValidRecoveryCode } from '../lib/credentials-policy';
import { isValidLoginPassword } from '../lib/password-policy';
import { Button, Field, Icon, Notice, Row, Txt } from './ui';

function useCodeAvailability(server: string) {
  const [status, setStatus] = useState<PhoneCodeCapability | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const revision = useRef(0);
  const reload = useCallback(async () => {
    const version = ++revision.current;
    setLoading(true); setError('');
    try { const result = await phoneCodeStatus(server); if (version === revision.current) setStatus(result); }
    catch (e) { if (version === revision.current) { setStatus(null); setError((e as Error).message); } }
    finally { if (version === revision.current) setLoading(false); }
  }, [server]);
  const cancelRequests = useCallback(() => { revision.current++; }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Probe the selected trusted origin; the result never gates credential sign-in.
    void reload();
    return cancelRequests;
  }, [reload, cancelRequests]);
  return { status, loading, error, reload };
}

export function PhoneCodeForm({ binding = false, onCredential, onBound, onBusyChange }: { binding?: boolean; onCredential?: () => void; onBound?: () => void; onBusyChange?: (busy: boolean) => void }) {
  const app = useApp(), kk = app.language === 'kk', server = app.phoneServerUrl;
  const availability = useCodeAvailability(server);
  const [phone, setPhone] = useState(''), [name, setName] = useState(''), [code, setCode] = useState('');
  const [currentPassword, setCurrentPassword] = useState(''), [recoveryCode, setRecoveryCode] = useState(''), [recovery, setRecovery] = useState(false);
  const [challenge, setChallenge] = useState<{ data: WhatsAppChallenge; phone: string; server: string } | null>(null);
  const [retryAt, setRetryAt] = useState(0), [now, setNow] = useState(Date.now), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const mounted = useRef(true), running = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onBusyChange?.(busy); return () => { onBusyChange?.(false); }; }, [busy, onBusyChange]);
  useEffect(() => {
    const deadline = Math.max(challenge?.data.expiresAt || 0, retryAt);
    if (deadline <= Date.now()) return;
    const timer = setInterval(() => { const time = Date.now(); setNow(time); if (time >= deadline) clearInterval(timer); }, 1000);
    return () => clearInterval(timer);
  }, [challenge, retryAt]);
  const remaining = challenge ? secondsUntil(challenge.data.expiresAt, now) : 0, resend = secondsUntil(retryAt, now);
  const proofValid = !binding || (recovery ? isValidRecoveryCode(recoveryCode) : isValidLoginPassword(currentPassword));
  const canSend = !!normalizeCodePhone(phone) && (binding || !name.trim() || name.trim().length >= 2) && proofValid && !!availability.status?.ready && !availability.loading && !resend;
  const canVerify = !!challenge && remaining > 0 && validPhoneCode(code);
  function failed(e: unknown) {
    if (!mounted.current) return;
    setError((e as Error).message);
    if (e instanceof PhoneAuthError && e.retryAfter) setRetryAt(Date.now() + e.retryAfter * 1000);
  }
  async function send() {
    if (running.current || !canSend) return;
    running.current = true; setBusy(true); setError('');
    try {
      const normalized = normalizeCodePhone(phone)!;
      const data = binding
        ? await sendPhoneBinding({ phone: normalized, language: app.language, ...(recovery ? { recoveryCode } : { currentPassword }) }, server)
        : await sendPhoneCode({ phone: normalized, name, language: app.language }, server);
      if (!mounted.current) return;
      setChallenge({ data, phone: normalized, server }); setCode('');
      setNow(Date.now()); setRetryAt(Date.now() + data.resendAfter * 1000);
    } catch (e) { failed(e); }
    finally { if (mounted.current) { setCurrentPassword(''); setRecoveryCode(''); setBusy(false); } running.current = false; }
  }
  async function verify() {
    if (running.current || !challenge || !canVerify) return;
    running.current = true; setBusy(true); setError('');
    try {
      if (binding) {
        await verifyPhoneBinding(challenge.data.challengeId, code, challenge.server, app.userId!);
        if (!mounted.current) return;
        setCode(''); setCurrentPassword(''); setRecoveryCode('');
        await app.refreshPhoneSession(); await app.refresh();
        if (mounted.current) { app.setToast(kk ? 'Нөмір осы аккаунтқа байланыстырылды' : 'Номер привязан к этому аккаунту'); onBound?.(); }
      } else {
        const session = await verifyPhoneCode(challenge.data.challengeId, code, challenge.server);
        if (!mounted.current) return;
        setCode(''); await app.acceptPhoneSession(session, challenge.server); router.replace('/profile');
      }
    } catch (e) { failed(e); }
    finally { if (mounted.current) setBusy(false); running.current = false; }
  }
  function changePhone() {
    setChallenge(null); setCode(''); setError(''); setCurrentPassword(''); setRecoveryCode('');
  }
  const unavailable = availability.loading ? (kk ? 'WhatsApp қызметін тексеріп жатырмыз…' : 'Проверяем доступность WhatsApp…')
    : availability.error ? (kk ? 'WhatsApp қолжетімділігін тексеру мүмкін болмады. Интернетті тексер немесе логинмен кір.' : 'Не удалось проверить доступность WhatsApp. Проверьте интернет или войдите с логином.')
      : !availability.status?.enabled ? (kk ? 'WhatsApp арқылы код жіберу серверде әлі қосылмаған. Логин мен құпиясөз арқылы кіру жұмыс істейді.' : 'Отправка кода в WhatsApp ещё не подключена на сервере. Вход с логином и паролем работает.')
        : (kk ? 'WhatsApp арқылы жеткізу қызметі әзірге дайын емес. Логин мен құпиясөзді қолдануға болады.' : 'Сервис отправки в WhatsApp пока не готов. Можно войти с логином и паролем.');
  return <View style={{ gap: 16 }}>
    <Row><Icon name="shield" color={app.colors.primary}/><Txt bold size={23}>{binding ? (kk ? 'Нөмірді байланыстыру' : 'Привязать номер') : (kk ? 'WhatsApp кодымен кіру' : 'Вход по коду WhatsApp')}</Txt></Row>
    {!binding && <Notice>{kk ? 'Логинмен бұрын тіркелсең, алдымен сол аккаунтқа кір де, баптауларда нөмірді байланыстыр. Осылай профиль мен чаттарың сақталады.' : 'Если уже регистрировались с логином, сначала войдите в свой аккаунт и привяжите номер в настройках. Так сохранятся профиль и чаты.'}</Notice>}
    {binding && <Txt size={12} color={app.colors.muted}>{kk ? 'Нөмір тек осы аккаунтқа қосылады. Профиль, @аты және чаттар сақталады; басқа аккаунтпен біріктірілмейді.' : 'Номер добавится к этому аккаунту. Профиль, @имя и чаты сохранятся; объединения с другим аккаунтом не будет.'}</Txt>}
    {!availability.status?.ready && <Notice>{unavailable}</Notice>}
    <Button secondary small icon="refresh" loading={availability.loading} disabled={busy} onPress={() => void availability.reload()}>{kk ? 'Қолжетімділікті тексеру' : 'Проверить доступность'}</Button>
    {!!error && <Notice error>{error}</Notice>}
    {!challenge ? <>
      <Field label={kk ? 'Телефон нөмірі' : 'Номер телефона'} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" autoCorrect={false} maxLength={30} editable={!busy} placeholder="+7 7XX XXX XX XX"/>
      {!binding && <Field label={kk ? 'Атың (жаңа аккаунт үшін, міндетті емес)' : 'Имя (для нового аккаунта, необязательно)'} value={name} onChangeText={setName} maxLength={80} autoComplete="name" editable={!busy}/>}
    </> : <>
      <Txt bold size={18}>{challenge.phone}</Txt>
      <Notice>{kk ? 'Код жіберуге сұрау қабылданды. WhatsApp-ты тексер.' : 'Запрос на отправку кода принят. Проверьте WhatsApp.'}</Notice>
      <Field label={kk ? '6 таңбалы код' : 'Код из 6 цифр'} value={code} onChangeText={value => setCode(value.replace(/[^0-9]/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} editable={!busy} placeholder="000000" onSubmitEditing={() => void verify()}/>
      <Txt size={12} color={remaining ? app.colors.muted : app.colors.danger}>{remaining ? (kk ? `Кодтың жарамдылығы: ${codeClock(remaining)}` : `Код действителен: ${codeClock(remaining)}`) : (kk ? 'Кодтың мерзімі өтті. Жаңа код сұра.' : 'Срок кода истёк. Запросите новый.')}</Txt>
      <Button icon="check" loading={busy} disabled={!canVerify} onPress={() => void verify()}>{binding ? (kk ? 'Нөмірді растау' : 'Подтвердить номер') : (kk ? 'Кодпен кіру' : 'Войти с кодом')}</Button>
      <Button secondary small disabled={busy} onPress={changePhone}>{kk ? 'Нөмірді өзгерту' : 'Изменить номер'}</Button>
    </>}
    {binding && (!challenge || !resend) && <View style={{ gap: 12 }}>
      <Txt size={12} color={app.colors.muted}>{challenge ? (kk ? 'Кодты қайта сұрау үшін аккаунтты тағы раста.' : 'Для повторной отправки подтвердите аккаунт ещё раз.') : (kk ? 'Алдымен ағымдағы құпиясөзбен немесе қалпына келтіру кодымен раста.' : 'Сначала подтвердите текущий пароль или код восстановления.')}</Txt>
      {recovery ? <Field label={kk ? 'Қалпына келтіру коды' : 'Код восстановления'} value={recoveryCode} onChangeText={setRecoveryCode} autoCapitalize="characters" autoCorrect={false} maxLength={100} editable={!busy}/>
        : <Field label={kk ? 'Ағымдағы құпиясөз' : 'Текущий пароль'} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoComplete="current-password" maxLength={256} editable={!busy}/>}
      <Button secondary small disabled={busy} onPress={() => { setRecovery(value => !value); setCurrentPassword(''); setRecoveryCode(''); }}>{recovery ? (kk ? 'Құпиясөзбен растау' : 'Подтвердить паролем') : (kk ? 'Қалпына келтіру кодымен растау' : 'Подтвердить кодом восстановления')}</Button>
    </View>}
    <Button secondary={!!challenge} icon="send" loading={busy} disabled={!canSend} onPress={() => void send()}>{resend ? (kk ? `Қайта сұрау: ${resend} с` : `Повтор через ${resend} с`) : challenge ? (kk ? 'Кодты қайта сұрау' : 'Запросить код повторно') : (kk ? 'WhatsApp кодын сұрау' : 'Запросить код в WhatsApp')}</Button>
    {!binding && <Txt size={11} color={app.colors.muted}>{kk ? 'Бірінші рет растағанда жаңа аккаунт ашылады. Нөмір ашық профильде көрінбейді.' : 'При первом подтверждении создастся новый аккаунт. Номер не отображается в публичном профиле.'}</Txt>}
    {onCredential && <Button secondary icon="lock" disabled={busy} onPress={onCredential}>{kk ? 'Логин мен құпиясөз арқылы кіру' : 'Войти с логином и паролем'}</Button>}
  </View>;
}

export function PhoneBindingSettings() {
  const app = useApp(), kk = app.language === 'kk', [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const phone = app.phoneUser?.phone;
  if (phone) return <View style={{ gap: 7 }}><Txt bold size={14}>{kk ? 'Кіру нөмірі' : 'Номер для входа'}</Txt><Txt size={16}>{phone}</Txt><Txt size={11} color={app.colors.muted}>{kk ? 'Нөмір тек өз баптауларыңда көрінеді. Ашық профильде — @аты.' : 'Номер виден только в ваших настройках. В публичном профиле — @имя.'}</Txt></View>;
  const needsCredentials = app.phoneUser?.hasPassword === false && app.phoneUser?.hasCredentials === false;
  return <View style={{ gap: 13 }}>
    <Txt size={12} color={app.colors.muted}>{kk ? 'WhatsApp коды арқылы осы аккаунтқа кіру үшін өз нөміріңді байланыстыра аласың. Нөмір ашық профильде көрсетілмейді.' : 'Можно привязать свой номер, чтобы входить в этот аккаунт по коду WhatsApp. Номер не появится в публичном профиле.'}</Txt>
    {needsCredentials ? <Notice>{kk ? 'Алдымен төмендегі «Логин мен құпиясөз» бөлімінде кіру деректерін жаса.' : 'Сначала настройте вход в разделе «Логин и пароль» ниже.'}</Notice>
      : <><Button secondary icon="shield" disabled={busy} onPress={() => setOpen(value => !value)}>{open ? (kk ? 'Жабу' : 'Закрыть') : (kk ? 'Телефон нөмірін байланыстыру' : 'Привязать номер телефона')}</Button>{open && <PhoneCodeForm binding onBusyChange={setBusy} onBound={() => setOpen(false)}/>}</>}
  </View>;
}
