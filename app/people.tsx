import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '../src/store';
import { Profile } from '../src/types';
import { socialRequest } from '../src/lib/social-api';
import { Avatar } from '../src/components/profile-hero';
import { publicHandle } from '../src/lib/profile-handle';
import { Button, Chip, Empty, Field, Row, Txt, useAction } from '../src/components/ui';
export default function People() {
  const app=useApp(),{colors}=app,kk=app.language==='kk',{busy,run}=useAction();
  const [query,setQuery]=useState(''),[users,setUsers]=useState<Profile[]>([]),[group,setGroup]=useState(false),[title,setTitle]=useState(''),[selected,setSelected]=useState<string[]>([]),[error,setError]=useState('');
  useEffect(()=>{if(!app.phoneAuthEnabled||!app.userId)return;let live=true;const timer=setTimeout(()=>{void socialRequest<{users:Profile[]}>('users?q='+encodeURIComponent(query)).then(r=>{if(live){setUsers(r.users);setError('');}}).catch(e=>{if(live)setError(e.message);});},300);return()=>{live=false;clearTimeout(timer);};},[query,app.userId,app.phoneAuthEnabled,app.profiles]);
  if(!app.userId)return <Empty title={app.t('needLogin')}><Button onPress={()=>router.push('/auth')}>{app.t('login')}</Button></Empty>;
  return <View style={{gap:20}}><Txt size={30} bold>{kk?'Бірге болайық':'Будем вместе'}</Txt><Txt color={colors.muted}>{kk?'Адамдарды тап. Жазыл. Әңгіме баста.':'Находи людей. Подписывайся. Общайся.'}</Txt>
    <Field label={app.t('search')} value={query} onChangeText={setQuery} placeholder={kk?'Аты немесе @аты':'Имя или @имя'} autoCapitalize="none" autoCorrect={false}/>
    {!!error&&<Txt color={colors.danger}>{error}</Txt>}
    <Button secondary icon="users" onPress={()=>setGroup(!group)}>{kk?'Топ ашу':'Создать группу'}</Button>
    {group&&<View style={{gap:12,padding:18,borderRadius:20,backgroundColor:colors.surface}}><Field label={kk?'Топ атауы':'Название группы'} value={title} onChangeText={setTitle} maxLength={80}/><Txt size={12}>{kk?'Төменнен қатысушыларды таңда':'Выберите участников ниже'} · {selected.length}/49</Txt><Button disabled={title.trim().length<2||!selected.length} loading={busy} onPress={()=>void run(()=>app.createGroup(title,selected))}>{kk?'Топ құру':'Создать'}</Button></View>}
    {users.filter(u=>u.id!==app.userId).map(p=><View key={p.id} style={{padding:16,borderRadius:20,backgroundColor:colors.surface,gap:14}}>
      <Pressable accessibilityRole="button" accessibilityLabel={'Профиль: '+(publicHandle(p.handle)||p.name)} onPress={()=>router.push(`/user/${p.id}`)}>
        <Row><Avatar profile={p}/><View style={{flex:1,gap:3}}><Txt bold size={17}>{p.name}</Txt>{publicHandle(p.handle)&&<Txt bold size={12} color={colors.primary}>{publicHandle(p.handle)}</Txt>}<Txt size={12} color={colors.muted} lines={1}>{p.bio||p.city}</Txt></View></Row>
      </Pressable>
      <Row>{group?<Chip active={selected.includes(p.id)} onPress={()=>setSelected(s=>s.includes(p.id)?s.filter(x=>x!==p.id):s.length<49?[...s,p.id]:s)}>{selected.includes(p.id)?'✓': '+'} {kk?'Қатысушы':'Участник'}</Chip>:<><Button small secondary icon="messages" loading={busy} onPress={()=>void run(()=>app.startDirect(p.id))}>{kk?'Жазу':'Написать'}</Button><Button small secondary icon="user" onPress={()=>router.push(`/user/${p.id}`)}>{kk?'Профиль':'Профиль'}</Button></>}</Row>
    </View>)}
    {!users.filter(u=>u.id!==app.userId).length&&<Empty icon="users" title={kk?'Қолданушы табылмады':'Пользователи не найдены'}/>}
  </View>;
}
