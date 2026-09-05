import { forwardRef } from "react";
import { useSound } from "@/sound/useSound";
import { cx } from "./cx";

type Variant = "primary" | "secondary" | "quiet" | "danger" | "key";
type Size = "sm" | "md" | "lg" | "xl";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** 16px icon. Never larger than the label (§09.1). */
  icon?: React.ReactNode;
  iconAfter?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    icon,
    iconAfter,
    disabled,
    className,
    children,
    onClick,
    ...rest
  },
  ref,
) {
  const play = useSound();

  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "pp-btn",
        `pp-btn--${variant}`,
        `pp-btn--${size}`,
        loading && "pp-btn--loading",
        className,
      )}
      onClick={(e) => {
        play("press");
        onClick?.(e);
      }}
      {...rest}
    >
      {icon}
      <span className={cx(loading && "pp-btn__label--loading")}>{children}</span>
      {iconAfter}
      {loading && (
        <span className="pp-btn__dots" aria-hidden="true">
          <i /><i /><i />
        </span>
      )}
    </button>
  );
});

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required — an icon-only control must name itself (§15). */
  label: string;
  size?: "sm" | "md";
  quiet?: boolean;
  children: React.ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { label, size = "md", quiet, className, children, onClick, ...rest },
    ref,
  ) {
    const play = useSound();
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={cx(
          "pp-iconbtn",
          size === "sm" && "pp-iconbtn--sm",
          quiet && "pp-iconbtn--quiet",
          className,
        )}
        onClick={(e) => {
          play("press");
          onClick?.(e);
        }}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
