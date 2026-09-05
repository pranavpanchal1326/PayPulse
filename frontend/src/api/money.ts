/**
 * MONEY
 *
 * The API serialises money as a decimal **string** ("50000.00"), never a
 * float. `parseFloat` on a money value is a defect: 0.1 + 0.2 !== 0.3, and a
 * payslip that fails its own reconciliation invariant on stage is the worst
 * possible bug in this product.
 *
 * So money is carried as an integer number of **paise** (minor units) and only
 * becomes characters at the moment of rendering.
 *
 * `check-tokens` cannot catch a stray parseFloat, so the rule is enforced by
 * this module being the only place a money string is ever parsed.
 */

/** Integer minor units. Branded so a raw number cannot be passed by mistake. */
export type Money = number & { readonly __money: unique symbol };

const MINOR = 100;

/** Parse the API's decimal string. Throws rather than silently producing NaN. */
export function money(value: string | number): Money {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new TypeError(
        `money() received a non-integer number (${value}). Pass the API's ` +
          `decimal string, or an integer count of paise.`,
      );
    }
    return value as Money;
  }

  const raw = value.trim();
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!m) throw new TypeError(`money() could not parse ${JSON.stringify(value)}`);

  const [, sign, whole, frac = ""] = m;
  const minor = Number(whole) * MINOR + Number(frac.padEnd(2, "0"));
  return ((sign === "-" ? -minor : minor) as Money);
}

/** Safe when the field is nullable. */
export const moneyOrNull = (v: string | null | undefined): Money | null =>
  v === null || v === undefined || v === "" ? null : money(v);

/** Back to the wire format the API expects. */
export function toDecimalString(m: Money): string {
  const neg = m < 0;
  const abs = Math.abs(m);
  return `${neg ? "-" : ""}${Math.trunc(abs / MINOR)}.${String(abs % MINOR).padStart(2, "0")}`;
}

/* Arithmetic stays in integer space — that is the whole point. */
export const addMoney = (...xs: Money[]) => xs.reduce((a, b) => a + b, 0) as Money;
export const subMoney = (a: Money, b: Money) => (a - b) as Money;
export const negateMoney = (a: Money) => -a as Money;
export const ZERO = 0 as Money;

/**
 * Indian digit grouping, per the PRD's `en-IN` locale: 47,842 and 1,23,456.
 * Formatter is constructed once — building one per cell is a real cost in a
 * 500-row table.
 */
const GROUP = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export interface MoneyParts {
  negative: boolean;
  /** Grouped whole rupees, e.g. "47,842". */
  whole: string;
  /** Always two digits. */
  decimals: string;
}

export function moneyParts(m: Money): MoneyParts {
  const abs = Math.abs(m);
  return {
    negative: m < 0,
    whole: GROUP.format(Math.trunc(abs / MINOR)),
    decimals: String(abs % MINOR).padStart(2, "0"),
  };
}

/** Plain string, for aria-labels, titles, and CSV. */
export function formatMoney(m: Money, symbol = "₹"): string {
  const p = moneyParts(m);
  return `${p.negative ? "−" : ""}${symbol}${p.whole}.${p.decimals}`;
}
