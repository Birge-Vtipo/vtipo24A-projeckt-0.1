import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useApp } from '../../src/store';
import { Profile } from '../../src/types';
import { socialRequest } from '../../src/lib/social-api';
import { ProfileHero } from '../../src/components/profile-hero';
import { MediaView } from '../../src/components/media-view';
import { ListingCard } from '../../src/components/listing-card';
import { Button, Empty, Row, Txt, useAction } from '../../src/components/ui';
export default function PublicProfile() {
  const {id}=useLocalSearchParams<{id:string}>(),app=useApp(),kk=app.language==='kk',{busy,run}=useAction();
  const [remote,setRemote]=useState<Profile|null>(null);
  useEffect(()=>{let live=true;void socialRequest<{users:Profile[]}>('users?q='+encodeURIComponent(id)).then(r=>{if(live)setRemote(r.users.find(p=>p.id===id)||null);}).catch(e=>{if(live)app.setError(e.message);});return()=>{live=false;};},[id,app.profiles]); // eslint-disable-line react-hooks/exhaustive-deps
  const p=app.profile?.id===id?app.profile:app.profiles.find(p=>p.id===id)||remote;
  if(!p)return <Empty title={app.t('loading')}/>;
  return <View style={{gap:20,padding:p.wallpaper_url?12:0,borderRadius:26,overflow:'hidden'}}>{p.wallpaper_url&&<View pointerEvents="none" style={{position:'absolute',top:0,left:0,right:0,bottom:0,opacity:.3}}><MediaView uri={p.wallpaper_url} kind={p.wallpaper_kind} background height={1800}/></View>}<ProfileHero profile={p}/>
    {p.id!==app.userId&&<Row><Button loading={busy} icon={p.followed?'check':'plus'} onPress={()=>void run(()=>app.follow(p.id,!p.followed))}>{p.followed?(kk?'Жазылдың':'Вы подписаны'):(kk?'Жазылу':'Подписаться')}</Button><Button secondary loading={busy} icon="messages" onPress={()=>void run(()=>app.startDirect(p.id))}>{kk?'Хабарлама':'Написать'}</Button></Row>}
    <Txt bold size={23}>{kk?'Жарияланымдар':'Публикации'}</Txt>{app.listings.filter(l=>l.owner_id===p.id&&l.status!=='cancelled').map(l=><ListingCard key={l.id} item={l}/>)}
    {p.id!==app.userId&&<Button secondary danger loading={busy} onPress={()=>void run(()=>app.blockUser(p.id))}>{kk?'Қолданушыны бұғаттау':'Заблокировать пользователя'}</Button>}
  </View>;
}
