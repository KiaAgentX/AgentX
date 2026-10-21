/**
 * Nation economy tests — the monetary charter as executable law.
 * 10 cases: tax split exactness, clamping, validation, mint caps, HITL
 * threshold and the sacred invariant (ok + broken).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertWithinMintCap,
  checkInvariant,
  clampTaxPercent,
  HITL_THRESHOLD_DINAR,
  MINT_DAILY_CAPS,
  requiresHitl,
  splitTax,
  TAX_DEFAULT_PERCENT,
  TAX_MAX_PERCENT,
  validateDinarAmount,
} from '../src/nation/charter';

test('A4: default tax is the real code default (10%), cap is 90%', () => {
  assert.equal(TAX_DEFAULT_PERCENT, 10);
  assert.equal(TAX_MAX_PERCENT, 90);
});

test('A3: splitTax floors the treasury share — integer exact, no mint/burn by rounding', () => {
  const s = splitTax(105); // 10% of 105 = 10.5 → treasury 10, seller 95
  assert.deepEqual(s, { gross: 105, percent: 10, treasury: 10, seller: 95 });
  assert.equal(s.treasury + s.seller, s.gross);
});

test('A3: splitTax conserves the gross at every legal percent', () => {
  for (const p of [0, 1, 7, 10, 33, 90]) {
    const s = splitTax(9_999, p);
    assert.equal(s.treasury + s.seller, 9_999);
    assert.ok(s.treasury >= 0 && s.seller >= 0);
  }
});

test('A4: clampTaxPercent rejects non-integers and clamps beyond the legal cap', () => {
  assert.throws(() => clampTaxPercent(12.5), RangeError);
  assert.throws(() => clampTaxPercent(Number.NaN), RangeError);
  assert.equal(clampTaxPercent(-5), 0);
  assert.equal(clampTaxPercent(95), TAX_MAX_PERCENT);
  assert.equal(clampTaxPercent(42), 42);
});

test('money is integer & positive: floats, negatives and zero are fail-closed', () => {
  assert.throws(() => validateDinarAmount(0), RangeError);
  assert.throws(() => validateDinarAmount(-100), RangeError);
  assert.throws(() => validateDinarAmount(10.5), RangeError);
  assert.throws(() => validateDinarAmount(Number.NaN), RangeError);
  assert.doesNotThrow(() => validateDinarAmount(1));
});

test('A8: mint caps — quest 10,000/day, referral 5,000/day', () => {
  assert.deepEqual(MINT_DAILY_CAPS, { quest: 10_000, referral: 5_000 });
});

test('A8: a mint that crosses the daily cap is rejected, one inside it passes', () => {
  assert.doesNotThrow(() => assertWithinMintCap('quest', 500, 9_500)); // exactly at cap
  assert.throws(() => assertWithinMintCap('quest', 501, 9_500), RangeError);
  assert.throws(() => assertWithinMintCap('referral', 1, 5_000), RangeError);
});

test('A9: actions ≥ 50,000 Đ require a human decision (HITL)', () => {
  assert.equal(HITL_THRESHOLD_DINAR, 50_000);
  assert.equal(requiresHitl(49_999), false);
  assert.equal(requiresHitl(50_000), true);
  assert.equal(requiresHitl(-50_000), true); // debits count too
});

test('A7: sacred invariant holds when balances ≡ ledger + adjustments', () => {
  const r = checkInvariant(1000, 900, 100);
  assert.equal(r.ok, true);
  assert.equal(r.gap, 0);
});

test('A7: an unexplained gap FAILS the audit — fail-closed, always', () => {
  const r = checkInvariant(187_672, 187_735, 0); // heritage gap without itemization
  assert.equal(r.ok, false);
  assert.equal(r.gap, -63);
  assert.match(r.detail!, /audit failed/);
});
