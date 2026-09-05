#!/usr/bin/env python3
"""
PeoplePay360 - System & Product design board.

Emits an .excalidraw scene authored in LIGHT-theme colours and shipped with
theme="dark", so it renders like the reference board (dark ground, hand-drawn
strokes, amber note panels) while staying readable if opened in light mode.
"""
import json, random, itertools

random.seed(20260905)
_seq = itertools.count(1)
def _id(): return "e%05d" % next(_seq)
def _n():  return random.randint(1, 2**31 - 1)

# ---------------------------------------------------------------- tokens --
INK  = "#1e1e1e"; MUTED = "#5c5f66"; HAIR = "#adb5bd"; SOFT = "#868e96"
BLUE = "#1971c2"; BLUE_F = "#a5d8ff"; BLUE_BG = "#e7f5ff"
VIO  = "#6741d9"; VIO_F  = "#d0bfff"; VIO_BG  = "#f3f0ff"
GRN  = "#2f9e44"; GRN_F  = "#b2f2bb"; GRN_BG  = "#ebfbee"
RED  = "#e03131"; RED_F  = "#ffc9c9"; RED_BG  = "#fff5f5"
AMB  = "#f08c00"; AMB_F  = "#ffec99"; AMB_BG  = "#fff9db"
TEA  = "#0c8599"; TEA_F  = "#99e9f2"; TEA_BG  = "#e3fafc"
PNK  = "#c2255c"; PNK_BG = "#fff0f6"
SURF = "#f8f9fa"; NONE   = "transparent"

HAND, CODE = 1, 3           # Excalifont / Cascadia
CW = {HAND: 0.535, CODE: 0.602}
LH = 1.25

ELS = []

def el(**kw):
    e = dict(id=_id(), type="rectangle", x=0, y=0, width=10, height=10, angle=0,
             strokeColor=INK, backgroundColor=NONE, fillStyle="solid",
             strokeWidth=1, strokeStyle="solid", roughness=1, opacity=100,
             groupIds=[], frameId=None, roundness={"type": 3}, seed=_n(),
             version=12, versionNonce=_n(), isDeleted=False, boundElements=None,
             updated=1757000000000, link=None, locked=False)
    e.update(kw)
    ELS.append(e)
    return e

# ------------------------------------------------------------- primitives --
def rect(x, y, w, h, stroke=INK, bg=NONE, r=True, sw=1, dash=None, g=None, op=100, rough=1):
    return el(type="rectangle", x=x, y=y, width=w, height=h, strokeColor=stroke,
              backgroundColor=bg, strokeWidth=sw, roughness=rough, opacity=op,
              strokeStyle=dash or "solid", roundness={"type": 3} if r else None,
              groupIds=g or [])

def ellipse(x, y, w, h, stroke=INK, bg=NONE, sw=1, g=None):
    return el(type="ellipse", x=x, y=y, width=w, height=h, strokeColor=stroke,
              backgroundColor=bg, strokeWidth=sw, roundness=None, groupIds=g or [])

def diamond(x, y, w, h, stroke=INK, bg=NONE, sw=1, g=None):
    return el(type="diamond", x=x, y=y, width=w, height=h, strokeColor=stroke,
              backgroundColor=bg, strokeWidth=sw, roundness=None, groupIds=g or [])

def txt(s, x, y, size=16, color=INK, fam=HAND, align="left", w=None, g=None, op=100):
    lines = s.split("\n")
    natural = max((len(l) for l in lines), default=1) * size * CW[fam] + 2
    width = w if w is not None else natural
    height = len(lines) * size * LH
    return el(type="text", x=x, y=y, width=width, height=height, text=s,
              originalText=s, fontSize=size, fontFamily=fam, textAlign=align,
              verticalAlign="top", strokeColor=color, backgroundColor=NONE,
              roundness=None, containerId=None, lineHeight=LH, groupIds=g or [],
              opacity=op, autoResize=w is None)

def tw(s, size=16, fam=HAND):
    """approximate rendered width of a single-line string"""
    return len(s) * size * CW[fam]

