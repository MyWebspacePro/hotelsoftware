import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiBlob } from "../api/client";
import { eur } from "../api/types";
import type { InvoiceListItem, InvoiceView } from "../api/types2";

const STATUS_STYLES: Record<string, string> = {
  ISSUED: "bg-blue-100 text-blue-700",
  PARTIALLY_PAID: "bg-amber-100 text-amber-700",
  PAID: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700 line-through",
};
const TYPE_LABELS: Record<string, string> = { STANDARD: "Rechnung", ADVANCE: "Anzahlung", CREDIT: "Gutschrift", CONSOLIDATED: "Sammelrechnung" };

export function Rechnungen() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "CARD" });
  const [error, setError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["invoices", status],
    queryFn: () => api<InvoiceListItem[]>(`/invoices${status ? `?status=${status}` : ""}`),
  });
  const detailQuery = useQuery({
    queryKey: ["invoice", detailId],
    queryFn: () => api<InvoiceView>(`/invoices/${detailId}`),
    enabled: Boolean(detailId),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api("/invoices/" + id + "/cancel", { method: "POST" }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["invoices"] }); void queryClient.invalidateQueries({ queryKey: ["invoice", detailId] }); setError(null); },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const payMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => api(`/invoices/${id}/payments`, { method: "POST", body }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["invoices"] }); void queryClient.invalidateQueries({ queryKey: ["invoice", detailId] }); setPayForm({ amount: "", method: "CARD" }); },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });

  async function openPdf(id: string) {
    try {
      setPdfUrl(await apiBlob(`/invoices/${id}/pdf`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF-Fehler");
    }
  }

  const inv = detailQuery.data;
  const paidCents = inv?.payments.reduce((s, p) => s + p.amountCents, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold text-slate-800">Rechnungen</h1>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="ml-auto rounded-md border border-slate-300 px-3 py-1.5 text-sm">
          <option value="">Alle Status</option>
          <option value="ISSUED">Offen</option>
          <option value="PARTIALLY_PAID">Teilbezahlt</option>
          <option value="PAID">Bezahlt</option>
          <option value="CANCELLED">Storniert</option>
        </select>
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Nummer</th>
              <th className="px-4 py-3">Typ</th>
              <th className="px-4 py-3">Datum</th>
              <th className="px-4 py-3">Gast</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Netto</th>
              <th className="px-4 py-3 text-right">Brutto</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {listQuery.data?.map((i) => (
              <tr key={i.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setDetailId(i.id)}>
                <td className="px-4 py-2.5 font-medium text-slate-800">{i.number}</td>
                <td className="px-4 py-2.5 text-slate-600">{TYPE_LABELS[i.type]}</td>
                <td className="px-4 py-2.5 text-slate-600">{i.date.slice(0, 10)}</td>
                <td className="px-4 py-2.5 text-slate-600">{i.guestName ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[i.status]}`}>{i.status}</span>
                </td>
                <td className="px-4 py-2.5 text-right text-slate-600">{eur(i.netCents, i.currency)}</td>
                <td className="px-4 py-2.5 text-right font-medium text-slate-800">{eur(i.grossCents, i.currency)}</td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={(e) => { e.stopPropagation(); void openPdf(i.id); }} className="rounded bg-slate-100 px-2 py-1 text-xs hover:bg-slate-200">PDF</button>
                </td>
              </tr>
            ))}
            {listQuery.data?.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">Noch keine Rechnungen</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Detail */}
      {inv && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10" onClick={() => { setDetailId(null); setPdfUrl(null); }}>
          <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">{TYPE_LABELS[inv.type]} {inv.number}</h2>
                <p className="text-sm text-slate-500">
                  {inv.guestName ?? "—"} · {inv.date.slice(0, 10)} ·{" "}
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[inv.status]}`}>{inv.status}</span>
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => void openPdf(inv.id)} className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700">PDF</button>
                <button onClick={() => { setDetailId(null); setPdfUrl(null); }} className="rounded-md bg-slate-100 px-3 py-1.5 text-sm hover:bg-slate-200">Schließen</button>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Position</th>
                    <th className="px-3 py-2">Menge</th>
                    <th className="px-3 py-2">Einzelpreis</th>
                    <th className="px-3 py-2">Steuer</th>
                    <th className="px-3 py-2 text-right">Summe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inv.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2 text-slate-700">{l.text}</td>
                      <td className="px-3 py-2 text-slate-600">{l.qty}</td>
                      <td className="px-3 py-2 text-slate-600">{eur(l.unitPriceCents, inv.currency)}</td>
                      <td className="px-3 py-2 text-slate-400">{l.isTouristTax ? "taxfrei" : `${Math.round(l.taxRate * 1000) / 10} %`}</td>
                      <td className={`px-3 py-2 text-right ${l.totalCents < 0 ? "text-green-700" : "text-slate-800"}`}>{eur(l.totalCents, inv.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Steueraufschlüsselung */}
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
              {inv.taxBreakdown.map((b) => (
                <span key={b.taxRateKey} className="rounded bg-slate-50 px-2 py-1">
                  {b.taxRateKey === "TOURIST_TAX" ? "Kurtaxe" : `${b.taxRateKey}`}: netto {eur(b.netCents, inv.currency)} + USt {eur(b.taxCents, inv.currency)}
                </span>
              ))}
              <span className="ml-auto font-semibold text-slate-700">
                Netto {eur(inv.netCents, inv.currency)} · Steuer {eur(inv.taxCents, inv.currency)} · Brutto <strong>{eur(inv.grossCents, inv.currency)}</strong>
              </span>
            </div>

            {/* Zahlungen + Aktionen */}
            {inv.type !== "CREDIT" && inv.status !== "CANCELLED" && (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3">
                <span className="text-sm text-slate-600">
                  Gezahlt: <strong>{eur(paidCents, inv.currency)}</strong> · offen:{" "}
                  <strong className={inv.grossCents - paidCents > 0 ? "text-red-600" : "text-green-700"}>{eur(inv.grossCents - paidCents, inv.currency)}</strong>
                </span>
                <input type="number" placeholder="Betrag EUR" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                <select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  {["CASH", "CARD", "SEPA", "ONLINE", "VOUCHER", "TRANSFER"].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <button
                  onClick={() => payMutation.mutate({ id: inv.id, body: { method: payForm.method, amountCents: Math.round(Number(payForm.amount) * 100) } })}
                  disabled={!payForm.amount || payMutation.isPending}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-500 disabled:opacity-50"
                >
                  Zahlung erfassen
                </button>
                <button
                  onClick={() => { if (confirm(`Rechnung ${inv.number} stornieren? Es wird eine Gutschrift erstellt.`)) cancelMutation.mutate(inv.id); }}
                  className="ml-auto rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                >
                  Stornieren
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {pdfUrl && (
        <div className="fixed inset-0 z-60 flex flex-col bg-black/60 p-4">
          <div className="flex justify-end">
            <button onClick={() => setPdfUrl(null)} className="rounded-md bg-white px-3 py-1.5 text-sm">Schließen</button>
          </div>
          <iframe src={pdfUrl} className="mt-2 flex-1 rounded-lg bg-white" title="Rechnung PDF" />
        </div>
      )}
    </div>
  );
}
