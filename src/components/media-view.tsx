import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Image, Pressable, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Icon, Txt } from './ui';
import { mediaUri } from '../lib/social-api';
import { Profile } from '../types';
import { useApp } from '../store';
import { VoiceWaveform } from './voice-waveform';
import { MediaVideo } from './media-video';

export function MediaView({uri,kind,background=false,height=200,waveform,durationMs,avatar}:{uri:string;kind?:string;background?:boolean;height?:number;waveform?:number[];durationMs?:number;avatar?:Profile}) {
  const source=mediaUri(uri)!;
  if(kind==='video')return <MediaVideo key={source} uri={source} background={background} height={height}/>;
  if(kind==='audio')return <Audio key={source} uri={source} waveform={waveform} durationMs={durationMs} avatar={avatar}/>;
  return <Image source={{uri:source}} style={{width:'100%',height,borderRadius:background?0:12}} resizeMode="cover" accessibilityLabel="Фото"/>;
}
function clock(value:number) {
  const seconds=Math.floor(Number.isFinite(value)?Math.max(0,value):0);
  return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}
function Audio({uri,waveform,durationMs,avatar}:{uri:string;waveform?:number[];durationMs?:number;avatar?:Profile}) {
  const {colors,language}=useApp(), kk=language==='kk';
  const player=useAudioPlayer(uri,{updateInterval:100}), status=useAudioPlayerStatus(player);
  const [actionError,setActionError]=useState(false);
  const duration=status.duration>0?status.duration:Math.max(0,(durationMs||0)/1000);
  const seconds=Math.min(duration||Infinity,Math.max(0,status.currentTime||0));
  const progress=duration>0?Math.min(1,seconds/duration):0;
  const error=!!status.error||actionError;
  async function toggle() {
    setActionError(false);
    try {
      if(status.playing)player.pause();
      else {if(status.didJustFinish||(duration>0&&seconds>=duration-.05))await player.seekTo(0);player.play();}
    } catch {setActionError(true);}
  }
  async function seek(fraction:number) {
    setActionError(false);
    try {await player.seekTo(fraction*duration);} catch {setActionError(true);}
  }
  useEffect(()=>{
    const subscription=AppState.addEventListener('change',state=>{if(state!=='active')player.pause();});
    return()=>subscription.remove();
  },[player]);
  const avatarUri=mediaUri(avatar?.avatar_url);
  return <View style={{width:252,maxWidth:'100%',minWidth:180,gap:0}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:9}}>
      <View style={{width:40,height:44,justifyContent:'center'}}>
        {avatarUri?<Image source={{uri:avatarUri}} accessibilityLabel={avatar?.name} style={{width:38,height:38,borderRadius:14,borderWidth:1,borderColor:'#D2AE6D'}}/>:<View style={{width:38,height:38,borderRadius:14,backgroundColor:avatar?.accent||colors.primary,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#D2AE6D'}}><Txt color="#FFFFFF" bold size={13}>{avatar?.name?.slice(0,2).toUpperCase()||'B'}</Txt></View>}
        <View style={{position:'absolute',right:-2,bottom:0,width:18,height:18,borderRadius:9,backgroundColor:'#D2AE6D',alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:colors.surface}}><Icon name="mic" color="#30265E" size={11}/></View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={status.playing?(kk?'Аудионы кідірту':'Приостановить аудио'):(kk?'Аудионы тыңдау':'Прослушать аудио')} accessibilityState={{disabled:!status.isLoaded,busy:status.isBuffering||!status.isLoaded}} disabled={!status.isLoaded} onPress={()=>void toggle()} style={({pressed})=>({width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:'#393185',borderWidth:1,borderColor:'#D2AE6D',opacity:pressed?.72:1})}>
        {status.isBuffering||!status.isLoaded?<ActivityIndicator size="small" color="#D2AE6D"/>:<Icon name={status.playing?'pause':'play'} color="#FFFFFF" size={19}/>}
      </Pressable>
      <View style={{flex:1,minWidth:50}}><VoiceWaveform levels={waveform} progress={progress} color={colors.primary} mutedColor={colors.muted} height={32} onSeek={status.isLoaded&&duration>0?fraction=>void seek(fraction):undefined} accessibilityLabel={kk?'Аудио барысын өзгерту':'Перемотать аудио'}/></View>
    </View>
    <View style={{flexDirection:'row',justifyContent:'flex-end',marginTop:-1}}>
      <Txt size={10} color={colors.muted} style={{fontVariant:['tabular-nums'],lineHeight:13}}>{clock(seconds)} <Txt size={9} color={colors.muted}>/ {clock(duration)}</Txt></Txt>
    </View>
    {error&&<Txt size={11} color={colors.danger}>{kk?'Аудионы ойнату мүмкін болмады. Қайта ашып көр.':'Не удалось воспроизвести аудио. Откройте его заново.'}</Txt>}
  </View>;
}
