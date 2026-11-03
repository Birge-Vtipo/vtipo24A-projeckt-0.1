import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import worker from '../../cloudflare/cloud-worker.mjs';

const origin='https://birge-api.birge-app.workers.dev';
const isolatedEnv=(extra={})=>({
  BIRGE_CORE:{idFromName(){throw Error('The public page must not open the account database');}},
  ...extra,
});
const responseFor=(path='/',options={},env=isolatedEnv())=>worker.fetch(new Request(origin+path,options),env);
function cspDirectives(response){
  const header=response.headers.get('content-security-policy');
  assert.ok(header,'The public page must have a Content Security Policy');
  return new Map(header.split(';').map(value=>value.trim()).filter(Boolean).map(value=>{
    const [name,...sources]=value.split(/\s+/);return[name,sources];
  }));
}

test('public project GET/HEAD has identical security headers and does not open the account database',async()=>{
  const response=await responseFor();
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/^text\/html; charset=utf-8$/);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  const html=await response.text();
  assert.match(html,/<title>Birge/);
  assert.match(html,/https:\/\/birge-api\.birge-app\.workers\.dev\/download\/Birge-2\.5\.0\.apk/);
  assert.match(html,/https:\/\/birge-api\.birge-app\.workers\.dev\/connect/);
  assert.match(html,/Тіркелусіз|тіркелусіз/);
  assert.match(html,/href="\/app\/"/);
  assert.match(html,/Браузерде қолдану/);
  assert.doesNotMatch(html,/<form\b|eras2540/i);

  const head=await responseFor('/',{method:'HEAD'});
  assert.equal(head.status,200);
  assert.equal(await head.text(),'');
  assert.deepEqual([...head.headers],[...response.headers]);
});

test('public HTML is independent of request parameters, account headers and private environment values',async()=>{
  const baseline=await responseFor(),html=await baseline.text();
  const privateValue='private-page-sentinel-7e19';
  const response=await responseFor('/?token='+privateValue+'&phone='+privateValue,{
    headers:{Authorization:'Bearer '+privateValue,Cookie:'session='+privateValue,'User-Agent':privateValue},
  },isolatedEnv({
    WHATSAPP_ACCESS_TOKEN:privateValue,TELEGRAM_BOT_TOKEN:privateValue,
    OTP_SECRET:privateValue,CONNECTION_PRIVATE_KEY:privateValue,MIGRATION_TOKEN:privateValue,
  }));
  const queried=await response.text();
  assert.equal(response.status,200);
  assert.equal(queried,html,'Private request/environment values must never be interpolated into the public page');
  assert.deepEqual([...response.headers],[...baseline.headers]);
  assert.equal(queried.includes(privateValue),false);
});

test('the only animation script is inline, syntactically valid and authorized by its exact CSP SHA-256 hash',async()=>{
  const response=await responseFor(),html=await response.text();
  const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  assert.equal((html.match(/<script\b/gi)||[]).length,1,'There must be exactly one owned script');
  assert.equal(scripts.length,1);
  const [,attributes,source]=scripts[0];
  assert.doesNotMatch(attributes,/\bsrc\s*=|\bon\w+\s*=/i);
  assert.ok(source.trim(),'Animation script cannot be empty');
  assert.doesNotThrow(()=>new Script(source),'Animation script must parse without executing browser code');
  const scriptSources=cspDirectives(response).get('script-src');
  assert.deepEqual(scriptSources,["'sha256-"+createHash('sha256').update(source,'utf8').digest('base64')+"'"],
    'CSP must authorize only the exact emitted script bytes');
  assert.doesNotMatch(scriptSources.join(' '),/unsafe-inline|unsafe-eval|\*|https?:|\bdata:/i);
  assert.doesNotMatch(html,/<[a-z][^>]*\son[a-z]+\s*=/i,'Inline event handlers are not authorized');
});

test('animations keep a closed network/document policy and have no external runtime or data requests',async()=>{
  const response=await responseFor(),html=await response.text(),directives=cspDirectives(response);
  for(const name of['default-src','base-uri','form-action','frame-ancestors'])assert.deepEqual(directives.get(name),["'none'"],name);
  assert.ok(!directives.has('connect-src')||directives.get('connect-src').join(' ')==="'none'",'Animation must not open network access');
  const source=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(match=>match[1]).join('\n');
  assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|sendBeacon)\s*\(|\bimport\s*(?:\(|[{*"'])/,
    'Animations must not load a runtime or query user/API data');
  assert.doesNotMatch(html,/<(?:iframe|object|embed|form)\b|<link\b[^>]*\brel\s*=\s*["']?(?:stylesheet|preload|modulepreload)\b/i);
  assert.doesNotMatch(html,/<(?:script|img|source|video|audio)\b[^>]*\bsrc\s*=\s*["']?\s*(?:https?:)?\/\//i);
});

test('public page retains same-origin CORS, denied-origin and unknown-route boundaries',async()=>{
  const sameOrigin=await responseFor('/',{headers:{Origin:origin}});
  assert.equal(sameOrigin.status,200);
  assert.equal(sameOrigin.headers.get('access-control-allow-origin'),origin);
  assert.match(sameOrigin.headers.get('vary'),/\bOrigin\b/i);
  for(const[path,method,status,requestOrigin]of[
    ['/','POST',404],['/','PUT',404],['/','DELETE',404],
    ['/public-page.mjs','GET',404],['/private','GET',404],['/private/birge.sqlite','GET',404],
    ['/__migration/status','GET',404],['/__release/status','GET',404],
    ['/','GET',403,'https://untrusted.invalid'],['/','HEAD',403,'https://untrusted.invalid'],
  ]){
    const response=await responseFor(path,{method,...(requestOrigin?{headers:{Origin:requestOrigin}}:{})});
    assert.equal(response.status,status,method+' '+path);
    assert.notEqual(response.headers.get('content-type'),'text/html; charset=utf-8');
    assert.equal(response.headers.get('access-control-allow-origin'),null);
  }
});
