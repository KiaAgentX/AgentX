/**
 * Core primitives — pure unit tests (no DB, no network).
 * Run: bun run test  (tsx --test tests/*.test.ts)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hmacSha256Hex, safeEqualHex, safeEqualString, signWithSecret, verifySignature } from '../src/core/crypto.js';
import { toJson, fromJson } from '../src/core/json.js';
import { newId } from '../src/core/ids.js';
import { AppError, ValidationError, NotFoundError } from '../src/core/errors.js';

test('crypto: hmac is deterministic and hex-encoded', () => {
  const a = hmacSha256Hex('secret', 'payload');
  const b = hmacSha256Hex('secret', 'payload');
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.notEqual(a, hmacSha256Hex('other-secret', 'payload'));
});

test('crypto: safeEqual resists length/timing shortcuts', () => {
  assert.equal(safeEqualHex('aabbcc', 'aabbcc'), true);
  assert.equal(safeEqualHex('aabbcc', 'aabbcd'), false);
  assert.equal(safeEqualHex('aabbcc', 'aabb'), false);
  assert.equal(safeEqualString('kia-secret', 'kia-secret'), true);
  assert.equal(safeEqualString('kia-secret', 'kia-Secret'), false);
});

test('crypto: sign/verify roundtrip and tamper detection', () => {
  const sig = signWithSecret('{"a":1}');
  assert.equal(verifySignature('{"a":1}', sig), true);
  assert.equal(verifySignature('{"a":2}', sig), false);
  assert.equal(verifySignature('{"a":1}', sig.slice(0, -2) + 'ff'), false);
});

test('json: toJson/fromJson roundtrip + bad input falls back', () => {
  const v = { a: 1, nested: { b: 'x' } };
  assert.deepEqual(fromJson(toJson(v), {}), v);
  assert.equal(fromJson('not-json{', 'fb'), 'fb');
  assert.equal(fromJson(null, 'fb'), 'fb');
  assert.deepEqual(fromJson('{"ok":true}', {}), { ok: true });
});

test('ids: newId is unique and non-empty', () => {
  const seen = new Set(Array.from({ length: 200 }, () => newId()));
  assert.equal(seen.size, 200);
  for (const id of seen) assert.ok(id.length >= 8);
});

test('errors: typed AppErrors carry code + httpStatus', () => {
  const ve = new ValidationError('bad input');
  assert.equal(ve instanceof AppError, true);
  assert.equal(ve.code, 'VALIDATION_ERROR');
  assert.equal(ve.httpStatus, 400);
  const nf = new NotFoundError('Widget');
  assert.equal(nf.code, 'NOT_FOUND');
  assert.equal(nf.httpStatus, 404);
});
