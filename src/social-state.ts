import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { fetch as streamFetch } from 'expo/fetch';
import { emptySocial, socialRequest, SocialState } from './lib/social-api';
import { mergeConversationReads } from './lib/message-read';
import { mergeMessages } from './lib/optimistic-messages';
import { expirePhoneSession,phoneAuthUrl,readPhoneSession } from './lib/phone-auth';
import { notificationPermission,onNotificationPermissionChanged,requestNotificationPermission,startLiveNotifications,updateNotificationVisibility } from './lib/live-notifications';
import { Message } from './types';

export function useSocialState(userId?: string) {
  const [state,setState]=useState<SocialState>(emptySocial),[loading,setLoading]=useState(!!userId),[error,setError]=useState('');
  const [connection,setConnection]=useState<'connecting'|'live'|'offline'>('connecting');
  const generation=useRef(0),pending=useRef<Promise<void>|null>(null),refreshAgain=useRef(false),lastFetch=useRef(0);
  const drafts=useRef(new Map<string,{payload:Record<string,unknown>;message:Message}>());
  const acknowledged=useRef(new Map<string,Message>()),confirmedClients=useRef(new Set<string>());
  const refresh=useCallback(async()=>{
    if(!userId)return;
    if(pending.current){refreshAgain.current=true;return pending.current;}
    const version=generation.current;
    const task=(async()=>{
      do {
        refreshAgain.current=false;
        try {
          const next=await socialRequest<SocialState>('snapshot');
          if(version!==generation.current)return;
          for(const message of next.messages){
            acknowledged.current.delete(message.id);
            if(message.client_id){confirmedClients.current.add(message.client_id);drafts.current.delete(message.client_id);}
          }
          while(confirmedClients.current.size>1000)confirmedClients.current.delete(confirmedClients.current.values().next().value!);
          setState(current=>({...next,messages:mergeMessages(next.messages,current.messages,[...acknowledged.current.values()]),conversations:next.conversations.map(c=>mergeConversationReads(current.conversations.find(old=>old.id===c.id),c))}));
          setError('');lastFetch.current=Date.now();
        }catch(e){if(version===generation.current)setError((e as Error).message);}
        finally{if(version===generation.current)setLoading(false);}
      }while(refreshAgain.current&&version===generation.current);
    })();
    pending.current=task;
    try{await task;}finally{if(pending.current===task)pending.current=null;}
  },[userId]);
  useEffect(()=>{
    if(!userId)return;
    let mounted=true,controller:AbortController|undefined,reconnect:ReturnType<typeof setTimeout>|undefined,debounce:ReturnType<typeof setTimeout>|undefined,cursor:string|undefined,live=false,attempts=0,connectionVersion=0;
    const scheduleRefresh=()=>{clearTimeout(debounce);debounce=setTimeout(()=>{if(mounted)void refresh();},45);};
    async function nativeNotifications(){
      const saved=await readPhoneSession();if(!mounted||!saved)return;
      const permission=await notificationPermission();if(!mounted)return;
      if(permission==='undetermined')await requestNotificationPermission();
      if(mounted)await startLiveNotifications(saved.server,saved.token,userId!);
    }
    async function connect(){
      if(!mounted||AppState.currentState!=='active')return;
      controller?.abort();const request=new AbortController();controller=request;const serial=++connectionVersion;
      setConnection('connecting');let activity=Date.now();
      const watchdog=setInterval(()=>{if(Date.now()-activity>75000)request.abort();},15000);
      try{
        const saved=await readPhoneSession();if(!mounted||!saved)return;
        while(mounted&&!request.signal.aborted){
          const response=await streamFetch(saved.server+'/social/events?transport=poll'+(cursor?'&after='+cursor:''),{headers:{Authorization:'Bearer '+saved.token,Accept:'application/json'},signal:request.signal});
          if(response.status===401){await expirePhoneSession(saved.token,saved.server);return;}
          if(!response.ok)throw Error('Connection unavailable');
          const event=await response.json();
          if(!mounted||request.signal.aborted||saved.server!==phoneAuthUrl)return;
          if(!Number.isSafeInteger(event.id)||event.id<0||!['change','heartbeat'].includes(event.type))throw Error('Invalid event');
          activity=Date.now();live=true;attempts=0;setConnection('live');cursor=String(event.id);
          if(event.type==='change')scheduleRefresh();
        }
      }catch{/* Keep cached messages and reconnect; manual refresh remains available. */}
      finally{
        clearInterval(watchdog);
        if(mounted&&serial===connectionVersion){live=false;setConnection('offline');if(AppState.currentState==='active')reconnect=setTimeout(()=>void connect(),Math.min(30000,1000*2**Math.min(attempts++,5)));}
      }
    }
    void refresh();void connect();void nativeNotifications().catch(()=>{});
    const permissionSub=onNotificationPermissionChanged(()=>{void nativeNotifications().catch(()=>{});});
    const appSub=AppState.addEventListener('change',value=>{
      updateNotificationVisibility();clearTimeout(reconnect);
      if(value==='active'){void refresh();void connect();void nativeNotifications().catch(()=>{});}else controller?.abort();
    });
    const timer=setInterval(()=>{if(AppState.currentState==='active'&&Date.now()-lastFetch.current>(live?60000:10000))void refresh();},10000);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Invalidate this identity's requests at unmount.
    return()=>{mounted=false;generation.current++;clearTimeout(reconnect);clearTimeout(debounce);clearInterval(timer);controller?.abort();appSub.remove();permissionSub();};
  },[userId,refresh]);
  async function mutate<T={ok:boolean}>(action:string,data:unknown){const result=await socialRequest<T>(action,data);await refresh();return result;}
  const submit=useCallback(async(clientId:string)=>{
    const draft=drafts.current.get(clientId);if(!draft)return;
    setState(current=>({...current,messages:current.messages.map(m=>m.client_id===clientId?{...m,delivery:'sending'}:m)}));
    try{
      const result=await socialRequest<{id:string;message:Message}>('message',draft.payload);
      drafts.current.delete(clientId);
      acknowledged.current.set(result.id,result.message);confirmedClients.current.add(clientId);
      while(acknowledged.current.size>500)acknowledged.current.delete(acknowledged.current.keys().next().value!);
      setState(current=>({...current,messages:[...current.messages.filter(m=>m.client_id!==clientId&&m.id!==result.id),result.message].sort((a,b)=>(a.sequence??Infinity)-(b.sequence??Infinity))}));
      void refresh();
    }catch(e){if(confirmedClients.current.has(clientId))return;setState(current=>({...current,messages:current.messages.map(m=>m.client_id===clientId&&m.delivery?{...m,delivery:'failed'}:m)}));throw e;}
  },[refresh]);
  async function sendMessage(payload:Record<string,unknown>,preview:Partial<Message>={}){
    if(!userId)return;
    const clientId=Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,13);
    const message:Message={...preview,id:'pending-'+clientId,client_id:clientId,conversation_id:String(payload.conversation_id),sender_id:userId,body:String(payload.body||''),created_at:new Date().toISOString(),delivery:'sending'};
    drafts.current.set(clientId,{payload:{...payload,client_id:clientId},message});
    setState(current=>({...current,messages:[...current.messages,message]}));
    await submit(clientId);
  }
  const markRead=useCallback(async(conversationId:string,messageId:string)=>{
    if(!userId)return;
    const result=await socialRequest<{last_message_id:string;sequence:number}>('read',{conversation_id:conversationId,last_message_id:messageId});
    setState(current=>({...current,conversations:current.conversations.map(c=>c.id!==conversationId?c:mergeConversationReads(c,{...c,read_by:{...c.read_by,[userId]:result.last_message_id},read_sequence_by:{...c.read_sequence_by,[userId]:result.sequence}}))}));
  },[userId]);
  return {state,loading,error,setError,refresh,mutate,markRead,sendMessage,retryMessage:submit,connection};
}
