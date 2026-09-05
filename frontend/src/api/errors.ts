/**
 * THE ERROR ENVELOPE
 *
 * Every failure from the API is `{code, message, field_errors[]}` — see
 * `backend/app/core/errors.py`. `code` is stable, so it is mapped to a message
 * once, here, and never re-invented at a call site.
 */

export interface FieldError {
  field: string;
  message: string;
}

export interface ErrorEnvelope {
  code: string;
  message: string;
  field_errors: FieldError[];
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fieldErrors: FieldError[];

  constructor(status: number, envelope: ErrorEnvelope) {
    super(envelope.message);
    this.name = "ApiError";
    this.status = status;
    this.code = envelope.code;
    this.fieldErrors = envelope.field_errors ?? [];
  }

  /** `{ ifsc: "Must match …" }` — ready to hand to react-hook-form. */
  get byField(): Record<string, string> {
    return Object.fromEntries(this.fieldErrors.map((f) => [f.field, f.message]));
  }

  get isAuth() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
  /** Field-level; belongs on the form, not in a toast. */
  get isValidation() {
    return this.status === 422 && this.fieldErrors.length > 0;
  }
  /**
   * Failed logins are throttled 5/minute on the email *and* the source IP.
   * Its own case, not a generic failure: the caller must say "wait", not
   * "wrong password", or the user retypes a correct password into a wall.
   */
  get isRateLimited() {
    return this.status === 429;
  }

  /**
   * The backend writes the wait into the message — "Try again in 43
   * second(s)." — and that is the only place it appears, so it is read back
   * out here rather than guessed. `undefined` when the wording changes; a
   * caller must cope with not knowing.
   */
  get retryAfterSeconds(): number | undefined {
    const n = /in (\d+) second/.exec(this.message)?.[1];
    return n ? Number(n) : undefined;
  }
}

/** Thrown when the network never reached the API at all. */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super("Could not reach the server.");
    this.name = "NetworkError";
    this.cause = cause;
  }
}

/**
 * Codes worth phrasing ourselves. Anything absent falls through to the API's
 * own `message`, which is already written for humans — so this map stays
 * small on purpose rather than duplicating the backend.
 *
 * `rate_limited` is absent on purpose: its message carries the remaining
 * seconds, which no fixed string here could reproduce.
 */
const MESSAGES: Record<string, string> = {
  unauthenticated: "Your session has ended. Sign in again.",
  permission_denied: "Your role does not allow that.",
  not_found: "That record no longer exists.",
  conflict: "That change collides with an existing record.",
  validation_error: "Some fields need attention.",
  business_rule_violated: "That would break a payroll rule.",
  http_error: "Something went wrong.",
};

export function messageFor(error: unknown): string {
  if (error instanceof ApiError) return MESSAGES[error.code] ?? error.message;
  if (error instanceof NetworkError) return error.message;
  return "Something went wrong.";
}

/** Validation belongs on the fields; everything else is a toast. */
export function shouldToast(error: unknown): boolean {
  return !(error instanceof ApiError && error.isValidation);
}
