import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '../../src/store';
import { Button, Empty, Field, Icon, IconButton, Notice, Row, Txt, useAction } from '../../src/components/ui';
import { ListingImage } from '../../src/components/listing-card';
import { moduleInfo } from '../../src/types';
export default function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>(); const app = useApp(), { colors, t } = app;
  const item = app.listings.find(x => x.id === id), { busy, run } = useAction();
  const [report, setReport] = useState(false), [reason, setReason] = useState(''), [confirmBlock, setConfirmBlock] = useState(false);
  if (!item) return <Empty title={t(app.loading ? 'loading' : 'empty')}><Button onPress={() => router.replace('/')}>{t('home')}</Button></Empty>;
  const info = moduleInfo[item.module], own = item.owner_id === app.userId, active = item.status === 'open' && item.moderation === 'approved';
  const route = async () => { if (item.metadata.lat === undefined || item.metadata.lng === undefined) return; await Linking.openURL(`https://www.openstreetmap.org/?mlat=${item.metadata.lat}&mlon=${item.metadata.lng}#map=17/${item.metadata.lat}/${item.metadata.lng}`); };
  return <View style={{ maxWidth: 850, width: '100%', alignSelf: 'center', gap: 20 }}>
    <Row style={{ justifyContent: 'space-between' }}><Button secondary small icon="back" onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>{t('back')}</Button><IconButton name="heart" label={t('favorites')} active={app.favorites.includes(id)} onPress={() => void run(() => app.toggleFavorite(id))} /></Row>
    <View style={{ borderRadius: 24, overflow: 'hidden' }}><ListingImage item={item} height={300} /></View>
    <Row style={{ justifyContent: 'space-between' }}><Row><Icon name={info.icon} color={colors.primary} /><Txt bold color={colors.primary}>{info.name}</Txt></Row><Txt color={colors.muted} size={12}>{t(item.moderation === 'pending' ? 'pending' : item.status)}</Txt></Row>
    <Txt bold size={30}>{item.title}</Txt>
    {!!item.metadata.reward && <Txt bold size={30} color={colors.primary}>{item.metadata.reward.toLocaleString()} ₸</Txt>}
    {app.phoneAuthEnabled && <Button secondary icon="user" onPress={()=>router.push(`/user/${item.owner_id}`)}>{app.profiles.find(p=>p.id===item.owner_id)?.name || 'Профиль'} ↗</Button>}
    <Row><Icon name="pin" size={16} color={colors.muted} /><Txt color={colors.muted}>{item.city} · {item.district}</Txt><Txt color={colors.muted} size={12}>· {new Date(item.created_at).toLocaleDateString(app.language === 'kk' ? 'kk-KZ' : 'ru-RU')}</Txt></Row>
    {item.is_demo && <Notice>{t('demo')} · {t('demoNote')}</Notice>}
    <View style={{ padding: 24, borderRadius: 18, backgroundColor: colors.surface, gap: 18, borderWidth: 1, borderColor: colors.line }}>
      <Txt size={16}>{item.description}</Txt>
      {item.metadata.exchange && <View><Txt color={colors.muted} size={12}>{t('exchange')}</Txt><Txt bold>{item.metadata.exchange}</Txt></View>}
      {item.metadata.date && <Txt>{t('date')}: {item.metadata.date}</Txt>}
      {item.module === 'study' && <><Txt>{item.metadata.address}</Txt><Txt>{t('hours')}: {item.metadata.hours}</Txt><Txt>{t('access')}: {item.metadata.access}</Txt><Row style={{ flexWrap: 'wrap' }}>{(['wifi', 'sockets', 'quiet'] as const).filter(k => item.metadata[k]).map(k => <Row key={k}><Icon name={k === 'sockets' ? 'plug' : k} size={17} /><Txt size={13}>{t(k)}</Txt></Row>)}</Row><Notice>{item.is_demo ? t('mapNote') : t('studyNotice')}</Notice></>}
      {item.module === 'aid' && <><Txt>{t('organization')}: {item.metadata.organization || '—'}</Txt><Txt>{t('needed')}: {item.metadata.needed}</Txt><Notice>{t('noVerification')} · {t('aidNotice')}</Notice></>}
      {item.module === 'help' && <Notice>{t('helpNotice')}</Notice>}
    </View>
    {own ? <Row style={{ flexWrap: 'wrap' }}><Button secondary icon="edit" disabled={item.status !== 'open'} onPress={() => router.push({ pathname: '/create', params: { edit: item.id } })}>{t('edit')}</Button><Button secondary danger disabled={item.status === 'cancelled' || item.status === 'completed'} loading={busy} onPress={() => void run(() => app.closeListing(id))}>{t('close')}</Button></Row> :
      <Row style={{ flexWrap: 'wrap' }}>{item.module === 'study' ? <Button icon="map" onPress={() => void run(route)}>{t('directions')}</Button> : <Button icon={item.module === 'swap' ? 'repeat' : 'heart-handshake'} disabled={!active} loading={busy} onPress={() => void run(() => app.startConversation(item))}>{t(item.module === 'swap' ? 'offer' : 'respond')}</Button>}<Button secondary icon="flag" onPress={() => setReport(!report)}>{t('report')}</Button><Button secondary icon="lock" onPress={() => setConfirmBlock(!confirmBlock)}>{t('block')}</Button></Row>}
    {confirmBlock && <Notice><Button small danger onPress={() => void run(async () => { await app.blockUser(item.owner_id); router.replace('/'); })}>{t('block')}</Button></Notice>}
    {report && <View style={{ gap: 12 }}><Field label={t('reportReason')} value={reason} onChangeText={setReason} multiline maxLength={1000} /><Button loading={busy} onPress={() => void run(async () => { await app.reportListing(id, reason); setReport(false); setReason(''); })}>{t('send')}</Button></View>}
  </View>;
}
