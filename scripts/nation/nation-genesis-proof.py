#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Nation Genesis Proof — مادهٔ ۷ (ناوردای مقدس) + حسابرسی کامل دفتر میراث.
Legacy schema (Railway era): balances in users.credits, ledger = transactions
(no status column — every row final), purchases in purchases.price_credits.

Claim under test (the honest invariant):
  Σ users.credits  ≡  Σ transactions.amount  +  explained_adjustments
  where every adjustment is localized to specific rows and fully itemized.
A gap that cannot be explained = audit failure.

⚠️ The heritage production DB was lost with the 2026-10-21 workspace reset.
If the owner re-uploads it, run:
    GENESIS_DB=/path/to/marketplace-20260924-0400.db python3 nation-genesis-proof.py
The recorded result of the original run (worklog Task 5, v1.5.0):
  Σ balances 187,672.8 · Σ ledger 187,735.8 · gap −63.0 · itemized 100%
  (−450 = nine 50-Đ purchases without ledger rows · +387 manual owner credit)
"""
import os
import sqlite3

DB = os.environ.get('GENESIS_DB') or \
    '/home/z/my-project/download/DropAgentX-legacy-DB-backup/marketplace-20260924-0400.db'

assert os.path.isfile(DB), 'legacy production DB missing — provide GENESIS_DB (never fabricate numbers!)'

con = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)
cur = con.cursor()


def scalar(sql, *args):
    row = cur.execute(sql, args).fetchone()
    return row[0] if row and row[0] is not None else 0


def main():
    balances = scalar('SELECT COALESCE(SUM(credits),0) FROM users')
    ledger = scalar('SELECT COALESCE(SUM(amount),0) FROM transactions')
    tx_rows = scalar('SELECT COUNT(*) FROM transactions')
    purchases = scalar('SELECT COUNT(*) FROM purchases')
    purchase_ledger = scalar(
        "SELECT COUNT(*) FROM transactions WHERE type='purchase'")
    citizens = scalar('SELECT COUNT(*) FROM users')

    print('── Nation Genesis Audit (Article 7 — Sacred Invariant) ──')
    print(f'citizens            : {citizens}')
    print(f'Σ balances (credits): {balances:,.1f} Đ')
    print(f'Σ ledger (signed)   : {ledger:,.1f} Đ  ({int(tx_rows)} rows)')
    print(f'purchases           : {int(purchases)} (ledger purchase rows: {int(purchase_ledger)})')

    # Itemization loop — every candidate explanation must be row-verifiable.
    unledgered_purchases = int(purchases) - int(purchase_ledger)
    unit_price = 50
    adj_unledgered = -unit_price * unledgered_purchases  # purchases missing ledger rows

    gap = balances - ledger
    remaining = gap - adj_unledgered
    print(f'raw gap             : {gap:,.1f} Đ')
    print(f'adj: unledgered purchases ({unledgered_purchases} × {unit_price}) : {adj_unledgered:+,.1f} Đ')
    print(f'remaining after itemization    : {remaining:,.1f} Đ')

    if abs(remaining) < 0.5:
        print('✅ SACRED INVARIANT HOLDS — 100% of the gap is itemized.')
    else:
        # The original audit also documented a manual owner credit (+387);
        # verify it against the actual owner row instead of assuming.
        print('⚠️ remaining gap is NOT fully itemized — audit must continue row-by-row.')
        print('   (historical reference: a +387 manual owner credit closed the v1.5.0 audit)')

    con.close()


if __name__ == '__main__':
    main()
