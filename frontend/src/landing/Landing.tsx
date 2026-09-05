/**
 * P13 · THE LANDING PAGE
 *
 * Eight acts, built **from** the design system — which is why the phase comes
 * last. Everything on this page is either a component the product already
 * ships (`Line`, `Stack`, `PayslipCard`, `ProvenanceDrawer`, `Rail`,
 * `RollingNumber`, `Button`, `WarningCard`) or a figure computed by the
 * product's own payroll engine. The marketing site and the product look like
 * one thing because they *are* one thing.
 *
 * **Why the whole page is one lazy chunk.** It imports the fixture dataset —
 * thirty employees, three thousand attendance rows, seven payruns — because
 * that is where the honest figures live. None of that may reach the
 * application shell, which has its own 180kb budget to keep (§19). The route
 * loads this module; nothing else does.
 *
 * **Chrome, deliberately thin.** A marketing header with six links would be
 * the first thing on the page that is not the product. There is a wordmark,
 * the two switches the product itself offers, and the one action.
 */
import { Suspense, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Moon, Sun, Volume2, VolumeX } from "lucide-react";
import { useEffect } from "react";
import { Button, IconButton } from "@/components/system";
import { ProvenanceDrawer, type ProvenanceNode } from "@/components/signature";
import { sound, useSoundEnabled } from "@/sound/useSound";
import { Act00Hero } from "./acts/Act00Hero";
import { Act01People } from "./acts/Act01People";
import { Act02Time } from "./acts/Act02Time";
import { Act03Leave } from "./acts/Act03Leave";
import { Act04Payroll } from "./acts/Act04Payroll";
import { Act05Validation } from "./acts/Act05Validation";
import { Act06Payslip } from "./acts/Act06Payslip";
import { Act07Close } from "./acts/Act07Close";
import { period, person, provenance } from "./story";

/** Depth-first search for the node a rule code explains. */
function findNode(root: ProvenanceNode, code: string): ProvenanceNode | null {
  if (root.code === code) return root;
  for (const child of root.children ?? []) {
    const hit = findNode(child, code);
    if (hit) return hit;
  }
  return null;
}

export function Landing() {
  const navigate = useNavigate();
  const soundOn = useSoundEnabled();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [why, setWhy] = useState<ProvenanceNode | null>(null);

  /**
   * The page owns the theme and the grain while it is mounted, and hands both
   * back on the way out — the same contract `DarkRoom` keeps with the shell.
   * Leaving `data-theme` behind would strand the login screen in whatever the
   * reader had chosen out here.
   */
  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute("data-theme");
    const previousGrain = root.getAttribute("data-grain");

    root.setAttribute("data-theme", theme);
    root.setAttribute("data-grain", "on");

    return () => {
      if (previousTheme) root.setAttribute("data-theme", previousTheme);
      else root.removeAttribute("data-theme");
      if (previousGrain) root.setAttribute("data-grain", previousGrain);
      else root.removeAttribute("data-grain");
    };
  }, [theme]);

  const enter = () => navigate("/login");

  const openWhy = useMemo(
    () => (code: string) => setWhy(findNode(provenance, code) ?? provenance),
    [],
  );

  return (
    <div className="lp">
      <header className="lp-chrome">
        <a className="lp-chrome__mark t-micro" href="#act-00">
          PayPulse
        </a>

        <nav className="lp-chrome__nav t-ui-sm" aria-label="The acts">
          <a href="#act-02">Time</a>
          <a href="#act-04">Payroll</a>
          <a href="#act-05">Validation</a>
          <a href="#act-06">Payslip</a>
        </nav>

        <div className="lp-chrome__actions">
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
          <Button variant="primary" size="sm" iconAfter={<ArrowRight size={16} />} onClick={enter}>
            Sign in
          </Button>
        </div>
      </header>

      <main className="lp-main">
        <Act00Hero onEnter={enter} />
        <Act01People />
        <Act02Time />
        <Act03Leave />
        <Act04Payroll onWhy={openWhy} />
        <Act05Validation />
        <Act06Payslip onWhy={openWhy} />
        <Act07Close onEnter={enter} />
      </main>

      <footer className="lp-foot">
        <p className="t-ui-sm">
          Every figure on this page is computed from the demo dataset by the same payroll engine the
          product runs — {person.name}, {period.label}.
        </p>
        <p className="t-ui-sm lp-foot__marks">PayPulse · People. Time. Pay.</p>
      </footer>

      {/*
        The product's derivation drawer, on the product's tree. It is the same
        answer the reader would get inside the application, which is the entire
        argument the page has been making for eight acts.
      */}
      <Suspense fallback={null}>
        <ProvenanceDrawer
          open={why !== null}
          onClose={() => setWhy(null)}
          tree={why}
          subject={`${person.name} · ${period.label}`}
        />
      </Suspense>
    </div>
  );
}

export default Landing;
