import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { allowedTransitions, STATUS_LABELS, type BookingStatusValue } from "@hg/shared";
import { api } from "../api/client";
import { eur, type BookingView, type RatePlan, type Room } from "../api/types";

interface Props {
  booking: BookingView;
  onClose: () => void;
}

/**
 * Buchungsdetails: Status-Wechsel (Statusmaschine aus shared), Reservierungs-
 * Bearbeitung (Zimmer/Datum/Personen), Storno/No-Show, Löschen.
 */
export function BookingDetail({ booking, onClose }: Props) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const roomsQuery = useQuery({ queryKey: ["rooms"], queryFn: () => api<Room[]>("/rooms") });
  const plansQuery = useQuery({ queryKey: ["ratePlans"], queryFn: () => api<RatePlan[]>("/pricing/rate-plans") });

  const statusMutation = useMutation({
    mutationFn: (status: BookingStatusValue) => api(`/bookings/${booking.id}/status`, { method: "PATCH", body: { status } }),
    onSuccess: () => invalidate(),
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const resMutation = useMutation({
    mutationFn: ({ resId, body }: { resId: string; body: unknown }) =>
      api(`/bookings/${booking.id}/reservations/${resId}`, { method: "PATCH", body }),
    onSuccess: () => invalidate(),
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const deleteMutation = useMutation({
    mutationFn: () => api(`/bookings/${booking.id}`, { method: "DELETE" }),
    onSuccess: onClose,
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["calendar"] });
    void queryClient.invalidateQueries({ queryKey: ["bookings"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["booking", booking.id] });
    setError(null);
  }

  const nextStatuses = allowedTransitions(booking.status);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Buchung · {booking.guest ? `${booking.guest.firstName} ${booking.guest.lastName}` : "ohne Gast"}
            </h2>
            <p className="text-sm text-slate-500">
              <span
                className="mr-2 inline-block rounded px-2 py-0.5 text-xs font-medium text-white"
                style={{ backgroundColor: statusColor(booking.status) }}
              >
                {STATUS_LABELS[booking.status]}
              </span>
              Quelle: {booking.source} · angelegt {new Date(booking.createdAt).toLocaleDateString("de-DE")}
              {booking.guest?.email ? ` · ${booking.guest.email}` : ""}
              {booking.guest?.phone ? ` · ${booking.guest.phone}` : ""}
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
          <button
            onClick={() => {
              if (confirm("Buchung endgültig löschen (archiviert)?")) deleteMutation.mutate();
            }}
            className="ml-auto rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          >
            Löschen
          </button>
        </div>

        {error && <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {/* Reservierungen */}
        <div className="mt-4 space-y-3">
          {booking.reservations.map((r) => (
            <div key={r.id} className="rounded-lg border border-slate-200 p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                <label className="text-xs text-slate-500">
                  Anreise
                  <input
                    type="date"
                    defaultValue={r.dateFrom}
                    onChange={(e) => resMutation.mutate({ resId: r.id, body: { dateFrom: e.target.value } })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-xs text-slate-500">
                  Abreise
                  <input
                    type="date"
                    defaultValue={r.dateTo}
                    onChange={(e) => resMutation.mutate({ resId: r.id, body: { dateTo: e.target.value } })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-xs text-slate-500">
                  Zimmer
                  <select
                    defaultValue={r.roomId ?? ""}
                    onChange={(e) => resMutation.mutate({ resId: r.id, body: { roomId: e.target.value || undefined } })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">(kein fixes Zimmer)</option>
                    {roomsQuery.data?.filter((room) => room.roomTypeId === r.roomTypeId).map((room) => (
                      <option key={room.id} value={room.id}>{room.number}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-500">
                  Erw.
                  <input
                    type="number" min={1} defaultValue={r.adults}
                    onBlur={(e) => { if (Number(e.target.value) !== r.adults) resMutation.mutate({ resId: r.id, body: { adults: Number(e.target.value) } }); }}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-xs text-slate-500">
                  Ki.
                  <input
                    type="number" min={0} defaultValue={r.children}
                    onBlur={(e) => { if (Number(e.target.value) !== r.children) resMutation.mutate({ resId: r.id, body: { children: Number(e.target.value) } }); }}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-xs text-slate-500">
                  Rate
                  <select
                    defaultValue={r.ratePlanId ?? ""}
                    onChange={(e) => resMutation.mutate({ resId: r.id, body: { ratePlanId: e.target.value || undefined } })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">—</option>
                    {plansQuery.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                <span>
                  {r.roomType.name} · {r.adults} Erw. {r.children > 0 ? `+ ${r.children} Ki.` : ""}
                  {r.room ? ` · Zimmer ${r.room.number}` : " · Zimmer flexibel"}
                </span>
                <span className="font-medium text-slate-800">{eur(r.priceTotalCents)} ({eur(r.pricePerNightCents)}/Nacht)</span>
              </div>
            </div>
          ))}
        </div>

        {booking.notes && <p className="mt-3 text-sm text-slate-600">Notizen: {booking.notes}</p>}
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
