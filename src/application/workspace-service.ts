import {DomainError,requireText} from '../core/errors.ts';
import {username} from './auth-service.ts';
import type {WorkspaceStore,Project} from '../ports/workspace-store.ts';

export class WorkspaceService {
  private readonly store:WorkspaceStore;
  private readonly ids:()=>string;
  constructor(store:WorkspaceStore,ids:()=>string) {this.store=store;this.ids=ids;}
  private active(actor:string):void {if(this.store.account(actor)?.disabled!==false)throw new DomainError('UNAUTHENTICATED');}
  create(actor:string,name:unknown):Project {
    this.active(actor);const project={id:this.ids(),name:requireText(name,'project name',120),ownerId:actor};
    this.store.createProject(project);return project;
  }
  list(actor:string):Project[] {this.active(actor);return this.store.projects(actor);}
  get(actor:string,id:string) {
    this.active(actor);const project=this.store.project(id);
    if(!project||!this.store.lookup(id,actor))throw new DomainError('FORBIDDEN');
    return {...project,members:this.store.members(id)};
  }
  private owner(actor:string,id:string):Project {
    const project=this.get(actor,id);if(project.ownerId!==actor)throw new DomainError('PROJECT_OWNER_REQUIRED');return project;
  }
  addMember(actor:string,id:string,name:unknown,canExecute:unknown) {
    const project=this.owner(actor,id);if(typeof canExecute!=='boolean')throw new DomainError('INVALID_INPUT');
    const member=this.store.accountByName(username(name));if(!member||member.disabled)throw new DomainError('ACCOUNT_NOT_FOUND');
    if(project.ownerId===member.id)throw new DomainError('OWNER_REQUIRED');
    this.store.putMember(id,member.id,canExecute);return this.get(actor,id);
  }
  removeMember(actor:string,id:string,userId:string) {
    const project=this.owner(actor,id);if(project.ownerId===userId)throw new DomainError('OWNER_REQUIRED');
    this.store.removeMember(id,userId);return this.get(actor,id);
  }
}
