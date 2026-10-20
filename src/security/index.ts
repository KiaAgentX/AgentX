/**
 * KIA DropAgentX — Security module barrel.
 * Re-exports everything public from the security submodules.
 */

export * from './rate-limiter';
export * from './prompt-guard';
export * from './redaction';
export * from './webhook';
export * from './mcp-token';
export * from './quota';
export * from './idempotency';
export * from './layers';

/** Documentation alias — identical to SECURITY_LAYERS (kept for discoverability). */
export { SECURITY_LAYERS as SECURITY_LAYERS_DOC } from './layers';