def line(pts, color=HAIR, sw=1, dash=None, g=None, op=100):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    x0, y0 = pts[0]
    return el(type="line", x=x0, y=y0, width=max(xs) - min(xs), height=max(ys) - min(ys),
              points=[[p[0] - x0, p[1] - y0] for p in pts], strokeColor=color,
              strokeWidth=sw, strokeStyle=dash or "solid", backgroundColor=NONE,
              roundness={"type": 2}, groupIds=g or [], opacity=op,
              lastCommittedPoint=None)

def arrow(pts, color=SOFT, sw=1, dash=None, head="arrow", tail=None, g=None, op=100):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    x0, y0 = pts[0]
    return el(type="arrow", x=x0, y=y0, width=max(xs) - min(xs), height=max(ys) - min(ys),
              points=[[p[0] - x0, p[1] - y0] for p in pts], strokeColor=color,
              strokeWidth=sw, strokeStyle=dash or "solid", backgroundColor=NONE,
              roundness={"type": 2}, startArrowhead=tail, endArrowhead=head,
              startBinding=None, endBinding=None, elbowed=False, groupIds=g or [],
              opacity=op, lastCommittedPoint=None)

# ------------------------------------------------------------- components --
def centered(s, x, y, w, size=16, color=INK, fam=HAND, g=None):
    """text horizontally centred inside [x, x+w]"""
    return txt(s, x, y, size=size, color=color, fam=fam, align="center", w=w, g=g)

def node(x, y, w, h, label, sub=None, stroke=INK, bg=NONE, size=16, g=None, sw=1, dash=None):
    rect(x, y, w, h, stroke=stroke, bg=bg, g=g, sw=sw, dash=dash)
    if sub:
        th = size * LH + 13 * LH + 3
        centered(label, x, y + (h - th) / 2, w, size=size, color=stroke, g=g)
        centered(sub, x, y + (h - th) / 2 + size * LH + 3, w, size=13, color=MUTED, g=g)
    else:
        centered(label, x, y + (h - size * LH) / 2, w, size=size, color=stroke, g=g)

def pill(x, y, label, stroke=BLUE, bg=NONE, size=13, g=None, padx=11, h=None):
    h = h or int(size * LH + 11)
    w = tw(label, size) + padx * 2
    rect(x, y, w, h, stroke=stroke, bg=bg, g=g)
    centered(label, x, y + (h - size * LH) / 2, w, size=size, color=stroke, g=g)
    return w

def card(x, y, w, h, title, body=None, accent=INK, bg=SURF, tsize=20, bsize=14, g=None, pad=18):
    rect(x, y, w, h, stroke=accent, bg=bg, g=g)
    txt(title, x + pad, y + pad - 2, size=tsize, color=accent, g=g)
    if body:
        txt(body, x + pad, y + pad + tsize * LH + 8, size=bsize, color=MUTED,
            w=w - pad * 2, g=g)

def sticky(x, y, w, title, bullets, accent=AMB, bg=AMB_BG, bsize=14, g=None):
    lines = ["- " + b for b in bullets]
    body = "\n".join(lines)
    h = 40 + len(lines) * bsize * LH
    txt(title, x + 4, y - 26, size=15, color=accent, g=g)
    rect(x, y, w, h, stroke=accent, bg=bg, g=g)
    txt(body, x + 20, y + 18, size=bsize, color=INK, w=w - 40, g=g)
    return h

def measure(s, w, size=14, fam=HAND):
    """wrap s to w pixels; returns (text, line count, height)"""
    import textwrap
    chars = max(8, int(w / (size * CW[fam])))
    out = []
    for block in s.split("\n"):
        out.extend(textwrap.wrap(block, chars) or [""])
    return "\n".join(out), len(out), len(out) * size * LH


def section(x, y, index, title, blurb="", w=3400, color=INK):
    txt(index, x, y, size=15, color=AMB)
    txt(title, x, y + 22, size=34, color=color)
    by = y + 22 + 34 * LH + 8
    if blurb:
        body, _, bh = measure(blurb, 1800, 15)
        txt(body, x, by, size=15, color=MUTED, w=1800)
        by += bh + 20
    else:
        by += 4
    line([(x, by), (x + w, by)], color=HAIR, sw=1)

