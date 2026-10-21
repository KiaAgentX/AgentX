/**
 * Nation economy router — public, READ-ONLY transparency API (Article 10).
 * ─────────────────────────────────────────────────────────────────────────────
 * Mounted additively at /api/v1/nation — no existing route is touched.
 * Endpoints:
 *   GET /api/v1/nation/economy           → live indicators
 *   GET /api/v1/nation/economy/verify    → sacred-invariant report (Article 7)
 *   GET /api/v1/nation/economy/charter   → the 10-article charter as data
 */
import { Router } from 'express';
import {
  DINAR,
  HITL_THRESHOLD_DINAR,
  MINT_DAILY_CAPS,
  TAX_DEFAULT_PERCENT,
  TAX_MAX_PERCENT,
} from './charter';
import {
  getEconomyIndicators,
  getGenesisAudit,
  verifySacredInvariant,
} from './economy.service';

export function createNationEconomyRouter(): Router {
  const r = Router();

  r.get('/economy', async (_req, res) => {
    try {
      res.json({ ok: true, indicators: await getEconomyIndicators() });
    } catch (err) {
      res.status(503).json({
        ok: false,
        error: 'economy indicators unavailable (database offline?)',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  r.get('/economy/verify', async (_req, res) => {
    try {
      res.json({ ok: true, audit: await verifySacredInvariant(), genesis: getGenesisAudit() });
    } catch (err) {
      res.status(503).json({
        ok: false,
        error: 'verification unavailable (database offline?)',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  r.get('/economy/charter', (_req, res) => {
    res.json({
      ok: true,
      charter: {
        title: 'منشور پولی کشور دیجیتال — ۱۰ ماده',
        currency: DINAR,
        articles: [
          { id: 1, title: 'واحد پول', rule: 'دینار دیجیتال (Đ/DNX)؛ تغییر نام ۱:۱ اعتبارات — هرگز تنزیل و بازپایه‌گذاری نمی‌شود' },
          { id: 2, title: 'رزرو خارجی', rule: 'ستارهٔ تلگرام = رزرو خارجی کشور؛ دینار فقط داخلی است' },
          { id: 3, title: 'خزانه', rule: 'کمیسیون پیش از هر تسویهٔ فروشنده به خزانه واریز می‌شود' },
          { id: 4, title: 'مالیات', rule: `پیش‌فرض ${TAX_DEFAULT_PERCENT}٪ (نرخ واقعی کد)؛ سقف قانونی ${TAX_MAX_PERCENT}٪` },
          { id: 5, title: 'ضرب', rule: 'پاداش‌ها (کوئست/معرفی) ضرب ملی‌اند با سقف روزانه' },
          { id: 6, title: 'ابطال', rule: 'سوزاندن دینار فقط در مسیرهای مستندِ ابطال' },
          { id: 7, title: 'ناوردای مقدس', rule: 'Σ موجودی ≡ Σ دفتر + تعدیلات مستند — مغایرتِ توجیه‌ناپذیر = شکست حسابرسی' },
          { id: 8, title: 'سقف‌های ضرب', rule: `کوئست ≤ ${MINT_DAILY_CAPS.quest.toLocaleString('en')} Đ/روز · معرفی ≤ ${MINT_DAILY_CAPS.referral.toLocaleString('en')} Đ/روز` },
          { id: 9, title: 'حاکمیت انسانی', rule: `اقدام یکجا ≥ ${HITL_THRESHOLD_DINAR.toLocaleString('en')} Đ نیازمند تصمیم انسانی (HITL) است` },
          { id: 10, title: 'شفافیت', rule: 'این API فقط-خواندنی و عمومی است؛ قانون آینهٔ واقعیت کد است' },
        ],
      },
    });
  });

  return r;
}
