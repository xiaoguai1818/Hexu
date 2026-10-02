import {DomainError} from '../core/errors.ts';
import type {WorkspaceStore,Passwords,User} from '../ports/workspace-store.ts';

export function username(value:unknown):string {
  if(typeof value!=='string'||!/^[a-z][a-z0-9._-]{2,31}$/i.test(value))throw new DomainError('INVALID_INPUT');
  return value.toLowerCase();
}
function password(value:unknown):asserts value is string {
  if(typeof value!=='string'||value.length<12||value.length>256)throw new DomainError('INVALID_INPUT','Password must contain 12–256 characters');
}
export class AuthService {
  private readonly store:WorkspaceStore;
  private readonly passwords:Passwords;
  private readonly now:()=>number;
  constructor(store:WorkspaceStore,passwords:Passwords,now:()=>number) {this.store=store;this.passwords=passwords;this.now=now;}
  /** Account provisioning is an operator/CLI boundary, never a public registration endpoint. */
  async provision(name:unknown,value:unknown):Promise<User> {
    const normalized=username(name);password(value);
    const user={id:this.passwords.token(),username:normalized};
    this.store.addAccount({...user,passwordHash:await this.passwords.hash(value),disabled:false});return user;
  }
  async login(name:unknown,value:unknown,address:string) {
    if(typeof name!=='string'||name.length>128||typeof value!=='string'||value.length>256)throw new DomainError('UNAUTHENTICATED');
    const normalized=name.toLowerCase(),key=this.passwords.digest(`name:${normalized}`);
    this.store.consumeAttempt(this.passwords.digest(`ip:${address}`),this.now(),60);
    this.store.consumeAttempt(key,this.now(),8);
    const account=this.store.accountByName(normalized);
    const valid=await this.passwords.verify(value,account?.passwordHash??'');
    if(!valid||!account||account.disabled||this.store.account(account.id)?.disabled!==false)throw new DomainError('UNAUTHENTICATED');
    const token=this.passwords.token(),csrf=this.passwords.token(),expiresAt=this.now()+8*60*60*1000;
    this.store.addSession({digest:this.passwords.digest(token),userId:account.id,csrf,expiresAt},this.now());
    this.store.clearAttempts(key);return {token,csrf,expiresAt,user:{id:account.id,username:account.username}};
  }
  authenticate(token:string) {
    if(!/^[a-f0-9]{64}$/.test(token))throw new DomainError('UNAUTHENTICATED');
    const session=this.store.session(this.passwords.digest(token));
    if(!session||session.expiresAt<=this.now())throw new DomainError('UNAUTHENTICATED');
    const account=this.store.account(session.userId);
    if(!account||account.disabled)throw new DomainError('UNAUTHENTICATED');
    return {user:{id:account.id,username:account.username},csrf:session.csrf};
  }
  logout(token:string):void {this.store.removeSession(this.passwords.digest(token));}
}
