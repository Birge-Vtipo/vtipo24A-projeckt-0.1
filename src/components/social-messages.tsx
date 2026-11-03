import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AppState,Pressable,ScrollView,TextInput,View} from 'react-native';
import {router,useFocusEffect,useLocalSearchParams} from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {useApp} from '../store';
import {uploadMedia} from '../lib/social-api';
import {Conversation} from '../types';
import {Button,Empty,Icon,Row,Txt,useAction} from './ui';
import {Avatar} from './profile-hero';
import {MediaView} from './media-view';
import {ReadReceipt} from './read-receipt';
import {VoiceDraft,VoiceRecorder} from './voice-recorder';
import {setNotificationView} from '../lib/live-notifications';

export function SocialMessages() {
  const {conversation}=useLocalSearchParams<{conversation?:string}>();
  return <ChatContent key={conversation||'inbox'} initial={conversation}/>;
}
function ChatContent({initial}:{initial?:string}) {
  const app=useApp(),{colors}=app,kk=app.language==='kk';
  const selected=initial;
  const chat=app.conversations.find(c=>c.id===selected);
  const name=(c:Conversation)=>c.kind==='group'?c.title:c.kind==='listing'?app.listings.find(l=>l.id===c.listing_id)?.title:app.profiles.find(p=>c.members?.includes(p.id)&&p.id!==app.userId)?.name;
  if(!app.userId)return <Empty title={app.t('needLogin')}><Button onPress={()=>router.push('/auth')}>{app.t('login')}</Button></Empty>;
  if(chat)return <ConversationThread key={chat.id} chat={chat} title={name(chat)||app.t('messages')} onBack={()=>router.replace('/messages')}/>;
  return <ScrollView style={{flex:1}} contentContainerStyle={{gap:18,paddingBottom:20}}>
    <Row style={{justifyContent:'space-between'}}><Txt size={30} bold>{kk?'Чаттар':'Чаты'}</Txt><Button small icon="plus" onPress={()=>router.push('/people')}>{kk?'Жаңа чат':'Новый чат'}</Button></Row>
    <Txt size={12} color={colors.muted}>{kk?'Бір хабарлама. Жаңа байланыс.':'Одно сообщение. Новая связь.'}</Txt>
    {app.conversations.length?app.conversations.map(c=>{
      const list=app.messages.filter(m=>m.conversation_id===c.id),last=list.at(-1);
      const person=app.profiles.find(p=>c.members?.includes(p.id)&&p.id!==app.userId);
      const unread=list.filter(m=>m.sender_id!==app.userId&&m.sequence!==undefined&&m.sequence>(c.read_sequence_by?.[app.userId!]||0)).length;
      return <Pressable key={c.id} accessibilityRole="button" onPress={()=>router.push({pathname:'/messages',params:{conversation:c.id}})} style={{padding:18,borderRadius:24,backgroundColor:colors.surface,borderWidth:1,borderColor:unread?colors.primary+'55':colors.line}}>
        <Row><Avatar profile={person}/><View style={{flex:1,gap:4}}><Txt bold size={17} lines={1}>{name(c)||app.t('messages')}</Txt><Txt size={12} color={colors.muted} lines={1}>{last?.body||(last?.kind==='audio'?'🎙 '+(kk?'Дауыс хабарлама':'Голосовое'):last?.kind==='video'?'▶ Видео':last?.kind==='image'?'Фото':kk?'Әңгіме баста':'Начните разговор')}</Txt></View>{!!unread&&<View style={{minWidth:24,height:24,paddingHorizontal:6,borderRadius:12,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'}}><Txt size={10} bold color="#FFFFFF">{unread>99?'99+':unread}</Txt></View>}</Row>
      </Pressable>;
    }):<Empty icon="messages" title={kk?'Алғашқы әңгімеңді баста':'Начните первый разговор'}><Button icon="users" onPress={()=>router.push('/people')}>{kk?'Адамдарды табу':'Найти людей'}</Button></Empty>}
  </ScrollView>;
}

function ConversationThread({chat,title,onBack}:{chat:Conversation;title:string;onBack:()=>void}) {
  const app=useApp(),{colors}=app,kk=app.language==='kk',{busy,run}=useAction();
  const scroll=useRef<React.ComponentRef<typeof ScrollView>>(null),stick=useRef(true),viewport=useRef(0),content=useRef(0);
  const [focused,setFocused]=useState(false),[active,setActive]=useState(AppState.currentState==='active'),[atBottom,setAtBottom]=useState(false);
  const messages=app.messages.filter(m=>m.conversation_id===chat.id),latest=messages.filter(m=>!m.delivery).at(-1),listing=app.listings.find(l=>l.id===chat.listing_id);
  const markRead=app.markConversationRead,ownMarker=chat.read_by?.[app.userId!],ownSequence=chat.read_sequence_by?.[app.userId!]||0;
  useFocusEffect(useCallback(()=>{setFocused(true);return()=>setFocused(false);},[]));
  useEffect(()=>{const sub=AppState.addEventListener('change',s=>setActive(s==='active'));return()=>sub.remove();},[]);
  useEffect(()=>{setNotificationView(focused&&active&&atBottom?chat.id:'');return()=>setNotificationView('');},[focused,active,atBottom,chat.id]);
  useEffect(()=>{
    if(!focused||!active||!atBottom||!latest||ownMarker===latest.id||(latest.sequence!==undefined&&ownSequence>=latest.sequence))return;
    const timer=setTimeout(()=>{void markRead(chat.id,latest.id).catch(()=>{/* Retry with the next foreground snapshot. */});},350);
    return()=>clearTimeout(timer);
  },[focused,active,atBottom,latest,ownMarker,ownSequence,chat.id,chat.read_by,markRead]);
  return <View style={{gap:12,flex:1}}>
    <Row><Pressable accessibilityRole="button" accessibilityLabel={app.t('back')} onPress={onBack} style={{height:44,width:44,borderRadius:16,backgroundColor:colors.soft,alignItems:'center',justifyContent:'center'}}><Icon name="back"/></Pressable><View style={{flex:1}}><Txt size={20} bold lines={1}>{title}</Txt><Txt size={11} color={colors.muted}>{chat.kind==='group'?`${chat.members?.length||0} · ${kk?'қатысушы':'участников'}`:kk?'Жеке әңгіме':'Личный разговор'}</Txt></View><Pressable accessibilityRole="button" accessibilityLabel={app.t('retry')} onPress={()=>void app.refresh()} style={{height:44,width:44,alignItems:'center',justifyContent:'center'}}><Icon name="refresh" color={colors.muted}/></Pressable></Row>
    <Row style={{flexWrap:'wrap'}}>{chat.members?.filter(id=>id!==app.userId).map(id=><Pressable key={id} onPress={()=>router.push(`/user/${id}`)}><Txt size={11} color={colors.primary}>{app.profiles.find(p=>p.id===id)?.name||'Профиль'} ↗</Txt></Pressable>)}</Row>
    {listing&&<Row style={{flexWrap:'wrap'}}>{!chat.accepted&&app.userId===chat.owner_id&&listing.status==='open'&&<Button small loading={busy} onPress={()=>void run(()=>app.transaction(chat.id,'accept'))}>{app.t('accept')}</Button>}{chat.accepted&&!(chat.owner_confirmed&&chat.responder_confirmed)&&<Button small secondary loading={busy} disabled={app.userId===chat.owner_id?chat.owner_confirmed:chat.responder_confirmed} onPress={()=>void run(()=>app.transaction(chat.id,'confirm'))}>{app.t('confirm')}</Button>}{chat.owner_confirmed&&chat.responder_confirmed&&<Txt>{app.t('completed')}</Txt>}</Row>}
    <View style={{flex:1,borderRadius:26,overflow:'hidden',borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface}}>
      <ScrollView ref={scroll} style={{flex:1,backgroundColor:colors.bg}} contentContainerStyle={{padding:14,gap:12}} scrollEventThrottle={100} keyboardShouldPersistTaps="handled"
        onLayout={e=>{viewport.current=e.nativeEvent.layout.height;if(content.current<=viewport.current)setAtBottom(true);if(stick.current)requestAnimationFrame(()=>scroll.current?.scrollToEnd({animated:false}));}}
        onContentSizeChange={(_w,h)=>{content.current=h;if(h<=viewport.current)setAtBottom(true);if(stick.current)requestAnimationFrame(()=>scroll.current?.scrollToEnd({animated:false}));}}
        onScroll={e=>{const n=e.nativeEvent,bottom=n.contentSize.height-n.contentOffset.y-n.layoutMeasurement.height<28;stick.current=bottom;setAtBottom(bottom);}}>
        {!messages.length&&<View style={{paddingVertical:60,alignItems:'center',gap:8}}><Icon name="messages" size={32} color={colors.primary}/><Txt color={colors.muted}>{app.t('noMessages')}</Txt></View>}
        {messages.map(m=>{
          const mine=m.sender_id===app.userId,sender=app.profiles.find(p=>p.id===m.sender_id);
          return <View key={m.client_id||m.id} style={{maxWidth:'94%',width:m.kind==='audio'?280:m.media_url?250:undefined,alignSelf:mine?'flex-end':'flex-start',backgroundColor:mine?colors.soft:colors.surface,padding:m.kind==='audio'?10:12,borderRadius:20,borderBottomRightRadius:mine?6:20,borderBottomLeftRadius:mine?20:6,gap:m.kind==='audio'?2:5,borderWidth:1,borderColor:mine?colors.primary+'12':colors.line}}>
            {chat.kind==='group'&&<Pressable onPress={()=>router.push(`/user/${m.sender_id}`)}><Txt size={11} color={colors.primary} bold>{sender?.name||'Birge'}</Txt></Pressable>}
            {m.media_url&&<MediaView uri={m.media_url} kind={m.kind} waveform={m.waveform} durationMs={m.duration_ms} avatar={sender}/>}
            {!!m.body&&<Txt>{m.body}</Txt>}
            <Row style={{alignSelf:'flex-end',gap:5,justifyContent:'flex-end'}}><Txt size={9} color={colors.muted}>{new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</Txt>{mine&&(m.delivery==='failed'?<Pressable accessibilityRole="button" accessibilityLabel={kk?'Хабарламаны қайта жіберу':'Повторить отправку сообщения'} onPress={()=>void run(()=>app.retryMessage(m.client_id!))} style={{padding:4}}><Icon name="refresh" size={15} color={colors.danger}/></Pressable>:m.delivery==='sending'?<View accessibilityLabel={kk?'Жіберілуде':'Отправляется'}><Icon name="send" size={13} color={colors.muted}/></View>:<ReadReceipt message={m} chat={chat} messages={messages}/>)}</Row>
          </View>;
        })}
      </ScrollView>
      <Composer key={chat.id} conversation={chat.id}/>
    </View>
  </View>;
}

function Composer({conversation}:{conversation:string}) {
  const app=useApp(),{colors}=app,kk=app.language==='kk',{busy,run}=useAction();
  const [body,setBody]=useState(''),[voiceOpen,setVoiceOpen]=useState(false),[pending,setPending]=useState<{uri:string;mime:string;kind:string}|null>(null);
  const input=useRef<React.ComponentRef<typeof TextInput>>(null);
  function focusComposer(){input.current?.focus();requestAnimationFrame(()=>input.current?.focus());}
  async function pick(){const r=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images','videos'],quality:.8,videoMaxDuration:60});if(!r.canceled){const a=r.assets[0];if((a.fileSize||0)>20*1024*1024)throw new Error('Файл ≤ 20 МБ');setPending({uri:a.uri,mime:a.mimeType||(a.type==='video'?'video/mp4':'image/jpeg'),kind:a.type==='video'?'video':'image'});}}
  async function deliverVoice(draft:VoiceDraft){const media=await uploadMedia(draft.uri,draft.mime,'chat',conversation);const delivered=app.sendMessage(conversation,'',media.id,{...(draft.waveform.length?{waveform:draft.waveform}:{}),duration_ms:draft.durationMs},{kind:media.kind,media_url:media.url});setVoiceOpen(false);await delivered;}
  async function send(){
    const captured=body,attachment=pending;
    focusComposer();
    try{
      const media=attachment?await uploadMedia(attachment.uri,attachment.mime,'chat',conversation):undefined;
      setBody(current=>current===captured?'':current);setPending(null);
      await app.sendMessage(conversation,captured,media?.id,undefined,media?{kind:media.kind,media_url:media.url}:undefined);
    }finally{focusComposer();}
  }
  const canSend=!!body.trim()||!!pending;
  return <View style={{padding:10,gap:10,borderTopWidth:1,borderColor:colors.line,backgroundColor:colors.surface}}>
    {voiceOpen?<VoiceRecorder onSend={deliverVoice} onCancel={()=>setVoiceOpen(false)}/>:<>
      {pending&&<View style={{gap:8,padding:8,borderRadius:18,backgroundColor:colors.soft}}><MediaView uri={pending.uri} kind={pending.kind} height={150}/><Pressable accessibilityRole="button" accessibilityLabel={app.t('cancel')} disabled={busy} onPress={()=>setPending(null)} style={{alignSelf:'flex-end',padding:8}}><Icon name="trash" size={18} color={colors.danger}/></Pressable></View>}
      <Row style={{gap:8,alignItems:'flex-end'}}>
        <Pressable accessibilityRole="button" accessibilityLabel="Фото / Видео" disabled={busy} onPress={()=>void run(pick)} style={{width:42,height:48,alignItems:'center',justifyContent:'center',opacity:busy?.5:1}}><Icon name="image" color={colors.muted}/></Pressable>
        <TextInput ref={input} accessibilityLabel={app.t('message')} placeholder={app.t('message')} placeholderTextColor={colors.muted} value={body} onChangeText={setBody} maxLength={2000} multiline style={{flex:1,minHeight:48,maxHeight:112,borderRadius:20,backgroundColor:colors.bg,color:colors.text,paddingHorizontal:14,paddingTop:13,paddingBottom:13,fontSize:14,textAlignVertical:'center'}}/>
        <Pressable accessibilityRole="button" accessibilityLabel={canSend?app.t('send'):(kk?'Дауыс жазу':'Записать голосовое')} disabled={busy} onPressIn={()=>{if(canSend)focusComposer();}} onPress={()=>canSend?void run(send):setVoiceOpen(true)} style={{width:48,height:48,borderRadius:19,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',opacity:busy?.5:1}}><Icon name={busy?'refresh':canSend?'send':'mic'} color={canSend?'#FFFFFF':'#E9D4A9'} size={21}/></Pressable>
      </Row>
    </>}
  </View>;
}
