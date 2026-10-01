import {DomainError, requireText} from './errors.ts';
import type {Stage} from './stage-plan.ts';
import type {RunResult} from './task.ts';

export function normalizeResult(stage: Stage, result: RunResult): RunResult {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new DomainError('INVALID_INPUT');
  const keys = stage === 'discussion' ? ['text'] : ['summary', 'verification', 'artifacts', 'unresolved'];
  if (Object.keys(result).some(k => !keys.includes(k))) throw new DomainError('INVALID_INPUT');
  if (stage === 'discussion') return {text: requireText(result.text, 'reply', 50_000)};
  if (!Array.isArray(result.artifacts) || result.artifacts.length === 0 || result.artifacts.length > 50 ||
      !Array.isArray(result.unresolved) || result.unresolved.length > 50) throw new DomainError('INVALID_INPUT');
  return {
    summary: requireText(result.summary, 'summary'),
    verification: requireText(result.verification, 'verification'),
    artifacts: result.artifacts.map(item => {
      if (!item || typeof item !== 'object') throw new DomainError('INVALID_INPUT');
      return {name: requireText(item.name, 'artifact name', 200), reference: requireText(item.reference, 'artifact reference', 2048)};
    }),
    unresolved: result.unresolved.map(x => requireText(x, 'unresolved', 2000)),
  };
}
