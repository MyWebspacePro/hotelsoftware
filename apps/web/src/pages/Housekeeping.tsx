import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

interface BoardRoom {
  roomId: string;
  number: string;
  roomTypeName: string;
  color: string;
  cleanStatus: "CLEAN" | "DIRTY" | "INSPECTED" | "BLOCKED";
  dnd: boolean;
  notes: string | null;
  occupancy: "DEPARTURE" | "ARRIVAL" | "STAYOVER" | "VACANT";
  task: { id: string; type: string; status: string; assigneeId: string | null; assigneeName: string | null; notes: string | null } | null;
}

interface Ticket {
  id: string;
  roomId: string | null;
  area: string | null;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  room: { number: string } | null;
  resolvedAt: string | null;
}

interface EmployeeLite {
  id: string;
  name: string;
}

const STATUS_COLORS: Record<string, string> = { CLEAN: "#22c55e", DIRTY: "#ef4444", INSPECTED: "#3b82f6", BLOCKED: "#64748b" };
const OCC_LABELS: Record<string, { label: string; cls: string }> = {
  DEPARTURE: { label: "Abreise", cls: "bg-amber-100 text-amber-700" },
  STAYOVER: { label: "bleibt", cls: "bg-violet-100 text-violet-700" },
  ARRIVAL: { label: "Anreise", cls: "bg-blue-100 text-blue-700" },
  VACANT: { label: "frei", cls: "bg-slate-100 text-slate-500" },
};
const TASK_STATUS_COLORS: Record<string, string> = { OPEN: "#f59e0b", IN_PROGRESS: "#3b82f6", DONE: "#22c55e", SKIPPED: "#94a3b8" };

function todayIsoWeb(): string {
  return new Date().toISOString().slice(0, 10);
}

