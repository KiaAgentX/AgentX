#!/usr/bin/env python3
"""v5.0.0 «Ultimate» — اعتبارسنج JSON لیدهای Hermes (قرارداد War Machine).

قبل از ایمپورت در وب‌CRM یا `POST /api/hermes/import` اجرا کن تا لیدهای
خراب را همان‌جا بگیری، نه وسط فروش:

    python tools_validate_leads.py leads.json
    python tools_validate_leads.py leads.json --out leads.clean.json
    cat leads.json | python tools_validate_leads.py -
    python tools_validate_leads.py leads.json --json     # خروجی ماشین‌خوان

بدون BOT_TOKEN و بدون دیتابیس کار می‌کند ( فقط `prospects.normalize_item` ).
Exit code: 0 = همه معتبر · 1 = حداقل یک رکورد نامعتبر.
"""
from __future__ import annotations

import argparse
import json
import sys

from prospects import normalize_item


def _read(path: str) -> str:
    if path == "-":
        return sys.stdin.read()
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def main() -> int:
    # ویندوز/کنسول‌های ANSI: چاپ →/✓ نباید کل خروجی را بشکند
    for _stream in (sys.stdout, sys.stderr):
        if hasattr(_stream, "reconfigure"):
            try:
                _stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass

    ap = argparse.ArgumentParser(
        description="Validate Hermes lead JSON (business+city dedupe contract)")
    ap.add_argument("inputs", nargs="+",
                    help="file path(s) — use '-' for stdin")
    ap.add_argument("--out", default="",
                    help="write cleaned/valid records to this file")
    ap.add_argument("--json", action="store_true", dest="as_json",
                    help="machine-readable report on stdout")
    args = ap.parse_args()

    valid: list[dict] = []
    errors: list[str] = []
    seen: set[tuple[str, str]] = set()
    dupes = 0
    total = 0

    for path in args.inputs:
        try:
            payload = json.loads(_read(path))
        except FileNotFoundError:
            errors.append(f"{path}: file not found")
            continue
        except json.JSONDecodeError as e:
            errors.append(f"{path}: invalid JSON ({e})")
            continue
        items = payload.get("items") if isinstance(payload, dict) else payload
        if not isinstance(items, list):
            errors.append(f"{path}: expected a JSON array or {{'items': [...]}}")
            continue
        for idx, raw in enumerate(items):
            total += 1
            row, err = normalize_item(raw)
            if row is None:
                errors.append(f"{path}[{idx}]: {err}")
                continue
            key = (row["business"].lower(), row["city"].lower())
            if key in seen:
                dupes += 1
                continue
            seen.add(key)
            valid.append(row)

    report = {
        "total": total,
        "valid": len(valid),
        "duplicate_in_file": dupes,
        "invalid": len(errors),
        "errors": errors[:50],
    }
    if args.as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print("=" * 56)
        print(f"  Lead contract check · total={total}  valid={len(valid)}  "
              f"dupes={dupes}  invalid={len(errors)}")
        print("=" * 56)
        for e in errors[:20]:
            print(f"  ✗ {e}")
        if len(errors) > 20:
            print(f"  … و {len(errors) - 20} خطای دیگر")
        if not errors:
            print("  ✓ همه رکوردها معتبر‌اند — آمادهٔ ایمپورت در /crm")

    if args.out and valid:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(valid, f, ensure_ascii=False, indent=2)
        # روی stderr تا stdout در حالت --json همیشه JSON خالص بماند
        print(f"  -> cleaned file: {args.out}", file=sys.stderr)

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