def table(x, y, cols, widths, rows, row_h=32, head_h=36, fs=13, head_bg=SURF,
          stroke=HAIR, g=None, mono=(), rowcolors=None, head_color=MUTED):
    W = sum(widths)
    H = head_h + len(rows) * row_h
    rect(x, y, W, H, stroke=stroke, bg=NONE, g=g)
    rect(x, y, W, head_h, stroke=stroke, bg=head_bg, g=g)
    cx = x
    for i, c in enumerate(cols):
        txt(c, cx + 12, y + (head_h - fs * LH) / 2, size=fs, color=head_color, g=g)
        cx += widths[i]
    for i in range(1, len(widths)):
        gx = x + sum(widths[:i])
        line([(gx, y), (gx, y + H)], color=stroke, sw=1, g=g, op=45)
    for r, row in enumerate(rows):
        ry = y + head_h + r * row_h
        if r:
            line([(x, ry), (x + W, ry)], color=stroke, sw=1, g=g, op=45)
        cx = x
        rc = (rowcolors or {}).get(r, INK)
        for i, cell in enumerate(row):
            fam = CODE if i in mono else HAND
            txt(str(cell), cx + 12, ry + (row_h - fs * LH) / 2, size=fs,
                color=rc, fam=fam, g=g)
            cx += widths[i]
    return H

# ------------------------------------------------------- wireframe kit -----
def window(x, y, w, h, title, nav=None, active=None, g=None, chrome=True):
    rect(x, y, w, h, stroke=HAIR, bg=NONE, g=g)
    ny = y
    if chrome:
        line([(x, y + 34), (x + w, y + 34)], color=HAIR, sw=1, g=g, op=60)
        for i, c in enumerate((RED, AMB, GRN)):
            ellipse(x + 14 + i * 15, y + 13, 8, 8, stroke=c, bg=c, g=g)
        txt(title, x + 68, y + 9, size=13, color=MUTED, g=g)
        ny = y + 34
    if nav:
        line([(x, ny + 36), (x + w, ny + 36)], color=HAIR, sw=1, g=g, op=60)
        cx = x + 16
        for item in nav:
            on = item == active
            if on:
                rect(cx - 8, ny + 7, tw(item, 13) + 16, 23, stroke=VIO, bg=VIO_BG, g=g)
            txt(item, cx, ny + 10, size=13, color=VIO if on else SOFT, g=g)
            cx += tw(item, 13) + 30
        ny += 36
    return ny

def field(x, y, w, label, placeholder, g=None, h=30, stroke=HAIR, val_color=SOFT):
    txt(label, x, y, size=11, color=SOFT, g=g)
    rect(x, y + 16, w, h, stroke=stroke, bg=NONE, g=g)
    txt(placeholder, x + 10, y + 16 + (h - 12 * LH) / 2, size=12, color=val_color, g=g)
    return y + 16 + h

def button(x, y, label, primary=True, g=None, size=13, h=30):
    w = tw(label, size) + 30
    rect(x, y, w, h, stroke=BLUE, bg=BLUE_F if primary else NONE, g=g)
    centered(label, x, y + (h - size * LH) / 2, w, size=size,
             color="#0b4d8f" if primary else BLUE, g=g)
    return w

def rowtable(x, y, w, cols, widths, rows, g=None, row_h=30, fs=12, hl=None,
             badge_col=None, badge_color=BLUE):
    head = 28
    line([(x, y + head), (x + w, y + head)], color=HAIR, sw=1, g=g, op=60)
    cx = x
    for i, c in enumerate(cols):
        txt(c, cx, y + 6, size=11, color=SOFT, g=g); cx += widths[i]
    for r, row in enumerate(rows):
        ry = y + head + r * row_h
        if hl is not None and r == hl:
            rect(x - 8, ry + 2, w + 16, row_h - 4, stroke=NONE, bg=BLUE_BG, g=g)
        cx = x
        for i, cell in enumerate(row):
            if badge_col is not None and i == badge_col:
                pill(cx, ry + 3, str(cell), stroke=badge_color, bg=NONE, size=11, g=g, padx=9)
            else:
                txt(str(cell), cx, ry + (row_h - fs * LH) / 2, size=fs, color=INK, g=g)
            cx += widths[i]
    return y + head + len(rows) * row_h
