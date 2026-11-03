import React from 'react';
import { Platform, Share, Text, View } from 'react-native';
import { useApp } from '../store';
import { publicHandle, profileShareText } from '../lib/profile-handle';
import { Button, Row, Txt, useAction } from './ui';

export function ProfileIdentity({ handle }: { handle?: string | null }) {
  const { colors, language } = useApp(), { busy, run } = useAction();
  const kk = language === 'kk', visible = publicHandle(handle);
  if (!visible || !handle) return null;
  return <View style={{ gap: 11, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.soft, overflow: 'hidden' }}>
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 18, bottom: 18, width: 3, backgroundColor: '#D2AE6D', borderRadius: 3 }}/>
    <Row style={{ gap: 8 }}>
      <View style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#393185', transform: [{ rotate: '-8deg' }] }}><Txt bold size={17} color="#D2AE6D">@</Txt></View>
      <Txt bold size={10} color={colors.muted} style={{ letterSpacing: 2 }}>BIRGE / @</Txt>
      <View style={{ height: 1, flex: 1, backgroundColor: colors.line }}/>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#D2AE6D' }}/>
    </Row>
    <Text selectable selectionColor="#D2AE6D66" accessibilityLabel={`Профиль: ${visible}`} accessibilityHint={kk ? 'Көшіру үшін профиль атын басып ұста' : 'Удерживайте имя профиля, чтобы скопировать'} style={{ color: colors.text, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 20, lineHeight: 29, fontWeight: '700', letterSpacing: .1 }}>{visible}</Text>
    <Txt size={11} color={colors.muted}>{kk ? 'Басып ұстап көшір. Осы @аты арқылы адамды іздеуге болады.' : 'Удерживайте, чтобы скопировать. По этому @имени можно найти человека.'}</Txt>
    <Button secondary small icon="external" loading={busy} onPress={() => void run(() => Share.share({ message: profileShareText(handle) }).then(() => {}))}>{kk ? 'Бөлісу' : 'Поделиться'}</Button>
  </View>;
}
