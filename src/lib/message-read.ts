import {Conversation,Message} from '../types';

/** An acknowledgement or an older in-flight snapshot must never lower progress. */
export function mergeConversationReads(previous:Conversation|undefined,next:Conversation):Conversation {
  if(!previous)return next;
  const read_by={...next.read_by},read_sequence_by={...next.read_sequence_by};
  for(const [id,sequence] of Object.entries(previous.read_sequence_by||{})){
    if(sequence>(read_sequence_by[id]||0)){
      read_sequence_by[id]=sequence;
      if(previous.read_by?.[id])read_by[id]=previous.read_by[id];
    }
  }
  return {...next,read_by,read_sequence_by};
}

export function messageReaders(message:Message,chat:Conversation,self:string,messages:Message[]) {
  const peers=(chat.members||[chat.owner_id,chat.responder_id]).filter((id,index,all)=>id&&id!==self&&all.indexOf(id)===index);
  const read=peers.filter(id=>{
    const sequence=chat.read_sequence_by?.[id];
    if(message.sequence!==undefined&&sequence!==undefined)return sequence>=message.sequence;
    const marker=chat.read_by?.[id];if(!marker)return false;
    if(marker===message.id)return true;
    const seenIndex=messages.findIndex(m=>m.id===marker),messageIndex=messages.findIndex(m=>m.id===message.id);
    return seenIndex>=0&&messageIndex>=0&&seenIndex>=messageIndex;
  }).length;
  return {read,total:peers.length,all:peers.length>0&&read===peers.length};
}
