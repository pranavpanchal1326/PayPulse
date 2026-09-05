/**
 * ⌘K · blueprint §09.7
 *
 * Three sections: Go to · Do · Ask.
 *
 * **Ask** is the differentiator. Typing `why is aarav net 47842` must not do a
 * text search — a question about a number is the product's core promise, so it
 * routes into the provenance drawer. That drawer lands in P4; until then the
 * intent is detected and the route is stubbed, so the behaviour is designed in
 * from the start rather than bolted on.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, HelpCircle, Search, Zap } from "lucide-react";
import { modalVariants, scrimVariants } from "@/motion/variants";
import { useAuth } from "@/auth/AuthContext";
import { navFor } from "./nav";

interface Entry {
  id: string;
  section: "Go to" | "Do" | "Ask";
  label: string;
  hint?: string;
  run: () => void;
}

/** A question about a figure, rather than a search for text. */
const QUESTION = /^(why|how|what)\b|\bwhy is\b/i;

export function CommandMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    // Focus immediately, with a timeout fallback: requestAnimationFrame is
    // paused in a background tab, and a menu that opens unfocused is unusable
    // for anyone driving it from the keyboard.
    inputRef.current?.focus();
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      clearTimeout(id);
      returnTo.current?.focus?.();
    };
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    if (!user) return [];
    const go: Entry[] = navFor(user.role).map((n) => ({
      id: `go:${n.to}`,
      section: "Go to",
      label: n.label,
      run: () => navigate(n.to),
    }));

    const does: Entry[] = [];
    if (can("payrun", "create"))
      does.push({ id: "do:payrun", section: "Do", label: "New payrun", hint: "Wizard step 1", run: () => navigate("/payroll/new") });
    if (can("employee", "create"))
      does.push({ id: "do:employee", section: "Do", label: "Add employee", run: () => navigate("/people/new") });
    if (can("time_off_request", "create"))
      does.push({ id: "do:leave", section: "Do", label: "Request time off", run: () => navigate("/leave/new") });

    const ask: Entry[] =
      query.trim() && QUESTION.test(query.trim())
        ? [{
            id: "ask:provenance",
            section: "Ask",
            label: query.trim(),
            hint: "Trace this number to its records",
            run: () => navigate(`/why?q=${encodeURIComponent(query.trim())}`),
          }]
        : [];

    return [...ask, ...go, ...does];
  }, [user, can, navigate, query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) => e.section === "Ask" || e.label.toLowerCase().includes(q),
    );
  }, [entries, query]);

  useEffect(() => setActive(0), [query]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % Math.max(filtered.length, 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + filtered.length) % Math.max(filtered.length, 1)); }
    if (e.key === "Enter") {
      e.preventDefault();
      const entry = filtered[active];
      if (entry) { entry.run(); onClose(); }
    }
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }

  let lastSection = "";

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="pp-scrim"
            variants={scrimVariants}
            initial="hidden" animate="visible" exit="exit"
            onClick={onClose}
          />
          <div className="pp-cmd-layer">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Command menu"
              className="pp-cmd"
              variants={modalVariants}
              initial="hidden" animate="visible" exit="exit"
            >
              <div className="pp-cmd__search">
                <Search size={16} aria-hidden="true" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Go to, do, or ask why a number is what it is"
                  aria-label="Command"
                  aria-activedescendant={filtered[active] ? `cmd-${filtered[active].id}` : undefined}
                  aria-controls="cmd-list"
                />
              </div>

              <ul id="cmd-list" role="listbox" aria-label="Commands" className="pp-cmd__list">
                {filtered.length === 0 && (
                  <li className="pp-cmd__empty t-ui-sm">Nothing matches that.</li>
                )}
                {filtered.map((e, i) => {
                  const header = e.section !== lastSection ? (lastSection = e.section) : null;
                  return (
                    <li key={e.id}>
                      {header && <p className="pp-cmd__section t-micro">{header}</p>}
                      <button
                        id={`cmd-${e.id}`}
                        role="option"
                        type="button"
                        aria-selected={i === active}
                        data-active={i === active}
                        className="pp-cmd__item"
                        onMouseEnter={() => setActive(i)}
                        onClick={() => { e.run(); onClose(); }}
                      >
                        {e.section === "Ask" ? <HelpCircle size={16} /> : e.section === "Do" ? <Zap size={16} /> : <ArrowRight size={16} />}
                        <span className="pp-cmd__label">{e.label}</span>
                        {e.hint && <span className="pp-cmd__hint t-ui-sm">{e.hint}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
