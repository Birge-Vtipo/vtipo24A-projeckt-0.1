// SSE fields may span network chunks. Keep one bounded partial frame and only
// accept the server's generic invalidation/session-expiry events.
export function eventStreamParser(onEvent:(type:'change'|'session-expired',id?:string)=>void) {
  let pending='';
  return (chunk:string)=>{
    pending+=chunk;
    pending=pending.replace(/\r\n/g,'\n');
    let end:number;
    while((end=pending.indexOf('\n\n'))>=0){
      const frame=pending.slice(0,end);pending=pending.slice(end+2);
      if(frame.length>65536)throw new Error('Event stream frame too large');
      const lines=frame.split('\n'),type=lines.find(l=>l.startsWith('event:'))?.slice(6).trim();
      if(type==='change'){
        const id=lines.find(l=>l.startsWith('id:'))?.slice(3).trim();
        if(id&&/^\d{1,16}$/.test(id))onEvent('change',id);
      }else if(type==='session-expired')onEvent('session-expired');
    }
    if(pending.length>65536)throw new Error('Event stream frame too large');
  };
}
