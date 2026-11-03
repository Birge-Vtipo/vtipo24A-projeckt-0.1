import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../store';
import { Profile } from '../types';
import { uploadMedia } from '../lib/social-api';
import { Button, Chip, Empty, Field, Notice, Row, Txt, useAction } from './ui';
import { ProfileHero } from './profile-hero';
import { ListingCard } from './listing-card';
import { PasswordSettings } from './password-form';
import { MediaView } from './media-view';
import { webGuestMode } from '../lib/web-guest';

export function SocialProfile() {
  const app=useApp();
  if(!app.userId)return webGuestMode ? <Empty title={app.t('loading')}><Button onPress={()=>void app.refresh()}>{app.t('retry')}</Button></Empty> : <Empty title={app.t('needLogin')}><Button onPress={()=>router.push('/auth')}>{app.t('login')}</Button></Empty>;
  if(!app.profile)return <Empty title={app.t(app.loading?'loading':'empty')}><Button onPress={()=>void app.refresh()}>{app.t('retry')}</Button></Empty>;
  return <ProfileEditor key={app.profile.id} initial={app.profile}/>;
}
function ProfileEditor({initial}:{initial:Profile}) {
  const app=useApp(), {colors}=app, kk=app.language==='kk', {busy,run}=useAction();
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState(initial);
  const p=app.profile || initial, mine=app.listings.filter(l=>l.owner_id===app.userId);
  async function choose(field:'avatar'|'cover'|'wallpaper') {
    const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:field==='avatar'?['images']:['images','videos'],quality:field==='avatar'?.8:1,allowsEditing:field==='avatar',aspect:[1,1],videoMaxDuration:30});
    if(result.canceled)return;
    const a=result.assets[0]; if((a.duration||0)>(Platform.OS==='web'?30:30000))throw new Error('Видео ≤ 30 с');
    const m=await uploadMedia(a.uri,a.mimeType || (a.type==='video'?'video/mp4':'image/jpeg'),'profile');
    setDraft(d=>({...d,[field]:m.id,[field+'_url']:m.url,...(field==='avatar'?{}:{[field+'_kind']:m.kind})}));
  }
  return <View style={{gap:20,maxWidth:850,width:'100%',alignSelf:'center',padding:p.wallpaper_url?12:0,borderRadius:26,overflow:'hidden'}}>
    {p.wallpaper_url&&<View pointerEvents="none" style={{position:'absolute',top:0,left:0,right:0,bottom:0,opacity:.25}}><MediaView uri={p.wallpaper_url} kind={p.wallpaper_kind} background height={2400}/></View>}
    <ProfileHero profile={editing?{...draft,handle:p.handle}:p}/>
    <Row style={{flexWrap:'wrap'}}><Button secondary icon="settings" onPress={()=>router.push('/settings')}>{webGuestMode ? (kk?'Баптаулар':'Настройки') : (kk?'Аккаунт баптаулары':'Настройки аккаунта')}</Button><Button secondary icon="bell" onPress={()=>router.push('/notifications')}>{kk?'Хабарландырулар':'Уведомления'}</Button></Row>
    <Row style={{flexWrap:'wrap'}}><Button icon="edit" onPress={()=>{setDraft(p);setEditing(!editing);}}>{kk?'Профильді безендіру':'Оформить профиль'}</Button><Button secondary icon="external" onPress={()=>router.push(`/user/${p.id}`)}>{kk?'Сырттан көру':'Посмотреть профиль'}</Button></Row>
    {editing&&<View style={{padding:22,borderRadius:22,gap:18,backgroundColor:colors.surface}}>
      <Field label={app.t('name')} value={draft.name} onChangeText={name=>setDraft(d=>({...d,name}))} maxLength={80}/>
      <Field label={kk?'Өзің туралы':'О себе'} value={draft.bio || ''} onChangeText={bio=>setDraft(d=>({...d,bio}))} maxLength={500} multiline/>
      <Row style={{flexWrap:'wrap'}}>{(['avatar','cover','wallpaper'] as const).map((field,i)=><View key={field} style={{gap:6}}><Button secondary small icon="image" loading={busy} onPress={()=>void run(()=>choose(field))}>{(kk?['Аватар','Мұқаба','Тұсқағаз']:['Аватар','Обложка','Обои'])[i]}</Button>{draft[field]&&<Button secondary small icon="x" onPress={()=>setDraft(d=>({...d,[field]:null,[field+'_url']:null}))}>{kk?'Өшіру':'Убрать'}</Button>}</View>)}</Row>
      <Notice>{kk?'Мұқаба мен тұсқағазды басқа қолданушылар да көреді. Галереядан фото, GIF немесе 30 секундқа дейінгі видео таңдауға болады. Файл: 20 МБ-қа дейін.':'Обложка и обои видны другим пользователям. Выберите фото, GIF или видео до 30 секунд из галереи. Файл до 20 МБ.'}</Notice>
      <Row style={{flexWrap:'wrap'}}>{['#393185','#26223E','#7B3D65','#246A68','#9A6C35'].map(accent=><Chip key={accent} active={draft.accent===accent} onPress={()=>setDraft(d=>({...d,accent}))}><Txt color={accent}>●</Txt></Chip>)}</Row>
      <Button loading={busy} icon="check" onPress={()=>void run(async()=>{await app.updateProfile(draft.name,draft);setEditing(false);})}>{app.t('save')}</Button>
    </View>}
    <Row style={{flexWrap:'wrap'}}><Button secondary icon="users" onPress={()=>router.push('/people')}>{kk?'Адамдарды табу':'Найти людей'}</Button><Button secondary icon="heart" onPress={()=>router.push('/search?favorites=1')}>{app.t('favorites')} · {app.favorites.length}</Button></Row>
    {!webGuestMode&&<PasswordSettings/>}
    {!!app.legacyListings.length&&<View style={{gap:12,padding:18,backgroundColor:colors.surface,borderRadius:20}}><Txt bold size={18}>{kk?'Осы телефондағы бұрынғы жарияланымдар':'Прежние публикации на этом телефоне'}</Txt><Txt size={12} color={colors.muted}>{kk?'Бұлар құрылғыда сақталған. Қажетін тексеріп, ортақ тақтаға жариялай аласың.':'Они сохранены на устройстве. Проверьте нужные и опубликуйте на общей доске.'}</Txt>{app.legacyListings.map(l=><View key={l.id} style={{gap:8}}><Txt bold>{l.title}</Txt><Button secondary small onPress={()=>router.push({pathname:'/create',params:{legacy:l.id}})}>{kk?'Өңдеп жариялау':'Проверить и опубликовать'}</Button></View>)}</View>}
    <Txt bold size={23}>{app.t('myListings')} · {mine.length}</Txt>
    {mine.length?mine.map(item=><ListingCard key={item.id} item={item}/>):<Empty title={app.t('empty')}><Button icon="plus" onPress={()=>router.push('/create')}>{app.t('create')}</Button></Empty>}
    {!webGuestMode&&<Button secondary icon="logout" loading={busy} onPress={()=>void run(app.signOut)}>{app.t('logout')}</Button>}
  </View>;
}
