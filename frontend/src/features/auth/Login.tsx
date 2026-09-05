/**
 * S1 · LOGIN
 *
 * Blueprint §12: flush charcoal field, split 5/7. Left carries the wordmark
 * and one line of copy; right holds a raised clay-4 card floating in the dark.
 * The only fully centred screen in the app.
 */
import { useEffect, useState } from "react";
import { ApiError } from "@/api/errors";
import { useAuth } from "@/auth/AuthContext";
import { Button, Field } from "@/components/system";

export function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  /**
   * Seconds left on a 429. Its own piece of state, separate from `formError`,
   * because it is not an error the user can fix by editing the form — it is a
   * wait. It disables the button, so it must be able to expire on its own.
   */
  const [lockedFor, setLockedFor] = useState(0);

  // Counts the block down and re-enables the form when it lapses. The backend
  // is still the authority; this only stops us from firing attempts we already
  // know will be refused.
  useEffect(() => {
    if (lockedFor <= 0) return;
    const id = setInterval(() => setLockedFor((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(id);
  }, [lockedFor > 0]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    setFieldErrors({});
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      if (err instanceof ApiError && err.isValidation) {
        // 422 → straight onto the fields, never a toast.
        setFieldErrors(err.byField);
      } else if (err instanceof ApiError && err.isRateLimited) {
        // 429 is not a credentials failure and must not read like one. The
        // message already carries the wait ("Try again in N second(s)."), so
        // it is surfaced verbatim and the same N drives the countdown.
        setFormError(err.message);
        setLockedFor(err.retryAfterSeconds ?? 60);
      } else if (err instanceof ApiError) {
        // The backend returns one message for unknown-user and wrong-password
        // alike, so the form cannot be used to enumerate accounts. Show it
        // verbatim rather than inventing a friendlier one.
        setFormError(err.message);
      } else {
        setFormError("Could not reach the server.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-theme="dark" className="pp-login">
      <section className="pp-login__brand">
        <p className="t-micro" style={{ color: "var(--ink-400)" }}>PayPulse</p>
        <h1 className="t-display-l" style={{ margin: "var(--s-5) 0 0" }}>
          People.
          <br />
          Time.
          <br />
          Pay.
        </h1>
        <p className="t-body-l" style={{ color: "var(--ink-500)", marginTop: "var(--s-5)", maxWidth: "34ch" }}>
          One system from the first day to the final payslip.
        </p>
      </section>

      <section className="pp-login__panel">
        <form className="clay-4 pp-login__card" onSubmit={onSubmit} noValidate>
          <h2 className="t-h1" style={{ margin: 0 }}>Sign in</h2>
          <p className="t-ui-sm" style={{ color: "var(--ink-400)", marginTop: "var(--s-2)" }}>
            Use your work address.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)", marginTop: "var(--s-6)" }}>
            <Field
              label="Email"
              type="email"
              autoComplete="username"
              autoFocus
              required
              value={email}
              error={fieldErrors.email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Field
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              error={fieldErrors.password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {formError && (
            <p
              role="alert"
              className="t-ui-sm pp-login__error"
            >
              {formError}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={busy}
            disabled={!email || !password || lockedFor > 0}
            style={{ width: "100%", marginTop: "var(--s-6)" }}
          >
            {lockedFor > 0 ? `Try again in ${lockedFor}s` : "Sign in"}
          </Button>
        </form>
      </section>
    </div>
  );
}
