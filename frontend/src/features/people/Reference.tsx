/**
 * DEPARTMENTS AND JOB POSITIONS — the two reference tables People depends on.
 *
 * They share a screen because they are the same shape of decision (a short
 * name, a count, and nothing else) and because neither is worth a nav item.
 * The counts are **derived server-side** from the employees pointing at each
 * row, so a rename or a move cannot leave a stale number behind — this screen
 * never adds them up itself.
 */
import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { Department, JobPosition } from "@/api/contract";
import { useQuery, useSubmission } from "@/api/useQuery";
import { useAuth } from "@/auth/AuthContext";
import { PageHeader } from "@/app/Shell";
import {
  Button, Drawer, EmptyState, Field, Select, Table, useToast, type Column,
} from "@/components/system";
import {
  createDepartment, createJobPosition, listDepartments, listJobPositions, updateDepartment,
  updateJobPosition,
} from "./api";
import { LoadFailure } from "@/features/shared";

export function Reference() {
  const { can } = useAuth();
  const departments = useQuery(() => listDepartments(), []);
  const positions = useQuery(() => listJobPositions(), []);

  const [editingDept, setEditingDept] = useState<Department | "new">();
  const [editingRole, setEditingRole] = useState<JobPosition | "new">();

  const deptRows = departments.data ?? [];
  const roleRows = positions.data ?? [];

  const deptColumns: Column<Department>[] = useMemo(
    () => [
      { id: "name", header: "Department", accessorFn: (d) => d.name },
      { id: "code", header: "Code", accessorFn: (d) => d.code },
      {
        id: "count",
        header: "People",
        accessorFn: (d) => d.employee_count,
        meta: { numeric: true },
      },
    ],
    [],
  );

  const roleColumns: Column<JobPosition>[] = useMemo(
    () => [
      { id: "title", header: "Position", accessorFn: (p) => p.title },
      {
        id: "department",
        header: "Department",
        accessorFn: (p) => deptRows.find((d) => d.id === p.department_id)?.name ?? "—",
      },
      {
        id: "count",
        header: "People",
        accessorFn: (p) => p.employee_count,
        meta: { numeric: true },
      },
    ],
    [deptRows],
  );

  const editable = can("department", "update");

  return (
    <>
      <PageHeader
        title="Departments and positions"
        meta="The reference data every employee record points at."
      />

      <div className="pp-ref">
        <section>
          <div className="pp-ref__head">
            <h2 className="t-h3">Departments</h2>
            {can("department", "create") && (
              <Button
                size="sm"
                variant="quiet"
                icon={<Plus size={16} />}
                style={{ marginLeft: "auto" }}
                onClick={() => setEditingDept("new")}
              >
                New
              </Button>
            )}
          </div>
          {departments.state === "error" ? (
            <LoadFailure what="Departments" error={departments.error} onRetry={departments.reload} />
          ) : (
            <Table
              caption="Departments"
              data={deptRows}
              columns={deptColumns}
              density="compact"
              getRowId={(d) => String(d.id)}
              loading={departments.initial}
              onRowClick={editable ? (d) => setEditingDept(d) : undefined}
              empty={
                <EmptyState
                  title="No departments"
                  body="Departments group the Kanban board and scope a manager's team. Add the first one."
                />
              }
            />
          )}
        </section>

        <section>
          <div className="pp-ref__head">
            <h2 className="t-h3">Job positions</h2>
            {can("job_position", "create") && (
              <Button
                size="sm"
                variant="quiet"
                icon={<Plus size={16} />}
                style={{ marginLeft: "auto" }}
                onClick={() => setEditingRole("new")}
              >
                New
              </Button>
            )}
          </div>
          {positions.state === "error" ? (
            <LoadFailure what="Job positions" error={positions.error} onRetry={positions.reload} />
          ) : (
            <Table
              caption="Job positions"
              data={roleRows}
              columns={roleColumns}
              density="compact"
              getRowId={(p) => String(p.id)}
              loading={positions.initial}
              onRowClick={can("job_position", "update") ? (p) => setEditingRole(p) : undefined}
              empty={
                <EmptyState
                  title="No job positions"
                  body="A position is the title that appears on an employee card and a contract."
                />
              }
            />
          )}
        </section>
      </div>

      <DepartmentDrawer
        subject={editingDept}
        onClose={() => setEditingDept(undefined)}
        onSaved={() => {
          departments.reload();
          positions.reload();
        }}
      />
      <PositionDrawer
        subject={editingRole}
        departments={deptRows}
        onClose={() => setEditingRole(undefined)}
        onSaved={() => positions.reload()}
      />
    </>
  );
}

