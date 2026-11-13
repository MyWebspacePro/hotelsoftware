import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiBlob } from "../api/client";
import type { RegistrationExportView, RegistrationProfileView, RegistrationRecordView, RetentionRunView } from "../api/types2";
import { missingFields, REGISTRATION_PROFILES, type CountryCode } from "@hg/shared";

function todayIsoWeb(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const EXPORT_TYPES = [
  { type: "DE_MELDESCHEIN_PDF", label: "Meldescheine PDF (DE)", needs: "period" },
  { type: "AT_GAESTEBLATT_CSV", label: "Gästeblatt CSV (AT)", needs: "period" },
  { type: "AT_STATISTIK_MONAT_CSV", label: "Statistik Austria Monatsmeldung (AT)", needs: "month" },
  { type: "CH_CANTON_CSV", label: "Gästekontrolle CSV (CH)", needs: "period" },
] as const;

export function Meldewesen() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [query, setQuery] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ fullName: "", birthDate: "", nationality: "", idType: "", idNumber: "", address: "" });
  const [error, setError] = useState<string | null>(null);
  const [exportFrom, setExportFrom] = useState(todayIsoWeb());
  const [exportTo, setExportTo] = useState(todayIsoWeb());
  const [exportMonth, setExportMonth] = useState(todayIsoWeb().slice(0, 7));
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const profileQuery = useQuery({
    queryKey: ["registrationProfile"],
    queryFn: () => api<RegistrationProfileView>("/registrations/profiles"),
  });
  const recordsQuery = useQuery({
    queryKey: ["registrations", statusFilter, query],
    queryFn: () =>
      api<RegistrationRecordView[]>(
        `/registrations?${statusFilter ? `status=${statusFilter}` : ""}${query ? `${statusFilter ? "&" : ""}q=${encodeURIComponent(query)}` : ""}`,
      ),
  });
  const exportsQuery = useQuery({
    queryKey: ["registrationExports"],
    queryFn: () => api<RegistrationExportView[]>("/registrations/exports"),
  });
  const runsQuery = useQuery({
    queryKey: ["retentionRuns"],
    queryFn: () => api<RetentionRunView[]>("/retention/runs"),
  });

  const profile = profileQuery.data?.profile;
  const sharedProfile = profile ? REGISTRATION_PROFILES[profile.country as CountryCode] : null;

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => api(`/registrations/${id}`, { method: "PATCH", body }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["registrations"] }); setEditId(null); setError(null); },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const submitMutation = useMutation({
    mutationFn: (id: string) => api(`/registrations/${id}/submit`, { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["registrations"] }),
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const runMutation = useMutation({
    mutationFn: () => api("/retention/run", { method: "POST" }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["retentionRuns"] }); void queryClient.invalidateQueries({ queryKey: ["registrations"] }); setError(null); },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });

  function missingFor(r: RegistrationRecordView): string[] {
    if (!sharedProfile) return [];
    return missingFields(
      { fullName: r.fullName, birthDate: r.birthDate, nationality: r.nationality, idType: r.idType, idNumber: r.idNumber, address: r.address },
      sharedProfile,
    );
  }

  async function downloadExport(type: string) {
    try {
      const params = new URLSearchParams({ type });
      const spec = EXPORT_TYPES.find((t) => t.type === type);
      if (spec?.needs === "month") params.set("month", exportMonth);
      else {
        params.set("from", exportFrom);
        params.set("to", exportTo);
      }
      const url = await apiBlob(`/registrations/export?${params.toString()}`);
      const isPdf = type.endsWith("_PDF");
      if (isPdf) {
        setPdfUrl(url);
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `${type.toLowerCase()}_${exportFrom || exportMonth}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
      void queryClient.invalidateQueries({ queryKey: ["registrationExports"] });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export-Fehler");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-slate-800">Meldewesen</h1>
        {profile && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
            {profile.label} · Frist {profile.retentionDays} Tage ·{" "}
            {profile.foreignOnly ? "nur ausländische Gäste" : "alle Gäste"}
          </span>
        )}
      </div>
      {profile && <p className="text-xs text-slate-500">{profile.legalNote}</p>}

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* Datensätze */}
      <section className="rounded-xl bg-white p-4 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            <option value="">Alle Status</option>
            <option value="DRAFT">Entwurf (unvollständig/zu melden)</option>
            <option value="SUBMITTED">Übermittelt</option>
          </select>
          <input placeholder="Name suchen…" value={query} onChange={(e) => setQuery(e.target.value)} className="w-56 rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Gast</th>
                <th className="px-3 py-2">Aufenthalt</th>
                <th className="px-3 py-2">Herkunft</th>
                <th className="px-3 py-2">Ausweis</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Löschfrist</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recordsQuery.data?.map((r) => {
                const missing = missingFor(r);
                return (
                  <tr key={r.id} className={missing.length ? "bg-amber-50/50" : ""}>
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {r.fullName}
                      {r.anonymizedAt && <span className="ml-1 text-xs text-slate-400">(anonymisiert)</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{r.arrival.slice(0, 10)} → {r.departure.slice(0, 10)}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {r.nationality ?? "—"}
                      {r.foreignGuest && <span className="ml-1 rounded bg-blue-50 px-1 text-[10px] text-blue-700">ausländisch</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-500 text-xs">{r.idType ? `${r.idType} ${r.idNumber ?? ""}`.trim() : "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${r.status === "SUBMITTED" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                        {r.status === "SUBMITTED" ? "übermittelt" : "Entwurf"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{r.retentionUntil.slice(0, 10)}</td>
                    <td className="px-3 py-2 text-right">
                      {missing.length > 0 && <span className="mr-2 text-xs text-amber-700" title={missing.join(", ")}>⚠ {missing.length} Felder fehlen</span>}
                      <button
                        onClick={() => {
                          setEditId(r.id);
                          setEditForm({
                            fullName: r.fullName,
                            birthDate: r.birthDate?.slice(0, 10) ?? "",
                            nationality: r.nationality ?? "",
                            idType: r.idType ?? "",
                            idNumber: r.idNumber ?? "",
                            address: r.address ?? "",
                          });
                        }}
                        className="rounded bg-slate-100 px-2 py-1 text-xs hover:bg-slate-200"
                      >
                        Bearbeiten
                      </button>
                      {r.status === "DRAFT" && (
                        <button onClick={() => submitMutation.mutate(r.id)} className="ml-1 rounded bg-green-50 px-2 py-1 text-xs text-green-700 hover:bg-green-100">
                          Übermitteln
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {recordsQuery.data?.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-400">Noch keine Meldescheine — entstehen automatisch beim Check-in</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Exporte */}
      <section className="rounded-xl bg-white p-4 shadow">
        <h2 className="font-medium text-slate-700">Behörden-Exporte</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" title="Von (Abreise-Zeitraum)" />
          <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" title="Bis (Abreise-Zeitraum)" />
          <input type="month" value={exportMonth} onChange={(e) => setExportMonth(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" title="Monat (Statistik)" />
          {EXPORT_TYPES.map((t) => (
            <button
              key={t.type}
              onClick={() => downloadExport(t.type)}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
            >
              {t.label}
            </button>
          ))}
        </div>
        {exportsQuery.data && exportsQuery.data.length > 0 && (
          <div className="mt-3 text-xs text-slate-500">
            Letzte Exporte:{" "}
            {exportsQuery.data.slice(0, 5).map((e) => `${e.type} (${e.recordCount} DS, ${new Date(e.createdAt).toLocaleString("de-DE")})`).join(" · ")}
          </div>
        )}
      </section>

      {/* DSGVO */}
      <section className="rounded-xl bg-white p-4 shadow">
        <h2 className="font-medium text-slate-700">DSGVO — Aufbewahrung & Löschung</h2>
        <p className="mt-1 text-xs text-slate-500">
          Meldescheine werden nach Fristablauf anonymisiert ({profile?.retentionDays ?? 365} Tage ab Abreise), Gästeprofile nach
          Inaktivität (Standard 1.095 Tage, konfigurierbar unter SystemConfig.retention). Zahlungs- und Rechnungsdaten bleiben
          von Buchhaltungsaufbewahrungspflichten umfasst (8–10 Jahre) und werden nicht angetastet.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => { if (confirm("Löschlauf jetzt ausführen? Abgelaufene Daten werden anonymisiert.")) runMutation.mutate(); }}
            disabled={runMutation.isPending}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
          >
            {runMutation.isPending ? "Läuft…" : "Löschlauf jetzt ausführen"}
          </button>
          {runsQuery.data && runsQuery.data.length > 0 && (
            <div className="text-xs text-slate-500">
              Letzte Läufe:{" "}
              {runsQuery.data.slice(0, 3).map((r) => `${new Date(r.executedAt).toLocaleString("de-DE")} — ${r.registrationsAnonymized} Meldescheine, ${r.guestsAnonymized} Gästeprofile`).join(" | ")}
            </div>
          )}
        </div>
      </section>

      {/* Bearbeiten */}
      {editId && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10" onClick={() => setEditId(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-800">Meldedaten nachbessern</h2>
            <div className="mt-3 grid gap-2">
              <input placeholder="Vollständiger Name" value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <input type="date" title="Geburtsdatum" value={editForm.birthDate} onChange={(e) => setEditForm({ ...editForm, birthDate: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <input placeholder="Staatsangehörigkeit (z. B. IT, DE, CH)" value={editForm.nationality} onChange={(e) => setEditForm({ ...editForm, nationality: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Ausweisart (Pass/ID)" value={editForm.idType} onChange={(e) => setEditForm({ ...editForm, idType: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
                <input placeholder="Ausweisnummer" value={editForm.idNumber} onChange={(e) => setEditForm({ ...editForm, idNumber: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <input placeholder="Anschrift (Straße, PLZ, Ort)" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditId(null)} className="rounded-md bg-slate-100 px-4 py-2 text-sm text-slate-700 hover:bg-slate-200">Abbrechen</button>
              <button
                onClick={() => patchMutation.mutate({ id: editId, body: { ...editForm, birthDate: editForm.birthDate || "" } })}
                disabled={patchMutation.isPending}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {pdfUrl && (
        <div className="fixed inset-0 z-60 flex flex-col bg-black/60 p-4">
          <div className="flex justify-end">
            <button onClick={() => setPdfUrl(null)} className="rounded-md bg-white px-3 py-1.5 text-sm">Schließen</button>
          </div>
          <iframe src={pdfUrl} className="mt-2 flex-1 rounded-lg bg-white" title="Meldescheine PDF" />
        </div>
      )}
    </div>
  );
}
