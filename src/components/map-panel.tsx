import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Listing } from '../types';
import { useApp } from '../store';
import { Button, Chip, Empty, Notice, Row, Txt } from './ui';
export function mapURL(item: Listing) {
  const lat = item.metadata.lat!, lng = item.metadata.lng!;
  const bbox = [lng - .012, lat - .007, lng + .012, lat + .007].join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lng}`;
}
export function MapPanel({ items, render }: { items: Listing[]; render: (url: string) => React.ReactNode }) {
  const { t, isDemo, colors } = useApp();
  const places = items.filter(x => Number.isFinite(x.metadata.lat) && Number.isFinite(x.metadata.lng));
  const [selected, setSelected] = useState<string>();
  const active = places.find(x => x.id === selected) || places[0];
  if (!active) return <Empty title={t('empty')} icon="map" />;
  return <View style={{ gap: 14 }}>
    {isDemo && <Notice>{t('mapNote')}</Notice>}
    <Row style={{ flexWrap: 'wrap' }}>{places.map(item => <Chip key={item.id} icon="pin" active={item.id === active.id} onPress={() => setSelected(item.id)}>{item.title}</Chip>)}</Row>
    <View style={{ height: 420, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.soft }}>{render(mapURL(active))}</View>
    <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}><View style={{ flex: 1, minWidth: 180 }}><Txt bold>{active.title}</Txt><Txt color={colors.muted} size={12}>{active.metadata.address}</Txt></View><Button small secondary icon="external" onPress={() => router.push(`/listing/${active.id}`)}>{t('details')}</Button></Row>
  </View>;
}
