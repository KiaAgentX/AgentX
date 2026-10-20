/**
 * Prompt-injection heuristics for user-provided text.
 * Weighted, case-insensitive pattern matching → score 0..100.
 * flagged = score >= 40.
 */

export interface InjectionVerdict {
  flagged: boolean;
  /** 0..100, capped sum of matched pattern weights. */
  score: number;
  /** Ids of the matched patterns. */
  matched: string[];
}

interface Pattern {
  id: string;
  weight: number;
  re: RegExp;
}

const PATTERNS: ReadonlyArray<Pattern> = [
  { id: 'ignore_instructions', weight: 50, re: /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions/i },
  { id: 'system_prompt', weight: 45, re: /system\s+prompt/i },
  { id: 'you_are_now', weight: 40, re: /you\s+are\s+now/i },
  { id: 'developer_mode', weight: 45, re: /developer\s+mode/i },
  { id: 'jailbreak', weight: 50, re: /jailbreak/i },
  { id: 'reveal_secret', weight: 55, re: /reveal\s+(?:your\s+)?(?:token|key|secret|password)/i },
  { id: 'disregard_rules', weight: 50, re: /disregard[\s\S]{0,80}rules/i },
  { id: 'print_env', weight: 45, re: /print[\s\S]{0,80}environment\s+variables/i },
  // base64("ignore") / base64("system prompt") / base64("jailbreak") / base64("you are now")
  { id: 'b64_ignore', weight: 40, re: /aWdub3Jl/ },
  { id: 'b64_system_prompt', weight: 40, re: /c3lzdGVtIHByb21wdA==/i },
  { id: 'b64_jailbreak', weight: 40, re: /amFpbGJyZWFr/i },
  { id: 'b64_you_are_now', weight: 40, re: /eW91IGFyZSBub3c/i },
];

const FLAG_THRESHOLD = 40;
const SCORE_CAP = 100;

export function detectPromptInjection(text: string): InjectionVerdict {
  if (!text || typeof text !== 'string') {
    return { flagged: false, score: 0, matched: [] };
  }
  const matched: string[] = [];
  let score = 0;
  for (const p of PATTERNS) {
    if (p.re.test(text)) {
      matched.push(p.id);
      score += p.weight;
    }
  }
  if (score > SCORE_CAP) score = SCORE_CAP;
  return { flagged: score >= FLAG_THRESHOLD, score, matched };
}
