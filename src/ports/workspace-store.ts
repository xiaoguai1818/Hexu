import type {MembershipDirectory} from './membership-directory.ts';

export interface User {id:string; username:string}
export interface Account extends User {passwordHash:string; disabled:boolean}
export interface Project {id:string; name:string; ownerId:string}
export interface ProjectMember extends User {canExecute:boolean}
export interface LoginSession {digest:string; userId:string; csrf:string; expiresAt:number}
export interface Passwords {
  hash(password:string):Promise<string>;
  verify(password:string,hash:string):Promise<boolean>;
  token():string;
  digest(value:string):string;
}
/** Storage operations preserve project ownership and atomic membership changes. */
export interface WorkspaceStore extends MembershipDirectory {
  accountByName(username:string):Account|undefined;
  account(id:string):Account|undefined;
  addAccount(account:Account):void;
  addSession(session:LoginSession,now:number):void;
  session(digest:string):LoginSession|undefined;
  removeSession(digest:string):void;
  consumeAttempt(key:string,now:number,limit:number):void;
  clearAttempts(key:string):void;
  createProject(project:Project):void;
  project(id:string):Project|undefined;
  projects(userId:string):Project[];
  members(projectId:string):ProjectMember[];
  putMember(projectId:string,userId:string,canExecute:boolean):void;
  removeMember(projectId:string,userId:string):void;
}
