import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { ChannelConnectionView, ChannelSyncLogView, IcalEventView } from "../api/types2";

/** Phase 5: iCal-Kanäle — Verbindungen, Sync, Konfliktübersicht, Log. */

interface RoomTypeLite {
  id: string;
  name: string;
}

const PLATFORM_LABELS: Record<string, string> = { AIRBNB: "Airbnb", BOOKING: "Booking.com", OTHER: "Andere" };
const PLATFORM_COLORS: Record<string, string> = {
  AIRBNB: "bg-rose-100 text-rose-700",
  BOOKING: "bg-blue-100 text-blue-700",
  OTHER: "bg-slate-100 text-slate-600",
};
const DIRECTION_LABELS: Record<string, string> = { IMPORT: "nur Import", EXPORT: "nur Export", BOTH: "Import + Export" };

export function Kanaele() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", platform: "AIRBNB", direction: "BOTH", roomTypeId: "", importUrl: "" });

  const connectionsQuery = useQuery({
    queryKey: ["channels"],
    queryFn: () => api<ChannelConnectionView[]>("/channels/connections"),
  });
  const eventsQuery = useQuery({
    queryKey: ["channelEvents"],
    queryFn: () => api<IcalEventView[]>("/channels/events"),
  });
  const logsQuery = useQuery({
    queryKey: ["channelLogs"],
    queryFn: () => api<ChannelSyncLogView[]>("/channels/logs"),
  });
  const typesQuery = useQuery({
    queryKey: ["roomTypes"],
    queryFn: () => api<RoomTypeLite[]>("/rooms/types"),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["channels"] });
    void queryClient.invalidateQueries({ queryKey: ["channelEvents"] });
    void queryClient.invalidateQueries({ queryKey: ["channelLogs"] });
    void queryClient.invalidateQueries({ queryKey: ["calendarBoard"] });
    setError(null);
  }

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/channels/connections", { method: "POST", body }),
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      setForm({ name: "", platform: "AIRBNB", direction: "BOTH", roomTypeId: "", importUrl: "" });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const syncMutation = useMutation({
    mutationFn: (id: string) => api<{ imported: number; updated: number; removed: number; conflicts: number; message: string }>(`/channels/connections/${id}/sync`, { method: "POST" }),
    onSuccess: (result) => {
      invalidate();
      setNotice(
        `Sync fertig: ${result.imported} neu übernommen, ${result.updated} aktualisiert, ${result.removed} entfernt, ${result.conflicts} Konflikte`,
      );
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Sync fehlgeschlagen"),
  });
  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api(`/channels/connections/${id}`, { method: "PATCH", body: { active } }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const tokenMutation = useMutation({
    mutationFn: (id: string) => api<{ exportToken: string }>(`/channels/connections/${id}`, { method: "PATCH", body: { regenerateToken: true } }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/channels/connections/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });

  const connections = connectionsQuery.data ?? [];
  const events = eventsQuery.data ?? [];
  const conflicts = events.filter((e) => e.conflict);
  const logs = logsQuery.data ?? [];

  function copyExportUrl(conn: ChannelConnectionView) {
    const url = `${window.location.origin}/api/public/ical/${conn.exportToken}`;
    void navigator.clipboard.writeText(url).then(
      () => setNotice(`Export-URL kopiert: ${url}`),
      () => setNotice(`Export-URL: ${url}`),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-800">Kanäle (iCal)</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
        >
          {showForm ? "Abbrechen" : "+ Verbindung"}
        </button>
        <div className="ml-auto flex gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{connections.length} Verbindungen</span>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">{conflicts.length} Konflikte</span>
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && (
        <div className="flex items-start justify-between rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          <span className="break-all">{notice}</span>
          <button onClick={() => setNotice(null)} className="ml-2 text-green-600 hover:text-green-800">×</button>
        </div>
      )}

      {/* Neue Verbindung */}
      {showForm && (
        <section className="rounded-xl bg-white p-4 shadow">
          <h2 className="font-medium text-slate-700">Verbindung anlegen</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <input placeholder="Name (z. B. Airbnb – Zimmer 12)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              {Object.keys(PLATFORM_LABELS).map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
            </select>
            <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              {Object.keys(DIRECTION_LABELS).map((d) => <option key={d} value={d}>{DIRECTION_LABELS[d]}</option>)}
            </select>
            <select value={form.roomTypeId} onChange={(e) => setForm({ ...form, roomTypeId: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">Zimmertyp (optional)…</option>
              {(typesQuery.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input placeholder="iCal-Import-URL (bei Export weglassen)" value={form.importUrl} onChange={(e) => setForm({ ...form, importUrl: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <button
              onClick={() => createMutation.mutate({
                name: form.name,
                platform: form.platform,
                direction: form.direction,
                roomTypeId: form.roomTypeId || null,
                importUrl: form.direction === "EXPORT" ? null : form.importUrl || null,
              })}
              disabled={!form.name || createMutation.isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              Anlegen
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Ohne Zimmertyp werden importierte Aufenthalte nur gelistet (Konfliktübersicht), nicht kalenderwirksam.
          </p>
        </section>
      )}

      {/* Verbindungen */}
      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-3">Verbindung</th>
              <th className="px-3 py-3">Richtung</th>
              <th className="px-3 py-3">Zimmertyp</th>
              <th className="px-3 py-3">Letzter Sync</th>
              <th className="px-3 py-3">Events</th>
              <th className="px-3 py-3">Aktiv</th>
              <th className="px-3 py-3 text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {connections.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${PLATFORM_COLORS[c.platform]}`}>{PLATFORM_LABELS[c.platform]}</span>
                    <span className="font-medium text-slate-800">{c.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-600">{DIRECTION_LABELS[c.direction]}</td>
                <td className="px-3 py-2 text-slate-600">{c.roomTypeName ?? <span className="text-xs text-amber-600">nur Liste</span>}</td>
                <td className="px-3 py-2 text-slate-600">
                  {c.lastSyncAt ? (
                    <>
                      {new Date(c.lastSyncAt).toLocaleString("de-DE")}{" "}
                      <span className={c.lastSyncStatus === "OK" ? "text-green-600" : "text-red-600"}>({c.lastSyncStatus})</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">{c.eventCount}</td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => toggleMutation.mutate({ id: c.id, active: !c.active })}
                    className={`rounded px-2 py-1 text-xs ${c.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}
                  >
                    {c.active ? "aktiv" : "inaktiv"}
                  </button>
                </td>
                <td className="px-3 py-2 text-right">
                  {c.direction !== "EXPORT" && (
                    <button
                      onClick={() => syncMutation.mutate(c.id)}
                      disabled={syncMutation.isPending}
                      className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                    >
                      ⟳ Sync
                    </button>
                  )}
                  {c.direction !== "IMPORT" && (
                    <>
                      <button onClick={() => copyExportUrl(c)} className="ml-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200" title="Export-URL für das Portal kopieren">
                        URL kopieren
                      </button>
                      <button onClick={() => tokenMutation.mutate(c.id)} className="ml-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200" title="Export-Token neu erzeugen (alte URL ungültig)">
                        Token neu
                      </button>
                    </>
                  )}
                  <button onClick={() => deleteMutation.mutate(c.id)} className="ml-2 text-red-400 hover:text-red-600" title="Verbindung löschen">×</button>
                </td>
              </tr>
            ))}
            {connections.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">Noch keine Kanal-Verbindungen angelegt.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Konfliktübersicht */}
      {conflicts.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <h2 className="font-medium text-amber-800">⚠️ Konflikte ({conflicts.length})</h2>
          <p className="mt-1 text-xs text-amber-700">
            Diese Portal-Aufenthalte kollidieren mit Belegungen im Kalender und wurden NICHT übernommen — intern auflösen, dann erneut synchronisieren.
          </p>
          <div className="mt-3 space-y-1.5">
            {conflicts.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-white px-3 py-2 text-sm">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${PLATFORM_COLORS[e.platform] ?? ""}`}>{PLATFORM_LABELS[e.platform] ?? e.platform}</span>
                <span className="font-medium text-slate-800">{e.summary ?? e.externalUid}</span>
                <span className="text-slate-500">{e.dateFrom} → {e.dateTo} ({e.nights} N.)</span>
                <span className="text-xs text-slate-400">{e.connectionName}{e.roomTypeName ? ` · ${e.roomTypeName}` : ""}</span>
                <span className="ml-auto text-xs text-amber-700">{e.conflictNote}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Importierte Events */}
      <section className="rounded-xl bg-white p-4 shadow">
        <h2 className="font-medium text-slate-700">Importierte Aufenthalte ({events.length})</h2>
        <div className="mt-3 max-h-80 space-y-1.5 overflow-y-auto">
          {events.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${PLATFORM_COLORS[e.platform] ?? ""}`}>{PLATFORM_LABELS[e.platform] ?? e.platform}</span>
              <span className="font-medium text-slate-800">{e.summary ?? e.externalUid}</span>
              <span className="text-slate-500">{e.dateFrom} → {e.dateTo}</span>
              <span className="text-xs text-slate-400">{e.connectionName}{e.roomTypeName ? ` · ${e.roomTypeName}` : ""}</span>
              {e.bookingId ? (
                <span className="ml-auto rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">übernommen</span>
              ) : e.conflict ? (
                <span className="ml-auto rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Konflikt</span>
              ) : (
                <span className="ml-auto rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">gelistet</span>
              )}
            </div>
          ))}
          {events.length === 0 && <div className="text-sm text-slate-400">Noch nichts importiert — erst verbinden, dann „⟳ Sync“.</div>}
        </div>
      </section>

      {/* Sync-Log */}
      <section className="rounded-xl bg-white p-4 shadow">
        <h2 className="font-medium text-slate-700">Sync-Protokoll</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Zeit</th>
                <th className="px-3 py-2">Verbindung</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Neu</th>
                <th className="px-3 py-2">Akt.</th>
                <th className="px-3 py-2">Entf.</th>
                <th className="px-3 py-2">Konflikte</th>
                <th className="px-3 py-2">Meldung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-1.5 text-slate-600">{new Date(l.ranAt).toLocaleString("de-DE")}</td>
                  <td className="px-3 py-1.5 font-medium text-slate-700">{l.connectionName}</td>
                  <td className="px-3 py-1.5">
                    <span className={`rounded px-2 py-0.5 text-xs ${l.status === "OK" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{l.status}</span>
                  </td>
                  <td className="px-3 py-1.5 text-slate-600">{l.imported}</td>
                  <td className="px-3 py-1.5 text-slate-600">{l.updated}</td>
                  <td className="px-3 py-1.5 text-slate-600">{l.removed}</td>
                  <td className={`px-3 py-1.5 ${l.conflicts > 0 ? "font-medium text-amber-700" : "text-slate-600"}`}>{l.conflicts}</td>
                  <td className="px-3 py-1.5 text-xs text-slate-400">{l.message}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-4 text-center text-slate-400">Noch keine Synchronisationen.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
