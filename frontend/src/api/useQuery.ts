/**
 * THE FETCHING PRIMITIVE
 *
 * P5 is the first phase that reads a list, a detail and a summary on one
 * screen, so it is where the "loading / empty / filtered-empty / error"
 * matrix stops being a per-component invention. This is deliberately not a
 * cache — it is one `useEffect`, one abort flag, and a `reload()`.
 *
 * **Why not TanStack Query.** The screens re-read on navigation and after a
 * write, and nothing in the product shows the same list twice at once. A
 * cache would buy staleness handling we do not need and cost a
 * dependency plus an invalidation vocabulary in every feature.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, messageFor } from "./errors";

export type QueryState = "loading" | "ready" | "error";

export interface Query<T> {
  data: T | undefined;
  error: unknown;
  state: QueryState;
  /** True only on the FIRST load — a refetch keeps the old data on screen. */
  initial: boolean;
  reload: () => void;
}

/**
 * `deps` decides identity. It is spread into the effect's dependency list, so
 * a filter change refetches and nothing else does.
 */
export function useQuery<T>(fetcher: () => Promise<T>, deps: unknown[]): Query<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [state, setState] = useState<QueryState>("loading");
  const [nonce, setNonce] = useState(0);
  const seen = useRef(false);

  // The fetcher is a fresh closure on every render; holding it in a ref keeps
  // it out of the dependency list, so only `deps` can trigger a refetch.
  const run = useRef(fetcher);
  run.current = fetcher;

  useEffect(() => {
    let live = true;
    setState("loading");
    run
      .current()
      .then((result) => {
        if (!live) return;
        seen.current = true;
        setData(result);
        setError(undefined);
        setState("ready");
      })
      .catch((cause) => {
        if (!live) return;
        setError(cause);
        setState("error");
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, state, initial: state === "loading" && !seen.current, reload };
}

export interface Submission {
  busy: boolean;
  /** Field errors from a 422, keyed for `<Field error=…>`. */
  fields: Record<string, string>;
  /** Everything that is not field-level. */
  message: string | undefined;
  submit: (run: () => Promise<void>) => Promise<boolean>;
  reset: () => void;
}

/**
 * Form submission with the envelope already unpacked. §09.3 — validation
 * renders **on the field**; only the rest is allowed to become a banner or a
 * toast, and the caller decides which.
 */
export function useSubmission(): Submission {
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string>();

  const reset = useCallback(() => {
    setFields({});
    setMessage(undefined);
  }, []);

  const submit = useCallback(async (run: () => Promise<void>) => {
    setBusy(true);
    setFields({});
    setMessage(undefined);
    try {
      await run();
      return true;
    } catch (cause) {
      if (cause instanceof ApiError && cause.isValidation) setFields(cause.byField);
      else setMessage(messageFor(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, fields, message, submit, reset };
}
