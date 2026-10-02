/** Used only for idempotent startup reads, BEGIN and journal configuration.
 * Never wrap business writes or replay agent work. SQLite can return BUSY while
 * upgrading journal locks without invoking its configured busy timeout.
 */
export function retrySqliteStartup<T>(operation:()=>T,timeoutMs=5000):T {
  const deadline=performance.now()+timeoutMs;
  while(true){
    try{return operation();}catch(error){
      const busy=error!==null&&typeof error==='object'&&'code' in error&&error.code==='ERR_SQLITE_ERROR'&&'errcode' in error&&typeof error.errcode==='number'&&(error.errcode&255)===5;
      const remaining=deadline-performance.now();if(!busy||remaining<=0)throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,Math.min(20,remaining));
    }
  }
}
