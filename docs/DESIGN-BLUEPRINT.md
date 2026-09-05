# PAYPULSE — Design Blueprint

**Art direction · design system · component spec · screen inventory**
Version 1.0 · the single source of truth for everything visual.

> Companion documents: [PRD.md](PRD.md) governs *behaviour and business logic*.
> This document governs *material, layout, type, motion and voice*.
> Where they disagree about a number, the PRD wins. Where they disagree about
> how something looks or feels, this document wins.

---

## 00 · The one idea

**PAYPULSE — PEOPLE. TIME. PAY. CONNECTED.**

> A payroll run whose every number is traceable to a record a human can open.

The product answers one question better than anything else in its category:
**"why is this number ₹47,842?"** — and it answers by letting you walk
backwards through a contract, a set of days, an approved leave request, and
twelve rules that fired in order.

The design has one job: make that traceability **physical**.

### The art direction, in one line

**SOFT MACHINE** — payroll as a beautifully made instrument you operate.

Not puffy pastel UI. A *device*. The lineage is Braun, Teenage Engineering,
Nagra, Muji stationery, Bauhaus toy blocks — 1960s industrial design language,
which is precisely why it will not date the way claymorphism-as-a-CSS-trend
does. Anchor every decision to **objects**, never to the trend.

### The signature

**Salary rules are physical blocks that stack.**

`BASIC` lands. `HRA` stacks on it. `DA` on that. `SPECIAL` fills the gap. They
build into `GROSS` as a visible tower. Deductions then **carve out of it** —
`PF`, `PT`, `TDS`, `LWP` as notches removed. What remains standing is `NET`.

Someone watches a tower assemble and get carved, and understands *"rules
execute in sequence and later ones consume earlier results"* without reading a
word. This is the hardest requirement in the brief, rendered as an object you
want to touch.

---

## 01 · Principles

Rules that decide arguments. When two options both look fine, the one
satisfying more of these wins.

| # | Principle | What it kills |
|---|---|---|
| **P1** | **Material before decoration.** Every surface is raised, recessed, or flush — and that state means something. | Random cards. Shadows for prettiness. |
| **P2** | **Raised = act. Recessed = read.** Elevation is a verb, not a style. | Puffy tables. Dead flat buttons. |
| **P3** | **One light source, obeyed everywhere.** Upper-left, 35°. If an element moves, its shadow moves correctly. | Inconsistent depth. The "CSS box-shadow" look. |
| **P4** | **Nothing teleports.** Every state change settles with mass. | Instant swaps. Dead interactions. |
| **P5** | **Motion explains cause and effect, or it is deleted.** | Ambient animation. Scroll-jacking. |
| **P6** | **Typography creates hierarchy before borders do.** | Border soup. Nested-card syndrome. |
| **P7** | **Colour is signal, not surface.** Under 6% of pixels are saturated. | Rainbow dashboards. Purple AI gradients. |
| **P8** | **Density is a feature.** Operators want more on screen, not less. | Giant KPI cards with three words in them. |
| **P9** | **Contrast is the memory.** Quiet → loud. Paper → charcoal. Dense → enormous. Motion → stillness. | Uniform impressiveness, which reads as noise. |
| **P10** | **Every number is openable.** If a figure is displayed, it can be interrogated. | Dead-end dashboards. |

### The do-not list

Non-negotiable. Any of these appearing is a defect, not a taste difference.

- Purple/violet AI gradients · mesh gradients · aurora blobs
- Glassmorphism · backdrop blur as a primary surface
- Floating 3D spheres, crypto networks, "AI brains", particle fields
- Stock photography · AI-fantasy imagery · faces in illustrations
- Emoji inside the product
- Uniform 16px-radius cards stacked on cards
- Drop shadows on text · text over busy imagery
- More than two icon styles
- "AI-powered", "Revolutionize", "Seamlessly", "Empower", "Solution", "Unlock"
- A line chart with a gradient fill underneath it
- Pastel-everything — the claymorphism failure mode

---

## 02 · The material system

Three elevation states. This is the core of the entire visual language.

```
            ╭──────────────╮
   PROUD    │              │   raised · catches light on its top edge
            ╰──────────────╯   buttons · keys · chips · nav · cards · beads
   ─────────────────────────
   FLUSH    the ground itself   page field · editorial type · the quiet
   ─────────────────────────
            ╭──────────────╮
   INSET    │▁▁▁▁▁▁▁▁▁▁▁▁▁▁│   milled into the material
            ╰──────────────╯   tables · inputs · wells · the payslip
```

**PROUD** is where you act. **INSET** is where you read. **FLUSH** is where you
breathe. A screen with no flush areas is exhausting; a screen with no inset
areas has nowhere to put information.

### 02.1 Clay tokens — raised

Shadow colour is **warm** `rgba(74,58,42,…)`. A neutral-grey shadow anywhere
in this product is a bug — it reads as a different material.

```css
--clay-1:                                    /* chips, badges, small keys */
  0 1px 1px         rgba(74,58,42,.05),
  0 3px 6px   -2px  rgba(74,58,42,.10),
  inset 0 1px 0     rgba(255,255,255,.90),
  inset 0 -2px 0    rgba(74,58,42,.06);

--clay-2:                                    /* buttons — the default feel */
  0 1px 2px         rgba(74,58,42,.06),
  0 8px 16px  -6px  rgba(74,58,42,.14),
  0 20px 32px -14px rgba(74,58,42,.09),
  inset 0 2px 0     rgba(255,255,255,.92),
  inset 0 -3px 0    rgba(74,58,42,.07);

--clay-3:                                    /* cards, object panels */
  0 2px 4px         rgba(74,58,42,.05),
  0 14px 28px -10px rgba(74,58,42,.13),
  0 32px 56px -22px rgba(74,58,42,.10),
  inset 0 2px 0     rgba(255,255,255,.94),
  inset 0 -4px 0    rgba(74,58,42,.06);

--clay-4:                                    /* drawers, modals, hero blocks */
  0 4px 8px         rgba(74,58,42,.06),
  0 24px 48px -16px rgba(74,58,42,.18),
  0 56px 96px -32px rgba(74,58,42,.14),
  inset 0 3px 0     rgba(255,255,255,.95),
  inset 0 -5px 0    rgba(74,58,42,.07);
```

### 02.2 Clay tokens — inset

The lip of white **below** a recessed element is what sells the deboss.

```css
--inset-1:                                   /* input fields, small wells */
  inset 0 2px 3px  rgba(74,58,42,.09),
  inset 0 1px 0    rgba(74,58,42,.06),
  inset 0 -1px 0   rgba(255,255,255,.65),
  0 1px 0          rgba(255,255,255,.60);

--inset-2:                                   /* tables, data wells */
  inset 0 3px 6px  rgba(74,58,42,.10),
  inset 0 1px 0    rgba(74,58,42,.07),
  inset 0 -1px 0   rgba(255,255,255,.70),
  0 1px 0          rgba(255,255,255,.70);

--inset-3:                                   /* deep wells, the payslip body */
  inset 0 5px 12px rgba(74,58,42,.13),
  inset 0 2px 0    rgba(74,58,42,.08),
  inset 0 -1px 0   rgba(255,255,255,.72),
  0 1px 0          rgba(255,255,255,.72);
```

### 02.3 Interaction states

The press is the most important interaction in the product. Highlight and
shade **swap**, and the element physically descends.

