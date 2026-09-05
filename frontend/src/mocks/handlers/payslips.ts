/**
 * PAYSLIPS — list, detail, recompute, and the PDF.
 *
 * `GET /payslips/{id}/pdf` returns a **real `application/pdf` body**, not JSON
 * and not a 501. It is a minimal one-page document written by hand below, and
 * it exists because the download path is the part of P11 that breaks in ways
 * nothing else catches: a `Content-Type` the browser will not preview, a blob
 * URL nobody revokes, a filename that arrives as `download.pdf`. Those are
 * only findable against something that actually opens in a viewer.
 *
 * The generated file is deliberately plain. B8 owns the designed payslip; this
 * is a stand-in with the right headers and the right name.
 */
import { http, HttpResponse } from "msw";
import { byId, db } from "../db";
import {
  Refused, auth, conflict, descBy, idOf, notFound, ok, ownScopeId, paginate, query,
  route, settle, sortBy,
} from "../http";
import { recomputePayslip } from "../payrollRun";
import { monthLabel, monthOf } from "../seed/calendar";

const linesOf = (payslipId: number) =>
  sortBy(db.payslipLines.filter((l) => l.payslip_id === payslipId), (l) => l.sequence);

/**
 * §4.7: a rule with `appears_on_payslip: false` still computes — it just does
 * not print. The lookup is by `rule_code` because lines are denormalised, so a
 * rule deleted since does not hide its own history: an unknown code prints.
 */
const printableLines = (payslipId: number) =>
  linesOf(payslipId).filter(
    (l) => db.salaryRules.find((r) => r.code === l.rule_code)?.appears_on_payslip !== false,
  );

const warningsOf = (payslipId: number) =>
  db.payrollWarnings.filter((w) => w.payslip_id === payslipId);

/* ── The PDF ─────────────────────────────────────────────────────────── */

/** PDF strings escape three characters, and forgetting them corrupts the file. */
const pdfText = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);

/**
 * A single-page PDF, assembled by hand: header, object table, xref, trailer.
 * Roughly two kilobytes and no dependency — pulling a PDF library into the
 * bundle to stand in for an endpoint the backend will own is the wrong trade.
 */
function buildPdf(lines: string[]): Blob {
  const content = [
    "BT",
    "/F1 16 Tf",
    "56 780 Td",
    `(${pdfText(lines[0] ?? "Payslip")}) Tj`,
    "/F1 10 Tf",
    "0 -28 Td",
    ...lines.slice(1).flatMap((line) => [`(${pdfText(line)}) Tj`, "0 -15 Td"]),
    "ET",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] " +
      "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

export const payslipHandlers = [
  http.get(route("/payslips"), async ({ request }) => {
    await settle();
    const user = auth(request, "payslip", "read");
    if (user instanceof Refused) return user.response;

    const url = new URL(request.url);
    const q = query(url);
    const own = ownScopeId(user);
    const employeeId = own ?? q.num("employee_id");
    const payrunId = q.num("payrun_id");
    const state = q.get("state");
    const period = q.get("period");

    const rows = db.payslips.filter(
      (p) =>
        (employeeId === undefined || p.employee_id === employeeId) &&
        (payrunId === undefined || p.payrun_id === payrunId) &&
        (state === undefined || p.state === state) &&
        (period === undefined || monthOf(p.period_end) === period),
    );

    return ok(paginate(descBy(rows, (p) => `${p.period_start}#${p.employee_name}`), url));
  }),

  /**
   * Registered before `/payslips/:id`, or `:id` swallows the `/pdf` suffix on
   * some matchers. Cheap to get right, expensive to debug.
   */
  http.get(route("/payslips/:id/pdf"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "payslip", "read");
    if (user instanceof Refused) return user.response;

    const row = byId(db.payslips, idOf(params));
    if (!row) return notFound("That payslip");

    const own = ownScopeId(user);
    if (own !== null && row.employee_id !== own) return notFound("That payslip");

    const body = buildPdf([
      `Payslip · ${row.employee_name}`,
      `${monthLabel(monthOf(row.period_end))} · ${row.period_start} to ${row.period_end}`,
      `Employee ${row.employee_number}${row.department_name ? ` · ${row.department_name}` : ""}`,
      "",
      ...printableLines(row.id).map(
        (l) => `${l.name.padEnd(28, " ")} ${row.currency} ${l.amount}`,
      ),
      "",
      `Gross ${row.currency} ${row.gross}`,
      `Deductions ${row.currency} ${row.total_deductions}`,
      `Net pay ${row.currency} ${row.net}`,
      "",
      "Income Tax (simplified) is demo content, not statutory tax.",
      "Confidential — for the named employee only.",
    ]);

    const filename = `payslip-${row.employee_number}-${monthOf(row.period_end)}.pdf`;
    return new HttpResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        // `inline` so the viewer can preview it; the filename still applies to
        // a Save. A wrong disposition here is the classic "download.pdf" bug.
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  }),

  http.get(route("/payslips/:id"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "payslip", "read");
    if (user instanceof Refused) return user.response;

    const row = byId(db.payslips, idOf(params));
    if (!row) return notFound("That payslip");

    const own = ownScopeId(user);
    if (own !== null && row.employee_id !== own) return notFound("That payslip");

    return ok({
      ...row,
      lines: printableLines(row.id),
      contract: row.contract_id === null ? null : (byId(db.contracts, row.contract_id) ?? null),
      warnings: warningsOf(row.id),
    });
  }),

  /**
   * §5: **409 unless the payrun is DRAFT or COMPUTED.** A validated or paid
   * payslip is a document that has been signed off and, in the paid case,
   * money that has moved — v1 had no state guard here and could rewrite one.
   */
  http.post(route("/payslips/:id/recompute"), async ({ request, params }) => {
    await settle();
    const user = auth(request, "payslip", "update");
    if (user instanceof Refused) return user.response;

    const row = byId(db.payslips, idOf(params));
    if (!row) return notFound("That payslip");

    const payrun = byId(db.payruns, row.payrun_id);
    if (!payrun) return notFound("That payrun");
    if (!["DRAFT", "COMPUTED"].includes(payrun.state)) {
      return conflict(
        `This payslip belongs to a ${payrun.state.toLowerCase()} payrun and cannot be recomputed. ` +
          `Reopen the run first.`,
      );
    }

    const updated = recomputePayslip(row);
    if (!updated) {
      return conflict("There is no contract covering this period any more — recompute the run.");
    }

    return ok({
      ...updated,
      lines: printableLines(updated.id),
      contract: updated.contract_id === null ? null : (byId(db.contracts, updated.contract_id) ?? null),
      warnings: warningsOf(updated.id),
    });
  }),
];
