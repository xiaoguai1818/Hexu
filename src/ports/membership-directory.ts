export interface Membership {userId: string; canExecute: boolean}
/** Supplied by a trusted identity/project service, never from browser claims. */
export interface MembershipDirectory {
  lookup(projectId: string, userId: string): Membership | undefined;
}