```css
/* rest */
box-shadow: var(--clay-2);
transform: translateY(0);

/* hover — it lifts, so the shadow grows, softens, slides down-right */
box-shadow:
  0 2px 3px         rgba(74,58,42,.06),
  0 12px 22px  -6px rgba(74,58,42,.16),
  0 28px 44px -16px rgba(74,58,42,.11),
  inset 0 2px 0     rgba(255,255,255,.94),
  inset 0 -3px 0    rgba(74,58,42,.07);
transform: translateY(-1px);

/* active — the swap */
box-shadow:
  inset 0 3px 6px rgba(74,58,42,.15),
  inset 0 -1px 0  rgba(255,255,255,.45),
  0 1px 1px       rgba(74,58,42,.04);
transform: translateY(2px);

/* focus-visible — the ring sits OUTSIDE the clay, never replaces it */
outline: 2px solid var(--cobalt-500);
outline-offset: 3px;
```

**Disabled** never uses opacity alone. It flattens to `--inset-1` with muted
ink — a dead key that has sunk into the panel.

### 02.4 Grain

Clay without micro-texture renders as plastic. A 2.5% noise overlay is the
difference between "box-shadow" and "photographed object". One SVG filter
applied as an `::after` on clay bodies: `opacity: .028`, `mix-blend-mode:
multiply`, `pointer-events: none`.

```html
<svg width="0" height="0" aria-hidden="true" style="position:absolute">
  <filter id="pp-grain">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
  </filter>
</svg>
```

Fallback: a 128×128 tiled PNG at ~4kb. Prefer the PNG when
`navigator.deviceMemory < 4` — SVG filters are expensive on low-end GPUs.

---

## 03 · The light model

**One key light. Upper-left. 35° above the horizon.** Stated once, obeyed
everywhere — including inside illustrations, the 3D scene, and chart elements.

| Consequence | Rule |
|---|---|
| Top edge of a raised element | inner highlight, `rgba(255,255,255,.90+)` |
| Bottom edge of a raised element | inner shade, `rgba(74,58,42,.06–.07)` |
| Drop shadows | offset **down and slightly right**, warm-tinted |
| Top edge of a recessed element | inner shade |
| Bottom edge of a recessed element | inner highlight |
| Element rises on hover | shadow **grows, softens, moves further down-right** |
| Element presses | shadow **collapses inward**, highlight moves to the bottom |

Shadows that stay static while an element moves are the tell that this is
decoration rather than matter. **Every elevation change animates its shadow.**

---

## 04 · Colour

**Desaturate the bodies. Saturate only the signal.** This is the rule that
keeps clay out of the nursery.

### 04.1 Neutral foundation — "bone & putty"

> **Revised in P0.** The first draft put the page ground at near-white
> (`#F7F4EE`), which crowded every surface into the top 3% of the luminance
> range and left raised clay nowhere to go — `clay-3` measured **1.018**
> against the ground, i.e. invisible. **The field is putty, not paper.** On any
> physical instrument the chassis is darker than the keys.

```css
--bone-50:   #FEFCF9;   /* raised clay top surface — catches the light */
--bone-100:  #FAF7F1;   /* card body */
--bone-200:  #EFEAE1;   /* PAGE GROUND — the field */
--bone-300:  #E5DFD3;   /* inset well floor — below the field */
--bone-400:  #DAD2C4;   /* deep well */
--bone-500:  #CCC2B1;   /* clay body, deep */
--bone-600:  #D5CBBA;   /* hairline border */
--bone-700:  #BFB3A0;   /* border, hover */
--bone-800:  #A2937C;   /* border, active */

--ink-900:   #1A1714;   /* primary text — warm near-black, never #000 */
--ink-700:   #3D372F;   /* headings on tinted grounds */
--ink-500:   #5A5248;   /* secondary text */
--ink-400:   #5F564C;   /* muted text, placeholders, axis labels */
--ink-300:   #A9A093;   /* disabled + non-text ONLY — never carries copy */
```

**The ramp must read as depth, in this order:**
`PROUD (50, 100)` → `FLUSH (200)` → `INSET (300, 400)`. If a raised surface is
ever darker than the field, the light model is broken.

The neutral ramp is warm throughout. A cool grey anywhere in this product is a
bug.

> **`--ink-400` was darkened from `#8B8172` in P0.** It carries `micro` (11px)
> and `ui-sm` (13px) — both *small* text, which needs 4.5:1, and the original
> measured **3.20:1**. It must clear 4.5:1 against the darkest ground it can
> land on, which is `--bone-400`, not just against the field.

### 04.2 Signal — four hues, used sparingly

Each has three stops: `tint` (backgrounds), `500` (the mark), `deep` (text on
tint). **Text on a coloured ground always uses that family's `deep`** — never
black, never grey.

```css
/* COBALT — system · live · primary action */
--cobalt-tint:    #E8EDFF;
--cobalt-500:     #2B4FF5;
--cobalt-deep:    #16277E;

/* SIGNAL ORANGE — needs attention · warning · in progress */
--orange-tint:    #FFEDE3;
--orange-500:     #FF6B2C;
--orange-deep:    #8A3210;

/* JADE — settled · paid · validated · healthy */
--jade-tint:      #E1F6EC;
--jade-500:       #0FA968;
--jade-deep:      #075435;

/* VERMILION — blocked · error · destructive */
--vermilion-tint: #FFE9EA;
--vermilion-500:  #E5484D;
--vermilion-deep: #7C1D20;
```

**Solid fills — added in P0.** The `500`s are tuned to read as a *mark* against
the field, and several are far too light to sit under text: white on
`--jade-500` measured **3.05:1**, and in the dark room it drops to **2.10:1**.
So a signal that covers a large area and carries a label uses a separate token,
and its text always uses `--on-solid`:

```css
/* light */                        /* dark — the signals are bright here, so   */
--cobalt-solid:    #2B4FF5;        /* a solid surface carries DARK ink, not    */
--orange-solid:    #B34513;        /* white. Cobalt is nudged brighter so dark */
--jade-solid:      #0A7D4D;        /* ink clears 4.5:1 on it too.              */
--vermilion-solid: #C0272C;        /* --cobalt-solid: #7A91FF;                 */
--on-solid:        #FFFFFF;        /* --on-solid:     #241F19;                 */
```

| Use the `500` for | Use `-solid` for |
|---|---|
| Chart series, state dots, borders, focus rings, 4px severity bars | Primary buttons, the `PAID` chip, any filled surface bearing a label |

This makes "text on a signal" one system decision rather than a per-component
guess. **Every text pairing in the product — 56 combinations across both
themes — is verified to clear 4.5:1.**

### 04.3 Semantic mapping — binding

| Meaning | Token | Where it appears |
|---|---|---|
| Primary action, live state, focus | **cobalt** | Primary buttons · focus rings · active nav · `COMPUTED` · the live line |
| Needs a human | **orange** | `WARNING` severity · `MISSING_BANK_DETAILS` · expiring contracts · pending requests |
| Settled, correct, done | **jade** | `VALIDATED` · `PAID` · `APPROVED` · attendance health at target |
| Blocked, refused, destructive | **vermilion** | `ERROR` severity · `NO_ACTIVE_CONTRACT` · `REFUSED` · delete |
| Neutral / inert | **bone + ink** | Everything else — which is most of the screen |

**Colour is never the sole carrier of state.** Every badge carries text. Every
chart series carries a label or a shape difference.

### 04.4 The dark room

The payrun — the one screen where money actually moves — inverts. Charcoal
clay with cobalt keys. This is the light→dark→light contrast of P9, and it
makes the moment of consequence *feel* like a different, more serious room.

```css
[data-room="dark"], [data-theme="dark"] {
  --bone-50:  #332C24;   /* raised clay top */
  --bone-100: #2E2820;
  --bone-200: #241F19;   /* ground */
  --bone-300: #1B1712;   /* inset well floor */
  --bone-400: #262119;
  --bone-500: #1E1A15;
  --bone-600: #3A322A;   /* hairline */
  --bone-700: #4A4036;
  --ink-900:  #F7F3EA;
  --ink-500:  #B5AA9A;
  --ink-400:  #8A7F70;
  --shadow:   0,0,0;
  --highlight: rgba(255,244,225,.10);
}
```

