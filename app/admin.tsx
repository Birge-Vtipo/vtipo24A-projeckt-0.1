import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '../src/store';
import { Button, Empty, Row, Txt, useAction } from '../src/components/ui';
export default function Admin() {
  const app = useApp(), { colors, t } = app, { busy, run } = useAction();
  if (!app.roles.some(x => ['admin', 'moderator'].includes(x))) return <Empty title="Қолжетімділік шектелген / Доступ ограничен" icon="lock" />;
  const pending = app.listings.filter(x => x.moderation === 'pending');
  return <View style={{ gap: 22 }}><Txt bold size={30}>{t('admin')}</Txt><Txt bold size={20}>{t('pending')} · {pending.length}</Txt>
    {pending.map(x => <View key={x.id} style={{ backgroundColor: colors.surface, padding: 20, borderRadius: 16, gap: 12 }}><Txt bold size={18}>{x.title}</Txt><Txt>{x.description}</Txt><Row style={{ flexWrap: 'wrap' }}><Button secondary small onPress={() => router.push(`/listing/${x.id}`)}>{t('details')}</Button><Button small loading={busy} onPress={() => void run(() => app.moderate(x.id, 'approved'))}>{t('approve')}</Button><Button small secondary danger loading={busy} onPress={() => void run(() => app.moderate(x.id, 'rejected'))}>{t('reject')}</Button></Row></View>)}
    <Txt bold size={20}>{t('report')} · {app.reports.length}</Txt>
    {app.reports.map(r => <View key={r.id} style={{ padding: 20, borderRadius: 16, backgroundColor: colors.surface, gap: 12 }}><Txt>{r.reason}</Txt><Row><Button small secondary onPress={() => router.push(`/listing/${r.listing_id}`)}>{t('details')}</Button><Button small secondary danger loading={busy} onPress={() => void run(() => app.moderate(r.listing_id, 'rejected'))}>{t('reject')}</Button></Row></View>)}
  </View>;
}
