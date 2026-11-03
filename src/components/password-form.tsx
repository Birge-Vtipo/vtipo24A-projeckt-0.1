import React, { useState } from 'react';
import { View } from 'react-native';
import { useApp } from '../store';
import { updateCredentials } from '../lib/credentials-api';
import { isValidRecoveryCode, isValidUsername, usernameHint } from '../lib/credentials-policy';
import { isValidNewPassword, passwordPolicyHint } from '../lib/password-policy';
import { Button, Field, Notice, Txt, useAction } from './ui';
import { RecoveryCode } from './recovery-code';

export function PasswordSettings() {
  const app = useApp(), kk = app.language === 'kk', { busy, run } = useAction();
  const [open, setOpen] = useState(false), [login, setLogin] = useState(app.phoneUser?.login || '');
  const [password, setPassword] = useState(''), [repeat, setRepeat] = useState(''), [currentPassword, setCurrentPassword] = useState('');
  const [recovery, setRecovery] = useState(false), [code, setCode] = useState('');
  const [pending, setPending] = useState<{ code: string; login: string } | null>(null);
  const valid = isValidUsername(login) && isValidNewPassword(password) && password === repeat && (!recovery || isValidRecoveryCode(code));
  function close() { setOpen(false); setPassword(''); setRepeat(''); setCurrentPassword(''); setCode(''); }
  async function finish() { await app.refreshPhoneSession(); await app.refresh(); setPending(null); close(); app.setToast(app.t('saved')); }
  async function save() {
    if (!valid) return;
    const result = await updateCredentials({ login, password, ...(recovery ? { recoveryCode: code } : currentPassword ? { currentPassword } : {}) });
    setPassword(''); setRepeat(''); setCurrentPassword(''); setCode('');
    setLogin(result.user?.login || result.login || login);
    if (result.recoveryCode) setPending({ code: result.recoveryCode, login: result.user?.login || result.login || login });
    else await finish();
  }
  return <View style={{ gap: 14 }}>
    <Button secondary icon="lock" disabled={busy || !!pending} onPress={() => { if (open) close(); else { setLogin(app.phoneUser?.login || ''); setOpen(true); } }}>{kk ? 'Логин мен құпиясөз' : 'Логин и пароль'}</Button>
    {open && <>
      <Notice>{kk ? 'Аккаунтта құпиясөз бұрыннан болса, оны немесе қалпына келтіру кодын енгіз. Алғаш рет орнатқанда бұл өрісті бос қалдыруға болады. Сақтағаннан кейін басқа құрылғылардағы сессиялар жабылады және жаңа қалпына келтіру коды беріледі.' : 'Если пароль уже установлен, подтвердите его или введите код восстановления. При первой настройке подтверждение можно оставить пустым. После сохранения другие сеансы завершатся и появится новый код восстановления.'}</Notice>
      <Field label={kk ? 'Логин' : 'Логин'} value={login} onChangeText={setLogin} maxLength={25} placeholder="@birge_user" autoComplete="username" autoCorrect={false} autoCapitalize="none" editable={!busy}/>
      <Txt size={11} color={app.colors.muted}>{usernameHint(kk)}</Txt>
      {recovery ? <Field label={kk ? 'Қалпына келтіру коды' : 'Код восстановления'} value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} maxLength={100} editable={!busy}/> : <Field label={kk ? 'Ағымдағы құпиясөз (бар болса)' : 'Текущий пароль (если установлен)'} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoComplete="current-password" maxLength={256} editable={!busy}/>}
      <Button secondary small disabled={busy} onPress={() => { setRecovery(value => !value); setCurrentPassword(''); setCode(''); }}>{recovery ? (kk ? 'Ағымдағы құпиясөзбен растау' : 'Подтвердить текущим паролем') : (kk ? 'Қалпына келтіру кодымен растау' : 'Подтвердить кодом восстановления')}</Button>
      <Field label={kk ? 'Жаңа құпиясөз (8–128 таңба)' : 'Новый пароль (8–128 символов)'} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" maxLength={256} editable={!busy}/>
      <Txt size={12} color={app.colors.muted}>{passwordPolicyHint(app.language)}</Txt>
      <Field label={kk ? 'Құпиясөзді қайтала' : 'Повторите пароль'} value={repeat} onChangeText={setRepeat} secureTextEntry autoComplete="new-password" maxLength={256} editable={!busy}/>
      {!!repeat && repeat !== password && <Txt size={12} color={app.colors.danger}>{kk ? 'Құпиясөздер сәйкес емес' : 'Пароли не совпадают'}</Txt>}
      <Button loading={busy} disabled={!valid} onPress={() => void run(save)}>{app.t('save')}</Button>
    </>}
    {pending && <RecoveryCode code={pending.code} login={pending.login} onSaved={finish}/>}
  </View>;
}