In dark, the inner top highlight drops to ~10% and the drop shadow strengthens.
Clay in low light has less specular and more occlusion; matching that is what
keeps it reading as the same material rather than an inverted palette.

Global dark mode uses this same ramp and is a first-class theme, not an
afterthought.

---

## 05 · Typography

Type carries the hierarchy. Borders and cards only confirm what type has
already established (P6).

### 05.1 The families — four, all free

| Role | Family | Why this one |
|---|---|---|
| **Display** | **Bricolage Grotesque** | Variable with a true optical-size axis, genuinely editorial, a little human in the joints. At 160px with tight tracking it is arresting rather than generic. This is the PayPulse voice. |
| **Text & UI** | **Geist Sans** | Precise, warm-neutral, and its **tabular numerals are exceptional** — which matters more here than in almost any other product, because money is the content. |
| **Data & code** | **Geist Mono** | Pairs exactly with Geist Sans. Rule codes, formulas, timestamps, IDs, IFSC. |
| **Editorial accent** | **Instrument Serif** | Used two or three times in the entire product, for pull quotes only. Its presence is the moment the page stops being an app and becomes a magazine. |

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,700;12..96,800&family=Geist:wght@300..700&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
```

```css
--font-display: "Bricolage Grotesque", "Geist", system-ui, sans-serif;
--font-sans:    "Geist", system-ui, -apple-system, sans-serif;
--font-mono:    "Geist Mono", ui-monospace, "SF Mono", monospace;
--font-voice:   "Instrument Serif", Georgia, serif;
```

**Self-host all four in production.** `display: swap` on a 160px hero figure
produces a visible reflow that undoes the whole first impression; preload the
display face as `woff2` and accept the extra 28kb.

### 05.2 The scale

Dramatic jumps, not a smooth ramp. The gap between `display-m` and `h1` is the
point — editorial rhythm comes from the discontinuity.

| Token | Size / line-height | Family · weight · tracking | Use |
|---|---|---|---|
| `display-xl` | `clamp(72px, 11vw, 168px)` / 0.86 | display · 800 · `-0.045em` | The hero figure. One per page, maximum. |
| `display-l`  | `clamp(52px, 7vw, 104px)` / 0.92 | display · 700 · `-0.035em` | Act openers on the landing page |
| `display-m`  | `clamp(38px, 4.4vw, 68px)` / 0.98 | display · 700 · `-0.03em` | Section headlines |
| `display-s`  | `40px` / 1.06 | display · 600 · `-0.02em` | Page titles in the app |
| `h1` | `30px` / 1.15 | sans · 600 · `-0.02em` | Panel titles |
| `h2` | `23px` / 1.2  | sans · 600 · `-0.015em` | Sub-sections |
| `h3` | `18px` / 1.3  | sans · 600 · `-0.01em` | Card titles, group headers |
| `body-l` | `17px` / 1.65 | sans · 400 | Landing prose, empty-state copy |
| `body`   | `15px` / 1.6  | sans · 400 | Default text |
| `ui`     | `14px` / 1.45 | sans · 450 | Buttons, labels, nav, table cells |
| `ui-sm`  | `13px` / 1.4  | sans · 450 | Secondary controls, table meta |
| `micro`  | `11px` / 1.3  | sans · 550 · `0.09em` · **UPPERCASE** | Eyebrows, column headers, chip text |
| `quote`  | `clamp(26px, 3vw, 44px)` / 1.28 | voice · 400 · italic | Pull quotes only |

### 05.3 The number scale — separate, and non-negotiable

Money is the content of this product. It gets its own ramp, always
`font-variant-numeric: tabular-nums`, always `font-feature-settings: "tnum" 1,
"ss01" 1`.

| Token | Size | Use |
|---|---|---|
| `num-hero`  | `clamp(64px, 9vw, 148px)` · display · 700 · `-0.04em` | The landing hero figure |
| `num-xl`    | `52px` · sans · 550 · `-0.03em` | Payslip `NET`, payrun total |
| `num-l`     | `34px` · sans · 550 · `-0.02em` | KPI values, employee summary figures |
| `num-m`     | `22px` · sans · 500 · `-0.01em` | Card figures, block-stack labels |
| `num-table` | `14px` · sans · 450 | Every money cell in every table |
| `num-mono`  | `13px` · mono · 400 | Formulas, rule inputs, derivation chains |

**Rules for numbers, all binding:**

1. Tabular figures everywhere, without exception. A money column that shifts
   when a digit changes is a defect.
2. Money is right-aligned and **decimal-aligned** within its column.
3. Currency symbol at `0.72em`, `--ink-400`, `0.15em` of space after it.
4. The decimal portion renders at `0.62em` and `--ink-400` in `num-hero`,
   `num-xl` and `num-l`. `₹47,842` reads instantly; `.00` should not compete.
5. Negative amounts use a true minus `−` (U+2212), never a hyphen, coloured
   `--vermilion-500`.
6. Every figure that can change **rolls** — see §07.4.

### 05.4 Rhythm rules

- **Measure**: prose caps at `68ch`. Landing prose caps at `54ch`.
- **Tracking scales inversely with size.** Above 40px, always negative. Below
  13px uppercase, always positive.
- **Two weights per block.** A card using 400/500/600/700 is a defect.
- **Uppercase is only ever `micro`.** Never uppercase a headline; the display
  face does that work through scale.
- **Optical alignment**: hang punctuation and quote marks outside the measure
  in editorial blocks.

---

## 06 · Grid, spacing, geometry

### 06.1 Spacing scale — 4px base

```
--s-1: 4     --s-2: 8     --s-3: 12    --s-4: 16    --s-5: 24
--s-6: 32    --s-7: 48    --s-8: 64    --s-9: 96    --s-10: 128
--s-11: 192  --s-12: 256
```

Values outside this scale are not permitted. `--s-9` and above exist for
editorial breathing on the landing page and appear rarely inside the app.

### 06.2 Grid

**12 columns. 24px gutter. Generous outer margin.**

| Breakpoint | Container | Outer margin | Columns | Notes |
|---|---|---|---|---|
| `≥1600` | 1440 | auto | 12 | Max content width; the field around it is deliberate |
| `1440` | fluid | 96 | 12 | Primary design target |
| `1280` | fluid | 64 | 12 | |
| `1024` | fluid | 40 | 8 | Sidebar collapses to icon rail |
| `768`  | fluid | 32 | 6 | Sidebar becomes a sheet; tables scroll in their well |
| `≤640` | fluid | 20 | 4 | Tables become stacked records |

**The asymmetry rule.** Editorial sections never centre their content. Default
composition is content on columns `1–7` with the visual on `8–12`, alternating
to `6–12` / `1–5` on the following act. Symmetry is reserved for the two
moments that need gravity: the hero figure, and the final CTA.

### 06.3 Radius — scales with element size

```
--r-xs:   6px    inputs inside dense tables, small chips
--r-sm:  10px    badges, chips, tags
--r-md:  14px    buttons, inputs, menu items
--r-lg:  20px    cards, wells, panels
--r-xl:  28px    drawers, modals, hero blocks
--r-2xl: 40px    the block-stack pieces, landing objects
--r-full: 999px  avatars and the pulse indicator ONLY
```

Radius is proportional: an element under 32px tall never exceeds `--r-sm`, or
it becomes a pill by accident. **Pills are reserved for avatars.**

### 06.4 Borders

In this system borders are **rare** — the material does the separating. Use a
`1px --bone-600` hairline only when:

- a table needs row separation inside its well (at 60% opacity)
- two flush regions meet with no elevation change between them
- an inset field needs its edge defined in the dark room, where inset shadows
  are weaker

Never combine a full border with `--clay-*` on the same element. That reads as
two competing separation systems and is the fastest way to look generic.

### 06.5 Z-index

```
--z-base: 0        --z-raised: 10      --z-sticky: 100
--z-nav: 200       --z-drawer: 300     --z-modal: 400
--z-toast: 500     --z-command: 600    --z-tooltip: 700
```

---

## 07 · Motion

**Smooth does not come from long durations. It comes from nothing ever
teleporting.** Every state change settles, and every settle has weight.

### 07.1 Springs, not easings

Clay has mass, so it uses spring physics. Cubic-bezier easing on a clay
element is a defect — it reads as a sticker sliding, not an object moving.

```ts
export const spring = {
  chip:   { type: "spring", stiffness: 420, damping: 30, mass: 0.55 },
  button: { type: "spring", stiffness: 260, damping: 24, mass: 0.9  },
  card:   { type: "spring", stiffness: 220, damping: 26, mass: 1.1  },
  panel:  { type: "spring", stiffness: 180, damping: 26, mass: 1.4  },
  drawer: { type: "spring", stiffness: 160, damping: 28, mass: 1.6  },
  block:  { type: "spring", stiffness: 300, damping: 18, mass: 1.0  }, // 4% overshoot
} as const;
```

For properties springs cannot animate well — colour, opacity, shadow — use
duration tokens:

```
--t-instant: 90ms     hover tints, row highlights
--t-quick:  160ms     chips, badges, tooltips
--t-base:   240ms     most transitions
--t-slow:   420ms     panels, drawers, room changes
--t-scene:  900ms     the block stack, scroll scenes
--ease-out:  cubic-bezier(.22,1,.36,1)
--ease-in-out: cubic-bezier(.65,0,.35,1)
```

### 07.2 The motion vocabulary

| Event | Motion | Meaning conveyed |
|---|---|---|
| Button press | `translateY(2px)` + shadow swap, `spring.button` | This is a real key |
| Row hover | ground shifts to `--bone-300`, 90ms | This row is addressable |
| Row select | inset deepens one step | This row is held |
| Drawer open | slides from the right, `spring.drawer`, ground behind dims 8% | Detail lives beside, not on top |
| Rule block lands | falls, 4% overshoot, settles | Physical consequence |
| Number changes | digits roll (§07.4) | The value moved because something happened |
| Payrun validates | rooms lighten, cobalt → jade sweeps left-to-right across the state rail, 900ms | The run is settled |
| Validation blocked | 3px lateral shake, 2 cycles, 160ms, vermilion flash on the blocker | The system stopped you |
| Warning cleared | card lifts, fades, remaining cards settle upward with 40ms stagger | One less thing in your way |
| Page transition | outgoing 6px down + fade, incoming 6px up + fade, 240ms | Continuity, not a reload |
| Timeline scrub | figures track the cursor with no easing at all | Direct manipulation |

### 07.3 Stagger

Lists animate in with a **40ms** stagger, capped at **10 items** — after that
everything arrives together. A 30-row table that staggers for 1.2 seconds is
slow, not premium.

### 07.4 Rolling numerals — the signature microinteraction

Every money figure that can change **rolls** rather than re-rendering. Digits
move vertically like an odometer; only the digits that actually changed move.

- Duration `520ms`, `--ease-out`, per-digit stagger of `18ms` from the right
- Colour flashes toward the direction of change during the roll — jade rising,
  vermilion falling — and settles back to `--ink-900` at the end
- Applies to: `NET`, `GROSS`, every KPI, leave balances, payrun totals,
  worked days, the hero figure

The canonical demo beat: approve three days of leave, and watch
`47,842 → 45,570` count down while the `LWP` line appears on the payslip.

### 07.5 Reduced motion

`prefers-reduced-motion: reduce` is fully honoured and must be tested, not
assumed.

- All springs collapse to a `120ms` opacity fade
- Number rolls become instant value swaps, with the colour flash retained —
  the *meaning* survives even when the motion does not
- The 3D scene renders **one static composed frame** and does not animate
- Scroll-driven scenes snap to their end state
- The pulse (§08.2) stops entirely

---

## 08 · Sound

A physical machine makes noise. Almost no product in this category has sound
design, and it is the single cheapest way to feel expensive.

**Muted by default.** One toggle in the shell footer, state persisted to
`localStorage`. Never autoplay. Never a jingle.

### 08.1 The sound map

| Event | Sound | Spec |
|---|---|---|
| Key press | soft mechanical click | 8ms attack, 40ms decay, −24 dBFS |
| Toggle / chip | lighter click, higher pitch | −28 dBFS |
| Rule block lands | low wooden *thunk*, pitch descends one semitone per block down the stack | −20 dBFS |
| Payrun validates | rising three-note resolve, warm sine, ~600ms | −18 dBFS |
| Payslips sent | one clean chime | −20 dBFS |
| Validation blocked | dull damped stop, no pitch | −20 dBFS |
| Warning cleared | short upward tick | −30 dBFS |
| Drawer open / close | soft air movement, barely audible | −34 dBFS |

All under 80ms except validate and send. All preloaded as a single `~40kb`
sprite. Web Audio API, never `<audio>` elements. Total budget: **40kb**.

**Rules:** nothing loops · nothing plays on page load · nothing plays on hover
· nothing plays more than twice per second (debounced) · sound never carries
information that is not also visual.

### 08.2 The pulse

The product is called PayPulse. Give it one.

A small indicator in the shell footer beats at a rate derived from the payroll
cycle: **slow** early in the period, **quickening** as `period_end`
approaches, and **holding steady** once a run is `PAID`. It is not decoration
— it is the payroll cycle made perceptible, and hovering it shows days
remaining in the period.

Silent. Stops entirely under `prefers-reduced-motion`.

---

## 09 · Components

Built once, in `src/components/system/`. Nothing invents its own styling.

### 09.1 Button

| Variant | Surface | Ink | Elevation | Use |
|---|---|---|---|---|
| `primary` | `--cobalt-500` | white | `--clay-2` | One per view. The commit action. |
| `secondary` | `--bone-50` | `--ink-900` | `--clay-2` | Everything else |
| `quiet` | transparent | `--ink-500` | none → `--clay-1` on hover | Table row actions, dense toolbars |
| `danger` | `--vermilion-500` | white | `--clay-2` | Delete, cancel a payrun |
| `key` | `--bone-50` | `--ink-900` | `--clay-2`, square-ish `--r-sm` | The instrument keys in the payrun cockpit |

Sizes `sm 32 · md 38 · lg 46 · xl 56`. Padding `0 --s-4` at md. Label is `ui`
weight 450. Icon 16px, `--s-2` from the label, **never** larger than the text.

Loading state: label holds its width, a 3-dot progression replaces it, the
button stays pressed. Never a spinner that changes the button's size.

### 09.2 Table — an inset well

The most important component in the product. The app is mostly tables.

```
╭─────────────────────────────────────────────────╮  ← --inset-2 well
│ EMPLOYEE      DEPARTMENT   WORKED    NET        │  ← micro, --ink-400, sticky
│─────────────────────────────────────────────────│  ← hairline 60%
│ Aarav Mehta   Engineering  21 / 22   ₹64,910.00 │  ← 44px row
│ Diya Shah     Engineering  22 / 22   ₹75,340.00 │
╰─────────────────────────────────────────────────╯
```

- Well: `--bone-300`, `--inset-2`, `--r-lg`, `--s-1` internal padding
- Rows: 44px default, 52px comfortable, 36px compact. **User-switchable.**
- Row hover: ground → `--bone-200`, 90ms, no movement
- Row selected: `--cobalt-tint` ground with a 2px `--cobalt-500` left marker,
  `--r-0` on that edge
- Header: `micro`, sticky, sits **on** the well lip, not inside the scroll
- Money columns right-aligned, `num-table`, decimal-aligned
- Zebra striping is forbidden — the well already separates
- Empty: the well stays, with the empty state centred inside it, so the page
  does not collapse
- Loading: skeleton bars at `--bone-400` inside the same well, exact row height

**Row actions** appear on hover as `quiet` buttons pinned right, and are always
also reachable from the row's `⋯` menu for keyboard users.

### 09.3 Field

Inset. The label sits **above**, never floating inside — floating labels are
unreadable at density and break tabular alignment.

```
LABEL                       ← micro, --ink-400, --s-2 below
╭───────────────────────╮
│ value                 │   ← --inset-1, --bone-300, --r-md, 38px
╰───────────────────────╯
helper or error text        ← ui-sm, --ink-400 / --vermilion-500
```

Focus deepens the inset one step and adds the cobalt ring outside. Error swaps
the well to `--vermilion-tint` and the helper to `--vermilion-deep`. Required
fields carry a `*` in `--orange-500`, not red — required is not an error.

### 09.4 Badge / state chip

Raised, `--clay-1`, `--r-sm`, `micro` text in the family's `deep`, tint ground.
Height 22px, padding `0 --s-2`.

State chips carry a **2px leading dot** of the family's `500` — so state
survives greyscale and colour-blindness.

```
DRAFT      bone-500 ground · ink-500 text        ○
COMPUTED   cobalt-tint     · cobalt-deep         ●
VALIDATED  jade-tint       · jade-deep           ●
PAID       jade-500 ground · white text          ●  ← the only filled chip
CANCELLED  bone-400        · ink-400 · strikethrough
BLOCKED    vermilion-tint  · vermilion-deep      ▲
```

`PAID` is the only solid-filled chip in the entire product. It is the terminal
state, and it should look like an achievement — this is the Kaggle tier idea,
earned rather than assigned.

### 09.5 Object card

Raised `--clay-3`, `--bone-100`, `--r-lg`, padding `--s-5`. Used for things
that are genuinely *objects*: an employee, a contract, a payrun, a warning.
**Not** used as a generic container — if it holds a table, it is a well, not a
card.

Hover lifts `-2px` and grows the shadow. Cards are never nested.

### 09.6 Drawer

Right side, `520px` (`680px` for the payslip), `--clay-4`, `--r-xl` on the left
edge only, full height. Ground behind dims 8% — never a heavy scrim, because
the context must remain readable. `Esc` closes. Focus traps, and returns to
the trigger on close.

**Drawers are the default detail pattern.** Modals are reserved for
irreversible confirmations that require a typed reason: force-pay, cancel a
payrun, delete a rule.

### 09.7 Command menu — `⌘K`

Centred, `--clay-4`, `640px`, `--r-xl`, opens with a `spring.panel` and a 4px
rise. Sections: **Go to · Do · Ask**.

**Ask** is the differentiator. Typing `why is aarav net 47842` routes into the
provenance drawer (§10.3) rather than performing a text search. Natural
questions about a number are the product's core promise, so the command menu
should honour them.

### 09.8 Empty state

Centred in the well or panel that would have held content. Generated
illustration at 180px (§16), a `h3` line, one sentence of `body` in `--ink-500`
at `--s-3` below, one `primary` button.

Copy is specific and forward-looking, never apologetic:

> **No contracts yet**
> Payroll will skip this employee until one exists.
> `[ Create contract ]`

### 09.9 Warning card

The unit of the triage inbox. Raised `--clay-2`, `--r-lg`, left edge carrying a
4px severity bar (`--r-0` on that edge per §06.3).

```
╭──────────────────────────────────────────────╮
┃ ▲ MISSING_BANK_DETAILS          [ Fix → ]    │  ← severity bar + code + action
┃   Kabir Nair, Sana Iyer, Vikram Bose         │  ← who
┃   Blocks: Mark Paid                          │  ← consequence, always stated
╰──────────────────────────────────────────────╯
```

Every warning states **what it blocks**. A warning that blocks nothing says
"informational" explicitly. Resolving one lifts and fades the card; the
remainder settle upward with a 40ms stagger.

### 09.10 Toast

Bottom-left, above the pulse. `--clay-3`, `--r-md`, max `380px`, 4s. Maps
directly from the API error envelope's `code` field. Never used for anything
the user can act on — that is a warning card, not a toast.

---

## 10 · The signature systems

Four things people remember. Each is a real product surface, not marketing —
which is why they survive contact with the app.

### 10.1 THE LINE — the timeline

One horizontal track. It is the timeline, the ledger line, and the system
diagram at once. It appears on the landing hero, on every employee page, and
across the top of the payrun.

```
        contract band                    payroll boundary
   ╭──────────────────────────╮                 ┃
