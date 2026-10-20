/**
 * Output redaction — scrubs secrets from any text before it leaves the
 * process (bot replies, tool payloads, logs). Everything that looks like a
 * credential is replaced with [REDACTED]; the rest of the text stays intact.
 */

const REDACTED = '[REDACTED]';

interface Rule {
  re: RegExp;
  /** Optional validator: return true to replace, false to keep the match. */
  keep?: (match: string) => boolean;
}

// Order matters: most specific / most structural first.
const RULES: ReadonlyArray<Rule> = [
  // PEM private keys (RSA / EC / DSA / OPENSSH / PGP / PKCS8, optional BLOCK)
  {
    re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/g,
  },
  // Bearer / authorization headers
  {
    re: /\b(?:Bearer|BEARER)[ \t]+[A-Za-z0-9._~+/=-]{8,}/g,
  },
  // JWTs (eyJ header, 2 or 3 base64url segments)
  {
    re: /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}(?:\.[A-Za-z0-9_-]{6,})?(?![A-Za-z0-9_-])/g,
  },
  // OpenAI-style keys (sk-..., including sk-proj-...)
  {
    re: /\bsk-[A-Za-z0-9_-]{16,}(?![A-Za-z0-9_-])/g,
  },
  // Telegram bot tokens: <bot_id 7..11 digits>:<secret 30+ chars>
  {
    re: /\b\d{7,11}:[A-Za-z0-9_-]{30,}\b/g,
  },
  // AWS access key ids
  {
    re: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g,
  },
  // Credit-card-like numbers: 13..19 digits with optional spaces/dashes (Luhn optional)
  {
    re: /\b\d(?:[ \t-]?\d){12,18}\b/g,
  },
  // Seed phrases: 12+ consecutive lowercase words (3-8 letters, single spaces)
  {
    re: /\b(?:[a-z]{3,8}[ \t]+){11,}[a-z]{3,8}\b/g,
  },
  // Long hex secrets (32+ hex chars) — API keys, hashes, salts
  {
    re: /\b[0-9a-fA-F]{32,}\b/g,
  },
];

export function redact(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let out = text;
  for (const rule of RULES) {
    out = out.replace(rule.re, (match) => (rule.keep && rule.keep(match) ? match : REDACTED));
  }
  return out;
}
