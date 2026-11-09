import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, startOfWeek } from "@hg/shared";
import { api } from "../api/client";
import type { Employee, ShiftTemplate } from "../api/types2";

interface ShiftView {
  id: string;
  date: string;
  department: string;
  fromTime: string;
  toTime: string;
  note: string | null;
  assignments: { id: string; employee: { id: string; name: string } }[];
}

interface VacationRequestView {
  id: string;
  employeeId: string;
  dateFrom: string;
  dateTo: string;
  days: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  note: string | null;
  employee: { id: string; name: string };
}

interface OverviewRow {
  employeeId: string;
  name: string;
  department: string;
  quota: number;
  approvedDays: number;
  pendingDays: number;
  months: number[];
}

const DEPARTMENTS = ["RECEPTION", "KITCHEN", "SERVICE", "HOUSEKEEPING", "TECH", "WELLNESS", "ADMIN"] as const;
const DEPT_COLORS: Record<string, string> = {
  RECEPTION: "#3b82f6", KITCHEN: "#f59e0b", SERVICE: "#22c55e", HOUSEKEEPING: "#8b5cf6", TECH: "#ef4444", WELLNESS: "#14b8a6", ADMIN: "#64748b",
};
const DAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function todayIsoWeb(): string {
  return new Date().toISOString().slice(0, 10);
}