───●──────────────────────────────────────────  ┃  ────────→
   employee bead                                ┃
   ▏▏▏▏▏ ▏▏▏▏▏  ▏▏▏   ␣␣␣  ▏▏▏▏▏                ┃
   attendance ticks    leave = a GAP            ┃
                                                ↓
                                          the payslip
```

| Element | Material | Meaning |
|---|---|---|
| The track | inset channel milled into the ground, 3px | Time itself |
| Employee bead | raised `--clay-1`, 14px, `--r-full` | The person, positioned at "now" |
| Contract band | raised, 8px tall, `--bone-500`, `--cobalt-500` when active | A contract's period |
| Attendance ticks | 2px marks below the line, `--ink-400` | Days with a record |
| **Leave** | **a gap in the ticks**, not a coloured mark | Absence rendered as absence — matching the PRD's own model |
| Public holiday | tick in `--bone-700`, half height | Not a working day |
| Payroll boundary | vertical rule crossing the track, `--ink-700` | Period end |
| Overtime | tick extends *above* the line | Excess hours |

**Scrub it and the page recomputes.** Dragging the bead to March turns the
entire employee view into March — contract, days, leave, net. Real data, no
easing on the drag, figures rolling as they change. This is not a toy; it is
the fastest possible proof that the systems are genuinely wired together.

### 10.2 THE STACK — ordered rule evaluation

The signature. Salary rules are physical blocks.

```
   ①  BASIC     lands on the ground plane
   ②  HRA       stacks on BASIC
   ③  DA        stacks on HRA
   ④  CONV      stacks
   ⑤  SPECIAL   fills the remaining gap up to the contract wage
   ⑥  OT        stacks
   ═  GROSS     the tower's full height, measured

   ⑦  PF        a notch CARVED out of the tower
   ⑧  PT        carved
   ⑨  TDS       carved
   ⑩  LWP       carved
   ═  NET       what remains standing
