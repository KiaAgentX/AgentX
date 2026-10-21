/**
 * Ledger reconciliation tool — XDrop (KIA DropAgentX)
 *
 * Legacy (pre-TypeScript) data imported balances and transactions
 * independently, leaving 10 wallets where wallet.credits ≠ Σ(completed
 * transactions). This tool:
 *   1. measures the drift per wallet (wallet.credits vs ledger sum),
 *   2. in --apply mode aligns each wallet to its ledger sum and writes ONE
 *      `adjustment` note row per wallet (status 'reconciled' — deliberately
 *      EXCLUDED from ledger sums, otherwise the gap could never close),
 *      so every change is visible in /history and auditable.
 *
 * Modes:
 *   npx tsx scripts/reconcile-ledger.ts            → read-only report
 *   npx tsx scripts/reconcile-ledger.ts --apply    → write adjustments
 * Idempotent: re-running after a successful apply reports zero drift.
 */
import 'dotenv/config';
import { db } from '../src/core/db';

interface Row {
  userId: string;
  telegramId: string;
  walletId: string;
  balance: number;
  ledger: number;
}

async function measure(): Promise<Row[]> {
  // NOTE: "Transaction" is a SQLite keyword — quoted identifiers required.
  const rows = await db.$queryRaw<Row[]>`
    SELECT u.id            AS userId,
           u."telegramId"  AS telegramId,
           w.id            AS walletId,
           w.credits       AS balance,
           COALESCE(SUM(t.amount), 0) AS ledger
    FROM "Wallet" w
    JOIN "User" u ON u.id = w.userId
    LEFT JOIN "Transaction" t ON t.walletId = w.id AND t.status = 'completed'
    GROUP BY w.id, u.id, u."telegramId", w.credits
    HAVING w.credits != COALESCE(SUM(t.amount), 0)
    ORDER BY ABS(w.credits - COALESCE(SUM(t.amount), 0)) DESC
  `;
  return rows;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const rows = await measure();

  if (rows.length === 0) {
    console.log('✅ Ledger is consistent — every wallet balance matches its transaction sum.');
    await db.$disconnect();
    return;
  }

  console.log(`⚠️  ${rows.length} wallet(s) with ledger drift:\n`);
  for (const r of rows) {
    const delta = Number(r.ledger) - Number(r.balance);
    console.log(
      `  user ${r.telegramId} (id ${r.userId.slice(0, 8)}…)  wallet=${r.balance}  ledger=${r.ledger}  drift=${delta > 0 ? '+' : ''}${delta}`
    );
  }

  if (!apply) {
    console.log('\n(read-only) run with --apply to write `adjustment` transactions and align balances.');
    await db.$disconnect();
    return;
  }

  console.log('\n🔧 applying adjustments…');
  for (const r of rows) {
    const delta = Number(r.ledger) - Number(r.balance);
    if (delta === 0) continue;
    await db.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          walletId: r.walletId,
          type: 'adjustment',
          amount: delta,
          currency: 'credits',
          // 'reconciled' (NOT 'completed') — audit-note row excluded from
          // ledger sums; otherwise inserting it would shift the sum by `delta`
          // and the gap could never close.
          status: 'reconciled',
          reference: 'ledger_reconcile_v1',
          meta: JSON.stringify({
            reason: 'legacy-import reconciliation (balance aligned to transaction ledger)',
            beforeBalance: Number(r.balance),
            ledgerSum: Number(r.ledger),
          }),
        },
      });
      await tx.wallet.update({ where: { id: r.walletId }, data: { credits: Number(r.ledger) } });
    });
    console.log(`  ✓ user ${r.telegramId}: ${r.balance} → ${r.ledger} (adjustment ${delta > 0 ? '+' : ''}${delta})`);
  }

  const after = await measure();
  console.log(after.length === 0 ? '\n✅ reconciliation complete — zero drift.' : `\n❌ ${after.length} wallets still drifted!`);
  await db.$disconnect();
}

main()
  .catch((err) => {
    console.error('❌ reconcile failed:', err);
    process.exit(1);
  });