export function Housekeeping() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayIsoWeb());
  const [ticketForm, setTicketForm] = useState({ title: "", area: "", roomId: "", priority: "NORMAL", description: "" });
  const [error, setError] = useState<string | null>(null);

  const boardQuery = useQuery({
    queryKey: ["hkBoard", date],
    queryFn: () => api<{ date: string; employees: EmployeeLite[]; rooms: BoardRoom[] }>(`/housekeeping/board?date=${date}`),
  });
  const ticketsQuery = useQuery({
    queryKey: ["hkTickets"],
    queryFn: () => api<Ticket[]>("/housekeeping/tickets"),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["hkBoard", date] });
    void queryClient.invalidateQueries({ queryKey: ["hkTickets"] });
    setError(null);
  }

  const statusMutation = useMutation({
    mutationFn: ({ roomId, body }: { roomId: string; body: Record<string, unknown> }) => api(`/housekeeping/status/${roomId}`, { method: "PATCH", body: { date, ...body } }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const generateMutation = useMutation({
    mutationFn: () => api("/housekeeping/generate", { method: "POST", body: { date } }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const taskMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => api(`/housekeeping/tasks/${id}`, { method: "PATCH", body }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const addTaskMutation = useMutation({
    mutationFn: (body: unknown) => api("/housekeeping/tasks", { method: "POST", body }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const deleteTaskMutation = useMutation({
    mutationFn: (id: string) => api(`/housekeeping/tasks/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const ticketMutation = useMutation({
    mutationFn: (body: unknown) => api("/housekeeping/tickets", { method: "POST", body }),
    onSuccess: () => { invalidate(); setTicketForm({ title: "", area: "", roomId: "", priority: "NORMAL", description: "" }); },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const ticketStatusMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => api(`/housekeeping/tickets/${id}`, { method: "PATCH", body }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });

  const rooms = boardQuery.data?.rooms ?? [];
  const withTask = rooms.filter((r) => r.task);
  const doneCount = withTask.filter((r) => r.task!.status === "DONE").length;
  const dirtyCount = rooms.filter((r) => r.cleanStatus === "DIRTY").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-800">Housekeeping</h1>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        <button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
          Tasks für Tag generieren
        </button>
        <div className="ml-auto flex gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{rooms.length} Zimmer</span>
          <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">{dirtyCount} schmutzig</span>
          <span className="rounded-full bg-green-50 px-3 py-1 text-green-700">{doneCount} Tasks fertig / {withTask.length}</span>
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* Board */}
      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-3">Zimmer</th>
              <th className="px-3 py-3">Kontext</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">DND</th>
              <th className="px-3 py-3">Task</th>
              <th className="px-3 py-3">Zuweisung</th>
              <th className="px-3 py-3">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rooms.map((r) => (
              <tr key={r.roomId} className={r.dnd ? "bg-orange-50/60" : ""}>
                <td className="px-3 py-2">
                  <span className="font-medium text-slate-800">{r.number}</span>
                  <span className="ml-1 text-xs text-slate-400">{r.roomTypeName}</span>
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${OCC_LABELS[r.occupancy].cls}`}>{OCC_LABELS[r.occupancy].label}</span>
                </td>
                <td className="px-3 py-2">
                  <select
                    value={r.cleanStatus}
                    onChange={(e) => statusMutation.mutate({ roomId: r.roomId, body: { cleanStatus: e.target.value } })}
                    className="rounded-md border px-2 py-1 text-xs font-medium"
                    style={{ borderColor: STATUS_COLORS[r.cleanStatus], color: STATUS_COLORS[r.cleanStatus] }}
                  >
                    {Object.keys(STATUS_COLORS).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => statusMutation.mutate({ roomId: r.roomId, body: { dnd: !r.dnd } })}
                    className={`rounded px-2 py-1 text-xs ${r.dnd ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-500"}`}
                    title="Do not disturb"
                  >
                    DND
                  </button>
                </td>
                <td className="px-3 py-2">
                  {r.task ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="rounded px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: TASK_STATUS_COLORS[r.task.status] }}>
                        {r.task.type}
                      </span>
                      <select
                        value={r.task.status}
                        onChange={(e) => taskMutation.mutate({ id: r.task!.id, body: { status: e.target.value } })}
                        className="rounded border border-slate-300 px-1 py-0.5 text-xs"
                      >
                        {Object.keys(TASK_STATUS_COLORS).map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.task ? (
                    <select
                      value={r.task.assigneeId ?? ""}
                      onChange={(e) => taskMutation.mutate({ id: r.task!.id, body: { assigneeId: e.target.value || "" } })}
                      className="rounded border border-slate-300 px-1 py-0.5 text-xs"
                    >
                      <option value="">—</option>
                      {boardQuery.data?.employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                      ))}
                    </select>
                  ) : (
                    <button
                      onClick={() => addTaskMutation.mutate({ roomId: r.roomId, date, type: "DEEP" })}
                      className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200"
                      title="DEEP-Reinigung anlegen"
                    >
                      + DEEP
                    </button>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.task && (
                    <>
                      {r.task.status !== "DONE" && (
                        <button onClick={() => taskMutation.mutate({ id: r.task!.id, body: { status: "DONE" } })} className="rounded bg-green-50 px-2 py-1 text-xs text-green-700 hover:bg-green-100">
                          ✓ Fertig
                        </button>
                      )}
                      <button onClick={() => deleteTaskMutation.mutate(r.task!.id)} className="ml-1 text-red-400 hover:text-red-600" title="Task löschen">×</button>
                    </>
                  )}
                  {r.occupancy === "DEPARTURE" && !r.task && (
                    <button onClick={() => addTaskMutation.mutate({ roomId: r.roomId, date, type: "CHECKOUT" })} className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 hover:bg-amber-100">
                      + Checkout-Reinigung
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Technik-Tickets */}
      <section className="rounded-xl bg-white p-4 shadow">
        <h2 className="font-medium text-slate-700">Technik-Tickets</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <input placeholder="Titel" value={ticketForm.title} onChange={(e) => setTicketForm({ ...ticketForm, title: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="Bereich (Wellness…)" value={ticketForm.area} onChange={(e) => setTicketForm({ ...ticketForm, area: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <select value={ticketForm.roomId} onChange={(e) => setTicketForm({ ...ticketForm, roomId: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">Zimmer (optional)…</option>
            {rooms.map((r) => <option key={r.roomId} value={r.roomId}>{r.number}</option>)}
          </select>
          <select value={ticketForm.priority} onChange={(e) => setTicketForm({ ...ticketForm, priority: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            {["LOW", "NORMAL", "HIGH"].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input placeholder="Beschreibung" value={ticketForm.description} onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <button
            onClick={() => ticketMutation.mutate({ title: ticketForm.title, area: ticketForm.area || undefined, roomId: ticketForm.roomId || undefined, priority: ticketForm.priority, description: ticketForm.description || undefined })}
            disabled={!ticketForm.title || ticketMutation.isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            + Ticket
          </button>
        </div>
        <div className="mt-3 space-y-1.5">
          {ticketsQuery.data?.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${t.priority === "HIGH" ? "bg-red-100 text-red-700" : t.priority === "LOW" ? "bg-slate-100 text-slate-500" : "bg-amber-100 text-amber-700"}`}>
                {t.priority}
              </span>
              <span className="font-medium text-slate-800">{t.title}</span>
              <span className="text-xs text-slate-500">{t.room ? `Zi. ${t.room.number}` : t.area ?? ""}</span>
              {t.description && <span className="text-xs text-slate-400">{t.description}</span>}
              <span className={`ml-auto rounded px-2 py-0.5 text-xs ${t.status === "DONE" ? "bg-green-100 text-green-700" : t.status === "IN_PROGRESS" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                {t.status}
              </span>
              {t.status !== "DONE" && (
                <button
                  onClick={() => ticketStatusMutation.mutate({ id: t.id, body: { status: t.status === "OPEN" ? "IN_PROGRESS" : "DONE" } })}
                  className="rounded bg-slate-100 px-2 py-1 text-xs hover:bg-slate-200"
                >
                  {t.status === "OPEN" ? "→ In Arbeit" : "→ Erledigt"}
                </button>
              )}
            </div>
          ))}
          {ticketsQuery.data?.length === 0 && <div className="text-sm text-slate-400">Keine offenen Technik-Tickets 🎉</div>}
        </div>
      </section>
    </div>
  );
}
