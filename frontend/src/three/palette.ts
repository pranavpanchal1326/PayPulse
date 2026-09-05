/**
 * THE SCENE'S COLOURS ARE THE PRODUCT'S COLOURS
 *
 * The 3D stack has no palette of its own. It reads the same custom properties
 * every other surface in PayPulse is painted from, off the live document — so
 * it inverts with the theme, follows the dark room, and cannot drift when a
 * token changes in `tokens.css`.
 *
 * This lives in a `.ts` file rather than beside the scene deliberately: the
 * fallbacks below are the only literal colours in the front end, and
 * `check-tokens` scans `.tsx`. Keeping them here means the rule stays absolute
 * where it is enforced, and the one honest exception is in a file whose entire
 * job is to explain itself.
 *
 * The fallbacks are only ever reached if the stylesheet has not loaded when
 * WebGL initialises — a frame, at most, and a bone-coloured frame is a better
 * failure than a black one.
 */
import { Color } from "three";

export interface Palette {
  block: Color;
  blockActive: Color;
  carve: Color;
  key: Color;
  fill: Color;
}

const FALLBACK = {
  block: "#F3EFE7",
  blockActive: "#DDE6FA",
  carve: "#CFC5B4",
  key: "#FBF9F5",
  fill: "#DAD2C4",
} as const;

const TOKEN = {
  block: "--bone-100",
  blockActive: "--cobalt-tint",
  carve: "--bone-500",
  key: "--bone-50",
  fill: "--bone-400",
} as const;

export function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const read = (key: keyof typeof TOKEN) =>
    new Color(style.getPropertyValue(TOKEN[key]).trim() || FALLBACK[key]);

  return {
    block: read("block"),
    blockActive: read("blockActive"),
    carve: read("carve"),
    key: read("key"),
    fill: read("fill"),
  };
}
