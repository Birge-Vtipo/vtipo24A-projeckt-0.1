import {phoneRequest, PhoneSession} from './phone-auth';
import {webGuestMode} from './web-guest';

let pending:{server:string;promise:Promise<PhoneSession>}|undefined;
export function requestGuestSession(server:string):Promise<PhoneSession> {
  if(!webGuestMode)return Promise.reject(new Error('Guest entry is available in the browser release only.'));
  if(pending?.server===server)return pending.promise;
  const promise=phoneRequest<PhoneSession>('/auth/guest',{},undefined,server).then(value=>{
    const user=value?.user;
    if(!/^[A-Za-z0-9_-]{43}$/.test(value?.token||'')||!Number.isFinite(value?.expiresAt)||value.expiresAt<=Date.now()
      ||user?.isGuest!==true||user.phone!==''||!user.name||!/^[a-f0-9-]{36}$/.test(user.id)||!/^[a-z0-9_]{3,24}$/.test(user.handle||'')){
      throw new Error('Қонақ режимі ашылмады. Қайта көріңіз / Не удалось открыть гостевой режим. Повторите.');
    }
    return value;
  });
  pending={server,promise};
  void promise.finally(()=>{if(pending?.promise===promise)pending=undefined;}).catch(()=>{});
  return promise;
}
