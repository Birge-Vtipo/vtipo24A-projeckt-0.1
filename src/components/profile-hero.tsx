import React from 'react';
import { Image, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Profile } from '../types';
import { mediaUri } from '../lib/social-api';
import { Icon, Row, Txt } from './ui';
import { MediaView } from './media-view';
import { ProfileIdentity } from './profile-identity';
import { useApp } from '../store';
export function Avatar({profile,size=48}:{profile?:Profile|null;size?:number}) {
  const {colors}=useApp();
  return profile?.avatar_url?<Image source={{uri:mediaUri(profile.avatar_url)}} style={{height:size,width:size,borderRadius:size/2,borderWidth:3,borderColor:colors.surface}} accessibilityLabel={profile.name}/>:<View style={{height:size,width:size,borderRadius:size/2,backgroundColor:profile?.accent||'#393185',alignItems:'center',justifyContent:'center',borderWidth:3,borderColor:colors.surface}}><Txt size={size*.32} color="#FFFFFF" bold>{profile?.name?.slice(0,2).toUpperCase()||'B'}</Txt></View>;
}
export function ProfileHero({profile}:{profile:Profile}) {
  const {colors,language}=useApp();
  return <View style={{backgroundColor:colors.surface,borderRadius:26,overflow:'hidden',borderWidth:1,borderColor:colors.line}}>
    <View style={{height:190}}>{profile.cover_url?<MediaView uri={profile.cover_url} kind={profile.cover_kind} background height={190}/>:<LinearGradient colors={[profile.accent||'#393185','#211A52','#8473B3']} start={{x:0,y:0}} end={{x:1,y:1}} style={{height:190,padding:25,justifyContent:'space-between'}}><Txt color="#D2AE6D" size={11} bold style={{letterSpacing:4}}>BIRGE / COMMUNITY</Txt><View style={{position:'absolute',width:200,height:200,borderRadius:100,borderWidth:1,borderColor:'#D2AE6D66',right:-30,top:20}}/><View style={{position:'absolute',width:140,height:140,borderRadius:70,borderWidth:1,borderColor:'#D2AE6D66',right:0,top:50}}/></LinearGradient>}</View>
    <View style={{padding:24,gap:14}}><View style={{marginTop:-66,alignSelf:'flex-start'}}><Avatar profile={profile} size={90}/></View><Row style={{justifyContent:'space-between'}}><View style={{flex:1}}><Txt size={26} bold>{profile.name}</Txt><Row><Icon name="pin" size={13}/><Txt size={12} color={colors.muted}>{profile.city}</Txt></Row></View><View style={{padding:10,backgroundColor:colors.soft,borderRadius:14}}><Icon name="shield" color={profile.accent||colors.primary}/></View></Row>{!!profile.bio&&<Txt>{profile.bio}</Txt>}<ProfileIdentity handle={profile.handle}/><Row style={{gap:28}}><View><Txt bold size={22}>{profile.followers||0}</Txt><Txt size={11} color={colors.muted}>{language==='kk'?'Жазылушы':'Подписчики'}</Txt></View><View><Txt bold size={22}>{profile.following_count||0}</Txt><Txt size={11} color={colors.muted}>{language==='kk'?'Жазылым':'Подписки'}</Txt></View></Row></View>
  </View>;
}
