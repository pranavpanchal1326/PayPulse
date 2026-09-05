/**
 * THE DARK ROOM · §04.4
 *
 * The payrun — the one place money actually moves — inverts. Charcoal clay,
 * cobalt keys. It is the light→dark→light contrast the blueprint asks for, and
 * it makes the moment of consequence *feel* like a different, more serious
 * room.
 *
 * Three things make it a room rather than a colour scheme.
 *
 * **It is the same ramp as global dark mode.** `[data-room="dark"]` is
 * declared beside `[data-theme="dark"]` in `tokens.css`, not copied. A second
 * set of dark values would drift, and the product would have two darks.
 *
 * **Entering and leaving are deliberate.** The attribute lands on `<html>` so
 * the shell — sidebar, top bar, scrollbars — comes with it; a dark panel
 * floating in a bone-coloured application would read as a broken component
 * rather than as another room. The transition is `--t-scene`, slow enough to
 * register as a move.
 *
 * **It always cleans up.** The effect's teardown restores whatever the theme
 * toggle had set, so navigating out — by link, by back button, or by a route
 * guard rejecting you — never strands the rest of the app in the dark.
 */
import { useEffect } from "react";

export function DarkRoom({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-room", "dark");
    return () => root.removeAttribute("data-room");
  }, []);

  return <div className="pp-room">{children}</div>;
}
