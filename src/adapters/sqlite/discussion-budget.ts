import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {DomainError} from '../../core/errors.ts';
import type {DiscussionBudget} from '../../ports/discussion-runtime.ts';

/** Lifetime DB lock is separate from committed admission receipts. Process exit releases ownership. */
export class SqliteDiscussionBudget implements DiscussionBudget {
  private readonly owner:DatabaseSync;
  private readonly budget:DatabaseSync;
  constructor(directory:string){
    mkdirSync(directory,{recursive:true,mode:0o700});
    this.owner=new DatabaseSync(join(directory,'discussion-owner.sqlite'),{timeout:0});
    try{this.owner.exec('BEGIN IMMEDIATE');}catch{this.owner.close();throw new DomainError('DISCUSSION_OWNER_ACTIVE');}
    let budget:DatabaseSync|undefined;
    try{
      this.budget=budget=new DatabaseSync(join(directory,'discussion-budget.sqlite'),{timeout:5000});
      const version=Number(this.budget.prepare('PRAGMA user_version').get()!['user_version']);
      if(version>1)throw new DomainError('SCHEMA_TOO_NEW');
      this.budget.exec('CREATE TABLE IF NOT EXISTS admissions (id TEXT PRIMARY KEY,project TEXT NOT NULL,day TEXT NOT NULL) STRICT; CREATE INDEX IF NOT EXISTS admissions_project_day ON admissions(project,day); PRAGMA user_version=1;');
    }catch(error){budget?.close();this.owner.close();throw error;}
  }
  admit(projectId:string,key:string,day:string,maximum:number):void {
    this.budget.exec('BEGIN IMMEDIATE');
    try{
      const count=Number(this.budget.prepare('SELECT COUNT(*) AS n FROM admissions WHERE project=? AND day=?').get(projectId,day)!['n']);
      if(count>=maximum)throw new DomainError('DISCUSSION_LIMIT');
      this.budget.prepare('INSERT INTO admissions VALUES(?,?,?)').run(key,projectId,day);this.budget.exec('COMMIT');
    }catch(error){this.budget.exec('ROLLBACK');throw error;}
  }
  release(key:string):void{this.budget.prepare('DELETE FROM admissions WHERE id=?').run(key);}
  close():void{try{this.budget.close();}finally{this.owner.close();}}
}