```

- Blocks are raised clay, `--r-2xl`, each sized **proportionally to its
  amount** — so the visual is literally the data
- Each lands with `spring.block` and a 4% overshoot, plus a descending *thunk*
- Deductions carve rather than stack: the notch animates *inward*, and the
  tower visibly shortens
- Hovering a block reveals its code, sequence, formula and inputs
- Clicking opens the provenance drawer for that rule

**This is where 3D is justified and nowhere else.** On the landing page the
stack is R3F with real depth and the key light from §03. Inside the app it is
the same composition rendered as flat SVG — same shapes, same proportions, no
WebGL cost on a working screen.

### 10.3 THE PROVENANCE DRAWER — "why this number?"

The product's core promise, made into a component. **Any figure anywhere is
clickable**, and every one opens the same drawer.

```
₹47,842.00  NET SALARY
Aarav Mehta · September 2026

  ├─ GROSS                     ₹54,300.00
  │   ├─ BASIC       seq 10    ₹25,000.00   ▸ wage × 0.5 × 22/22
  │   ├─ HRA         seq 20    ₹10,000.00   ▸ 40% of BASIC
  │   └─ …
  │
  └─ DEDUCTIONS             − ₹ 6,458.00
      ├─ PF          seq 110  ₹ 3,600.00   ▸ min(BASIC+DA, 15000) × .12
      └─ LWP         seq 140  ₹ 2,272.73   ▸ wage / 22 × 1 unpaid day
                                              ▸ from: leave request #418
                                              ▸ approved by Imran Shaikh
