import { useRef } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Well } from "./Surfaces";
import { cx } from "./cx";

export type Density = "compact" | "default" | "comfortable";

const ROW_H: Record<Density, number> = { compact: 36, default: 44, comfortable: 52 };

/**
 * Add `meta: { numeric: true }` to a column to right- and decimal-align it.
 * Every money column must set it.
 */
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends unknown, TValue> {
    numeric?: boolean;
  }
}

/**
 * TanStack types column arrays as invariant in the value parameter, so its own
 * public signature uses `any` here. Aliased once rather than leaking through
 * every feature's column definitions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Column<T> = ColumnDef<T, any>;

export interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  density?: Density;
  sorting?: SortingState;
  onSortingChange?: (s: SortingState) => void;
  /** Row id of the current selection. */
  selectedId?: string;
  getRowId?: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  /** Rendered inside the well, so the page never collapses (§09.2). */
  empty?: React.ReactNode;
  /** Above this many rows the body virtualises. */
  virtualizeFrom?: number;
  maxHeight?: number;
  caption: string;
}

export function Table<T>({
  data,
  columns,
  density = "default",
  sorting,
  onSortingChange,
  selectedId,
  getRowId,
  onRowClick,
  loading = false,
  empty,
  virtualizeFrom = 60,
  maxHeight = 560,
  caption,
}: TableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const table = useReactTable({
    data,
    columns,
    state: sorting ? { sorting } : undefined,
    onSortingChange: onSortingChange
      ? (u) => onSortingChange(typeof u === "function" ? u(sorting ?? []) : u)
      : undefined,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;
  const virtualize = rows.length > virtualizeFrom;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H[density],
    overscan: 12,
    enabled: virtualize,
  });

  const items = virtualize ? virtualizer.getVirtualItems() : null;
  const padTop = items?.length ? items[0].start : 0;
  const padBottom = items?.length
    ? virtualizer.getTotalSize() - items[items.length - 1].end
    : 0;

  const colCount = table.getAllLeafColumns().length;

  return (
    <Well className="pp-table-well">
      <div
        ref={scrollRef}
        style={{ maxHeight, overflow: "auto" }}
      >
        <table
          className={cx("pp-table", density !== "default" && `pp-table--${density}`)}
        >
          <caption className="sr-only">{caption}</caption>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sortable = h.column.getCanSort() && !!onSortingChange;
                  const dir = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      className={cx(h.column.columnDef.meta?.numeric && "pp-num")}
                      aria-sort={
                        dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined
                      }
                    >
                      {sortable ? (
                        <button
                          type="button"
                          className="focusable"
                          style={{ font: "inherit", letterSpacing: "inherit", textTransform: "inherit", color: "inherit", cursor: "pointer" }}
                          onClick={h.column.getToggleSortingHandler()}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {dir === "asc" ? " ↑" : dir === "desc" ? " ↓" : ""}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`s${i}`} style={{ height: ROW_H[density] }}>
                  {table.getAllLeafColumns().map((c, j) => (
                    <td key={c.id}>
                      <span
                        className="pp-skel"
                        style={{ width: j === 0 ? "60%" : "40%" }}
                        aria-hidden="true"
                      />
                    </td>
                  ))}
                </tr>
              ))}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={colCount} style={{ borderTop: "none" }}>
                  {empty}
                </td>
              </tr>
            )}

            {!loading && padTop > 0 && <tr style={{ height: padTop }} aria-hidden="true" />}

            {!loading &&
              (items
                ? items.map((vi) => renderRow(rows[vi.index], vi.index))
                : rows.map((r, i) => renderRow(r, i)))}

            {!loading && padBottom > 0 && (
              <tr style={{ height: padBottom }} aria-hidden="true" />
            )}
          </tbody>
        </table>
      </div>
    </Well>
  );

  function renderRow(row: (typeof rows)[number], index: number) {
    const selected = selectedId !== undefined && row.id === selectedId;
    return (
      <tr
        key={row.id}
        aria-selected={selected || undefined}
        aria-rowindex={index + 1}
        tabIndex={onRowClick ? 0 : undefined}
        style={{ height: ROW_H[density] }}
        onClick={onRowClick ? () => onRowClick(row.original) : undefined}
        onKeyDown={
          onRowClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onRowClick(row.original);
                }
              }
            : undefined
        }
      >
        {row.getVisibleCells().map((cell) => (
          <td
            key={cell.id}
            className={cx(cell.column.columnDef.meta?.numeric && "pp-num n-table")}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
      </tr>
    );
  }
}
