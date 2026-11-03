import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { useApp } from '../store';
import { PhoneAuthError } from '../lib/phone-auth';
import { telegramCodeStatus, sendTelegramBinding, sendTelegramCode, verifyTelegramBinding, verifyTelegramCode, TelegramChallenge } from '../lib/telegram-code-api';
import { codeClock, normalizeCodePhone, TelegramCodeCapability, secondsUntil, trustedTelegramBotUrl, validPhoneCode } from '../lib/telegram-code-policy';
import { isValidRecoveryCode } from '../lib/credentials-policy';
import { isValidLoginPassword } from '../lib/password-policy';
import { Button, Field, Icon, Notice, Row, Txt } from './ui';

function useCodeAvailability(server: string) {
  const [status, setStatus] = useState<TelegramCodeCapability | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const revision = useRef(0);
  const reload = useCallback(async () => {
    const version = ++revision.current;
    setLoading(true); setError('');
    try { const result = await telegramCodeStatus(server); if (version === revision.current) setStatus(result); }
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

export function TelegramCodeForm({ binding = false, onCredential, onBound, onBusyChange }: { binding?: boolean; onCredential?: () => void; onBound?: () => void; onBusyChange?: (busy: boolean) => void }) {
  const app = useApp(), kk = app.language === 'kk', server = app.phoneServerUrl;
  const availability = useCodeAvailability(server);
  const [phone, setPhone] = useState(''), [name, setName] = useState(''), [code, setCode] = useState('');
  const [currentPassword, setCurrentPassword] = useState(''), [recoveryCode, setRecoveryCode] = useState(''), [recovery, setRecovery] = useState(false);
  const [challenge, setChallenge] = useState<{ data: TelegramChallenge; phone: string; server: string; botUsername: string } | null>(null);
  const [retryAt, setRetryAt] = useState(0), [now, setNow] = useState(Date.now), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const mounted = useRef(true), running = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { const subscription = AppState.addEventListener('change', value => { if (value === 'active') setNow(Date.now()); }); return () => subscription.remove(); }, []);
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
  async function openBot(request = challenge) {
    if (!request || !mounted.current) return;
    if (request.server !== server) { failed(new PhoneAuthError('SESSION_EXPIRED')); return; }
    if (request.data.expiresAt <= Date.now()) { failed(new PhoneAuthError('CODE_EXPIRED')); return; }
    const botUrl = trustedTelegramBotUrl(request.data.botUrl, request.botUsername);
    if (!botUrl) { failed(new PhoneAuthError('TELEGRAM_UNAVAILABLE')); return; }
    try { await Linking.openURL(botUrl); }
    catch { failed(new PhoneAuthError('TELEGRAM_OPEN_FAILED')); }
  }
  async function send() {
    if (running.current || !canSend) return;
    running.current = true; setBusy(true); setError('');
    try {
      const normalized = normalizeCodePhone(phone)!;
      const botUsername = availability.status!.botUsername;
      const data = binding
        ? await sendTelegramBinding({ phone: normalized, language: app.language, ...(recovery ? { recoveryCode } : { currentPassword }) }, server, botUsername)
        : await sendTelegramCode({ phone: normalized, name, language: app.language }, server, botUsername);
      if (!mounted.current) return;
      const request = { data, phone: normalized, server, botUsername };
      setChallenge(request); setCode(''); setCurrentPassword(''); setRecoveryCode('');
      setNow(Date.now()); setRetryAt(Date.now() + data.resendAfter * 1000);
      // Browser popup activation is lost while awaiting the API. A real link
      // below opens on the user's next tap and keeps this code-entry tab alive.
      if (Platform.OS !== 'web') await openBot(request);
    } catch (e) { failed(e); }
    finally { if (mounted.current) { setCurrentPassword(''); setRecoveryCode(''); setBusy(false); } running.current = false; }
  }
  async function verify() {
    if (running.current || !challenge || !canVerify || challenge.data.expiresAt <= Date.now()) return;
    running.current = true; setBusy(true); setError('');
    try {
      if (binding) {
        await verifyTelegramBinding(challenge.data.challengeId, code, challenge.server, app.userId!);
        if (!mounted.current) return;
        setCode(''); setCurrentPassword(''); setRecoveryCode('');
        await app.refreshPhoneSession(); await app.refresh();
        if (mounted.current) { app.setToast(kk ? 'Нөмір осы аккаунтқа байланыстырылды' : 'Номер привязан к этому аккаунту'); onBound?.(); }
      } else {
        const session = await verifyTelegramCode(challenge.data.challengeId, code, challenge.server);
        if (!mounted.current) return;
        setCode(''); await app.acceptPhoneSession(session, challenge.server); router.replace('/profile');
      }
    } catch (e) { failed(e); }
    finally { if (mounted.current) setBusy(false); running.current = false; }
  }
  function changePhone() {
    setChallenge(null); setCode(''); setError(''); setCurrentPassword(''); setRecoveryCode('');
  }
  const unavailable = availability.loading ? (kk ? 'Telegram қызметін тексеріп жатырмыз…' : 'Проверяем доступность Telegram…')
    : availability.error ? (kk ? 'Telegram қолжетімділігін тексеру мүмкін болмады. Интернетті тексер немесе логинмен кір.' : 'Не удалось проверить доступность Telegram. Проверьте интернет или войдите с логином.')
      : !availability.status?.enabled ? (kk ? 'Telegram арқылы кіру серверде әлі қосылмаған. Логин мен құпиясөз арқылы кіру жұмыс істейді.' : 'Вход через Telegram ещё не подключён на сервере. Вход с логином и паролем работает.')
        : (kk ? 'Telegram боты әзірге дайын емес. Логин мен құпиясөзді қолдануға болады.' : 'Telegram-бот пока не готов. Можно войти с логином и паролем.');
  const browserBotUrl = challenge && challenge.server === server && remaining > 0
    ? trustedTelegramBotUrl(challenge.data.botUrl, challenge.botUsername) : undefined;
  return <View style={{ gap: 16 }}>
    <Row><Icon name="shield" color={app.colors.primary}/><Txt bold size={23}>{binding ? (kk ? 'Нөмірді байланыстыру' : 'Привязать номер') : (kk ? 'Telegram кодымен кіру' : 'Вход по коду Telegram')}</Txt></Row>
    {!binding && <Notice>{kk ? 'Логинмен бұрын тіркелсең, алдымен сол аккаунтқа кір де, баптауларда нөмірді байланыстыр. Осылай профиль мен чаттарың сақталады.' : 'Если уже регистрировались с логином, сначала войдите в свой аккаунт и привяжите номер в настройках. Так сохранятся профиль и чаты.'}</Notice>}
    <Txt size={12} color={app.colors.muted}>{kk ? 'Өз Telegram аккаунтыңның нөмірін енгіз. Ботта өз контактіңді арнайы батырмамен бөлісу керек.' : 'Введите номер своего Telegram-аккаунта. В боте нужно поделиться собственным контактом через специальную кнопку.'}</Txt>
    {binding && <Txt size={12} color={app.colors.muted}>{kk ? 'Нөмір тек осы аккаунтқа қосылады. Профиль, @аты және чаттар сақталады; басқа аккаунтпен біріктірілмейді.' : 'Номер добавится к этому аккаунту. Профиль, @имя и чаты сохранятся; объединения с другим аккаунтом не будет.'}</Txt>}
    {!availability.status?.ready && <Notice>{unavailable}</Notice>}
    <Button secondary small icon="refresh" loading={availability.loading} disabled={busy} onPress={() => void availability.reload()}>{kk ? 'Қолжетімділікті тексеру' : 'Проверить доступность'}</Button>
    {!!error && <Notice error>{error}</Notice>}
    {!challenge ? <>
      <Field label={kk ? 'Телефон нөмірі' : 'Номер телефона'} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" autoCorrect={false} maxLength={30} editable={!busy} placeholder="+7 7XX XXX XX XX"/>
      {!binding && <Field label={kk ? 'Атың (жаңа аккаунт үшін, міндетті емес)' : 'Имя (для нового аккаунта, необязательно)'} value={name} onChangeText={setName} maxLength={80} autoComplete="name" editable={!busy}/>}
    </> : <>
      <Txt bold size={18}>{challenge.phone}</Txt>
      <Notice>{kk ? 'Сұрау дайын. Код алу үшін Telegram ботында өз нөміріңді раста.' : 'Запрос готов. Чтобы получить код, подтвердите свой номер в Telegram-боте.'}</Notice>
      <Txt size={12} color={app.colors.muted}>{kk ? 'Telegram ашу → Start → «Өз нөмірімді жіберу» → кодты Birge-ге енгізу. Telegram нөмірің жоғарыдағы нөмірмен бірдей болуы керек.' : 'Открыть Telegram → Start → «Отправить свой номер» → ввести код в Birge. Номер Telegram должен совпадать с указанным выше.'}</Txt>
      {Platform.OS === 'web' ? React.createElement('a', {
        href: busy ? undefined : browserBotUrl, target: '_blank', rel: 'noopener noreferrer', referrerPolicy: 'no-referrer',
        'aria-disabled': busy || !browserBotUrl, tabIndex: busy || !browserBotUrl ? -1 : 0,
        onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
          // Check at click time too: a suspended tab can display a stale clock.
          if (busy || !challenge || challenge.server !== server || challenge.data.expiresAt <= Date.now() || !trustedTelegramBotUrl(challenge.data.botUrl, challenge.botUsername)) event.preventDefault();
        },
        style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, padding: '13px 20px', boxSizing: 'border-box', borderRadius: 12, backgroundColor: app.colors.soft, color: app.colors.text, textDecoration: 'none', fontSize: 14, fontWeight: 700, opacity: busy || !browserBotUrl ? .5 : 1 },
      }, React.createElement(Icon, { name: 'external', size: 19 }), kk ? 'Telegram ашу' : 'Открыть Telegram')
        : <Button secondary icon="external" disabled={busy || !remaining} onPress={() => void openBot()}>{kk ? 'Telegram ашу' : 'Открыть Telegram'}</Button>}
      <Field label={kk ? '6 таңбалы код' : 'Код из 6 цифр'} value={code} onChangeText={value => setCode(value.replace(/[^0-9]/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} editable={!busy} placeholder="000000" onSubmitEditing={() => void verify()}/>
      <Txt size={12} color={remaining ? app.colors.muted : app.colors.danger}>{remaining ? (kk ? `Сұраудың жарамдылығы: ${codeClock(remaining)}` : `Запрос действителен: ${codeClock(remaining)}`) : (kk ? 'Сұраудың мерзімі өтті. Жаңа код сұра.' : 'Срок запроса истёк. Запросите новый код.')}</Txt>
      <Button icon="check" loading={busy} disabled={!canVerify} onPress={() => void verify()}>{binding ? (kk ? 'Нөмірді растау' : 'Подтвердить номер') : (kk ? 'Кодпен кіру' : 'Войти с кодом')}</Button>
      <Button secondary small disabled={busy} onPress={changePhone}>{kk ? 'Нөмірді өзгерту' : 'Изменить номер'}</Button>
    </>}
    {binding && (!challenge || !resend) && <View style={{ gap: 12 }}>
      <Txt size={12} color={app.colors.muted}>{challenge ? (kk ? 'Кодты қайта сұрау үшін аккаунтты тағы раста.' : 'Для повторной отправки подтвердите аккаунт ещё раз.') : (kk ? 'Алдымен ағымдағы құпиясөзбен немесе қалпына келтіру кодымен раста.' : 'Сначала подтвердите текущий пароль или код восстановления.')}</Txt>
      {recovery ? <Field label={kk ? 'Қалпына келтіру коды' : 'Код восстановления'} value={recoveryCode} onChangeText={setRecoveryCode} autoCapitalize="characters" autoCorrect={false} maxLength={100} editable={!busy}/>
        : <Field label={kk ? 'Ағымдағы құпиясөз' : 'Текущий пароль'} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoComplete="current-password" maxLength={256} editable={!busy}/>}
      <Button secondary small disabled={busy} onPress={() => { setRecovery(value => !value); setCurrentPassword(''); setRecoveryCode(''); }}>{recovery ? (kk ? 'Құпиясөзбен растау' : 'Подтвердить паролем') : (kk ? 'Қалпына келтіру кодымен растау' : 'Подтвердить кодом восстановления')}</Button>
    </View>}
    <Button secondary={!!challenge} icon="send" loading={busy} disabled={!canSend} onPress={() => void send()}>{resend ? (kk ? `Қайта сұрау: ${resend} с` : `Повтор через ${resend} с`) : challenge ? (kk ? 'Кодты қайта сұрау' : 'Запросить код повторно') : (kk ? 'Telegram кодын сұрау' : 'Запросить код в Telegram')}</Button>
    {!binding && <Txt size={11} color={app.colors.muted}>{kk ? 'Бірінші рет растағанда жаңа аккаунт ашылады. Нөмір ашық профильде көрінбейді.' : 'При первом подтверждении создастся новый аккаунт. Номер не отображается в публичном профиле.'}</Txt>}
    {onCredential && <Button secondary icon="lock" disabled={busy} onPress={onCredential}>{kk ? 'Логин мен құпиясөз арқылы кіру' : 'Войти с логином и паролем'}</Button>}
  </View>;
}

export function TelegramBindingSettings() {
  const app = useApp(), kk = app.language === 'kk', [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const phone = app.phoneUser?.phone;
  if (phone) return <View style={{ gap: 7 }}><Txt bold size={14}>{kk ? 'Кіру нөмірі' : 'Номер для входа'}</Txt><Txt size={16}>{phone}</Txt><Txt size={11} color={app.colors.muted}>{kk ? 'Нөмір тек өз баптауларыңда көрінеді. Ашық профильде — @аты.' : 'Номер виден только в ваших настройках. В публичном профиле — @имя.'}</Txt></View>;
  const needsCredentials = app.phoneUser?.hasPassword === false && app.phoneUser?.hasCredentials === false;
  return <View style={{ gap: 13 }}>
    <Txt size={12} color={app.colors.muted}>{kk ? 'Telegram коды арқылы осы аккаунтқа кіру үшін өз нөміріңді байланыстыра аласың. Нөмір ашық профильде көрсетілмейді.' : 'Можно привязать свой номер, чтобы входить в этот аккаунт по коду Telegram. Номер не появится в публичном профиле.'}</Txt>
    {needsCredentials ? <Notice>{kk ? 'Алдымен төмендегі «Логин мен құпиясөз» бөлімінде кіру деректерін жаса.' : 'Сначала настройте вход в разделе «Логин и пароль» ниже.'}</Notice>
      : <><Button secondary icon="shield" disabled={busy} onPress={() => setOpen(value => !value)}>{open ? (kk ? 'Жабу' : 'Закрыть') : (kk ? 'Телефон нөмірін байланыстыру' : 'Привязать номер телефона')}</Button>{open && <TelegramCodeForm binding onBusyChange={setBusy} onBound={() => setOpen(false)}/>}</>}
  </View>;
}