```

Expanding any node reveals: rule code · sequence · the formula as written ·
the **input values it actually received** · the result. Leaf nodes link to the
source record — the contract, the leave request, the attendance rows.

Every step is openable until you reach a record a human created. **That is the
product.**

### 10.4 THE PAYSLIP — a physical object that flips

Not a page. A card with a real edge and two faces.

- **Front**: the document. Employee, period, worked days, the lines in
  sequence grouped by category, `NET` at `num-xl`.
- **Back**: the derivation. The same lines with formulas, inputs, and the
  contract that applied.

Flip is a 3D `rotateY` over 520ms with `spring.card`, with the card's shadow
tracking the rotation correctly — that shadow is what makes it read as an
object rather than a CSS transform.

`Print PDF` animates the card resolving into a document and lifting away.

---

## 11 · The application shell

```
┌────────────┬──────────────────────────────────────────────────────┐
│            │  Employees / Aarav Mehta                  ⌘K   ◐  ♪  │  56px
│  PAYPULSE  ├──────────────────────────────────────────────────────┤
│            │                                                      │
│  ○ People  │  Aarav Mehta                        [ Actions ▾ ]    │  display-s
│  ○ Contracts│  Engineering · Senior Engineer · ACTIVE              │
│  ○ Time    │                                                      │
│  ○ Leave   │  ────────────────────────────────────────────────    │
│  ○ Payroll │                                                      │
│  ○ Reports │  content                                             │
│            │                                                      │
│            │                                                      │
│  ─────────  │                                                     │
│  ◍ pulse   │                                                      │
│  ⚙ Settings│                                                      │
│  ◔ Profile │                                                      │
└────────────┴──────────────────────────────────────────────────────┘
   240px
```

- **Sidebar** `240px`, `--bone-100`, flush with the page — not a card. Active
  item is a raised `--clay-1` key in `--cobalt-tint` with `--cobalt-deep` ink.
  Collapses to a 64px icon rail below 1024px.
- **Top bar** `56px`, flush, hairline beneath. Breadcrumbs at `ui-sm`
  `--ink-500`; the last crumb is `--ink-900`. Right: `⌘K`, theme, sound.
- **Page header**: title at `display-s`, metadata beneath at `ui-sm`, primary
  action right-aligned. One `primary` button maximum.
- **Content** starts at `--s-6` below the header and holds the 12-column grid
  with `--s-6` internal margins.

**Role shapes the shell, not just its contents.** `EMPLOYEE` sees three nav
items (Me · Time · Leave) and a materially quieter shell — this is a different
product for them, not a version with hidden menus.

---

## 12 · Screen inventory

Behaviour is specified in [PRD.md §7](PRD.md). This table specifies **material
and composition**. Screen IDs match the PRD.

### Master data

| ID | Screen | Composition |
|---|---|---|
| **S1** | Login | Flush charcoal field, split 5/7. Left: `display-l` wordmark and one line of copy. Right: a raised `--clay-4` card, `420px`, floating in the dark. The only fully centred screen in the app. |
| **S2** | Employees | Header, then a segmented `key` control for Kanban / List. **List** is one inset well, dense, 44px rows. **Kanban** is columns of `--clay-2` cards by department, with the column header as a flush `micro` label. |
| **S3** | Employee | The operational hub. Identity block (avatar 72px, name `h1`, department · position · manager · state chip). **THE LINE** directly beneath, full width. Then four inset summary wells — `CONTRACT · TIME · LEAVE · PAYROLL` — each showing a `num-l` figure and one supporting line. Smart-button counts sit on the wells as `--clay-1` chips. One `/employees/{id}/summary` call fills all of it. |
| **S4** | Contracts | Inset well list. Active contract row gets a `--cobalt-500` left marker and a slightly raised ground. Overlap `409` renders as a warning card, never a toast. |
| **S5** | Working schedule | The best pure-material screen. A weekly grid of seven inset day-wells; each populated day holds a raised `--clay-1` block whose **width is proportional to its hours**. `hours_per_week` reads out at `num-l` beside the grid and **rolls** on every edit — read-only, visibly derived. |

### Time

| ID | Screen | Composition |
|---|---|---|
| **S6** | Attendance | Dense inset well, 36px compact rows. Status as chips. Manual edits carry a `--clay-1` badge. A month strip above the table mirrors THE LINE's tick language. |
| **S7** | Correction dialog | Modal — this is an audited change. Before / after in two inset wells side by side, differing values in `--orange-500`. The reason field is required and the submit key stays disabled until it has content. |
| **S8** | Time-off requests | List well. Approve / refuse are `quiet` row actions. Approving animates the balance figure rolling down in the header. |
| **S9** | Allocations | List well, validity range shown as a miniature LINE segment per row. |
| **S10** | Time-off types | Small card grid. The type's colour appears only as a 4px edge marker. |
| **S11** | Balances | Per type, a raised card holding a **four-segment inset meter**: allocated / taken / pending / remaining, sized proportionally. Remaining under 2 days flips the meter's remaining segment to `--orange-500` **before** the user files a request that would be refused. |

### Payroll configuration

| ID | Screen | Composition |
|---|---|---|
| **S12** | Salary structures | Card grid. Each card shows rule count, employee count, and a miniature STACK glyph. |
| **S13** | Salary rules | Split view. Left: the ordered rule list as **draggable raised keys** — grabbing one lifts it to `--clay-4` and the others part to make room. Right: the editor, with a live STACK preview that re-renders as you type. `Validate formula` runs the sandbox and shows the result against a sample context. Forward references highlight in `--vermilion-500` in both panes simultaneously. |

### The payrun — the dark room

`data-room="dark"` applies from S14 through S16. Charcoal clay, cobalt keys.

| ID | Screen | Composition |
|---|---|---|
| **S14** | Wizard step 1 | Dark. Four inset fields, then the eligibility preview well. A flush `micro` line under the well reads `COMPUTED · NOT PERSISTED` — the PRD's requirement that Continue creates nothing, stated in the interface. |
| **S15** | Wizard step 2 | The eligible list, per-employee `contract_days/period_days` as a miniature LINE segment. Blocked rows drop to 55% and their reason renders inline. `Create Payrun` disabled while zero are eligible. |
| **S16** | Payrun cockpit | The product's set piece. A six-stage state rail across the top — `SCOPE · EMPLOYEES · COMPUTE · REVIEW · VALIDATE · PAY` — as raised keys; completed stages fill jade, current stage glows cobalt, future stages sit inset and dark. Four totals at `num-l`, rolling. The warning inbox is the left column; the payslip table the right. Clearing the last blocker lifts the whole rail from vermilion to jade left-to-right over 900ms, with the resolve chord. |

### Output

| ID | Screen | Composition |
|---|---|---|
| **S17** | Payslip | Back to light. The flip card (§10.4) centred on a flush field, `--clay-4`, `680px`. Lines grouped by category with `micro` group headers. `NET` at `num-xl`. The STACK renders as flat SVG in the right margin. |
| **S18** | Dashboard | Command centre, not a KPI grid. Five figures across the top at `num-l`, each **openable** into its own derivation. Then: salary by department (horizontal bars, cobalt), monthly net trend (line, jade, 12 months sparse-tolerant), attendance health, and the alerts panel using the same warning cards as S16 — deliberately, so the language is identical in both places. `HR_MANAGER` gets the money-free variant, and the layout must not look broken with those cells absent. |
| **S19** | My payslips | Employee-role only, flagged off by default. |

---

## 13 · The landing page

Eight acts. The rhythm alternates loud → quiet → loud; two consecutive
high-energy acts is a composition error (P9).

### Act 00 — The hero

Do not open with a tagline. **Open with the answer.**

```
        NET SALARY · AARAV MEHTA · SEPTEMBER 2026        ← micro, --ink-400

              47,842                                     ← num-hero
              ──────
        Every number has a reason.                       ← body-l

   21/22 days · one contract · 3 days leave · 12 rules   ← ui-sm, --ink-500

              [ ENTER PAYPULSE → ]                       ← primary, lg
