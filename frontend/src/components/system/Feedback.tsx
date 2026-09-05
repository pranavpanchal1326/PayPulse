import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Info, OctagonAlert, X } from "lucide-react";
import { toastVariants, warningVariants } from "@/motion/variants";
import { staggerDelay } from "@/motion/springs";
import { IconButton } from "./Button";
import { cx } from "./cx";

/* ── TOAST · §09.10 ─────────────────────────────────────────────────────────
   Maps from the API error envelope's `code`. NEVER used for anything the user
   can act on — that is a WarningCard, not a toast.                          */

type ToastTone = "neutral" | "jade" | "vermilion";
interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}

const ToastCtx = createContext<(message: string, tone?: ToastTone) => void>(() => {});

export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: ToastTone = "neutral") => {
    const id = Math.random().toString(36).slice(2);
    setItems((xs) => [...xs, { id, message, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div className="pp-toast-layer" role="status" aria-live="polite">
          <AnimatePresence initial={false}>
            {items.map((t) => (
              <motion.div
                key={t.id}
                className="pp-toast"
                variants={toastVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                layout
              >
                <span
                  style={{
                    color:
                      t.tone === "vermilion"
                        ? "var(--vermilion-500)"
                        : t.tone === "jade"
                          ? "var(--jade-500)"
                          : "var(--ink-400)",
                    marginTop: 2,
                  }}
                >
                  {t.tone === "vermilion" ? <OctagonAlert size={16} /> : <Info size={16} />}
                </span>
                <span style={{ flex: 1 }}>{t.message}</span>
                <IconButton
                  label="Dismiss"
                  quiet
                  size="sm"
                  onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}
                >
                  <X size={14} />
                </IconButton>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

/* ── TOOLTIP ─────────────────────────────────────────────────────────────── */

export function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <span
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{ display: "inline-flex" }}
      >
        {children}
      </span>
      <AnimatePresence>
        {open && (
          <motion.span
            id={id}
            role="tooltip"
            className="pp-tooltip"
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ position: "absolute", bottom: "calc(100% + var(--s-2))", left: "50%", translate: "-50% 0" }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/* ── EMPTY STATE · §09.8 ──────────────────────────────────────────────────
   Copy is specific and forward-looking, never apologetic.                  */

export function EmptyState({
  title,
  body,
  action,
  art,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  art?: React.ReactNode;
}) {
  return (
    <div className="pp-empty">
      {art && <div className="pp-empty__art">{art}</div>}
      <h3 className="t-h3" style={{ margin: 0 }}>
        {title}
      </h3>
      <p className="pp-empty__body">{body}</p>
      {action && <div style={{ marginTop: "var(--s-2)" }}>{action}</div>}
    </div>
  );
}

/* ── WARNING CARD · §09.9 ──────────────────────────────────────────────────
   The unit of the triage inbox. Every warning states what it BLOCKS.       */

export type Severity = "error" | "warning" | "info";

const SEV_ICON = { error: OctagonAlert, warning: AlertTriangle, info: Info };
const SEV_INK = {
  error: "var(--vermilion-500)",
  warning: "var(--orange-500)",
  info: "var(--cobalt-500)",
};

export interface WarningProps {
  severity: Severity;
  /** The stable code from the API — shown verbatim so it is searchable. */
  code: string;
  /** Who or what it concerns. */
  detail: string;
  /** What this stops. A warning that stops nothing must say "Informational". */
  blocks: string;
  action?: React.ReactNode;
  index?: number;
}

export function WarningCard({ severity, code, detail, blocks, action, index = 0 }: WarningProps) {
  const Icon = SEV_ICON[severity];
  return (
    <motion.div
      className={cx("pp-warning", `pp-warning--${severity}`)}
      variants={warningVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{ delay: staggerDelay(index) }}
      layout
    >
      <div className="pp-warning__head">
        <span style={{ color: SEV_INK[severity], display: "inline-flex" }} aria-hidden="true">
          <Icon size={16} />
        </span>
        <span className="pp-warning__code">{code}</span>
        <span style={{ marginLeft: "auto" }}>{action}</span>
      </div>
      <p className="pp-warning__who" style={{ margin: 0 }}>
        {detail}
      </p>
      <p className="pp-warning__blocks" style={{ margin: 0 }}>
        {blocks}
      </p>
    </motion.div>
  );
}

/* ── MENU ────────────────────────────────────────────────────────────────── */

export interface MenuItem {
  label: string;
  onSelect: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
}

export function Menu({
  items,
  open,
  onClose,
  align = "right",
}: {
  items: MenuItem[];
  open: boolean;
  onClose: () => void;
  align?: "left" | "right";
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % items.length); }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + items.length) % items.length); }
      if (e.key === "Enter") { e.preventDefault(); items[active]?.onSelect(); onClose(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, items, active, onClose]);

  const style = useMemo(
    () => ({ position: "absolute" as const, top: "calc(100% + var(--s-2))", [align]: 0 }),
    [align],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="pp-menu"
          role="menu"
          style={style}
          initial={{ opacity: 0, y: -4, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
        >
          {items.map((item, i) => (
            <button
              key={item.label}
              role="menuitem"
              type="button"
              data-active={i === active}
              className={cx("pp-menu__item", item.danger && "pp-menu__item--danger")}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                item.onSelect();
                onClose();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
