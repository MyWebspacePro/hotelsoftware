import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { allowedTransitions, STATUS_LABELS, type BookingStatusValue } from "@hg/shared";
import { api, apiBlob } from "../api/client";
import { eur, type Article, type BookingView, type RatePlan, type Room } from "../api/types";
import type { FolioAccount, InvoiceView } from "../api/types2";

interface Props {
  booking: BookingView;
  onClose: () => void;
}

const METHODS = ["CASH", "CARD", "SEPA", "ONLINE", "VOUCHER", "TRANSFER"] as const;

export function BookingDetail({ booking, onClose }: Props) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<InvoiceView | null>(null);
  const [showFreeEntry, setShowFreeEntry] = useState(false);
  const [freeEntry, setFreeEntry] = useState({ text: "", qty: 1, price: 0, taxRateKey: "" });
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "CASH" as (typeof METHODS)[number] });
  const [advanceForm, setAdvanceForm] = useState({ amount: "", method: "SEPA" as (typeof METHODS)[number] });
  const [showAdvance, setShowAdvance] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const roomsQuery = useQuery({ queryKey: ["rooms"], queryFn: () => api<Room[]>("/rooms") });
  const plansQuery = useQuery({ queryKey: ["ratePlans"], queryFn: () => api<RatePlan[]>("/pricing/rate-plans") });
  const articlesQuery = useQuery({ queryKey: ["articles"], queryFn: () => api<Article[]>("/articles") });
  const folioQuery = useQuery({
    queryKey: ["folio", booking.id],
    queryFn: () => api<FolioAccount[]>(`/folios?bookingId=${booking.id}`),
  });
  const folio = folioQuery.data?.[0];

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["calendar"] });
    void queryClient.invalidateQueries({ queryKey: ["bookings"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["booking", booking.id] });
    void queryClient.invalidateQueries({ queryKey: ["folio", booking.id] });
    void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    setError(null);
  }

  const statusMutation = useMutation({
    mutationFn: (status: BookingStatusValue) => api(`/bookings/${booking.id}/status`, { method: "PATCH", body: { status } }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const resMutation = useMutation({
    mutationFn: ({ resId, body }: { resId: string; body: unknown }) =>
      api(`/bookings/${booking.id}/reservations/${resId}`, { method: "PATCH", body }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const deleteMutation = useMutation({
    mutationFn: () => api(`/bookings/${booking.id}`, { method: "DELETE" }),
    onSuccess: onClose,
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const entryMutation = useMutation({
    mutationFn: (body: unknown) => api(`/folios/${folio!.id}/entries`, { method: "POST", body }),
    onSuccess: () => { invalidate(); setShowFreeEntry(false); setFreeEntry({ text: "", qty: 1, price: 0, taxRateKey: "" }); },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const deleteEntryMutation = useMutation({
    mutationFn: (entryId: string) => api(`/folios/entries/${entryId}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const paymentMutation = useMutation({
    mutationFn: (body: unknown) => api(`/folios/${folio!.id}/payments`, { method: "POST", body }),
    onSuccess: () => { invalidate(); setPaymentForm({ amount: "", method: "CASH" }); },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const invoiceMutation = useMutation({
    mutationFn: () => api<InvoiceView>("/invoices/from-folio", { method: "POST", body: { folioId: folio!.id } }),
    onSuccess: (inv) => { invalidate(); setInvoice(inv); },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const advanceMutation = useMutation({
    mutationFn: (body: unknown) => api<InvoiceView>("/invoices/advance", { method: "POST", body }),
    onSuccess: (inv) => { invalidate(); setShowAdvance(false); setAdvanceForm({ amount: "", method: "SEPA" }); setInvoice(inv); },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });

  async function openPdf(id: string) {
    const url = await apiBlob(`/invoices/${id}/pdf`);
    setPdfUrl(url);
  }

  const charges = folio?.entries.filter((e) => e.kind === "CHARGE").reduce((s, e) => s + e.totalCents, 0) ?? 0;
  const credits = folio?.entries.filter((e) => e.kind !== "CHARGE").reduce((s, e) => s + e.totalCents, 0) ?? 0;
  const paid = folio?.payments.reduce((s, p) => s + p.amountCents, 0) ?? 0;
  const openCents = charges - credits - paid;
  const nextStatuses = allowedTransitions(booking.status);
  const touristTaxCents = folio?.entries.filter((e) => e.isTouristTax).reduce((s, e) => s + e.totalCents, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8" onClick={onClose}>
      <div className="w-full max-w-4xl rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Buchung · {booking.guest ? `${booking.guest.firstName} ${booking.guest.lastName}` : "ohne Gast"}
            </h2>
            <p className="text-sm text-slate-500">
              <span className="mr-2 inline-block rounded px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: statusColor(booking.status) }}>
                {STATUS_LABELS[booking.status]}
              </span>
              Quelle: {booking.source}
              {booking.guest?.email ? ` · ${booking.guest.email}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md bg-slate-100 px-3 py-1.5 text-sm hover:bg-slate-200">Schließen</button>
        </div>

        {/* Status-Wechsel */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {nextStatuses.map((s) => (
            <button
              key={s}
              onClick={() => statusMutation.mutate(s)}
              disabled={statusMutation.isPending}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-white hover:brightness-110"
              style={{ backgroundColor: statusColor(s) }}
            >
              → {STATUS_LABELS[s]}
            </button>
          ))}
          {booking.status === "CONFIRMED" && (
            <button onClick={() => { setShowAdvance(true); setAdvanceForm({ amount: "", method: "SEPA" }); }} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              Anzahlung
            </button>
          )}
          <button
            onClick={() => { if (confirm("Buchung endgültig löschen (archiviert)?")) deleteMutation.mutate(); }}
            className="ml-auto rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          >
            Löschen
          </button>
        </div>

        {showAdvance && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-blue-50 p-3">
            <input type="number" placeholder="Betrag EUR" value={advanceForm.amount} onChange={(e) => setAdvanceForm({ ...advanceForm, amount: e.target.value })} className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <select value={advanceForm.method} onChange={(e) => setAdvanceForm({ ...advanceForm, method: e.target.value as (typeof METHODS)[number] })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <button
              onClick={() => advanceMutation.mutate({ bookingId: booking.id, amountCents: Math.round(Number(advanceForm.amount) * 100), method: advanceForm.method })}
              disabled={!advanceForm.amount || advanceMutation.isPending}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
            >
              Anzahlungsrechnung + Zahlung
            </button>
            <button onClick={() => setShowAdvance(false)} className="text-sm text-slate-500">Abbrechen</button>
          </div>
        )}

        {error && <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {/* Reservierungen */}
        <div className="mt-4 space-y-3">
          {booking.reservations.map((r) => (
            <div key={r.id} className="rounded-lg border border-slate-200 p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                <label className="text-xs text-slate-500">
                  Anreise
                  <input type="date" defaultValue={r.dateFrom} onChange={(e) => resMutation.mutate({ resId: r.id, body: { dateFrom: e.target.value } })} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                </label>
                <label className="text-xs text-slate-500">
                  Abreise
                  <input type="date" defaultValue={r.dateTo} onChange={(e) => resMutation.mutate({ resId: r.id, body: { dateTo: e.target.value } })} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                </label>
                <label className="text-xs text-slate-500">
                  Zimmer
                  <select defaultValue={r.roomId ?? ""} onChange={(e) => resMutation.mutate({ resId: r.id, body: { roomId: e.target.value || undefined } })} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                    <option value="">(kein fixes Zimmer)</option>
                    {roomsQuery.data?.filter((room) => room.roomTypeId === r.roomTypeId).map((room) => (
                      <option key={room.id} value={room.id}>{room.number}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-500">
                  Erw.
                  <input type="number" min={1} defaultValue={r.adults} onBlur={(e) => { if (Number(e.target.value) !== r.adults) resMutation.mutate({ resId: r.id, body: { adults: Number(e.target.value) } }); }} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                </label>
                <label className="text-xs text-slate-500">
                  Ki.
                  <input type="number" min={0} defaultValue={r.children} onBlur={(e) => { if (Number(e.target.value) !== r.children) resMutation.mutate({ resId: r.id, body: { children: Number(e.target.value) } }); }} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                </label>
                <label className="text-xs text-slate-500">
                  Rate
                  <select defaultValue={r.ratePlanId ?? ""} onChange={(e) => resMutation.mutate({ resId: r.id, body: { ratePlanId: e.target.value || undefined } })} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                    <option value="">—</option>
                    {plansQuery.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                <span>
                  {r.roomType.name} · {r.adults} Erw. {r.children > 0 ? `+ ${r.children} Ki.` : ""}
                  {r.room ? ` · Zimmer ${r.room.number}` : " · flexibel"}
                </span>
                <span className="font-medium text-slate-800">{eur(r.priceTotalCents)} ({eur(r.pricePerNightCents)}/Nacht)</span>
              </div>
            </div>
          ))}
        </div>

        {booking.notes && <p className="mt-3 text-sm text-slate-600">Notizen: {booking.notes}</p>}

        {/* ── Abrechnung / Folio ─────────────────────────────── */}
        {folio && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-800">Gastkonto (Folio)</h3>
              <span className="ml-auto text-sm">
                Verzehr <strong>{eur(charges)}</strong> · gezahlt <strong>{eur(paid)}</strong> ·{" "}
                <span className={openCents > 0 ? "text-red-600" : "text-green-700"}>offen {eur(openCents)}</span>
                {touristTaxCents > 0 ? ` · Kurtaxe ${eur(touristTaxCents)}` : ""}
              </span>
            </div>

            {/* Artikel-Schnellbuchung */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {articlesQuery.data?.filter((a) => a.active).map((a) => (
                <button
                  key={a.id}
                  onClick={() => entryMutation.mutate({ articleId: a.id, qty: 1 })}
                  disabled={entryMutation.isPending}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:border-blue-400 hover:text-blue-700"
                  title={`${a.name} · ${eur(a.unitPriceCents)} · ${a.taxRateKey}`}
                >
                  + {a.name}
                </button>
              ))}
              <button onClick={() => setShowFreeEntry(!showFreeEntry)} className="rounded-full border border-dashed border-slate-400 px-3 py-1 text-xs text-slate-600 hover:border-slate-600">
                + Freitext…
              </button>
            </div>

            {showFreeEntry && (
              <div className="mt-2 grid grid-cols-5 gap-2">
                <input placeholder="Bezeichnung" value={freeEntry.text} onChange={(e) => setFreeEntry({ ...freeEntry, text: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                <input type="number" min={1} value={freeEntry.qty} onChange={(e) => setFreeEntry({ ...freeEntry, qty: Number(e.target.value) })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                <input type="number" step={0.5} placeholder="EUR" value={freeEntry.price || ""} onChange={(e) => setFreeEntry({ ...freeEntry, price: Number(e.target.value) })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                <select value={freeEntry.taxRateKey} onChange={(e) => setFreeEntry({ ...freeEntry, taxRateKey: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">Steuerschlüssel…</option>
                  <option value="MANUAL_LOGIS">Logis-Satz</option>
                  <option value="MANUAL_FOOD">Speisen/Getränke</option>
                  <option value="MANUAL_OTHER">Sonstiges</option>
                </select>
                <button
                  onClick={() =>
                    entryMutation.mutate({
                      text: freeEntry.text,
                      qty: freeEntry.qty,
                      unitPriceCents: Math.round(freeEntry.price * 100),
                      taxRateKey: freeEntry.taxRateKey,
                    })
                  }
                  disabled={!freeEntry.text || !freeEntry.price || !freeEntry.taxRateKey || entryMutation.isPending}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  Buchen
                </button>
              </div>
            )}

            {/* Posten-Tabelle */}
            <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Text</th>
                    <th className="px-2 py-2">Nacht</th>
                    <th className="px-2 py-2 text-right">Qty</th>
                    <th className="px-2 py-2 text-right">Betrag</th>
                    <th className="px-2 py-2">St.</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {folio.entries.map((e) => (
                    <tr key={e.id} className={e.kind !== "CHARGE" ? "text-green-700" : ""}>
                      <td className="px-2 py-1.5">{e.text}{e.invoiceId ? " ✓fakt." : ""}</td>
                      <td className="px-2 py-1.5 text-slate-500">{e.nightDate ? e.nightDate.slice(5) : "—"}</td>
                      <td className="px-2 py-1.5 text-right">{e.qty}</td>
                      <td className={`px-2 py-1.5 text-right font-medium ${e.kind !== "CHARGE" ? "" : "text-slate-800"}`}>
                        {e.kind !== "CHARGE" ? "-" : ""}{eur(e.totalCents)}
                      </td>
                      <td className="px-2 py-1.5 text-slate-400">{e.isTouristTax ? "Tax" : `${Math.round(e.taxRate * 100)}%`}</td>
                      <td className="px-2 py-1.5 text-right">
                        {!e.invoiceId && (
                          <button onClick={() => deleteEntryMutation.mutate(e.id)} className="text-red-500 hover:text-red-700">×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {folio.entries.length === 0 && (
                    <tr><td colSpan={6} className="px-2 py-3 text-center text-slate-400">Noch keine Posten — Check-in bucht Logis & Kurtaxe automatisch</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Zahlungen */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input type="number" placeholder="Betrag EUR" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              <select value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value as (typeof METHODS)[number] })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <button
                onClick={() => paymentMutation.mutate({ method: paymentForm.method, amountCents: Math.round(Number(paymentForm.amount) * 100) })}
                disabled={!paymentForm.amount || paymentMutation.isPending}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-500 disabled:opacity-50"
              >
                Zahlung erfassen
              </button>
              <button
                onClick={() => invoiceMutation.mutate()}
                disabled={charges - credits === 0 || invoiceMutation.isPending}
                className="ml-auto rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Rechnung erstellen
              </button>
            </div>

            {folio.payments.length > 0 && (
              <div className="mt-2 text-xs text-slate-500">
                Zahlungen: {folio.payments.map((p) => `${eur(p.amountCents)} ${p.method}`).join(" · ")}
              </div>
            )}
          </div>
        )}

        {/* Rechnungs-PDF-Vorschau */}
        {pdfUrl && (
          <div className="fixed inset-0 z-60 flex flex-col bg-black/60 p-4">
            <div className="flex justify-end">
              <button onClick={() => setPdfUrl(null)} className="rounded-md bg-white px-3 py-1.5 text-sm">Schließen</button>
            </div>
            <iframe src={pdfUrl} className="mt-2 flex-1 rounded-lg bg-white" title="Rechnung PDF" />
          </div>
        )}
        {invoice && !pdfUrl && (
          <button onClick={() => openPdf(invoice.id)} className="mt-3 rounded-md bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700">
            Rechnung {invoice.number} als PDF öffnen ({eur(invoice.grossCents, invoice.currency)})
          </button>
        )}
      </div>
    </div>
  );
}

function statusColor(status: BookingStatusValue): string {
  const colors: Record<BookingStatusValue, string> = {
    INQUIRY: "#f59e0b",
    OFFERED: "#3b82f6",
    CONFIRMED: "#22c55e",
    CHECKED_IN: "#8b5cf6",
    CHECKED_OUT: "#64748b",
    CANCELLED: "#ef4444",
    NO_SHOW: "#f97316",
  };
  return colors[status];
}