```

One enormous tabular figure. As you scroll, it **disassembles along THE LINE
into the records that produced it** — the contract slides in, the attendance
ticks draw, the leave gap opens, the rules stack up and get carved, and the
figure lands where it started.

The hero *is* the product. Nothing is described.

- Ground: flush `--bone-200`, no card
- The figure sits on the grid at columns `2–8`; THE LINE runs full-bleed
  beneath it. Asymmetric, per §06.2.
- Scroll-driven, not autoplaying. The user controls time.
- Reduced motion: one composed static frame with the figure and the assembled
  line, no animation.

### Act 01 — `PEOPLE ARE NOT ROWS`

Headline `display-l`: **ONE PERSON. ONE CONTEXT.**
Show the real S3 employee page as a raised `--clay-4` object at a slight
angle. Connector lines run out from it to four small raised cards — contracts,
attendance, time off, payroll — drawn on hover as if the record is reaching
for its relations. Content left, object right.

### Act 02 — `TIME BECOMES PAY`

Headline: **TIME SHOULD NOT DISAPPEAR BETWEEN HR AND PAYROLL.**
A live clock face milled into the ground. Numbers roll in real time:

```
09:07  CHECK-IN      18:21  CHECK-OUT
08:14  WORKED       +01:14  OVERTIME
```

Then those hours physically travel down THE LINE and land in the `OT` block of
the stack. Composition inverts — object left, content right.

### Act 03 — `LEAVE IS A STATE CHANGE`

Quiet act. Mostly flush field. One inset meter, and one number that moves:

```
12 ALLOCATED → 3 REQUESTED → APPROVED → 9 REMAINING → PAYROLL UPDATED
```

The `12 → 9` roll is the only motion on screen. Beneath it, an `LWP` line
appears on a miniature payslip and the net figure counts down. Restraint here
is what makes Act 04 land.

### Act 04 — `PAYROLL IS A SYSTEM, NOT A FORMULA`

The loudest act. **THE STACK in full 3D**, scroll-scrubbed, with sound. Each
block lands as you scroll, labelled, sized to its real amount. Then the
deductions carve. `NET` remains standing.

Headline: **KNOW WHY THE NUMBER IS ₹47,842.**
This is the technical differentiator, and it gets the most screen time.

### Act 05 — `NOTHING GETS PAID UNTIL IT MAKES SENSE`

**The page goes dark.** The only dark act, mirroring the payrun room.

```
PAYRUN #SEP-2026
147 PAYSLIPS · 142 READY · 04 WARNINGS · 01 BLOCKED
```

The flow visibly stops at the blocker. The user clicks `Fix` in-page, the
warning card lifts away, and the rail sweeps vermilion → jade with the resolve
chord. Business logic demonstrated, not claimed.

### Act 06 — `THE PAYSLIP IS THE RECEIPT`

Back to light, and quiet. The flip card, at rest, inviting a click. Flip it,
see the derivation. Then `GENERATE PDF` and the document resolves and lifts
away.

### Act 07 — The close

```
PEOPLE.
TIME.
PAY.

ONE SYSTEM.

[ ENTER PAYPULSE → ]
```

`display-xl`, flush field, enormous space, symmetric — one of only two
centred moments in the entire product. THE LINE, now fully assembled, runs
beneath and off both edges of the screen.

---

## 14 · Data visualisation

Recharts, restyled to this system. Charts are **inset wells**, never cards.

| Rule | |
|---|---|
| Grid | Horizontal only, `--ink-300` at 40%, 1px. No vertical gridlines. No borders. |
| Axes | `micro`, `--ink-400`. No axis lines. Ticks are implied by labels. |
| Bars | `--cobalt-500`, `--r-sm` on the top corners only, 40% of the band as gap |
| Lines | 2px `--jade-500`, no area fill under it — ever. Points only at data-dense breaks. |
| Tooltip | A `--clay-2` chip, `--r-md`, tabular figures, follows the cursor with a 60ms lag so it feels weighted |
| Empty | Never a blank frame. The well keeps its shape and holds a `micro` line: `NO PAYROLL DATA FOR THIS PERIOD`. |
| Sparse | 12-month trend renders whatever exists. Six points must look intentional, not broken. |
| Colour | Maximum two hues per chart. If a third is needed, the chart is doing too much. |

Charts animate in once, drawing left to right over `--t-scene`, and never
re-animate on re-render.

---

## 15 · Iconography

**Lucide, outline only, 1.5px stroke.** One family, no exceptions, no mixing,
no emoji.

- 16px inline with text · 18px in buttons · 20px in nav · 24px maximum
- Icons are **secondary to typography**. A nav item is its label first.
- Icons never carry meaning alone — every icon-only control has an
  `aria-label` and a tooltip.
- The wordmark and the pulse are the only custom SVG in the shell.

---

## 16 · Generated illustration

This direction *wants* illustration, unlike an austere one. But it must be
tightly controlled or it collapses the whole thing into generic SaaS.

**Where it appears — nowhere else:**

1. Empty states, one per module (9 total)
2. Landing act transitions (up to 4)
3. The 404 / permission-denied screens

**The locked prompt template:**

> Isometric clay object, matte ceramic finish, single soft key light from
> upper-left at 35°, soft contact shadow beneath. Palette strictly limited to
> bone `#F7F4EE`, putty `#E4DDD0`, one accent of cobalt `#2B4FF5`. Precise
> geometry, no bevels beyond 4px, generous negative space, centred on a plain
> bone background. No faces, no people, no text, no logos, no gradients beyond
> the light falloff. Muji stationery photographed as a 3D render.
> Subject: **[a folded contract document / a calendar block with one day
> raised / a stack of coins / a wall clock / an empty tray / a sealed
> envelope]**

**Rules:** square, transparent or bone ground · under 40kb as WebP ·
consistent scale across the set · the light direction must match §03 exactly ·
any image with a face, text, or a second accent colour is rejected.

---

## 17 · Voice

Short. Confident. Specific. Never markets, always states.

| Instead of | Write |
|---|---|
| "Welcome to PayPulse!" | "People. Time. Pay. Connected." |
| "Streamline your HR workflow" | "Payroll without the spreadsheet archaeology." |
| "Powerful attendance tracking" | "Every hour has a consequence." |
| "Manage leave efficiently" | "Leave shouldn't disappear into email." |
| "Transparent salary calculations" | "Know why the number is ₹47,842." |
| "Robust validation engine" | "Nothing gets paid until it makes sense." |
| "Comprehensive employee timeline" | "Your people have a timeline. Your payroll should too." |

