import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../store';
import { Button, Icon, IconButton, IconName, Notice, Row, Txt } from './ui';
import { Word } from '../i18n';
import { useKeyboardViewport } from '../lib/use-keyboard-viewport';
const nav: { path: '/' | '/search' | '/create' | '/messages' | '/profile'; key: Word; icon: IconName }[] = [
  { path: '/', key: 'home', icon: 'home' }, { path: '/search', key: 'search', icon: 'search' },
  { path: '/create', key: 'create', icon: 'plus' }, { path: '/messages', key: 'messages', icon: 'messages' },
  { path: '/profile', key: 'profile', icon: 'user' },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const app = useApp(), { colors, t } = app; const { width } = useWindowDimensions();
  const desktop = width >= 1000, insets = useSafeAreaInsets(), path = usePathname();
  const chatViewport=path==='/messages'&&app.phoneAuthEnabled;
  const keyboard=useKeyboardViewport(),chatKeyboard=chatViewport&&keyboard.visible;
  const notificationCount=(app as typeof app & {notificationCount?:number}).notificationCount??0;
  function navItem(item: typeof nav[number], compact = false) {
    const active = path === item.path;
    return <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={t(item.key)} accessibilityState={{ selected: active }} onPress={() => router.push(item.path)}
      style={{ flex: compact ? 1 : undefined, flexDirection: compact ? 'column' : 'row', alignItems: 'center', gap: compact ? 5 : 13, padding: compact ? 8 : 15, borderRadius: 12, backgroundColor: active ? colors.soft : 'transparent' }}>
      <Icon name={item.icon} size={compact ? 21 : 20} color={active ? colors.primary : colors.muted} /><Txt lines={1} size={compact ? 10 : 14} bold={active} color={active ? colors.primary : colors.muted}>{compact && item.key==='messages' ? (app.language==='kk'?'Чаттар':'Чаты') : t(item.key)}</Txt>
    </Pressable>;
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined} keyboardVerticalOffset={0} onLayout={keyboard.onLayout}><View style={{ flex: 1, minHeight: 0, backgroundColor: colors.bg, flexDirection: 'row', paddingTop: insets.top }}>
    {desktop && <View style={{ width: 236, backgroundColor: colors.surface, borderRightWidth: 1, borderColor: colors.line, padding: 25, gap: 28 }}>
      <Pressable accessibilityRole="button" onPress={() => router.push('/')}><Row><View style={{ backgroundColor: '#393185', borderRadius: 12, padding: 10 }}><Icon name="leaf" color="#EBD5AB" size={25} /></View><Txt bold size={30} style={{ letterSpacing: -1.5 }}>birge<TextDot /></Txt></Row></Pressable>
      <Txt color={colors.muted} size={10} bold style={{ letterSpacing: 2, marginTop: 18 }}>{app.language === 'kk' ? 'ЖАҚСЫЛЫҚҚА БІР ҚАДАМ' : 'ШАГ НАВСТРЕЧУ ДОБРУ'}</Txt>
      <View style={{ gap: 6 }}>{nav.filter(x => x.key !== 'create').map(x => navItem(x))}</View>
      <Button icon="plus" onPress={() => router.push('/create')}>{t('create')}</Button>
      <View style={{ flex: 1 }} />
      <View style={{ backgroundColor: colors.soft, borderRadius: 18, padding: 18, gap: 12 }}><Icon name="heart-handshake" color={colors.primary} size={28} /><Txt bold>{t('trust')}</Txt><Txt color={colors.muted} size={12}>{t('trustSub')}</Txt></View>
      <Row><View style={{ width: 34, height: 34, backgroundColor: colors.soft, borderRadius: 17, justifyContent: 'center', alignItems: 'center' }}><Icon name="user" size={17} /></View><View style={{ flex: 1 }}><Txt bold size={12} lines={1}>{app.profile?.name || t('login')}</Txt><Txt size={11} color={colors.muted}>{t('city')}</Txt></View></Row>
    </View>}
    <View style={{ flex: 1, minHeight: 0 }}>
      <View style={{ minHeight: 80, paddingHorizontal: desktop ? 42 : 18, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
        <Row style={{ justifyContent: 'space-between', maxWidth: 1180, width: '100%', alignSelf: 'center' }}>
          {!desktop ? <Pressable onPress={() => router.push('/')} accessibilityRole="button"><Txt bold size={29} style={{ letterSpacing: -1 }}>birge<TextDot /></Txt></Pressable> : <Row><Icon name="pin" size={17} color={colors.primary} /><Txt bold size={13}>{t('city')}</Txt><Txt color={colors.muted} size={12}>/ {t('nearby')}</Txt></Row>}
          <Row style={{ gap: 8 }}>{app.userId&&app.phoneAuthEnabled&&<View><IconButton name="bell" label={app.language==='kk'?`Хабарландырулар${notificationCount?`, ${notificationCount} жаңа`:''}`:`Уведомления${notificationCount?`, ${notificationCount} новых`:''}`} active={path==='/notifications'} onPress={()=>router.push('/notifications')}/>{notificationCount>0&&<View pointerEvents="none" style={{position:'absolute',top:-3,right:-3,minWidth:18,height:18,paddingHorizontal:4,borderRadius:9,backgroundColor:'#D2AE6D',alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:colors.surface}}><Txt bold size={9} color="#30265E">{notificationCount>99?'99+':notificationCount}</Txt></View>}</View>}<Pressable accessibilityRole="button" accessibilityLabel={t('language')} onPress={() => app.setLanguage(app.language === 'kk' ? 'ru' : 'kk')} style={{ padding: 10 }}><Txt bold size={12}>{app.language === 'kk' ? 'ҚАЗ' : 'РУС'}</Txt></Pressable><IconButton name={app.darkMode ? 'sun' : 'moon'} label={t('dark')} onPress={() => app.setDarkMode(!app.darkMode)} />{desktop && <Button small icon="plus" onPress={() => router.push('/create')}>{t('create')}</Button>}</Row>
        </Row>
      </View>
      {app.isDemo && <View style={{ backgroundColor: app.darkMode ? '#354332' : '#EFF0DE', paddingVertical: 7, paddingHorizontal: 18 }}><Txt size={11} style={{ textAlign: 'center' }}>{t('demo')} · {desktop ? t('demoNote') : 'MVP preview'}</Txt></View>}
      {!!app.error && <View style={{ padding: 12 }}><Row style={{ alignItems: 'flex-start' }}><View style={{ flex: 1 }}><Notice error>{app.error}</Notice></View><IconButton name="x" label={t('close')} onPress={() => app.setError('')} /></Row></View>}
      {chatViewport?<View style={{flex:1,minHeight:0,paddingHorizontal:desktop?24:12,paddingTop:chatKeyboard?8:desktop?24:12,paddingBottom:chatKeyboard?4:desktop?24:12}}><View style={{flex:1,minHeight:0,maxWidth:1180,width:'100%',alignSelf:'center'}}>{children}</View></View>:<ScrollView key={path} style={{ flex: 1 }} contentContainerStyle={{ padding: desktop ? 36 : 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
        <View style={{ maxWidth: 1180, width: '100%', alignSelf: 'center' }}>{children}</View>
      </ScrollView>}
      {!!app.toast && <View style={{ position: 'absolute', bottom: desktop ? 24 : chatKeyboard?80:90, alignSelf: 'center', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14, backgroundColor: '#393185', maxWidth: '90%' }}><Txt color="white" size={13}>{app.toast}</Txt></View>}
      {!desktop && !chatKeyboard && <View style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.line, flexDirection: 'row', paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8), paddingHorizontal: 8 }}>{nav.map(x => navItem(x, true))}</View>}
    </View>
  </View></KeyboardAvoidingView>;
}
function TextDot() { return <Txt color="#D2AE6D" size={30} bold>.</Txt>; }
