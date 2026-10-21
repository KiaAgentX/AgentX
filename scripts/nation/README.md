# 🏛️ Nation Tools — ابزارهای کشور دیجیتال

Sovereign tooling of the Digital Nation. Portable, no cloud dependency.

## 🧾 nation-genesis-proof.py — the Sacred Invariant audit (Article 7)

Read-only forensic audit of the heritage production database:

```
Σ users.credits ≡ Σ transactions.amount + explained_adjustments
```

Recorded result (v1.5.0, worklog Task 5): official supply **187,672.8 Đ**,
heritage gap **−63.0 Đ** itemized 100% (9 unledgered 50-Đ purchases = −450;
+387 manual owner credit). The heritage DB was lost in the 2026-10-21 reset —
the moment the owner re-attaches it, the audit is re-runnable:

```bash
GENESIS_DB=/path/to/marketplace-20260924-0400.db python3 nation-genesis-proof.py
```

## 🎺 muziket/ — the National Anthem agent

The 4-stage anthem production line (v1.5.0) was lost with the same reset and is
being re-instrumented in the reconstruction line. Preserved composition spec:
1:42 · D minor → Picardy D major · 80 BPM · 33 bars · 7 lyric sections ·
sub-bass / detuned pad / brass fanfare / formant choir (480–950 & 900–1650 Hz)
/ pitch-dropping timpani / military snare + roll / crash · Schroeder reverb ·
sidechain ducking at 200 Hz control rate · edge-tts `fa-IR-FaridNeural`
(rate −8%, pitch −3 Hz).

Hard-won lessons baked into the design (never re-learn these):
- `ffmpeg` calls **must** use `-nostdin` + `stdin=subprocess.DEVNULL`
- Persian TTS: only `edge-tts` works here (z-ai engine loops into gibberish)
- `pip` ≠ `python3` (3.13 system vs 3.12 venv) — always `python3 -m pip install`
- Big-audio filtering: `uniform_filter1d` + control-rate, never huge `np.convolve`
- Persian text shaping in PIL: `get_display(arabic_reshaper.reshape(t))` + real TTF