export function Personal() {
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayIsoWeb()));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [error, setError] = useState<string | null>(null);

  const [shiftForm, setShiftForm] = useState({ date: todayIsoWeb(), department: "RECEPTION", templateId: "", fromTime: "07:00", toTime: "15:00", employeeIds: [] as string[], note: "" });
  const [vacForm, setVacForm] = useState({ employeeId: "", dateFrom: "", dateTo: "", note: "" });
  const [empForm, setEmpForm] = useState({ name: "", department: "RECEPTION", quota: 25 });
  const [tplForm, setTplForm] = useState({ name: "", department: "RECEPTION", fromTime: "07:00", toTime: "15:00" });

  const shiftsQuery = useQuery({
    queryKey: ["shifts", weekStart],
    queryFn: () => api<ShiftView[]>(`/staff/shifts?from=${weekStart}&to=${addDays(weekStart, 6)}`),
  });
  const employeesQuery = useQuery({
    queryKey: ["employees"],
    queryFn: () => api<Employee[]>("/staff/employees"),
  });
  const templatesQuery = useQuery({
    queryKey: ["shiftTemplates"],
    queryFn: () => api<ShiftTemplate[]>("/staff/templates"),
  });
  const vacationsQuery = useQuery({
    queryKey: ["vacations", year],
    queryFn: () => api<VacationRequestView[]>(`/staff/vacations?year=${year}`),
  });
  const overviewQuery = useQuery({
    queryKey: ["vacationOverview", year],
    queryFn: () => api<OverviewRow[]>(`/staff/vacations/overview?year=${year}`),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["shifts"] });
    void queryClient.invalidateQueries({ queryKey: ["vacations"] });
    void queryClient.invalidateQueries({ queryKey: ["vacationOverview"] });
    void queryClient.invalidateQueries({ queryKey: ["employees"] });
    void queryClient.invalidateQueries({ queryKey: ["shiftTemplates"] });
    void queryClient.invalidateQueries({ queryKey: ["hkBoard"] });
    setError(null);
  }

  const createShift = useMutation({
    mutationFn: (body: unknown) => api("/staff/shifts", { method: "POST", body }),
    onSuccess: () => { invalidate(); setShiftForm({ ...shiftForm, employeeIds: [], note: "" }); },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const deleteShift = useMutation({
    mutationFn: (id: string) => api(`/staff/shifts/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const createVac = useMutation({
    mutationFn: (body: unknown) => api("/staff/vacations", { method: "POST", body }),
    onSuccess: () => { invalidate(); setVacForm({ employeeId: "", dateFrom: "", dateTo: "", note: "" }); },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const decideVac = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api(`/staff/vacations/${id}`, { method: "PATCH", body: { status } }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const createEmp = useMutation({
    mutationFn: (body: unknown) => api("/staff/employees", { method: "POST", body }),
    onSuccess: () => { invalidate(); setEmpForm({ name: "", department: "RECEPTION", quota: 25 }); },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const createTpl = useMutation({
    mutationFn: (body: unknown) => api("/staff/templates", { method: "POST", body }),
    onSuccess: () => { invalidate(); setTplForm({ name: "", department: "RECEPTION", fromTime: "07:00", toTime: "15:00" }); },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">Personal</h1>
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* Dienstplan */}
      <section className="rounded-xl bg-white p-4 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-medium text-slate-700">Dienstplan</h2>
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded-md bg-slate-100 px-3 py-1.5 text-sm hover:bg-slate-200">‹</button>
          <button onClick={() => setWeekStart(startOfWeek(todayIsoWeb()))} className="rounded-md bg-slate-100 px-3 py-1.5 text-sm hover:bg-slate-200">Diese Woche</button>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded-md bg-slate-100 px-3 py-1.5 text-sm hover:bg-slate-200">›</button>
          <span className="text-sm text-slate-500">KW ab {weekStart}</span>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {weekDays.map((d, i) => {
            const dayShifts = (shiftsQuery.data ?? []).filter((s) => s.date.slice(0, 10) === d);
            return (
              <div key={d} className={`min-h-40 rounded-lg border p-2 ${d === todayIsoWeb() ? "border-blue-400 bg-blue-50/40" : "border-slate-200"}`}>
                <div className="text-xs font-semibold text-slate-600">
                  {DAY_LABELS[i]} {d.slice(8)}.{d.slice(5, 7)}
                </div>
                <div className="mt-1 space-y-1">
                  {dayShifts.map((s) => (
                    <div key={s.id} className="group relative rounded border-l-2 bg-slate-50 px-1.5 py-1 text-[11px]" style={{ borderColor: DEPT_COLORS[s.department] }}>
                      <div className="font-medium text-slate-700">{s.fromTime}–{s.toTime}</div>
                      <div className="text-slate-500">{s.assignments.map((a) => a.employee.name.split(" ")[0]).join(", ") || "—"}</div>
                      <div className="text-[10px] text-slate-400">{s.department}</div>
                      <button
                        onClick={() => { if (confirm(`Schicht ${s.fromTime}–${s.toTime} am ${d} löschen?`)) deleteShift.mutate(s.id); }}
                        className="absolute right-0.5 top-0.5 hidden text-red-400 hover:text-red-600 group-hover:block"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {dayShifts.length === 0 && <div className="text-[10px] text-slate-300">frei</div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Schicht anlegen */}
        <div className="mt-4 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-7">
          <input type="date" value={shiftForm.date} onChange={(e) => setShiftForm({ ...shiftForm, date: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <select value={shiftForm.templateId} onChange={(e) => {
            const tpl = templatesQuery.data?.find((t) => t.id === e.target.value);
            setShiftForm({ ...shiftForm, templateId: e.target.value, department: tpl?.department ?? shiftForm.department, fromTime: tpl?.fromTime ?? shiftForm.fromTime, toTime: tpl?.toTime ?? shiftForm.toTime });
          }} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">Vorlage…</option>
            {templatesQuery.data?.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.fromTime}–{t.toTime})</option>)}
          </select>
          <select value={shiftForm.department} onChange={(e) => setShiftForm({ ...shiftForm, department: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <input type="time" value={shiftForm.fromTime} onChange={(e) => setShiftForm({ ...shiftForm, fromTime: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <input type="time" value={shiftForm.toTime} onChange={(e) => setShiftForm({ ...shiftForm, toTime: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <select multiple size={1} value={shiftForm.employeeIds} onChange={(e) => setShiftForm({ ...shiftForm, employeeIds: [...e.target.selectedOptions].map((o) => o.value) })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            {employeesQuery.data?.filter((emp) => emp.active).map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.name} ({emp.department})</option>
            ))}
          </select>
          <button
            onClick={() => createShift.mutate({ date: shiftForm.date, department: shiftForm.department, fromTime: shiftForm.fromTime, toTime: shiftForm.toTime, employeeIds: shiftForm.employeeIds, note: shiftForm.note || undefined })}
            disabled={createShift.isPending || shiftForm.employeeIds.length === 0}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            title="Mehrfachauswahl mit Cmd/Ctrl"
          >
            + Schicht
          </button>
        </div>
      </section>

      {/* Urlaub */}
      <section className="rounded-xl bg-white p-4 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-medium text-slate-700">Urlaubsplanung</h2>
          <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm" title="Jahr" />
        </div>

        {/* Neue Anträge */}
        <div className="mt-3 grid gap-2 sm:grid-cols-5">
          <select value={vacForm.employeeId} onChange={(e) => setVacForm({ ...vacForm, employeeId: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">Mitarbeiter…</option>
            {employeesQuery.data?.filter((emp) => emp.active).map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
          <input type="date" value={vacForm.dateFrom} onChange={(e) => setVacForm({ ...vacForm, dateFrom: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" title="Von" />
          <input type="date" value={vacForm.dateTo} onChange={(e) => setVacForm({ ...vacForm, dateTo: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" title="Bis" />
          <button
            onClick={() => createVac.mutate({ employeeId: vacForm.employeeId, dateFrom: vacForm.dateFrom, dateTo: vacForm.dateTo })}
            disabled={!vacForm.employeeId || !vacForm.dateFrom || !vacForm.dateTo || createVac.isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            + Antrag
          </button>
        </div>

        {/* Offene Anträge */}
        <div className="mt-3 space-y-1.5">
          {vacationsQuery.data?.filter((v) => v.status === "PENDING").map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2 text-sm">
              <span className="font-medium text-slate-800">{v.employee.name}</span>
              <span className="text-slate-600">{v.dateFrom.slice(0, 10)} – {v.dateTo.slice(0, 10)} ({v.days} Tage)</span>
              <button onClick={() => decideVac.mutate({ id: v.id, status: "APPROVED" })} className="ml-auto rounded-md bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-500">Genehmigen</button>
              <button onClick={() => decideVac.mutate({ id: v.id, status: "REJECTED" })} className="rounded-md bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100">Ablehnen</button>
            </div>
          ))}
        </div>

        {/* Jahresübersicht */}
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-2 py-2">Mitarbeiter</th>
                <th className="px-2 py-2">Kontingent</th>
                <th className="px-2 py-2">Genehmigt</th>
                <th className="px-2 py-2">Offen</th>
                {["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"].map((m, i) => (
                  <th key={i} className="px-1 py-2 text-center">{m}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {overviewQuery.data?.map((row) => (
                <tr key={row.employeeId}>
                  <td className="px-2 py-1.5 font-medium text-slate-800">{row.name}</td>
                  <td className="px-2 py-1.5 text-slate-600">{row.quota}</td>
                  <td className="px-2 py-1.5 font-medium text-green-700">{row.approvedDays}</td>
                  <td className="px-2 py-1.5 text-amber-600">{row.pendingDays || ""}</td>
                  {row.months.map((days, i) => (
                    <td key={i} className="px-1 py-1.5 text-center">
                      {days > 0 && (
                        <span
                          className="inline-block w-6 rounded text-white"
                          style={{ backgroundColor: DEPT_COLORS[row.department], opacity: Math.min(0.4 + days / 10, 1) }}
                          title={`${days} Tage im Monat ${i + 1}`}
                        >
                          {days}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Mitarbeiter & Vorlagen */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-4 shadow">
          <h2 className="font-medium text-slate-700">Mitarbeiter ({employeesQuery.data?.length ?? 0})</h2>
          <div className="mt-3 grid grid-cols-4 gap-2">
            <input placeholder="Name" value={empForm.name} onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <select value={empForm.department} onChange={(e) => setEmpForm({ ...empForm, department: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <input type="number" title="Urlaubstage" value={empForm.quota} onChange={(e) => setEmpForm({ ...empForm, quota: Number(e.target.value) })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <button onClick={() => createEmp.mutate(empForm)} disabled={!empForm.name || createEmp.isPending} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-50">+ Anlegen</button>
          </div>
          <div className="mt-3 space-y-1">
            {employeesQuery.data?.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-sm">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: DEPT_COLORS[e.department] }} />
                <span className="text-slate-700">{e.name}</span>
                <span className="text-xs text-slate-400">{e.department} · {e.vacationQuotaDays} T. Urlaub{e.active ? "" : " · inaktiv"}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow">
          <h2 className="font-medium text-slate-700">Schichtvorlagen</h2>
          <div className="mt-3 grid grid-cols-4 gap-2">
            <input placeholder="Name" value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <select value={tplForm.department} onChange={(e) => setTplForm({ ...tplForm, department: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <input type="time" value={tplForm.fromTime} onChange={(e) => setTplForm({ ...tplForm, fromTime: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <input type="time" value={tplForm.toTime} onChange={(e) => setTplForm({ ...tplForm, toTime: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <button onClick={() => createTpl.mutate(tplForm)} disabled={!tplForm.name || createTpl.isPending} className="mt-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-50">+ Vorlage</button>
          <div className="mt-3 space-y-1">
            {templatesQuery.data?.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-sm">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: DEPT_COLORS[t.department] }} />
                <span className="text-slate-700">{t.name}</span>
                <span className="text-xs text-slate-400">{t.department} · {t.fromTime}–{t.toTime}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
