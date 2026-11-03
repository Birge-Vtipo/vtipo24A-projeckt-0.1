import { Message } from '../types';
export function mergeMessages(remote:Message[],local:Message[],acknowledged:Message[]=[]) {
  const ids=new Set(remote.map(m=>m.id)),clients=new Set(remote.map(m=>m.client_id).filter(Boolean));
  const accepted=acknowledged.filter(m=>!ids.has(m.id)&&(!m.client_id||!clients.has(m.client_id)));
  accepted.forEach(m=>{ids.add(m.id);if(m.client_id)clients.add(m.client_id);});
  return [...remote,...accepted,...local.filter(m=>m.delivery&&!ids.has(m.id)&&(!m.client_id||!clients.has(m.client_id)))].sort((a,b)=>(a.sequence??Infinity)-(b.sequence??Infinity));
}
