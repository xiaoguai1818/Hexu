import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {DomainError} from '../../core/errors.ts';
import type {WorkspaceStore,Account,Project,ProjectMember,LoginSession} from '../../ports/workspace-store.ts';

export class SqliteWorkspace implements WorkspaceStore {
  private readonly db:DatabaseSync;
  constructor(filename:string) {
    if(filename!==':memory:')mkdirSync(dirname(resolve(filename)),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(filename,{timeout:5000});
    try {
      const version=()=>Number(this.db.prepare('PRAGMA user_version').get()!['user_version']);
      if(version()>1)throw new DomainError('SCHEMA_TOO_NEW');
      this.db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
      try {
        if(version()>1)throw new DomainError('SCHEMA_TOO_NEW');
        if(version()===0)this.db.exec(`
          CREATE TABLE accounts(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,disabled INTEGER NOT NULL CHECK(disabled IN (0,1))) STRICT;
          CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,owner_id TEXT NOT NULL REFERENCES accounts(id)) STRICT;
          CREATE TABLE members(project_id TEXT NOT NULL REFERENCES projects(id),user_id TEXT NOT NULL REFERENCES accounts(id),can_execute INTEGER NOT NULL CHECK(can_execute IN (0,1)),PRIMARY KEY(project_id,user_id)) STRICT;
          CREATE TABLE sessions(digest TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES accounts(id),csrf TEXT NOT NULL,expires_at INTEGER NOT NULL) STRICT;
          CREATE INDEX sessions_expiry ON sessions(expires_at);
          CREATE TABLE login_attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL) STRICT;
          PRAGMA user_version=1;
        `);
        this.db.exec('COMMIT');
      }catch(error){this.db.exec('ROLLBACK');throw error;}
      this.db.exec('PRAGMA journal_mode=WAL');
    }catch(error){this.db.close();throw error;}
  }
  private user(row:Record<string,unknown>|undefined):Account|undefined {
    return row?{id:String(row['id']),username:String(row['username']),passwordHash:String(row['password_hash']),disabled:row['disabled']===1}:undefined;
  }
  accountByName(name:string):Account|undefined{return this.user(this.db.prepare('SELECT * FROM accounts WHERE username=?').get(name));}
  account(id:string):Account|undefined{return this.user(this.db.prepare('SELECT * FROM accounts WHERE id=?').get(id));}
  addAccount(account:Account):void {
    try{this.db.prepare('INSERT INTO accounts VALUES(?,?,?,?)').run(account.id,account.username,account.passwordHash,Number(account.disabled));}
    catch(error){if(error instanceof Error&&error.message.includes('UNIQUE constraint'))throw new DomainError('ACCOUNT_EXISTS');throw error;}
  }
  addSession(session:LoginSession,now:number):void {
    this.db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now);
    this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(session.digest,session.userId,session.csrf,session.expiresAt);
  }
  session(digest:string):LoginSession|undefined {
    const row=this.db.prepare('SELECT * FROM sessions WHERE digest=?').get(digest);
    return row?{digest:String(row['digest']),userId:String(row['user_id']),csrf:String(row['csrf']),expiresAt:Number(row['expires_at'])}:undefined;
  }
  removeSession(digest:string):void {this.db.prepare('DELETE FROM sessions WHERE digest=?').run(digest);}
  consumeAttempt(key:string,now:number,limit:number):void {
    this.db.prepare('DELETE FROM login_attempts WHERE expires_at<=?').run(now);
    const row=this.db.prepare('INSERT INTO login_attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').get(key,now+900000);
    if(Number(row!['count'])>limit)throw new DomainError('RATE_LIMITED');
  }
  clearAttempts(key:string):void{this.db.prepare('DELETE FROM login_attempts WHERE key=?').run(key);}
  createProject(p:Project):void {
    this.db.exec('BEGIN IMMEDIATE');try{
      this.db.prepare('INSERT INTO projects VALUES(?,?,?)').run(p.id,p.name,p.ownerId);
      this.putMember(p.id,p.ownerId,true);this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  private decodeProject(row:Record<string,unknown>):Project{return {id:String(row['id']),name:String(row['name']),ownerId:String(row['owner_id'])};}
  project(id:string):Project|undefined{const row=this.db.prepare('SELECT * FROM projects WHERE id=?').get(id);return row?this.decodeProject(row):undefined;}
  projects(userId:string):Project[]{return this.db.prepare('SELECT p.* FROM projects p JOIN members m ON m.project_id=p.id WHERE m.user_id=? ORDER BY p.name,p.id').all(userId).map(row=>this.decodeProject(row));}
  members(id:string):ProjectMember[]{return this.db.prepare('SELECT a.id,a.username,m.can_execute FROM members m JOIN accounts a ON a.id=m.user_id WHERE m.project_id=? AND a.disabled=0 ORDER BY a.username').all(id).map(row=>({id:String(row['id']),username:String(row['username']),canExecute:row['can_execute']===1}));}
  lookup(projectId:string,userId:string) {
    const row=this.db.prepare('SELECT m.can_execute FROM members m JOIN accounts a ON a.id=m.user_id WHERE m.project_id=? AND m.user_id=? AND a.disabled=0').get(projectId,userId);
    return row?{userId,canExecute:row['can_execute']===1}:undefined;
  }
  putMember(projectId:string,userId:string,canExecute:boolean):void{this.db.prepare('INSERT INTO members VALUES(?,?,?) ON CONFLICT(project_id,user_id) DO UPDATE SET can_execute=excluded.can_execute').run(projectId,userId,Number(canExecute));}
  removeMember(projectId:string,userId:string):void{this.db.prepare('DELETE FROM members WHERE project_id=? AND user_id=?').run(projectId,userId);}
  close():void{this.db.close();}
}
