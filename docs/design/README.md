# PeoplePay360 — design board

`PeoplePay360-System-Design.excalidraw` — the board. 1,162 elements, 3400 × 8930 canvas.

## Open it

Go to <https://excalidraw.com>, then **drag the `.excalidraw` file onto the canvas**
(or hamburger menu → Open). It ships with `theme: "dark"`, so it looks like the
organisers' reference board on arrival. Switching to light theme also works — the
scene is authored in light-theme colours and Excalidraw inverts them for dark.

`PeoplePay360-System-Design.png` is a flat export for pasting into a deck or a README.

## What's on it

| Band | Content |
|---|---|
| 00 | Cover + legend — the board's own colour/shape system |
| 01 | The four requirements that carry the marks, and what makes each structurally true |
| 02 | System architecture, ownership boundary, API surface, scale targets |
| 03 | Data model — 23 tables around the Employee hub, with the exclusion constraint |
| 04 | Payroll engine — the 5-step compute pipeline, the 12 seeded rules, the formula sandbox |
| 05 | Payrun lifecycle and the warning gates |
| 06 | Navigation, and the two demo scenarios as flows |
| 07 | Four key screens — payrun wizard, payrun processing, payslip, dashboard |
| 08 | RBAC matrix |
| 09 | Delivery plan — two tracks, six sync points, top risks |

## Regenerate

The board is generated, not hand-drawn, so content edits stay cheap and the layout
stays on-grid:

```bash
python render.py
```

- `build_board.py` — element factory and the component kit (`card`, `sticky`,
  `table`, `window`, `field`, `button`, `rowtable`, `section`, tokens).
- `render.py` — one function per band, plus the copy.

Editing by hand in Excalidraw afterwards is fine — just don't re-run `render.py`
over a hand-edited file, it overwrites.

### Local preview

`preview.html` renders the scene without uploading it anywhere:

```bash
python -m http.server 8777
```

then open <http://127.0.0.1:8777/preview.html>.
