import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { drawerVariants, modalVariants, scrimVariants } from "@/motion/variants";
import { useSound } from "@/sound/useSound";
import { IconButton } from "./Button";
import { cx } from "./cx";

/** Esc to close, focus trapped, focus returned to the trigger on close. */
function useDismissable(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement as HTMLElement | null;

    const node = ref.current;
    node?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const focusable = [
        ...node.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      returnTo.current?.focus?.();
    };
  }, [open, onClose]);

  return ref;
}

/**
 * DRAWER · §09.6 — the default detail pattern. Detail lives beside the
 * context, not on top of it, so the scrim stays light.
 */
export function Drawer({
  open,
  onClose,
  title,
  wide,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  wide?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useDismissable(open, onClose);
  const play = useSound();

  useEffect(() => {
    if (open) play("drawer");
  }, [open, play]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="pp-scrim"
            variants={scrimVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cx("pp-drawer", wide && "pp-drawer--wide")}
            variants={drawerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className="pp-drawer__head">
              <h2 className="t-h2" style={{ margin: 0, flex: 1 }}>
                {title}
              </h2>
              <IconButton label="Close" quiet size="sm" onClick={onClose}>
                <X size={16} />
              </IconButton>
            </div>
            <div className="pp-drawer__body">{children}</div>
            {footer && <div className="pp-drawer__head" style={{ borderBottom: "none" }}>{footer}</div>}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * MODAL · reserved for irreversible confirmations that require a typed
 * reason — force-pay, cancel a payrun, delete a rule. Everything else is a
 * Drawer (§09.6).
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const ref = useDismissable(open, onClose);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="pp-scrim"
            variants={scrimVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
          />
          <div className="pp-modal-layer">
            <motion.div
              ref={ref}
              role="alertdialog"
              aria-modal="true"
              aria-label={title}
              className="pp-modal"
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <h2 className="t-h2" style={{ margin: 0 }}>
                {title}
              </h2>
              {description && (
                <p className="t-body" style={{ color: "var(--ink-500)", marginTop: "var(--s-2)" }}>
                  {description}
                </p>
              )}
              {children && <div style={{ marginTop: "var(--s-5)" }}>{children}</div>}
              {footer && (
                <div style={{ display: "flex", gap: "var(--s-2)", justifyContent: "flex-end", marginTop: "var(--s-6)" }}>
                  {footer}
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
