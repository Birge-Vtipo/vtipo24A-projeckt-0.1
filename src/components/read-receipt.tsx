import React from 'react';
import {View} from 'react-native';
import Svg,{Circle,Path} from 'react-native-svg';
import {Conversation,Message} from '../types';
import {messageReaders} from '../lib/message-read';
import {useApp} from '../store';

export function ReadReceipt({message,chat,messages}:{message:Message;chat:Conversation;messages:Message[]}) {
  const {userId,language,colors}=useApp();
  if(!userId||message.sender_id!==userId)return null;
  const state=messageReaders(message,chat,userId,messages),kk=language==='kk';
  const label=state.all?(kk?'Оқылды':'Прочитано'):state.read?`${kk?'Оқыды':'Прочитали'} ${state.read}/${state.total}`:(kk?'Оқылмады':'Не прочитано');
  const ink=state.all?colors.primary:state.read?'#A67C37':colors.muted;
  return <View accessible accessibilityLabel={label} style={{width:23,height:16,alignItems:'center',justifyContent:'center'}}>
    <Svg width={23} height={16} viewBox="0 0 30 20" accessible={false}>
      <Path d="M14 10C11 1 2 3 3 10c1 7 9 7 12 0C18 1 27 3 27 10c0 7-9 7-13 0Z" stroke={ink} strokeWidth={1.6} fill={state.all?colors.primary+'16':'none'} strokeDasharray={state.read?'':'3 3'}/>
      <Circle cx={15} cy={10} r={state.all?3:2} fill={state.all?'#D2AE6D':ink}/>
    </Svg>
  </View>;
}
