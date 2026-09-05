/**
 * Chrome for the design-system routes only — theme, grain and sound, without
 * the application shell. Never rendered inside the product.
 */
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Moon, Sun, Volume2, VolumeX } from "lucide-react";
import { IconButton } from "@/components/system";
import { sound, useSoundEnabled } from "@/sound/useSound";

export function DevChrome() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [grain, setGrain] = useState(true);
  const soundOn = useSoundEnabled();

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.setAttribute("data-grain", grain ? "on" : "off");
  }, [theme, grain]);

  return (
    <>
      <header className="pp-topbar">
        <span className="t-micro">PayPulse</span>
        <nav className="pp-crumbs" style={{ gap: "var(--s-4)" }}>
          <NavLink to="/dev/gallery" className={({ isActive }) => (isActive ? "pp-crumbs__here" : undefined)}>
            Gallery
          </NavLink>
          <NavLink to="/dev/material" className={({ isActive }) => (isActive ? "pp-crumbs__here" : undefined)}>
            Material
          </NavLink>
          <NavLink to="/dev/signature" className={({ isActive }) => (isActive ? "pp-crumbs__here" : undefined)}>
            Signature
          </NavLink>
          <NavLink to="/login">App</NavLink>
        </nav>
        <div className="pp-topbar__actions">
          <button type="button" className="pp-seg__item" aria-pressed={grain} onClick={() => setGrain((g) => !g)}>
            Grain {grain ? "on" : "off"}
          </button>
          <IconButton label={soundOn ? "Mute sound" : "Unmute sound"} size="sm" quiet onClick={() => sound.toggle()}>
            {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </IconButton>
          <IconButton
            label={theme === "dark" ? "Switch to light" : "Switch to dark"}
            size="sm" quiet
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </IconButton>
        </div>
      </header>
      <Outlet />
    </>
  );
}
