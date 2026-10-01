import {DomainError, requireId} from './errors.ts';

export type Stage = 'discussion' | 'development';
export interface StagePlan {
  engine: 'pi';
  stage: Stage;
  role: 'requirements-analyst' | 'developer-architect';
  skills: string[];
  capabilities: string[];
  target: {kind: 'platform'} | {kind: 'registered'; environmentId: string};
}

/** A contract, not a sandbox. The runtime must enforce capabilities externally. */
export function stagePlan(stage: Stage, environmentId?: string): StagePlan {
  if (stage !== 'discussion' && stage !== 'development') throw new DomainError('INVALID_INPUT', 'Unknown Pi stage');
  if (stage === 'discussion') return {
    engine: 'pi', stage, role: 'requirements-analyst',
    skills: ['skills/requirements/SKILL.md'], capabilities: ['conversation'],
    target: {kind: 'platform'},
  };
  return {
    engine: 'pi', stage, role: 'developer-architect',
    skills: ['skills/development/SKILL.md'],
    capabilities: ['read_project', 'edit_project', 'run_project_checks'],
    target: {kind: 'registered', environmentId: requireId(environmentId, 'environmentId')},
  };
}
