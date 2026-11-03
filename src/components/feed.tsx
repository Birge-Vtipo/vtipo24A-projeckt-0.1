import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Pressable, TextInput, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native-paper';
import { useApp } from '../store';
import { districts, moduleInfo, modules } from '../types';
import { Word } from '../i18n';
import { filterListings } from '../lib/validation';
import { Art } from './art';
import { ListingCard } from './listing-card';
import { Button, Chip, Empty, Icon, Row, Txt } from './ui';
import StudyMap from './study-map';
export function Feed({ home = false }: { home?: boolean }) {
  const app = useApp(), { t, colors } = app; const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ module?: string; favorites?: string }>();
  const [module, setModule] = useState(params.module || 'all'), [query, setQuery] = useState('');
  const [district, setDistrict] = useState('all'), [saved, setSaved] = useState(params.favorites === '1');
  const [map, setMap] = useState(false), [filters, setFilters] = useState(false);
  const [wifi, setWifi] = useState(false), [sockets, setSockets] = useState(false), [quiet, setQuiet] = useState(false);
  const columns = width >= 1300 ? 3 : width >= 680 ? 2 : 1;
  const items = filterListings(app.listings.filter(x => x.moderation === 'approved' && x.status !== 'cancelled'), { query, module: map ? 'study' : module, district, onlyFavorites: saved, favorites: app.favorites, wifi, sockets, quiet });
  const reset = () => { setModule('all'); setQuery(''); setDistrict('all'); setSaved(false); setWifi(false); setSockets(false); setQuiet(false); setMap(false); };
  return <View style={{ gap: 25 }}>
    {home && <LinearGradient colors={['#211A52', '#393185', '#6454A2']} start={{x:0,y:0}} end={{x:1,y:1}} style={{ backgroundColor: '#393185', borderRadius: 24, padding: width < 600 ? 26 : 36, minHeight: width < 600 ? 280 : 300, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ flex: 1, gap: 15, zIndex: 1 }}><Row><View style={{ width: 6, height: 6, backgroundColor: '#D2AE6D', borderRadius: 3 }} /><Txt color="#ECD8B3" size={10} bold style={{ letterSpacing: 1.8 }}>{t('eyebrow')}</Txt></Row><Txt color="#F9F8EE" bold size={width < 600 ? 35 : 45} style={{ lineHeight: width < 600 ? 41 : 51, letterSpacing: -1.2 }}>{t('hero')}</Txt><Txt color="#DBD5F0" size={13}>{t('heroSub')}</Txt><Button secondary icon="arrow" style={{ alignSelf: 'flex-start', backgroundColor: '#EBD5AB', marginTop: 4 }} onPress={() => router.push('/search')}>{t('explore')}</Button></View>
      {width > 760 && <View style={{ width: '46%', height: 280, marginVertical: -22 }}><Art hero /></View>}
    </LinearGradient>}
    {home && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {modules.map(m => <Pressable accessibilityRole="button" key={m} onPress={() => { setModule(m); setMap(false); }} style={({ pressed }) => ({ flexBasis: width < 700 ? '46%' : '22%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: module === m ? colors.primary : colors.line, borderRadius: 16, opacity: pressed ? .7 : 1 })}><View style={{ backgroundColor: moduleInfo[m].color, padding: 12, borderRadius: 12 }}><Icon name={moduleInfo[m].icon} color={moduleInfo[m].ink} size={23} /></View><View style={{ flex: 1 }}><Txt bold size={15}>{moduleInfo[m].name}</Txt><Txt color={colors.muted} size={10}>{t(`${m}Sub` as Word)}</Txt></View></Pressable>)}
    </View>}
    <Row style={{flexWrap:'wrap'}}><Button secondary icon="users" onPress={()=>router.push('/people')}>{app.language==='kk'?'Адамдарды табу':'Найти людей'}</Button><Button secondary icon="plus" onPress={()=>router.push('/create?task=1')}>{app.language==='kk'?'Ақылы тапсырма':'Платное задание'}</Button></Row>
    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}><View style={{ flex: 1, gap: 5 }}><Txt bold size={home ? 25 : 30} style={{ letterSpacing: -.6 }}>{t(home ? 'feed' : 'search')}</Txt><Txt color={colors.muted} size={12}>{t('feedSub')}</Txt></View><Button small secondary icon="refresh" onPress={() => void app.refresh()}>{t('retry')}</Button></Row>
    <Row style={{ backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 13, paddingHorizontal: 15 }}><Icon name="search" color={colors.muted} size={19} /><TextInput accessibilityLabel={t('search')} value={query} onChangeText={setQuery} placeholder={app.language === 'kk' ? 'Кітап, көмек, оқу орны…' : 'Книги, помощь, место для учёбы…'} placeholderTextColor={colors.muted} style={{ flex: 1, height: 49, fontSize: 14, color: colors.text }} /><Pressable accessibilityRole="button" accessibilityLabel={t('category')} onPress={() => setFilters(!filters)} style={{ padding: 10 }}><Icon name="filter" size={18} /></Pressable></Row>
    <Row style={{ flexWrap: 'wrap', gap: 8 }}><Chip active={module === 'all' && !map} onPress={() => { setModule('all'); setMap(false); }}>{t('all')}</Chip>{modules.map(m => <Chip key={m} active={module === m} onPress={() => { setModule(m); setMap(false); }}>{moduleInfo[m].name}</Chip>)}<Chip icon="heart" active={saved} onPress={() => setSaved(!saved)}>{t('favorites')}</Chip><Chip icon="map" active={map} onPress={() => { setMap(!map); setModule('study'); }}>{t('map')}</Chip></Row>
    {filters && <View style={{ gap: 12 }}><Txt bold size={12}>{t('district')}</Txt><Row style={{ flexWrap: 'wrap', gap: 8 }}><Chip active={district === 'all'} onPress={() => setDistrict('all')}>{t('all')}</Chip>{districts.map(d => <Chip key={d} active={district === d} onPress={() => setDistrict(d)}>{d}</Chip>)}</Row>{(module === 'study' || map) && <Row style={{ flexWrap: 'wrap' }}><Chip active={wifi} onPress={() => setWifi(!wifi)}>{t('wifi')}</Chip><Chip active={sockets} onPress={() => setSockets(!sockets)}>{t('sockets')}</Chip><Chip active={quiet} onPress={() => setQuiet(!quiet)}>{t('quiet')}</Chip></Row>}</View>}
    {app.loading ? <ActivityIndicator color={colors.primary} /> : map ? <StudyMap items={items} /> : items.length === 0 ? <Empty title={t('empty')} subtitle={t('emptySub')}><Button secondary onPress={reset}>{t('clear')}</Button></Empty> : <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 18 }}>{items.map(item => <View key={item.id} style={{ width: columns === 1 ? '100%' : columns === 2 ? '48.5%' : '31.8%', flexGrow: 0 }}><ListingCard item={item} /></View>)}</View>}
    <Row style={{ justifyContent: 'center', paddingTop: 8 }}><Icon name="leaf" size={14} color={colors.muted} /><Txt color={colors.muted} size={11}>Birge · {t('nearby')}</Txt></Row>
  </View>;
}
