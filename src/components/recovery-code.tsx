import React, { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useApp } from '../store';
import { Button, Icon, Notice, Row, Txt } from './ui';

// Sharing does not acknowledge saving: Android may report sharedAction on cancel.
// The raw code remains only in the owning screen's memory until acknowledged.
export function RecoveryCode({ code, login, onSaved }: { code: string; login: string; onSaved: () => Promise<void> | void }) {
  const { colors, language } = useApp(), kk = language === 'kk';
  const [saved, setSaved] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function share() {
    setError('');
    try { await Share.share({ title: 'Birge', message: `Birge\nЛогин: ${login}\n${kk ? 'Қалпына келтіру коды' : 'Код восстановления'}:\n${code}` }, { dialogTitle: kk ? 'Кодты қауіпсіз сақтау' : 'Сохранить код в надёжном месте' }); }
    catch { setError(kk ? 'Бөлісу ашылмады. Кодты басып ұстап, көшіріп сақта.' : 'Не удалось открыть меню. Удерживайте код, скопируйте и сохраните его.'); }
  }
  async function finish() {
    if (!saved || busy) return;
    setBusy(true); setError('');
    try { await onSaved(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Modal visible animationType="fade" transparent onRequestClose={() => {}}>
    <View style={{ flex: 1, backgroundColor: '#141122E8', justifyContent: 'center' }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 460, backgroundColor: colors.surface, borderRadius: 26, padding: 23, gap: 18, borderWidth: 1, borderColor: '#D2AE6D' }}>
          <Row><Icon name="shield" size={28} color={colors.primary}/><Txt bold size={24}>{kk ? 'Құтқару кілтің' : 'Ключ к аккаунту'}</Txt></Row>
          <Txt>{kk ? 'Бұл код бір рет көрсетіледі. Құпиясөзді ұмытсаң, аккаунтқа кіруге көмектеседі.' : 'Этот код показывается один раз. Он поможет вернуть аккаунт, если забудете пароль.'}</Txt>
          <Txt bold size={13}>Логин · {login}</Txt>
          <View style={{ padding: 16, borderRadius: 16, backgroundColor: colors.soft, gap: 9 }}>
            <Text selectable accessibilityLabel={kk ? `Қалпына келтіру коды: ${code}` : `Код восстановления: ${code}`} accessibilityHint={kk ? 'Көшіру үшін басып ұста' : 'Удерживайте, чтобы скопировать'} style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: colors.text, fontSize: 16, lineHeight: 27, fontWeight: '700', letterSpacing: .8 }}>{code}</Text>
            <Txt size={11} color={colors.muted}>{kk ? 'Көшіру үшін кодты басып ұста.' : 'Удерживайте код, чтобы скопировать.'}</Txt>
          </View>
          <Notice>{kk ? 'Қауіпсіз жерде сақта. Басқа адамға берме: бұл код аккаунтқа жол ашады. Жаңа код берілгенде алдыңғысы жарамсыз болады.' : 'Сохраните в надёжном месте. Никому не передавайте: код открывает доступ к аккаунту. При выдаче нового кода предыдущий перестаёт работать.'}</Notice>
          <Button secondary icon="external" disabled={busy} onPress={() => void share()}>{kk ? 'Сақтау / бөлісу' : 'Сохранить / поделиться'}</Button>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: saved }} accessibilityLabel={kk ? 'Кодты қауіпсіз жерге сақтадым' : 'Я сохранил код в надёжном месте'} onPress={() => setSaved(value => !value)} disabled={busy} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            <View style={{ width: 25, height: 25, borderRadius: 7, borderWidth: 2, borderColor: colors.primary, backgroundColor: saved ? '#393185' : colors.surface, alignItems: 'center', justifyContent: 'center' }}>{saved && <Icon name="check" size={17} color="#FFFFFF"/>}</View>
            <Txt bold size={13} style={{ flex: 1 }}>{kk ? 'Кодты қауіпсіз жерге сақтадым' : 'Я сохранил код в надёжном месте'}</Txt>
          </Pressable>
          {!!error && <Notice error>{error}</Notice>}
          <Button icon="check" disabled={!saved} loading={busy} onPress={() => void finish()}>{kk ? 'Жалғастыру' : 'Продолжить'}</Button>
        </View>
      </ScrollView>
    </View>
  </Modal>;
}
