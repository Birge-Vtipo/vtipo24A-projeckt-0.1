import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { AuthError } from '../whatsapp-bot/src/auth-core.mjs';

export const CLOUD_MEDIA_BYTES=500_000_000;
export const CLOUD_STORAGE_HARD_BYTES=5_000_000_000;
export const CLOUD_MEDIA_CHUNK_BYTES=1024*1024;
const fail=(code,status=400)=>{throw new AuthError(code,status);};
const validId=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);

// The outer social service owns MIME, HMAC URLs, upload ownership and room ACL.
// This store only persists validated bytes in bounded, atomic SQLite chunks.
export function createSqlMediaStorage({db,maxBytes=CLOUD_MEDIA_BYTES,chunkBytes=CLOUD_MEDIA_CHUNK_BYTES}) {
  if(!db?.prepare||typeof db.transaction!=='function')throw new TypeError('Synchronous transactional database required');
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>CLOUD_STORAGE_HARD_BYTES||!Number.isSafeInteger(chunkBytes)||chunkBytes<1||chunkBytes>CLOUD_MEDIA_CHUNK_BYTES)throw new TypeError('Invalid media storage limits');
  db.exec(`CREATE TABLE IF NOT EXISTS cloud_media_objects(id TEXT PRIMARY KEY,size INTEGER NOT NULL CHECK(size>0));
    CREATE TABLE IF NOT EXISTS cloud_media_chunks(id TEXT NOT NULL,chunk INTEGER NOT NULL,bytes BLOB NOT NULL CHECK(length(bytes)<=1048576),PRIMARY KEY(id,chunk));`);
  const remove=id=>{
    if(!validId(id))fail('INVALID_MEDIA');
    return db.transaction(()=>{db.prepare('DELETE FROM cloud_media_chunks WHERE id=?').run(id);db.prepare('DELETE FROM cloud_media_objects WHERE id=?').run(id);});
  };
  return {
    maxBytes,
    write(id,value){
      if(!validId(id)||!ArrayBuffer.isView(value)||!value.byteLength||value.byteLength>20*1024*1024)fail('INVALID_MEDIA');
      const bytes=Buffer.from(value.buffer,value.byteOffset,value.byteLength);
      return db.transaction(()=>{
        if(db.prepare('SELECT 1 FROM cloud_media_objects WHERE id=?').get(id))fail('MEDIA_EXISTS',409);
        const used=db.prepare('SELECT coalesce(sum(size),0) n FROM cloud_media_objects').get().n;
        if(used+bytes.length>maxBytes||(Number.isFinite(db.sizeBytes)&&db.sizeBytes+bytes.length>CLOUD_STORAGE_HARD_BYTES))fail('STORAGE_FULL',413);
        db.prepare('INSERT INTO cloud_media_objects VALUES(?,?)').run(id,bytes.length);
        const insert=db.prepare('INSERT INTO cloud_media_chunks VALUES(?,?,?)');
        for(let offset=0,index=0;offset<bytes.length;offset+=chunkBytes,index++)insert.run(id,index,bytes.subarray(offset,offset+chunkBytes));
        if(Number.isFinite(db.sizeBytes)&&db.sizeBytes>CLOUD_STORAGE_HARD_BYTES)fail('STORAGE_FULL',413);
      });
    },
    read(id){
      if(!validId(id))fail('INVALID_MEDIA');
      const object=db.prepare('SELECT size FROM cloud_media_objects WHERE id=?').get(id);
      if(!object)fail('NOT_FOUND',404);
      const chunks=db.prepare('SELECT chunk,bytes FROM cloud_media_chunks WHERE id=? ORDER BY chunk').all(id);
      const parts=chunks.map((row,index)=>{
        const bytes=Buffer.from(row.bytes);
        if(row.chunk!==index||!bytes.length||bytes.length>chunkBytes)fail('MEDIA_UNAVAILABLE',503);
        return bytes;
      });
      if(parts.reduce((size,bytes)=>size+bytes.length,0)!==object.size)fail('MEDIA_UNAVAILABLE',503);
      return Buffer.concat(parts,object.size);
    },
    digest(id){
      if(!validId(id))fail('INVALID_MEDIA');
      const object=db.prepare('SELECT size FROM cloud_media_objects WHERE id=?').get(id);
      if(!object)fail('NOT_FOUND',404);
      const count=db.prepare('SELECT count(*) n FROM cloud_media_chunks WHERE id=?').get(id).n;
      if(count!==Math.ceil(object.size/chunkBytes))fail('MEDIA_UNAVAILABLE',503);
      const digest=createHash('sha256');let size=0;
      // Fetch one bounded BLOB at a time; sealing never assembles a 20MiB file.
      for(let chunk=0;chunk<count;chunk++){
        const row=db.prepare('SELECT bytes FROM cloud_media_chunks WHERE id=? AND chunk=?').get(id,chunk);
        if(!row)fail('MEDIA_UNAVAILABLE',503);
        const bytes=Buffer.from(row.bytes);
        if(!bytes.length||bytes.length>chunkBytes)fail('MEDIA_UNAVAILABLE',503);
        size+=bytes.length;digest.update(bytes);
      }
      if(size!==object.size)fail('MEDIA_UNAVAILABLE',503);
      return {size,sha256:digest.digest('hex')};
    },
    remove,
  };
}
