export function Section({
  n,
  title,
  note,
  children,
}: {
  n: string;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ padding: "var(--s-8) 0" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 5fr) minmax(0, 7fr)",
          gap: "var(--s-7)",
          alignItems: "start",
          marginBottom: "var(--s-6)",
        }}
      >
        <div>
          <span className="t-micro" style={{ color: "var(--ink-400)" }}>
            {n}
          </span>
          <h2 className="t-h1" style={{ margin: "var(--s-2) 0 0" }}>
            {title}
          </h2>
        </div>
        {note && (
          <p className="t-body" style={{ color: "var(--ink-500)", margin: 0, maxWidth: "62ch" }}>
            {note}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}
