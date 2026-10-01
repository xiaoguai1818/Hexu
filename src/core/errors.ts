export class DomainError extends Error {
  readonly code: string;
  constructor(code: string, message: string = code) {
    super(message); this.name = 'DomainError'; this.code = code;
  }
}
export function requireText(value: unknown, field: string, limit = 10_000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) {
    throw new DomainError('INVALID_INPUT', `Invalid ${field}`);
  }
  return value.trim();
}
export function requireId(value: unknown, field: string): string {
  const id = requireText(value, field, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) throw new DomainError('INVALID_INPUT', `Invalid ${field}`);
  return id;
}
