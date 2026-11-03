import {createHash} from 'node:crypto';

const prefix='/app';
const pages=new Set(['/','/auth','/connect','/create','/admin','/people','/search','/messages','/notifications','/profile','/settings']);
const mediaTypes={
  js:['text/javascript','application/javascript'],css:['text/css'],
  png:['image/png'],jpg:['image/jpeg'],jpeg:['image/jpeg'],webp:['image/webp'],gif:['image/gif'],svg:['image/svg+xml'],ico:['image/x-icon','image/vnd.microsoft.icon'],avif:['image/avif'],
  woff:['font/woff','application/font-woff'],woff2:['font/woff2'],ttf:['font/ttf','application/x-font-ttf'],otf:['font/otf','application/x-font-opentype'],
  mp4:['video/mp4'],webm:['video/webm','audio/webm'],mp3:['audio/mpeg'],m4a:['audio/mp4'],ogg:['audio/ogg','video/ogg'],wav:['audio/wav','audio/x-wav'],
};
const headers={
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  'Cross-Origin-Resource-Policy':'same-origin',
};
const unavailable=()=>Response.json({error:'WEB_APP_UNAVAILABLE'},{status:503,headers:{...headers,'Cache-Control':'no-store'}});
const notFound=()=>Response.json({error:'NOT_FOUND'},{status:404,headers:{...headers,'Cache-Control':'no-store'}});

function safePath(path){
  // Inspect encoded separators/dots before decoding; decoding must never create
  // a second interpretation or an escape from the owned asset directory.
  if(path.length>2048||/%(?:2f|5c|2e|00)/i.test(path))return null;
  let value;try{value=decodeURIComponent(path);}catch{return null;}
  if(/[\\%\u0000-\u0020\u007f]/.test(value)||!/^\/[A-Za-z0-9_@+.,()[\]/-]*$/.test(value))return null;
  const segments=value.split('/').slice(1);
  if(segments.some((segment,index)=>!segment&&index<segments.length-1||segment==='.'||segment==='..'||segment.startsWith('.')||/^(?:private|secrets?|credentials?|env|work)$/i.test(segment)))return null;
  return value;
}
function pagePath(path){
  const normalized=path.length>1?path.replace(/\/$/,''):path;
  return pages.has(normalized)||/^\/(?:user|listing)\/[A-Za-z0-9_-]{1,128}$/.test(normalized);
}
function assetType(path){
  if(path!=='/favicon.ico'&&!path.startsWith('/_expo/')&&!path.startsWith('/assets/'))return null;
  const extension=/\.([a-z0-9]+)$/.exec(path)?.[1];
  return extension&&mediaTypes[extension]?mediaTypes[extension]:null;
}
function assetRequest(request,path,method='GET'){
  const url=new URL(request.url);
  // Cloudflare Assets canonicalizes @2x and [id] filenames with percent
  // encoding. Request that exact path so its redirect cannot escape /app.
  url.pathname=path.split('/').map(segment=>encodeURIComponent(segment).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase())).join('/');url.search='';url.hash='';
  const selected=new Headers();
  if(path!=='/index.html')for(const name of['Range','If-None-Match','If-Modified-Since']){
    const value=request.headers.get(name);if(value)selected.set(name,value);
  }
  // Assets are public build output. Never forward an account token, cookie,
  // private query parameter, body or caller-selected redirect destination.
  return new Request(url,{method,headers:selected,redirect:'manual'});
}
async function htmlText(response){
  const maximum=1024*1024,reader=response.body?.getReader();
  if(!reader)throw Error('Missing web shell');
  const chunks=[];let size=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maximum)throw Error('Web shell too large');chunks.push(value);}
  }catch(error){await reader.cancel().catch(()=>{});throw error;}
  return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size));
}
function scriptPolicy(html){
  const hashes=new Set();let count=0;
  if(!/<html\b/i.test(html)||!/<(?:div|main)\b[^>]*\bid=["']root["']/i.test(html)||/<base\b|<[a-z][^>]*\son[a-z]+\s*=/i.test(html))throw Error('Invalid exported web shell');
  for(const [,attributes,body]of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
    count++;
    const source=/(?:^|\s)src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(attributes);
    if(source){
      const value=source[1]??source[2]??source[3],path=safePath(value);
      if(!path?.startsWith(prefix+'/_expo/')||!path.endsWith('.js')||!assetType(path.slice(prefix.length)))throw Error('Web export must use the /app base URL');
    }else if(body.trim()){
      // HTML parsing normalizes newlines before CSP hashes are checked.
      hashes.add("'sha256-"+createHash('sha256').update(body.replace(/\r\n?/g,'\n'),'utf8').digest('base64')+"'");
    }
  }
  if(!count)throw Error('Missing exported application scripts');
  // A stale export with root-relative resources must not reach production.
  if(/\b(?:src|href)\s*=\s*["']\/(?:_expo\/|assets\/|favicon\.ico)/i.test(html))throw Error('Web export must use the /app base URL');
  return ["default-src 'none'","script-src 'self'"+(hashes.size?' '+[...hashes].join(' '):''),"script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'","connect-src 'self' blob:","img-src 'self' data: blob:","media-src 'self' blob:","font-src 'self' data:",
    'frame-src https://www.openstreetmap.org',"frame-ancestors 'none'","base-uri 'none'","object-src 'none'","form-action 'self'"].join('; ');
}

// Return null outside /app so the existing public page/API/data routes keep
// their own handlers. Only this allowlist may fetch the public asset binding.
export async function webApp(request,env={}){
  const url=new URL(request.url),raw=url.pathname;
  if(raw!==prefix&&!raw.startsWith(prefix+'/'))return null;
  const path=safePath(raw);
  if(!path||!['GET','HEAD'].includes(request.method))return notFound();
  const relative=path.slice(prefix.length)||'/';
  const isPage=pagePath(relative),types=assetType(relative);
  if(!isPage&&!types)return notFound();
  if(typeof env.ASSETS?.fetch!=='function')return unavailable();
  if(raw===prefix){url.pathname=prefix+'/';return new Response(null,{status:308,headers:{...headers,Location:url.href,'Cache-Control':'no-store'}});}
  try{
    if(isPage){
      const response=await env.ASSETS.fetch(assetRequest(request,'/index.html'));
      if(response.status!==200||!/^text\/html(?:;|$)/i.test(response.headers.get('content-type')||'')){await response.body?.cancel();return unavailable();}
      const html=await htmlText(response),policy=scriptPolicy(html);
      return new Response(request.method==='HEAD'?null:html,{headers:{...headers,
        'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':policy,
        'Permissions-Policy':'microphone=(self), camera=(self), geolocation=(self)',
      }});
    }
    const response=await env.ASSETS.fetch(assetRequest(request,relative,request.method));
    const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    if(![200,206,304].includes(response.status)||(response.status!==304&&!types.includes(type))){await response.body?.cancel();return notFound();}
    const selected=new Headers(headers);
    for(const name of['Content-Type','Content-Length','Content-Range','Accept-Ranges','ETag','Last-Modified']){
      const value=response.headers.get(name);if(value)selected.set(name,value);
    }
    const fingerprint=/(?:^|[._-])[a-f0-9]{16,64}(?:@\d+x)?\.[a-z0-9]+$/i.test(relative.split('/').at(-1));
    selected.set('Cache-Control',fingerprint?'public, max-age=31536000, immutable':'public, max-age=0, must-revalidate');
    if(request.method==='HEAD'){await response.body?.cancel();return new Response(null,{status:response.status,headers:selected});}
    return new Response(response.body,{status:response.status,headers:selected});
  }catch{return unavailable();}
}
