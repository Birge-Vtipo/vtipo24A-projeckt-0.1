import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import * as Linking from 'expo-linking';
import { useApp } from '../src/store';
import { supabase, unwrap } from '../src/lib/supabase';
import { Button, Chip, Empty, Field, Icon, Notice, Row, Txt, useAction } from '../src/components/ui';
import { PhoneAuth } from '../src/components/phone-auth';
import { webGuestMode } from '../src/lib/web-guest';
export default function Auth() {
  const app = useApp(), { colors, t } = app;
  const [selectedMode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const mode = app.recovery ? 'update' : selectedMode;
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [name, setName] = useState(''), [info, setInfo] = useState('');
  const { busy, run } = useAction();
  if (webGuestMode) return <Redirect href="/" />;
  if (app.phoneAuthEnabled) return <PhoneAuth />;
  if (app.isDemo) return <Empty title={t('demo')} subtitle={t('noServer')}><Button onPress={() => router.replace('/')}>{t('home')}</Button></Empty>;
  async function submit() {
    if (!supabase) throw new Error(t('noServer'));
    if (mode !== 'update' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error('Email форматын тексер / Проверьте email');
    if ((mode === 'signup' || mode === 'update') && password.length < 8) throw new Error(t('password'));
    const redirect = Platform.OS === 'web' ? `${window.location.origin}/auth` : Linking.createURL('auth');
    if (mode === 'login') { unwrap(await supabase.auth.signInWithPassword({ email: email.trim(), password })); router.replace('/profile'); }
    if (mode === 'signup') {
      if (name.trim().length < 2) throw new Error('Аты / Имя: 2–80');
      const data = unwrap(await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim(), language: app.language }, emailRedirectTo: redirect } }));
      if (data.session) router.replace('/profile'); else setInfo(t('verifyEmail'));
    }
    if (mode === 'reset') { unwrap(await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect })); setInfo(t('resetSent')); }
    if (mode === 'update') { unwrap(await supabase.auth.updateUser({ password })); app.setRecovery(false); app.setToast(t('saved')); router.replace('/profile'); }
  }
  return <View style={{ width: '100%', maxWidth: 460, alignSelf: 'center', backgroundColor: colors.surface, borderRadius: 24, padding: 30, gap: 22, borderWidth: 1, borderColor: colors.line }}>
    <Icon name="leaf" size={34} color={colors.primary} /><Txt bold size={30}>{mode === 'update' ? t('newPassword') : 'Birge-ге қош келдің!'}</Txt>
    {mode !== 'update' && <Row><Chip active={mode === 'login'} onPress={() => { setMode('login'); setInfo(''); }}>{t('login')}</Chip><Chip active={mode === 'signup'} onPress={() => { setMode('signup'); setInfo(''); }}>{t('signup')}</Chip></Row>}
    {info && <Notice>{info}</Notice>}
    {mode === 'signup' && <Field label={t('name')} value={name} onChangeText={setName} maxLength={80} />}
    {mode !== 'update' && <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />}
    {mode !== 'reset' && <Field label={t('password')} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />}
    <Button loading={busy} onPress={() => void run(submit)}>{t(mode === 'login' ? 'login' : mode === 'signup' ? 'signup' : mode === 'reset' ? 'resetSend' : 'save')}</Button>
    {mode === 'login' && <Button secondary onPress={() => { setMode('reset'); setInfo(''); }}>{t('reset')}</Button>}
  </View>;
}
