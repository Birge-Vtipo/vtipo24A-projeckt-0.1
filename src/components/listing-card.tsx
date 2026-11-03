import React, { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Listing, moduleInfo } from '../types';
import { useApp } from '../store';
import { Icon, IconButton, Row, Txt, useAction } from './ui';
import { Art } from './art';
import { mediaUri } from '../lib/social-api';
import { supabase } from '../lib/supabase';
export function ListingImage({ item, height = 176 }: { item: Listing; height?: number }) {
  return <ListingImageContent key={`${!!item.is_demo}:${item.image_url || item.image_path || ''}`} item={item} height={height} />;
}
function ListingImageContent({ item, height }: { item: Listing; height: number }) {
  const [uri, setUri] = useState<string | undefined>(item.image_url ? mediaUri(item.image_url) : item.is_demo ? item.image_path ?? undefined : undefined);
  useEffect(() => {
    let live = true;
    if (!item.image_path || item.is_demo || item.image_url) return;
    supabase?.storage.from('listing-images').createSignedUrl(item.image_path, 3600)
      .then(({ data }) => { if (live) setUri(data?.signedUrl); })
      .catch(() => { if (live) setUri(undefined); });
    return () => { live = false; };
  }, [item.image_path, item.is_demo, item.image_url]);
  return <View style={{ height, backgroundColor: moduleInfo[item.module].color }}>{uri ? <Image source={{ uri }} style={{ height: '100%', width: '100%' }} resizeMode="cover" onError={() => setUri(undefined)} /> : <Art module={item.module} />}</View>;
}
export function ListingCard({ item }: { item: Listing }) {
  const { colors, t, favorites, toggleFavorite } = useApp(); const { run } = useAction(); const info = moduleInfo[item.module];
  return <View style={{ backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', alignSelf: 'stretch' }}>
    <Pressable accessibilityRole="button" accessibilityLabel={item.title} onPress={() => router.push(`/listing/${item.id}`)}>
      <ListingImage item={item} /><View style={{ position: 'absolute', left: 13, top: 13, backgroundColor: '#FFFFFFE8', borderRadius: 7, paddingVertical: 4, paddingHorizontal: 9 }}><Txt size={10} bold color={info.ink}>{item.is_demo ? t('sample') : info.name}</Txt></View>
    </Pressable>
    <View style={{ position: 'absolute', right: 10, top: 10 }}><IconButton name="heart" label={t('favorites')} active={favorites.includes(item.id)} onPress={() => void run(() => toggleFavorite(item.id))} /></View>
    <Pressable accessibilityRole="button" onPress={() => router.push(`/listing/${item.id}`)} style={{ padding: 18, gap: 9 }}>
      <Row style={{ justifyContent: 'space-between' }}><Row style={{ gap: 5 }}><Icon name={info.icon} size={13} color={info.ink} /><Txt size={11} bold color={colors.primary}>{info.name}</Txt></Row><Txt size={10} color={colors.muted}>{t(item.moderation === 'pending' ? 'pending' : item.status)}</Txt></Row>
      {!!item.metadata.reward && <Txt bold size={23} color={colors.primary}>{item.metadata.reward.toLocaleString()} ₸</Txt>}
      <Txt bold size={17} lines={2}>{item.title}</Txt>
      <Txt size={12} color={colors.muted} lines={2}>{item.description}</Txt>
      <View style={{ borderTopWidth: 1, borderColor: colors.line, marginTop: 6, paddingTop: 11 }}><Row style={{ justifyContent: 'space-between' }}><Row style={{ gap: 5 }}><Icon name="pin" size={13} color={colors.muted} /><Txt size={11} color={colors.muted}>{item.city} · {item.district}</Txt></Row><Icon name="external" size={16} color={colors.primary} /></Row></View>
    </Pressable>
  </View>;
}
