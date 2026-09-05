/**
 * Money is handled as an integer number of paise, never a float.
 *
 * This previews the discipline P2 formalises: the API serialises money as a
 * decimal *string*, and `parseFloat` on it is a defect. Rendering is the only
 * place a money value becomes characters.
 */
const GROUP = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function Money({ paise, hero = false }: { paise: number; hero?: boolean }) {
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.trunc(abs / 100);
  const decimals = String(abs % 100).padStart(2, "0");

  return (
    <span className={negative ? "n-neg" : undefined} style={{ whiteSpace: "nowrap" }}>
      {negative && "−"}
      <span className="n-cur">₹</span>
      {GROUP.format(rupees)}
      <span className="n-dec">.{decimals}</span>
      {hero && <span className="sr-only"> rupees</span>}
    </span>
  );
}
