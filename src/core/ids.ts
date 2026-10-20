import { randomUUID } from 'crypto';

/** Collision-safe id for tokens, nonces, references. */
export function newId(): string {
  return randomUUID().replace(/-/g, '');
}
