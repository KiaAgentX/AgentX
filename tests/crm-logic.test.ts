/**
 * Lead CRM pure-logic tests — pipeline rules + contact normalization.
 * Run: bun run test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { canLeadTransition, normalizeContact, isValidContact, LEAD_STAGES } from '../src/services/crm.service.js';
import { t, detectLocale, LOCALES } from '../src/i18n/index.js';

test('crm: forward pipeline transitions are allowed', () => {
  assert.equal(canLeadTransition('new', 'warm'), true);
  assert.equal(canLeadTransition('new', 'won'), true);   // instant close allowed
  assert.equal(canLeadTransition('new', 'lost'), true);
  assert.equal(canLeadTransition('warm', 'won'), true);
  assert.equal(canLeadTransition('warm', 'lost'), true);
});

test('crm: illegal transitions fail closed', () => {
  assert.equal(canLeadTransition('won', 'new'), false);
  assert.equal(canLeadTransition('won', 'warm'), false);
  assert.equal(canLeadTransition('lost', 'new'), false);
  assert.equal(canLeadTransition('bogus', 'warm'), false);
});

test('crm: lost leads can be revived to warm', () => {
  assert.equal(canLeadTransition('lost', 'warm'), true);
});

test('crm: all stages are covered by the transition map', () => {
  for (const s of LEAD_STAGES) {
    for (const to of LEAD_STAGES) {
      assert.equal(typeof canLeadTransition(s, to), 'boolean');
    }
  }
});

test('crm: contact normalization — email / phone / handle', () => {
  assert.equal(normalizeContact('  Alice@Example.COM '), 'alice@example.com');
  assert.equal(normalizeContact('+44 7700-900 (123)'), '+447700900123');
  assert.equal(normalizeContact('@TelegramUser'), '@telegramuser');
  assert.equal(normalizeContact('  MixedCASE_handle '), 'mixedcase_handle');
});

test('crm: invalid contacts are rejected', () => {
  assert.equal(isValidContact(normalizeContact('ab')), false);       // too short
  assert.equal(isValidContact(normalizeContact('!!!')), false);
  assert.equal(isValidContact(normalizeContact('+447700900123')), true);
  assert.equal(isValidContact(normalizeContact('alice@example.com')), true);
});

test('i18n: t() falls back en → key and interpolates params', () => {
  assert.equal(t('en', 'nonexistent_key_xyz'), 'nonexistent_key_xyz');
  const bonus = t('en', 'welcome_bonus', { credits: 123 });
  assert.ok(bonus.includes('123'));
  assert.ok(bonus.includes('Welcome'));
});

test('i18n: 25 locales registered and detector maps codes', () => {
  assert.equal(LOCALES.length, 25);
  assert.equal(detectLocale('fa-IR'), 'fa');
  assert.equal(detectLocale('pt-BR'), 'pt');
  assert.equal(detectLocale('xx-YY'), 'en');
  assert.equal(detectLocale(null), 'en');
});
