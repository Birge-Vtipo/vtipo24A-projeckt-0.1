import { AppState, NativeModules, Platform } from 'react-native';

export type NotificationPermission = 'granted'|'denied'|'undetermined'|'unsupported';
type Bridge = {
  permission:()=>Promise<NotificationPermission>;
  requestPermission:()=>Promise<NotificationPermission>;
  configure:(origin:string,token:string,userId:string)=>Promise<boolean>;
  stop:()=>Promise<void>;
  setView:(active:boolean,conversationId:string)=>void;
  deviceMetadata:()=>Promise<{name:string;platform:string;userAgent?:string}>;
};
const bridge:Bridge|undefined=Platform.OS==='android'?NativeModules.BirgeLiveNotifications:undefined;
let activeConversation='';
const permissionListeners=new Set<()=>void>();
export function onNotificationPermissionChanged(listener:()=>void){permissionListeners.add(listener);return()=>{permissionListeners.delete(listener);};}
export async function notificationPermission():Promise<NotificationPermission>{return bridge?bridge.permission():'unsupported';}
export async function requestNotificationPermission():Promise<NotificationPermission>{const result=bridge?await bridge.requestPermission():'unsupported';permissionListeners.forEach(listener=>listener());return result;}
export async function startLiveNotifications(origin:string,token:string,userId:string){
  if(!bridge||await bridge.permission()!=='granted')return false;
  const started=await bridge.configure(origin,token,userId);
  bridge.setView(AppState.currentState==='active',activeConversation);
  return started;
}
export async function stopLiveNotifications(){await bridge?.stop();}
export function setNotificationView(conversation:string){activeConversation=conversation;bridge?.setView(AppState.currentState==='active',activeConversation);}
export function updateNotificationVisibility(){bridge?.setView(AppState.currentState==='active',activeConversation);}
export async function loginDeviceMetadata(){
  if(bridge)return bridge.deviceMetadata();
  if(Platform.OS==='web')return {name:'Web · '+(typeof navigator!=='undefined'?navigator.platform:'Browser'),platform:'web',userAgent:typeof navigator!=='undefined'?navigator.userAgent:''};
  return {name:Platform.OS==='ios'?'iPhone':'Android',platform:Platform.OS+' '+String(Platform.Version)};
}
