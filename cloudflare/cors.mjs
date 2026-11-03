// Reflect only this service's own origin or explicitly configured origins.
// The same policy wraps entry-level failures and Durable Object responses.
export function requestCors(request,env={}) {
  const origin=request.headers.get('origin');
  const configured=[new URL(request.url).origin,env.PUBLIC_ORIGIN,...String(env.ALLOWED_ORIGINS||'').split(',')];
  const allowed=new Set(configured.map(value=>typeof value==='string'?value.trim():'').filter(value=>{
    try{return /^https?:$/.test(new URL(value).protocol)&&new URL(value).origin===value;}catch{return false;}
  }));
  const accepted=!origin||allowed.has(origin);
  return {
    accepted,
    wrap(response){
      if(!origin||!accepted)return response;
      const headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin',origin);
      if(!(headers.get('Vary')||'').split(',').some(value=>value.trim().toLowerCase()==='origin'))headers.append('Vary','Origin');
      return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
    },
  };
}
