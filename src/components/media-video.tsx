import React, {useEffect, useState} from 'react';
import {AccessibilityInfo, AppState} from 'react-native';
import {useVideoPlayer, VideoView} from 'expo-video';

// The native player retains the existing Android/iOS behavior.
export function MediaVideo({uri,background,height}:{uri:string;background:boolean;height:number}) {
  const player=useVideoPlayer(uri,p=>{p.loop=background;p.muted=background;});
  const [reduced,setReduced]=useState(true);
  useEffect(()=>{void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);const s=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);return()=>s.remove();},[]);
  useEffect(()=>{const play=()=>{if(background&&!reduced&&AppState.currentState==='active')player.play();else player.pause();};play();const s=AppState.addEventListener('change',play);return()=>s.remove();},[player,background,reduced]);
  return <VideoView player={player} style={{width:'100%',height,borderRadius:background?0:12}} nativeControls={!background} contentFit="cover" surfaceType="textureView"/>;
}
