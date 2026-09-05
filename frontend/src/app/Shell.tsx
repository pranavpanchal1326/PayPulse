/**
 * THE APPLICATION SHELL · blueprint §11
 *
 * Sidebar is flush with the page — not a card. The active item is a raised
 * clay key. The top bar is flush with a hairline beneath. Restraint here is
 * what lets the content carry the weight.
 */
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Command, LogOut, Moon, Sun, Volume2, VolumeX } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { ROLE_LABEL } from "@/auth/rbac";
import { IconButton, Tooltip } from "@/components/system";
import { sound, useSoundEnabled } from "@/sound/useSound";
import { navFor } from "./nav";
import { Pulse } from "./Pulse";
import { ClockControl, ClockProvider, useClock } from "./Clock";
import { CommandMenu } from "./CommandMenu";

const THEME_KEY = "paypulse.theme";

/**
 * The shell owns the clock, because the clock is a state the whole
 * application is in rather than something one screen holds. Everything below
 * this boundary — the topbar control, the sidebar's light, the Time screen —
 * reads the same open row.
 */
export function Shell() {
  return (
    <ClockProvider>
      <ShellFrame />
    </ClockProvider>
  );
}

function ShellFrame() {
  const { user, signOut } = useAuth();
  const clock = useClock();
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      return (localStorage.getItem(THEME_KEY) as "light" | "dark") ?? "light";
    } catch {
      return "light";
    }
  });
  const [cmdOpen, setCmdOpen] = useState(false);
  const soundOn = useSoundEnabled();
  const location = useLocation();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-grain", "on");
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!user) return null;
  const items = navFor(user.role);
  const crumbs = breadcrumbs(location.pathname, items);

  return (
    <div className="pp-shell">
      <a href="#main" className="pp-skip">Skip to content</a>

      <aside className="pp-sidebar">
        <div className="pp-sidebar__brand">
          <span className="t-micro">PayPulse</span>
        </div>

        <nav className="pp-sidebar__nav" aria-label="Sections">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `pp-navitem${isActive ? " pp-navitem--active" : ""}`
              }
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="pp-sidebar__foot">
          {/*
            The light says whether *you* are on the clock — not whether the
            server is up. A heartbeat that beats for somebody who went home at
            six is a light that means nothing, so it goes out with the punch
            and the label goes with it.
          */}
          <div className="pp-sidebar__pulse">
            <Pulse on={clock.open !== null} />
            <span className="t-micro" style={{ color: "var(--ink-400)" }}>
              {clock.open !== null ? "On the clock" : "Checked out"}
            </span>
          </div>
          <div className="pp-sidebar__who">
            <p className="t-ui-sm" style={{ margin: 0 }}>{user.full_name}</p>
            <p className="t-micro" style={{ margin: 0, color: "var(--ink-400)" }}>
              {ROLE_LABEL[user.role]}
            </p>
          </div>
        </div>
      </aside>

      <div className="pp-main">
        <header className="pp-topbar">
          <nav aria-label="Breadcrumb" className="pp-crumbs">
            {crumbs.map((c, i) => (
              <span key={c}>
                {i > 0 && <span className="pp-crumbs__sep" aria-hidden="true">/</span>}
                <span className={i === crumbs.length - 1 ? "pp-crumbs__here" : undefined}>
                  {c}
                </span>
              </span>
            ))}
          </nav>

          <div className="pp-topbar__actions">
            <ClockControl />
            <span className="pp-topbar__split" aria-hidden="true" />
            <Tooltip label="Command menu — Ctrl K">
              <IconButton label="Open command menu" size="sm" quiet onClick={() => setCmdOpen(true)}>
                <Command size={16} />
              </IconButton>
            </Tooltip>
            <IconButton
              label={soundOn ? "Mute sound" : "Unmute sound"}
              size="sm"
              quiet
              onClick={() => sound.toggle()}
            >
              {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </IconButton>
            <IconButton
              label={theme === "dark" ? "Switch to light" : "Switch to dark"}
              size="sm"
              quiet
              onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </IconButton>
            <IconButton label="Sign out" size="sm" quiet onClick={signOut}>
              <LogOut size={16} />
            </IconButton>
          </div>
        </header>

        <main id="main" className="pp-content">
          <Outlet />
        </main>
      </div>

      <CommandMenu open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}

/** Path → readable trail, using the nav labels the role actually has. */
function breadcrumbs(pathname: string, items: ReturnType<typeof navFor>): string[] {
  const segments = pathname.split("/").filter(Boolean);
  if (!segments.length) return ["Home"];
  const root = items.find((i) => i.to === `/${segments[0]}`);
  const head = root?.label ?? title(segments[0]);
  return [head, ...segments.slice(1).map(title)];
}

const title = (s: string) =>
  s.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Page header, used by every feature screen (§11). */
export function PageHeader({
  title: heading,
  meta,
  action,
}: {
  title: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="pp-pagehead">
      <div>
        <h1 className="t-display-s" style={{ margin: 0 }}>{heading}</h1>
        {meta && <p className="pp-pagehead__meta t-ui-sm">{meta}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
