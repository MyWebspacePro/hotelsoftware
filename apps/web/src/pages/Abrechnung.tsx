import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiBlob } from "../api/client";
import { eur } from "../api/types";
import type { ClosingPaymentRow, DayClosingView } from "../api/types2";

function todayIsoWeb(): string {
  return new Date().toISOString().slice(0, 10);
}

export function Abrechnung() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayIsoWeb());
  const [error, setError] = useState<string | null>(null);
  const [exportFrom, setExportFrom] = useState(todayIsoWeb());
  const [exportTo, setExportTo] = useState(todayIsoWeb());
  const [exportFormat, setExportFormat] = useState<"DATEV" | "GENERIC">("DATEV");

  const paymentsQuery = useQuery({
    queryKey: ["closingPayments", date],
    queryFn: () => api<ClosingPaymentRow[]>(`/closing/payments?date=${date}`),
  });
  const closingsQuery = useQuery({
    queryKey: ["closings"],
    queryFn: () => api<DayClosingView[]>(`/closing/closings?from=2026-01-01&to=2099-12-31`),
  });

  const closeMutation = useMutation({
    mutationFn: () => api("/closing/close", { method: "POST", body: { date } }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["closings"] }); setError(null); },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });

  const total = paymentsQuery.data?.reduce((s, p) => s + p.amountCents, 0) ?? 0;
  const byMethod = new Map<string, number>();
  for (const p of paymentsQuery.data ?? []) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amountCents);

  async function downloadExport() {
    try {
      const url = await apiBlob(`/fibu/export?from=${exportFrom}&to=${exportTo}&format=${exportFormat}`);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fibu-export-${exportFrom}_${exportTo}-${exportFormat.toLowerCase()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export-Fehler");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">Kasse & Tagesabschluss</h1>
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* Kassenbuch */}
      <section className="rounded-xl bg-white p-4 shadow">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-medium text-slate-700">Kassenbuch</h2>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <span className="text-sm text-slate-600">
            {paymentsQuery.data?.length ?? 0} Zahlungen · Total <strong>{eur(total)}</strong>
          </span>
          <div className="ml-auto flex gap-2">
            {[...byMethod.entries()].map(([m, c]) => (
              <span key={m} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{m}: {eur(c)}</span>
            ))}
          </div>
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Zeit</th>
                <th className="px-3 py-2">Gast</th>
                <th className="px-3 py-2">Beleg</th>
                <th className="px-3 py-2">Art</th>
                <th className="px-3 py-2">Referenz</th>
                <th className="px-3 py-2 text-right">Betrag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paymentsQuery.data?.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 text-slate-500">{new Date(p.date).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {p.invoice?.guestName ?? p.folio?.booking?.guest ? (p.invoice?.guestName ?? (p.folio?.booking?.guest ? `${p.folio.booking.guest.firstName} ${p.folio.booking.guest.lastName}` : "—")) : "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{p.invoice?.number ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{p.method}{p.note ? ` (${p.note})` : ""}</td>
                  <td className="px-3 py-2 text-slate-500">{p.reference ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-medium text-slate-800">{eur(p.amountCents)}</td>
                </tr>
              ))}
              {paymentsQuery.data?.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-400">Keine Zahlungen an diesem Tag</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <button
          onClick={() => closeMutation.mutate()}
          disabled={closeMutation.isPending}
          className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {closeMutation.isPending ? "…" : "Tagesabschluss durchführen"}
        </button>
      </section>

      {/* Abschlüsse */}
      <section className="rounded-xl bg-white p-4 shadow">
        <h2 className="font-medium text-slate-700">Tagesabschlüsse</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Datum</th>
                <th className="px-3 py-2">Zahlarten</th>
                <th className="px-3 py-2">Folio-Umsatz</th>
                <th className="px-3 py-2">Steuer (Schlüssel)</th>
                <th className="px-3 py-2">Abgeschlossen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {closingsQuery.data?.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2 font-medium text-slate-700">{c.date.slice(0, 10)}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {(c.totals.payments ?? []).map((p) => `${p.method} ${eur(p.amountCents)}`).join(" · ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    Verzehr {eur(c.folioTotals.chargeCents)} / Gutschriften {eur(c.folioTotals.creditCents)}
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-xs">
                    {c.taxTotals.map((t) => `${t.taxRateKey === "TOURIST_TAX" ? "Kurtaxe" : t.taxRateKey}: ${eur(t.taxCents)}`).join(" · ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-400 text-xs">{new Date(c.closedAt).toLocaleString("de-DE")}</td>
                </tr>
              ))}
              {closingsQuery.data?.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400">Noch keine Tagesabschlüsse</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* FiBu-Export */}
      <section className="rounded-xl bg-white p-4 shadow">
        <h2 className="font-medium text-slate-700">FiBu-Export (Buchungsstapel)</h2>
        <p className="mt-1 text-xs text-slate-500">DATEV-Format für DE/AT; generischer Export für CH und andere Programme. Konten mapping unter /api/fibu/mapping konfigurierbar.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value as "DATEV" | "GENERIC")} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="DATEV">DATEV (DE/AT)</option>
            <option value="GENERIC">Generisch (CH & sonst)</option>
          </select>
          <button onClick={downloadExport} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
            CSV herunterladen
          </button>
        </div>
      </section>
    </div>
  );
}