**Microcopy rules**

- Errors say **what happened and what to do**: not "Validation failed" but
  "Three employees have no bank details. Payroll can't pay them."
- Empty states look forward: not "No data" but "Payroll will skip this
  employee until a contract exists."
- Buttons are verbs: `Compute` · `Validate` · `Mark paid` · not `Submit`, `OK`.
- Numbers in prose are always specific. Never "several", never "many".
- Sentence case everywhere except `micro`.
- **Banned**: leverage · seamless · empower · unlock · revolutionize ·
  cutting-edge · solution · robust · AI-powered · game-changing.

---

## 18 · Accessibility

Non-negotiable, and tested rather than assumed.

- **Contrast** — 4.5:1 body, 3:1 large text and UI boundaries. `--ink-400` on
  `--bone-200` passes at 14px+; it must never carry body copy.
- **Focus** — `focus-visible` ring is 2px `--cobalt-500` at 3px offset, always
  outside the clay, never replacing it. Never `outline: none`.
- **Keyboard** — every action reachable, including row actions, drag-to-reorder
  (arrow keys with a live region announcing position), and the timeline scrub
  (arrows step one day, `Shift` one week).
- **Semantics** — real `<table>`, real `<button>`, real `<label>`. Landmarks on
  the shell. `aria-live="polite"` on rolling figures so screen readers hear the
  final value, not every intermediate digit.
- **Motion** — §07.5, fully honoured.
- **Colour independence** — state chips carry text and a dot glyph. Charts
  carry direct labels. Warning severity carries a shape as well as a hue.
- **Sound** — never the only signal for anything.
- **Target size** — 32px minimum, 44px on touch.

---

## 19 · Performance

The material system is expensive if built carelessly. These are budgets, not
aspirations.

| Budget | Target |
|---|---|
| LCP (landing) | < 1.8s on a 4G throttle |
| Landing JS, initial | < 180kb gzipped, R3F lazily loaded below the fold |
| App shell JS | < 220kb gzipped |
| Fonts | 4 families, `woff2`, subset to `latin` + `₹`, preloaded, ~92kb total |
| Sound sprite | 40kb, loaded only when sound is enabled |
| Interaction to next paint | < 200ms |

**Clay-specific rules**

- Multi-layer `box-shadow` on 200 table rows will drop frames. Rows are
  **flat** inside their inset well — the well carries the elevation, not the
  rows. This is why P2 exists.
- Animate `transform` and `opacity` only. `box-shadow` transitions are
  permitted **only** on elements smaller than ~400px².
- `will-change: transform` on hover-lifting elements, removed after.
- The grain overlay is one shared filter reference, never re-declared per
  element. On `deviceMemory < 4`, swap to the tiled PNG.
- R3F: `dpr={[1, 1.75]}`, `frameloop="demand"` outside scroll scenes,
  instanced geometry for the blocks, no post-processing, no shadow maps —
  shadows are baked into the material.
- The 3D scene never mounts below 768px, on `prefers-reduced-motion`, or when
  `navigator.hardwareConcurrency <= 4`. The flat SVG stack is a full substitute.

---

## 20 · Implementation

### 20.1 Stack

React 18 · TypeScript · Vite · Tailwind (tokens only, no utility soup in
components) · shadcn/ui as an unstyled base, fully re-skinned · TanStack Query
· TanStack Table · Motion (Framer) · Three.js + React Three Fiber · Recharts ·
react-hook-form + zod.

### 20.2 Structure

```
frontend/src/
├── styles/
│   ├── tokens.css          every value in this document, and nothing else
│   ├── clay.css            the elevation system
│   └── grain.svg
├── components/
│   ├── system/             Button Field Table Badge Card Drawer Toast Empty …
│   ├── signature/          Line Stack ProvenanceDrawer PayslipCard Pulse
│   └── charts/
├── features/               employees contracts schedules attendance
│                           timeoff payroll dashboard
├── landing/                acts/ Act00Hero … Act07Close
├── api/                    schema.d.ts (generated) · client · hooks
├── motion/                 springs.ts · variants.ts
└── sound/                  sprite.ts · useSound.ts
```

### 20.3 Token discipline

Every value in this document lives in `tokens.css` as a CSS custom property
and is surfaced through the Tailwind theme. **A hex code, px value, or shadow
written inline in a component is a defect** — it means a decision was made
outside the system and will drift.

### 20.4 Build order

1. `tokens.css` + `clay.css` + the grain — prove the material on one button
2. `system/` primitives — Button, Field, Table, Badge, Card, Drawer, Empty
3. The shell — sidebar, top bar, page header, command menu, pulse
4. `signature/` — Line, Stack, ProvenanceDrawer, PayslipCard
5. Feature screens, in PRD block order
6. The landing acts, last — they reuse everything above

The landing page is built **from** the design system, never alongside it.
That is what makes the marketing site and the product look like one thing.

---

## 21 · The quality bar

Before any screen is called done:

- [ ] Does every surface read as **raised, recessed, or flush** — and does that state mean something?
- [ ] Is there **one light source**, and do shadows move when their element moves?
- [ ] Does **every animation explain a cause**? If not, delete it.
- [ ] Are all figures **tabular**, decimal-aligned, and do they **roll** on change?
- [ ] Is saturated colour under **6%** of the pixels?
- [ ] Is there a **flush area** for the eye to rest?
- [ ] Could someone understand *Employee → Contract → Time → Leave → Payroll → Payslip* in **30 seconds**?
- [ ] Can **every displayed number be opened**?
- [ ] Does it work at 1024px, in dark mode, with reduced motion, and by keyboard alone?
- [ ] Does it look like generic HR SaaS? → **Redesign.**
- [ ] Does it look AI-generated? → **Redesign.**
- [ ] Does it feel like a **toybox** rather than an instrument? → Flatten more of it.

**The product should feel:** precise · quiet · intelligent · human ·
technical · editorial · fast · memorable.

Not flashy. Not generic. Not "AI".

---

## 22 · Open items

| # | Item | Owner |
|---|---|---|
| 1 | `PeoplePay360` → `PAYPULSE` across the PRD, the design board, `COMPANY_NAME` in `backend/app/core/config.py`, and the payslip PDF template | Aditya |
| 2 | The Excalidraw board at `docs/design/` is v1.0 and its payslip wireframe still shows the **v1 payroll bug** (`SPECIAL = 0.00`, BASIC as the whole wage). Numbers must come from [PRD.md §4.5](PRD.md), not from that board. | — |
| 3 | Backend currently exposes only `/auth`. Frontend builds against typed fixtures derived from [PRD.md §5](PRD.md), swapped for the generated client as each block lands. | Both |
| 4 | `docs/api-contract.md` — named in PRD §8.1 as the drift-prevention mechanism, does not yet exist | Aditya |
| 5 | ~~Licence check and self-hosting for all four typefaces~~ — **done in P1** via `@fontsource`; no CDN dependency remains | ✅ |
| 6 | **PRD §6.1(a) is unimplemented and its own tests contradict it.** The PRD resolves that `HR_MANAGER` gets a money-free dashboard; `core/rbac.py` does not grant it and `test_rbac.py::test_no_payroll_features` asserts it must not. `src/auth/rbac.ts` mirrors the backend, so HR_MANAGER currently has a 4-item nav and no landing dashboard. Grant it in `rbac.py`, or amend §6.1(a). | Aditya |
| 7 | Font budget in §19 (~92kb) is exceeded — self-hosted reality is ~123kb on first paint, Bricolage's optical-size axis being 77kb of it. Fix is to subset the display face to the glyphs it actually renders. | P14 |

