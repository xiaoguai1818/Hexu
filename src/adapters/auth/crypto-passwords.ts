import {randomBytes,createHash,scrypt,timingSafeEqual} from 'node:crypto';
import type {Passwords} from '../../ports/workspace-store.ts';

const derive=(password:string,salt:string):Promise<Buffer>=>new Promise((resolve,reject)=>{
  scrypt(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key));
});
/** OWASP scrypt profile: 32 MiB / p=3; never accepts costs supplied by a stored string. */
export class CryptoPasswords implements Passwords {
  async hash(password:string):Promise<string> {
    const salt=randomBytes(16).toString('hex');return `scrypt-v1:${salt}:${(await derive(password,salt)).toString('hex')}`;
  }
  async verify(password:string,hash:string):Promise<boolean> {
    const match=/^scrypt-v1:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(hash);
    // Missing accounts and malformed hashes still incur the same password work.
    const actual=await derive(password,match?.[1]??'0'.repeat(32));
    const expected=Buffer.from(match?.[2]??'0'.repeat(128),'hex');
    return timingSafeEqual(actual,expected)&&match!==null;
  }
  token():string {return randomBytes(32).toString('hex');}
  digest(value:string):string {return createHash('sha256').update(value).digest('hex');}
}
