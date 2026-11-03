import React, {useEffect, useRef, useState} from 'react';
import {View} from 'react-native';
import {useApp} from '../store';
import {Txt} from './ui';

export function MediaVideo({uri,background,height}:{uri:string;background:boolean;height:number}) {
  const video=useRef<HTMLVideoElement>(null),[error,setError]=useState(false);
  const {language,colors}=useApp();
  useEffect(()=>{
    const element=video.current;if(!element)return;
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    const update=()=>{
      if(background&&!motion.matches&&document.visibilityState==='visible'){
        // Browser autoplay can be denied, or a route can remove the element
        // while play is pending. Consume that promise without a global error.
        void element.play().catch(()=>{});
      }else if(background)element.pause();
    };
    update();document.addEventListener('visibilitychange',update);motion.addEventListener('change',update);
    return()=>{document.removeEventListener('visibilitychange',update);motion.removeEventListener('change',update);element.pause();};
  },[background,uri]);
  return <View style={{width:'100%'}}>{React.createElement('video',{
    ref:video,src:uri,controls:!background,muted:background,loop:background,playsInline:true,preload:'metadata',
    'aria-label':background?(language==='kk'?'Профиль видеосы':'Видео профиля'):'Видео',
    onError:()=>setError(true),onLoadedData:()=>setError(false),
    style:{display:'block',width:'100%',height,objectFit:'cover',borderRadius:background?0:12},
  })}{error&&!background&&<Txt size={11} color={colors.danger}>{language==='kk'?'Видеоны ойнату мүмкін болмады. Қайта ашып көр.':'Не удалось воспроизвести видео. Откройте его заново.'}</Txt>}</View>;
}
