#!/usr/bin/env python3
"""
SUBSET THE SELF-HOSTED FACES — blueprint §19's font budget, §22 item 7's fix.

Why this exists
---------------
§19 budgets ~92 kB of fonts on first paint. Measured from the built `woff2`
files, first paint was **148.0 kB** after P14 removed Instrument Serif's
upright cut, which nothing rendered.

§22 item 7 prescribes subsetting the display face, naming Bricolage's
optical-size axis as "77kb of it". **That diagnosis is wrong, and this script
is how we found out.** The weight is in the *variable axis data*, not the
glyph coverage: `@fontsource`'s `latin` cuts are already tight, so subsetting
Bricolage to the glyphs the product sets saves only **10.3 kB**, not the ~50 kB
the item implies. Subsetting all three variable faces saves **19.5 kB** and
lands first paint at **128.5 kB** — real, but still 36 kB over budget.

Where the rest of the gap actually is
-------------------------------------
Two levers remain, and both are decisions rather than optimisations:

  * **Accented coverage.** Dropping Latin-1 Supplement — no `é`, no `ü` —
    takes Bricolage from 64.8 kB to **46.2 kB**, and the three faces to about
    81 kB, under budget. The price is that an employee named "José" renders
    their heading in a fallback face. That is a product decision about whose
    names the product can set, not a build setting.
  * **The fourth family.** Instrument Serif's italic is 21.6 kB and `.t-quote`
    — its only consumer — lives on `/dev/material`. Dropping it from the
    global sheet costs the dev reference surface its serif.

Absent one of those, §19's ~92 kB is not reachable with four self-hosted
families at full Latin coverage, and the honest fix is to amend the budget.

What it keeps
-------------
The faces set headings, body copy and every figure, and two of those carry
*data* — employee names, department names, money — so the set cannot be the
literal strings on the screens today. It is instead:

  * Basic Latin, printable                        U+0020–U+007E
  * Latin-1 Supplement                            U+00A0–U+00FF
    (accented letters that appear in real names)
  * The rupee sign — every money figure needs it  U+20B9
  * The typographic marks the voice uses          ' ' " " – — … · → × ↑ ↓

Both of Bricolage's variable axes (`opsz`, `wght`) survive: fonttools keeps
`fvar`/`gvar` unless you instance the font, and this script never does. So
the optical-size axis §05.1 chose the face for is intact.

Running it
----------
    python scripts/subset-display-font.py

Requires `fonttools[woff]` and `brotli`. **The build does not.** The output is
committed, so `npm run build` stays a pure Node toolchain — this is only run
when a typeface or the glyph set changes, and it prints before/after so the
§19 numbers can be updated from a measurement rather than an estimate.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FRONTEND = HERE.parent
MODULES = FRONTEND / "node_modules"
OUT_DIR = FRONTEND / "src" / "styles" / "fonts"

# (label, source woff2, output name) — the `latin` cut of each self-hosted
# variable face. Instrument Serif is deliberately absent: it is a static face
# whose one consumer is a dev route, so it is a drop-or-keep decision rather
# than a subsetting one.
FACES = [
    (
        "Bricolage Grotesque",
        MODULES / "@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2",
        "bricolage-grotesque-latin-opsz.woff2",
    ),
    (
        "Geist",
        MODULES / "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
        "geist-latin-wght.woff2",
    ),
    (
        "Geist Mono",
        MODULES / "@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2",
        "geist-mono-latin-wght.woff2",
    ),
]

UNICODES = ",".join(
    [
        "U+0020-007E",  # Basic Latin, printable
        "U+00A0-00FF",  # Latin-1 Supplement — accented letters in real names
        "U+20B9",       # ₹ — the rupee sign
        "U+2018-2019",  # ' '
        "U+201C-201D",  # " "
        "U+2013-2014",  # – —
        "U+2026",       # …
        "U+00B7",       # ·
        "U+2192",       # →
        "U+00D7",       # ×
        "U+2191",       # ↑ — the sort indicators in Table
        "U+2193",       # ↓
    ]
)

# Keep the shaping the faces were designed with. `tnum` is not optional: §05.3
# makes tabular figures non-negotiable, and it is a layout feature that a
# careless subset will strip.
LAYOUT_FEATURES = "kern,liga,clig,calt,tnum,onum,frac,ccmp,mark,mkmk,locl"


def kb(path: Path) -> float:
    return path.stat().st_size / 1024


def main() -> int:
    try:
        import fontTools.subset  # noqa: F401
    except ImportError:
        print("! fonttools not importable — pip install 'fonttools[woff]' brotli", file=sys.stderr)
        return 1

    missing = [str(src) for _, src, _ in FACES if not src.exists()]
    if missing:
        print("! source faces not found — run `npm install` first:", file=sys.stderr)
        for m in missing:
            print(f"    {m}", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    total_before = total_after = 0.0
    print(f"{'face':<22}{'before':>9}{'after':>9}{'saved':>9}")

    for label, src, out_name in FACES:
        out = OUT_DIR / out_name
        cmd = [
            sys.executable,
            "-m",
            "fontTools.subset",
            str(src),
            f"--output-file={out}",
            "--flavor=woff2",
            f"--unicodes={UNICODES}",
            f"--layout-features={LAYOUT_FEATURES}",
            "--name-IDs=*",
            "--notdef-outline",
            # NOT passing --instancer: fvar/gvar stay, so every variable axis
            # survives — including Bricolage's opsz.
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(result.stdout)
            print(result.stderr, file=sys.stderr)
            return result.returncode

        before, after = kb(src), kb(out)
        total_before += before
        total_after += after
        print(f"{label:<22}{before:8.1f} {after:8.1f} {before - after:8.1f}")

    print(f"\n{'':<22}{total_before:8.1f} {total_after:8.1f} {total_before - total_after:8.1f}  kB")
    print(f"\n  first paint, three faces: {total_after:.1f} kB")
    print(f"  + Instrument Serif italic: {total_after + 21.6:.1f} kB   (§19 budget ~92 kB)")
    print(f"\n  -> {OUT_DIR.relative_to(FRONTEND)}")
    print("     declared by src/styles/fonts.css; commit the woff2 files with this script.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
