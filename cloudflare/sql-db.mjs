// Synchronous subset used by auth/social. Cursors never escape a synchronous
// call, and transaction statements are delegated to Durable Object storage.
export function createSqlDatabase(storage) {
  if(!storage?.sql?.exec||typeof storage.transactionSync!=='function')throw new TypeError('SQLite Durable Object storage required');
  const rows=(query,bindings=[])=>Array.from(storage.sql.exec(query,...bindings.map(value=>{
    if(ArrayBuffer.isView(value))return value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength);
    return value;
  })));
  return {
    maxLikePatternBytes:50,
    get sizeBytes(){return storage.sql.databaseSize;},
    exec(query){rows(query);},
    prepare(query){return {
      get(...bindings){return rows(query,bindings)[0];},
      all(...bindings){return rows(query,bindings);},
      run(...bindings){
        rows(query,bindings);
        // rowsWritten includes index writes; SQL changes() matches Node SQLite.
        return rows('SELECT changes() AS changes,last_insert_rowid() AS lastInsertRowid')[0];
      },
    };},
    transaction(callback){
      if(typeof callback!=='function')throw new TypeError('Synchronous transaction callback required');
      return storage.transactionSync(()=>{
        const result=callback();
        if(result&&typeof result.then==='function')throw new TypeError('Transaction callback must be synchronous');
        return result;
      });
    },
    close(){},
  };
}
