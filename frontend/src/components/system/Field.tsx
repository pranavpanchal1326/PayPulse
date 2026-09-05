import { forwardRef, useId } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "./cx";

interface FieldShellProps {
  label: string;
  required?: boolean;
  /** Populated from the API envelope's `field_errors` (§09.3). */
  error?: string;
  help?: string;
  className?: string;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
}

/**
 * The label sits ABOVE, never floating inside — floating labels are unreadable
 * at density and break tabular alignment.
 */
export function FieldShell({
  label,
  required,
  error,
  help,
  className,
  children,
}: FieldShellProps) {
  const id = useId();
  const msgId = `${id}-msg`;
  const message = error ?? help;

  return (
    <div className={cx("pp-field", error && "pp-field--error", className)}>
      <label className="pp-field__label" htmlFor={id}>
        {label}
        {/* Required is not an error, so it is orange (§09.3). */}
        {required && (
          <span className="pp-field__req" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children({ id, describedBy: message ? msgId : undefined, invalid: !!error })}
      {message && (
        <p className="pp-field__help" id={msgId} role={error ? "alert" : undefined}>
          {message}
        </p>
      )}
    </div>
  );
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> &
  Omit<FieldShellProps, "children">;

export const Field = forwardRef<HTMLInputElement, InputProps>(function Field(
  { label, required, error, help, className, ...rest },
  ref,
) {
  return (
    <FieldShell label={label} required={required} error={error} help={help} className={className}>
      {({ id, describedBy, invalid }) => (
        <input
          ref={ref}
          id={id}
          className="pp-input"
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          {...rest}
        />
      )}
    </FieldShell>
  );
});

type TextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> &
  Omit<FieldShellProps, "children">;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ label, required, error, help, className, ...rest }, ref) {
    return (
      <FieldShell label={label} required={required} error={error} help={help} className={className}>
        {({ id, describedBy, invalid }) => (
          <textarea
            ref={ref}
            id={id}
            className="pp-input"
            required={required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            {...rest}
          />
        )}
      </FieldShell>
    );
  },
);

type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "id"> &
  Omit<FieldShellProps, "children"> & { options: Array<{ value: string; label: string }> };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, required, error, help, className, options, ...rest },
  ref,
) {
  return (
    <FieldShell label={label} required={required} error={error} help={help} className={className}>
      {({ id, describedBy, invalid }) => (
        <span className="pp-select-wrap">
          <select
            ref={ref}
            id={id}
            className="pp-input"
            required={required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            {...rest}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </span>
      )}
    </FieldShell>
  );
});
