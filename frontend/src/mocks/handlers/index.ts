/**
 * EVERY PRD §5 ENDPOINT, IN ONE ARRAY.
 *
 * **Order matters.** MSW matches in registration order, and a pattern like
 * `/payruns/:id` will happily match `/payruns/eligible-employees`. Each module
 * puts its literal routes above its parameterised ones; this file preserves
 * that by never re-sorting the arrays it concatenates.
 *
 * `onUnhandledRequest: "warn"` in `browser.ts` is the safety net: a call this
 * list does not cover says so in the console rather than falling through to a
 * backend that has not built it yet and failing as a network error.
 */
import { attendanceHandlers } from "./attendance";
import { authHandlers } from "./auth";
import { contractHandlers } from "./contracts";
import { dashboardHandlers } from "./dashboard";
import { payrollConfigHandlers } from "./payrollConfig";
import { payrunHandlers } from "./payruns";
import { payslipHandlers } from "./payslips";
import { peopleHandlers } from "./people";
import { timeOffHandlers } from "./timeOff";

export const handlers = [
  ...authHandlers,
  ...peopleHandlers,
  ...contractHandlers,
  ...attendanceHandlers,
  ...timeOffHandlers,
  ...payrollConfigHandlers,
  ...payrunHandlers,
  ...payslipHandlers,
  ...dashboardHandlers,
];