/* ── Drawers ──────────────────────────────────────────────────────────── */

function DepartmentDrawer({
  subject,
  onClose,
  onSaved,
}: {
  subject: Department | "new" | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = subject === "new" ? undefined : subject;
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const { busy, fields, message, submit, reset } = useSubmission();
  const toast = useToast();

  // Seeded from the subject rather than defaulted on the input: an untouched
  // field must still submit the value the row already has, not an empty one.
  useEffect(() => {
    if (subject === undefined) return;
    setName(existing?.name ?? "");
    setCode("");
    reset();
  }, [subject, existing, reset]);

  async function save() {
    const ok = await submit(async () => {
      if (existing) await updateDepartment(existing.id, { name: name.trim() });
      else await createDepartment({ name: name.trim(), code: code.trim().toUpperCase() });
      onSaved();
    });
    if (ok) {
      toast(existing ? "Department renamed." : "Department added.", "jade");
      onClose();
    }
  }

  return (
    <Drawer
      open={subject !== undefined}
      onClose={onClose}
      title={existing ? `Edit ${existing.name}` : "New department"}
      footer={
        <div style={{ display: "flex", gap: "var(--s-3)", marginLeft: "auto" }}>
          <Button variant="quiet" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>Save</Button>
        </div>
      }
    >
      <div className="pp-form">
        {message && <p className="pp-form__error t-ui-sm" role="alert">{message}</p>}
        <Field
          label="Name"
          required
          value={name}
          error={fields.name}
          onChange={(e) => setName(e.target.value)}
        />
        {/* The code identifies the department downstream, so it is set once. */}
        {!existing && (
          <Field
            label="Code"
            required
            value={code}
            error={fields.code}
            help="Two to six capital letters. It cannot be changed later."
            style={{ textTransform: "uppercase" }}
            onChange={(e) => setCode(e.target.value)}
          />
        )}
      </div>
    </Drawer>
  );
}

function PositionDrawer({
  subject,
  departments,
  onClose,
  onSaved,
}: {
  subject: JobPosition | "new" | undefined;
  departments: Department[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = subject === "new" ? undefined : subject;
  const [title, setTitle] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const { busy, fields, message, submit, reset } = useSubmission();
  const toast = useToast();

  useEffect(() => {
    if (subject === undefined) return;
    setTitle(existing?.title ?? "");
    setDepartmentId(
      existing?.department_id === null || existing === undefined ? "" : String(existing.department_id),
    );
    reset();
  }, [subject, existing, reset]);

  async function save() {
    const patch = {
      title: title.trim(),
      department_id: departmentId === "" ? null : Number(departmentId),
    };
    const ok = await submit(async () => {
      if (existing) await updateJobPosition(existing.id, patch);
      else await createJobPosition(patch);
      onSaved();
    });
    if (ok) {
      toast(existing ? "Position updated." : "Position added.", "jade");
      onClose();
    }
  }

  return (
    <Drawer
      open={subject !== undefined}
      onClose={onClose}
      title={existing ? `Edit ${existing.title}` : "New job position"}
      footer={
        <div style={{ display: "flex", gap: "var(--s-3)", marginLeft: "auto" }}>
          <Button variant="quiet" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>Save</Button>
        </div>
      }
    >
      <div className="pp-form">
        {message && <p className="pp-form__error t-ui-sm" role="alert">{message}</p>}
        <Field
          label="Title"
          required
          value={title}
          error={fields.title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Select
          label="Department"
          value={departmentId}
          error={fields.department_id}
          options={[
            { value: "", label: "No department" },
            ...departments.map((d) => ({ value: String(d.id), label: d.name })),
          ]}
          onChange={(e) => setDepartmentId(e.target.value)}
        />
      </div>
    </Drawer>
  );
}
