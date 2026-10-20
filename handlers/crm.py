"""v5.0.0 «Ultimate» — CRM لیدها در ربات (War Machine).

فقط ادمین: `/crm` → آمار قیف فروش + ۸ لید آخر + دکمه‌های تغییر استیج.
ایمپورت JSON از مسیر وب (`/crm` یا `POST /api/hermes/import`) انجام می‌شود —
اینجا فقط «نمایش + جابه‌جایی استیج» است تا پیام ادمین سبک بماند.
"""
from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from config import config

router = Router()

STAGES = ("new", "warm", "won", "lost")
STAGE_EMOJI = {"new": "🆕", "warm": "🔥", "won": "💰", "lost": "❄️"}
STAGE_FA = {"new": "تازه", "warm": "گرم", "won": "بسته", "lost": "ازدست"}


def _admin(uid: int) -> bool:
    return uid in config.ADMIN_IDS


async def _render() -> tuple[str, InlineKeyboardMarkup]:
    import prospects
    stats = await prospects.crm_stats()
    items = await prospects.list_prospects("", "", 8)

    lines = [
        "🤝 **CRM لیدها — قیف فروش War Machine**",
        "",
        f"کل: **{stats['total']}**  ·  "
        f"🆕 {stats['new']}  ·  🔥 {stats['warm']}  ·  "
        f"💰 {stats['won']}  ·  ❄️ {stats['lost']}",
        "",
    ]
    kb: list[list[InlineKeyboardButton]] = []
    if not items:
        lines.append("_هنوز لیدی ثبت نشده — JSON هرمس را در وب‌CRM ایمپورت کن._")
    for p in items:
        rating = f" ★{p['rating']:.1f}" if p.get("rating") is not None else ""
        reviews = f" ({p['reviews']})" if p.get("reviews") is not None else ""
        lines.append(
            f"{STAGE_EMOJI.get(p['stage'], '🆕')} **{p['id']}.** {p['business']} — "
            f"{p['city']}{rating}{reviews}")
        kb.append([
            InlineKeyboardButton(
                text=f"{STAGE_EMOJI[s]} {STAGE_FA[s]}",
                callback_data=f"crmst:{p['id']}:{s}")
            for s in STAGES
        ])

    kb.append([
        InlineKeyboardButton(text="🌐 وب‌CRM", callback_data="crm_web"),
        InlineKeyboardButton(text="🔄 بروزرسانی", callback_data="crm_refresh"),
    ])
    kb.append([InlineKeyboardButton(text="🔙 منو", callback_data="main_menu")])
    return "\n".join(lines), InlineKeyboardMarkup(inline_keyboard=kb)


@router.message(Command("crm"))
async def cmd_crm(message: Message):
    if not _admin(message.from_user.id):
        return
    text, kb = await _render()
    await message.answer(text, reply_markup=kb, parse_mode="Markdown")


@router.callback_query(F.data == "crm_refresh")
async def crm_refresh(callback: CallbackQuery):
    if not _admin(callback.from_user.id):
        await callback.answer("فقط ادمین", show_alert=True)
        return
    text, kb = await _render()
    try:
        await callback.message.edit_text(text, reply_markup=kb, parse_mode="Markdown")
    except Exception:
        pass
    await callback.answer("بروزرسانی شد")


@router.callback_query(F.data == "crm_web")
async def crm_web(callback: CallbackQuery):
    if not _admin(callback.from_user.id):
        await callback.answer("فقط ادمین", show_alert=True)
        return
    await callback.answer(
        "وب‌CRM: آدرس دامنهٔ وب همین سرویس + مسیر /crm (با رمز ادمین)",
        show_alert=True)


@router.callback_query(F.data.startswith("crmst:"))
async def crm_set_stage(callback: CallbackQuery):
    if not _admin(callback.from_user.id):
        await callback.answer("فقط ادمین", show_alert=True)
        return
    try:
        _, pid, stage = callback.data.split(":", 2)
        pid = int(pid)
    except (ValueError, AttributeError):
        await callback.answer("داده نامعتبر", show_alert=True)
        return
    import prospects
    ok = await prospects.set_stage(pid, stage)
    if not ok:
        await callback.answer("لید پیدا نشد یا استیج نامعتبر است", show_alert=True)
        return
    text, kb = await _render()
    try:
        await callback.message.edit_text(text, reply_markup=kb, parse_mode="Markdown")
    except Exception:
        pass
    await callback.answer(f"{STAGE_FA.get(stage, stage)} شد ✓")
