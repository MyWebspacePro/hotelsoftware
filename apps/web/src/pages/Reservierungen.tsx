import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { STATUS_LABELS, STATUS_COLORS, type BookingStatusValue } from "@hg/shared";
import { api } from "../api/client";
import { eur, type BookingView } from "../api/types";
import { BookingDialog } from "../components/BookingDialog";
import { BookingDetail } from "../components/BookingDetail";

const ALL_STATUSES: BookingStatusValue[] = ["INQUIRY", "OFFERED", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED", "NO_SHOW"];

export function Reservierungen() {
  const [statusFilter, setStatusFilter] = useState<BookingStatusValue[]>(["INQUIRY", "OFFERED", "CONFIRMED", "CHECKED_IN"]);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const bookingsQuery = useQuery({
    queryKey: ["bookings", statusFilter, query],
    queryFn: () =>
      api<BookingView[]>(
        `/bookings?status=${statusFilter.join(",")}${query ? `&q=${encodeURIComponent(query)}` : ""}&limit=200`,
      ),
  });
  const detailQuery = useQuery({
    queryKey: ["booking", detailId],
    queryFn: () => api<BookingView>(`/bookings/${detailId}`),
    enabled: Boolean(detailId),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["bookings"] });
    void queryClient.invalidateQueries({ queryKey: ["booking", detailId] });
    void queryClient.invalidateQueries({ queryKey: ["calendar"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-slate-800">Reservierungen</h1>
        <button onClick={() => setDialogOpen(true)} className="ml-auto rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500">
          + Neue Buchung
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {ALL_STATUSES.map((s) => {
          const active = statusFilter.includes(s);
          return (
            <button
              key={s}
              onClick={() =>
                setStatusFilter(active ? statusFilter.filter((x) => x !== s) : [...statusFilter, s])
              }
              className="rounded-full px-3 py-1 text-xs font-medium text-white"
              style={{ backgroundColor: active ? STATUS_COLORS[s] : "#cbd5e1" }}
            >
              {STATUS_LABELS[s]}
            </button>
          );
        })}
        <input
          placeholder="Gast / Notiz suchen…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="ml-auto w-56 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Gast</th>
              <th className="px-4 py-3">Zeitraum</th>
              <th className="px-4 py-3">Zimmer / Typ</th>
              <th className="px-4 py-3">Pers.</th>
              <th className="px-4 py-3">Rate</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Preis</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bookingsQuery.data?.flatMap((b) =>
              b.reservations.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setDetailId(b.id)}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">
                    {b.guest ? `${b.guest.lastName}, ${b.guest.firstName}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {r.dateFrom.slice(8)}.{r.dateFrom.slice(5, 7)}. – {r.dateTo.slice(8)}.{r.dateTo.slice(5, 7)}.{r.dateTo.slice(0, 4)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {r.room ? `Zi. ${r.room.number} · ` : "flexibel · "}
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded" style={{ backgroundColor: r.roomType.color }} />
                      {r.roomType.name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{r.adults + r.children}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.ratePlan?.name ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: STATUS_COLORS[r.status] }}>
                      {STATUS_LABELS[r.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-slate-800">{eur(r.priceTotalCents)}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
        {bookingsQuery.data?.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-slate-400">Keine Reservierungen im Filter</div>
        )}
      </div>

      {dialogOpen && <BookingDialog onClose={() => { setDialogOpen(false); refresh(); }} />}
      {detailId && detailQuery.data && <BookingDetail booking={detailQuery.data} onClose={() => { setDetailId(null); refresh(); }} />}
    </div>
  );
}
