import type {Run} from '../core/task.ts';
import type {RunModel,RunUsage} from '../core/usage.ts';

/** Only approved conversation context crosses this boundary, never project paths or browser credentials. */
export interface DiscussionRuntime {
  readonly identity:RunModel;
  respond(input:Run['input'],signal:AbortSignal):Promise<{text:string;usage:RunUsage}>;
}
/** Request admission, not a monetary billing ledger. Failed/unknown calls consume admission. */
export interface DiscussionBudget {
  admit(projectId:string,key:string,day:string,maximum:number):void;
  release(key:string):void;
}
