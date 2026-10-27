import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '../src/store';
import { Button, Empty, Field, Icon, Notice, Row, Txt, useAction } from '../src/components/ui';
import { SocialMessages } from '../src/components/social-messages';
export default function Messages() {
  const app = useApp();
  const { conversation } = useLocalSearchParams<{ conversation?: string }>();
  if(app.phoneAuthEnabled) return <SocialMessages/>;
  return <MessagesContent key={conversation || 'inbox'} initialConversation={conversation} />;
}
function MessagesContent({ initialConversation }: { initialConversation?: string }) {
  const app = useApp(), { t, colors } = app;
  const [selected, setSelected] = useState(initialConversation), [body, setBody] = useState('');
  const { width } = useWindowDimensions(), wide = width > 1050, { busy, run } = useAction(); const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const chats = app.conversations.filter(c => !app.blocked.includes(c.owner_id === app.userId ? c.responder_id : c.owner_id));
  const chat = chats.find(c => c.id === selected), messages = app.messages.filter(m => m.conversation_id === selected);
  const listing = app.listings.find(x => x.id === chat?.listing_id);
  if (!chats.length) return <Empty title={t('noMessages')} subtitle={t('noMessagesSub')} icon="messages"><Button icon="search" onPress={() => router.push('/search')}>{t('search')}</Button></Empty>;
  return <View style={{ gap: 20 }}><Txt bold size={30}>{t('messages')}</Txt>{app.isDemo && <Notice>{t('demoChat')}</Notice>}<View style={{ flexDirection: wide ? 'row' : 'column', gap: 20 }}>
    {(wide || !chat) && <View style={{ width: wide ? 280 : '100%', gap: 10 }}>{chats.map(c => {
      const item = app.listings.find(x => x.id === c.listing_id), last = app.messages.filter(m => m.conversation_id === c.id).at(-1);
      return <Pressable key={c.id} accessibilityRole="button" onPress={() => { setSelected(c.id); setBody(''); }} style={{ padding: 18, borderRadius: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: selected === c.id ? colors.soft : colors.surface, gap: 8 }}><Row><Icon name="messages" size={18} /><Txt bold style={{ flex: 1 }} lines={2}>{item?.title || t('messages')}</Txt></Row><Txt color={colors.muted} size={12} lines={1}>{last?.body || t('noMessages')}</Txt></Pressable>;
    })}</View>}
    {chat ? <View style={{ flex: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
      <View style={{ padding: 20, gap: 12, borderBottomWidth: 1, borderColor: colors.line }}>{!wide && <Button secondary small icon="back" onPress={() => setSelected(undefined)}>{t('back')}</Button>}<Txt bold size={18}>{listing?.title || t('messages')}</Txt><Row style={{ flexWrap: 'wrap' }}>
        {!chat.accepted && app.userId === chat.owner_id && listing?.status === 'open' && <Button small loading={busy} onPress={() => void run(() => app.transaction(chat.id, 'accept'))}>{t('accept')}</Button>}
        {chat.accepted && !(chat.owner_confirmed && chat.responder_confirmed) && <Button small secondary loading={busy} disabled={chat.owner_id === app.userId ? chat.owner_confirmed : chat.responder_confirmed} onPress={() => void run(() => app.transaction(chat.id, 'confirm'))}>{t('confirm')}</Button>}
        {(chat.owner_confirmed || chat.responder_confirmed) && <Txt size={12} color={colors.primary}>{t(chat.owner_confirmed && chat.responder_confirmed ? 'completed' : 'waiting')}</Txt>}
      </Row></View>
      <ScrollView ref={scroll} style={{ height: 340 }} contentContainerStyle={{ padding: 20, gap: 12 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        {messages.length === 0 && <Txt color={colors.muted} style={{ textAlign: 'center', marginTop: 80 }}>{t('noMessages')}</Txt>}
        {messages.map(m => <View key={m.id} style={{ maxWidth: '85%', alignSelf: m.sender_id === app.userId ? 'flex-end' : 'flex-start', backgroundColor: m.sender_id === app.userId ? colors.soft : colors.bg, padding: 13, borderRadius: 14, gap: 4 }}><Txt>{m.body}</Txt><Txt size={10} color={colors.muted} style={{ alignSelf: 'flex-end' }}>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Txt></View>)}
      </ScrollView>
      <View style={{ padding: 16, borderTopWidth: 1, borderColor: colors.line, gap: 10 }}><Field label={t('message')} value={body} onChangeText={setBody} maxLength={2000} multiline style={{ minHeight: 70 }} /><Button icon="send" disabled={!body.trim()} loading={busy} onPress={() => void run(async () => { await app.sendMessage(chat.id, body); setBody(''); })}>{t('send')}</Button></View>
    </View> : wide && <View style={{ flex: 1 }}><Empty title={t('noMessages')} icon="messages" /></View>}
  </View></View>;
}
