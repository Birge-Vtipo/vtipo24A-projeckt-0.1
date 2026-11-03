import { createHash, timingSafeEqual } from 'node:crypto';
import { AuthError } from '../whatsapp-bot/src/auth-core.mjs';

const json=(status,value)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const hash=value=>createHash('sha256').update(value).digest('hex');
const validTable=name=>typeof name==='string'&&/^(users|sessions|passwords|password_attempts|credential_attempts|challenges|requests|recipients|auth_[a-z_]+|social_[a-z_]+)$/.test(name);
export function createMigration(db,media,env) {
  db.exec(`CREATE TABLE IF NOT EXISTS recipients(phone TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS cloud_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cloud_import_batches(id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS cloud_releases(version TEXT PRIMARY KEY,size INTEGER NOT NULL,sha256 TEXT NOT NULL,ready INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS cloud_release_chunks(version TEXT,part INTEGER,bytes BLOB NOT NULL,PRIMARY KEY(version,part));`);
  const get=key=>{const row=db.prepare('SELECT value FROM cloud_meta WHERE key=?').get(key);return row?JSON.parse(row.value):null;};
  const put=(key,value)=>db.prepare('INSERT INTO cloud_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));
  function authorize(request) {
    const supplied=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
    if(!env.MIGRATION_TOKEN||!supplied||!timingSafeEqual(Buffer.from(hash(supplied),'hex'),Buffer.from(hash(env.MIGRATION_TOKEN),'hex')))throw new AuthError('NOT_FOUND',404);
  }
  async function input(request,maximum=2*1024*1024) {
    if(!request.headers.get('content-type')?.startsWith('application/json'))throw new AuthError('JSON_REQUIRED',415);
    const chunks=[];let size=0;
    if(request.body)for await(const chunk of request.body){size+=chunk.length;if(size>maximum)throw new AuthError('BODY_TOO_LARGE',413);chunks.push(chunk);}
    try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw new AuthError('INVALID_JSON');}
  }
  const columns=table=>db.prepare(`PRAGMA table_info(${table})`).all().map(row=>row.name);
  function counts(){const result={};for(const {name}of db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all())if(validTable(name))result[name]=db.prepare(`SELECT count(*) n FROM ${name}`).get().n;return result;}
  function digests(){const result={};for(const name of Object.keys(counts()))result[name]=hash(JSON.stringify(db.prepare(`SELECT rowid,* FROM ${name} ORDER BY rowid`).all()));return result;}
  async function handle(request,url) {
    authorize(request);
    if(request.method==='GET'&&url.pathname==='/__migration/status')return json(200,{state:get('import'),counts:counts(),...(url.searchParams.has('digests')?{digests:digests()}:{}),releases:db.prepare('SELECT version,size,sha256,ready FROM cloud_releases').all()});
    if(request.method!=='POST')throw new AuthError('NOT_FOUND',404);
    const data=await input(request);
    if(url.pathname==='/__migration/begin') {
      if(get('import')?.sealed)throw new AuthError('IMPORT_SEALED',409);
      if(!/^[a-f0-9]{64}$/i.test(data.sourceHash||''))throw new AuthError('INVALID_INPUT');
      db.transaction(()=>{
        for(const name of Object.keys(counts()))db.prepare(`DELETE FROM ${name}`).run();
        db.prepare('DELETE FROM cloud_import_batches').run();
        // Media references and payloads are imported independently, releases survive.
        db.prepare('DELETE FROM cloud_media_chunks').run();
        db.prepare('DELETE FROM cloud_media_objects').run();
        put('import',{sourceHash:data.sourceHash,status:'importing',sealed:false});
      });
      return json(200,{ok:true});
    }
    if(url.pathname==='/__migration/rows') {
      if(get('import')?.status!=='importing'||get('import')?.sealed)throw new AuthError('IMPORT_NOT_OPEN',409);
      if(!validTable(data.table)||!Array.isArray(data.rows)||data.rows.length>100||typeof data.batch!=='string'||data.batch.length>150)throw new AuthError('INVALID_INPUT');
      const names=columns(data.table);if(!names.length)throw new AuthError('INVALID_INPUT');
      if(db.prepare('SELECT id FROM cloud_import_batches WHERE id=?').get(data.batch))return json(200,{ok:true,duplicate:true});
      db.transaction(()=>{
        for(const row of data.rows){
          if(!row||typeof row!=='object'||Array.isArray(row))throw new AuthError('INVALID_INPUT');
          const fields=Object.keys(row);if(!fields.length||fields.length>90||fields.some(name=>name!=='rowid'&&!names.includes(name)))throw new AuthError('INVALID_INPUT');
          const values=fields.map(name=>{const value=row[name];if(value!==null&&!['string','number'].includes(typeof value))throw new AuthError('INVALID_INPUT');return value;});
          db.prepare(`INSERT INTO ${data.table}(${fields.join(',')}) VALUES(${fields.map(()=>'?').join(',')})`).run(...values);
        }
        db.prepare('INSERT INTO cloud_import_batches VALUES(?)').run(data.batch);
      });
      return json(200,{ok:true,rows:data.rows.length});
    }
    if(url.pathname==='/__migration/media') {
      if(get('import')?.status!=='importing'||get('import')?.sealed)throw new AuthError('IMPORT_NOT_OPEN',409);
      if(!/^[a-f0-9-]{36}$/.test(data.id||'')||typeof data.bytes!=='string'||typeof data.sha256!=='string')throw new AuthError('INVALID_INPUT');
      // Current migration media is small; large files use bounded chunk imports below.
      const bytes=Buffer.from(data.bytes,'base64');if(bytes.length>1048576||hash(bytes)!==data.sha256)throw new AuthError('INVALID_INPUT');
      await media.write(data.id,bytes);return json(200,{ok:true});
    }
    if(url.pathname==='/__migration/media-chunk') {
      if(get('import')?.status!=='importing'||get('import')?.sealed)throw new AuthError('IMPORT_NOT_OPEN',409);
      if(!/^[a-f0-9-]{36}$/.test(data.id||'')||!Number.isSafeInteger(data.part)||data.part<0||data.part>19||!Number.isSafeInteger(data.size)||data.size<1||data.size>20*1048576||typeof data.bytes!=='string')throw new AuthError('INVALID_INPUT');
      const bytes=Buffer.from(data.bytes,'base64');if(bytes.length>1048576||hash(bytes)!==data.sha256)throw new AuthError('INVALID_INPUT');
      db.transaction(()=>{
        if(data.part===0)db.prepare('INSERT INTO cloud_media_objects VALUES(?,?) ON CONFLICT(id) DO NOTHING').run(data.id,data.size);
        if(db.prepare('SELECT size FROM cloud_media_objects WHERE id=?').get(data.id)?.size!==data.size)throw new AuthError('INVALID_INPUT');
        db.prepare('INSERT INTO cloud_media_chunks(id,chunk,bytes) VALUES(?,?,?) ON CONFLICT(id,chunk) DO UPDATE SET bytes=excluded.bytes').run(data.id,data.part,bytes);
      });
      return json(200,{ok:true});
    }
    if(url.pathname==='/__migration/finish') {
      const state=get('import');if(state?.status!=='importing'||state.sealed)throw new AuthError('IMPORT_NOT_OPEN',409);
      const actual=counts();
      const names=Object.keys(data.counts||{});
      if(!['users','sessions','social_messages'].every(name=>names.includes(name))||Object.keys(actual).some(name=>actual[name]>0&&!names.includes(name))||Object.keys(data.digests||{}).sort().join(',')!==names.sort().join(','))throw new AuthError('IMPORT_MANIFEST_INCOMPLETE',409);
      if(!data.counts||Object.entries(data.counts).some(([name,count])=>!validTable(name)||actual[name]!==count))throw new AuthError('IMPORT_COUNTS_MISMATCH',409);
      const actualDigests=digests();
      if(!data.digests||Object.entries(data.digests).some(([name,digest])=>!validTable(name)||actualDigests[name]!==digest))throw new AuthError('IMPORT_DIGEST_MISMATCH',409);
      // A matching length and self-consistent chunk hashes do not prove that the
      // restored payload is the source file. Require its complete source digest.
      const referenced=db.prepare('SELECT id,size FROM social_media').all(),expected=data.mediaDigests;
      if(referenced.length||expected!==undefined){
        if(!expected||typeof expected!=='object'||Array.isArray(expected)||Object.keys(expected).length!==referenced.length||referenced.some(row=>!Object.hasOwn(expected,row.id)||!/^[a-f0-9]{64}$/i.test(expected[row.id])))throw new AuthError('IMPORT_MEDIA_MANIFEST_INCOMPLETE',409);
      }
      for(const row of referenced){
        let restored;
        if(typeof media.digest==='function')restored=await media.digest(row.id);
        else {const bytes=await media.read(row.id);restored={size:bytes.length,sha256:hash(bytes)};}
        if(restored.size!==row.size)throw new AuthError('IMPORT_MEDIA_MISSING',409);
        if(restored.sha256.toLowerCase()!==expected[row.id].toLowerCase())throw new AuthError('IMPORT_MEDIA_DIGEST_MISMATCH',409);
      }
      put('import',{...state,status:'ready',sealed:true});return json(200,{ok:true,counts:actual});
    }
    if(url.pathname==='/__release/begin') {
      if(!/^\d+\.\d+\.\d+$/.test(data.version||'')||!Number.isSafeInteger(data.size)||data.size<1||data.size>120*1024*1024||!/^[a-f0-9]{64}$/i.test(data.sha256||''))throw new AuthError('INVALID_INPUT');
      const previous=db.prepare('SELECT * FROM cloud_releases WHERE version=?').get(data.version);
      if(previous?.ready)throw new AuthError('RELEASE_EXISTS',409);
      db.transaction(()=>{db.prepare('DELETE FROM cloud_release_chunks WHERE version=?').run(data.version);db.prepare('INSERT INTO cloud_releases(version,size,sha256,ready) VALUES(?,?,?,0) ON CONFLICT(version) DO UPDATE SET size=excluded.size,sha256=excluded.sha256,ready=0').run(data.version,data.size,data.sha256.toUpperCase());});
      return json(200,{ok:true});
    }
    if(url.pathname==='/__release/chunk') {
      const release=db.prepare('SELECT * FROM cloud_releases WHERE version=?').get(data.version);
      if(!release||release.ready||!Number.isSafeInteger(data.part)||data.part<0||data.part>=Math.ceil(release.size/1048576)||typeof data.bytes!=='string')throw new AuthError('INVALID_INPUT');
      const bytes=Buffer.from(data.bytes,'base64'),expected=Math.min(1048576,release.size-data.part*1048576);
      if(bytes.length!==expected||hash(bytes)!==data.sha256)throw new AuthError('INVALID_INPUT');
      db.prepare('INSERT INTO cloud_release_chunks VALUES(?,?,?) ON CONFLICT(version,part) DO UPDATE SET bytes=excluded.bytes').run(data.version,data.part,bytes);
      return json(200,{ok:true});
    }
    if(url.pathname==='/__release/finish') {
      const release=db.prepare('SELECT * FROM cloud_releases WHERE version=?').get(data.version);if(!release)throw new AuthError('NOT_FOUND',404);
      const digest=createHash('sha256');let size=0;
      for(let part=0;part<Math.ceil(release.size/1048576);part++){const row=db.prepare('SELECT bytes FROM cloud_release_chunks WHERE version=? AND part=?').get(data.version,part);if(!row)throw new AuthError('RELEASE_INCOMPLETE',409);size+=row.bytes.byteLength;digest.update(Buffer.from(row.bytes));}
      if(size!==release.size||digest.digest('hex').toUpperCase()!==release.sha256)throw new AuthError('RELEASE_INCOMPLETE',409);
      db.prepare('UPDATE cloud_releases SET ready=1 WHERE version=?').run(data.version);return json(200,{ok:true});
    }
    throw new AuthError('NOT_FOUND',404);
  }
  function download(request,url) {
    const version=/^\/download\/Birge-(\d+\.\d+\.\d+)\.apk$/.exec(url.pathname)?.[1];
    const release=version&&db.prepare('SELECT * FROM cloud_releases WHERE version=? AND ready=1').get(version);if(!release)throw new AuthError('NOT_FOUND',404);
    let start=0,end=release.size-1,status=200;const headers=new Headers({'Content-Type':'application/vnd.android.package-archive','Content-Disposition':`attachment; filename="Birge-${version}.apk"`,'Accept-Ranges':'bytes','X-APK-SHA256':release.sha256,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    if(request.headers.has('range')){const match=/^bytes=(\d+)-(\d*)$/.exec(request.headers.get('range'));if(!match)throw new AuthError('INVALID_RANGE',416);start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end)throw new AuthError('INVALID_RANGE',416);status=206;headers.set('Content-Range',`bytes ${start}-${end}/${release.size}`);}
    headers.set('Content-Length',String(end-start+1));
    let cursor=start;
    const stream=request.method==='HEAD'?null:new ReadableStream({pull(controller){if(cursor>end){controller.close();return;}const part=Math.floor(cursor/1048576),row=db.prepare('SELECT bytes FROM cloud_release_chunks WHERE version=? AND part=?').get(version,part);if(!row){controller.error(new Error('Release unavailable'));return;}const bytes=new Uint8Array(row.bytes),offset=cursor%1048576,length=Math.min(bytes.length-offset,end-cursor+1);controller.enqueue(bytes.slice(offset,offset+length));cursor+=length;}});
    return new Response(stream,{status,headers});
  }
  return {handle,download,ready:()=>get('import')?.status==='ready'};
}
