import { useMemo, useState, type MouseEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, STATUS_COLORS, STATUS_LABELS, todayIso, type BookingStatusValue } from "@hg/shared";
import { api } from "../api/client";
import { eur, type BookingView, type CalendarData, type CalReservation } from "../api/types";
import { BookingDialog } from "../components/BookingDialog";
import { BookingDetail } from "../components/BookingDetail";

const DAY_W = 44; // Pixel pro Tag
const ROW_H = 34;

interface Selection {
  roomId: string | null;
  roomTypeId: string;
  dateFrom: string;
  dateTo: string;
}

/**
 * Grafischer Zimmerplan: Zimmerzeilen (nach Typ gruppiert), Monats-/Wochenansicht,
 * Drag über Tagzellen = neue Buchung, Klick auf Balken = Buchungsdetails.
 */
export function Zimmerplan() {
  const queryClient = useQueryClient();
  const [spanDays, setSpanDays] = useState(31);
  const [start, setStart] = useState(() => startOfMonthIso());
  const [dialog, setDialog] = useState<Selection | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ roomId: string; roomTypeId: string; fromIdx: number; toIdx: number } | null>(null);

  const calendarQuery = useQuery({
    queryKey: ["calendar", start, spanDays],
    queryFn: () => api<CalendarData>(`/calendar?from=${start}&to=${addDays(start, spanDays)}`),
  });
  const detailQuery = useQuery({
    queryKey: ["booking", detailId],
    queryFn: () => api<BookingView>(`/bookings/${detailId}`),
    enabled: Boolean(detailId),
  });

  const days = calendarQuery.data?.days ?? [];
  const dayIdx = useMemo(() => new Map(days.map((d, i) => [d, i])), [days]);

  // Reservierungen je Zimmer-Zeile; ohne Zimmer auf Typ-Kopfzeilen
  const byRoom = useMemo(() => {
    const map = new Map<string, CalReservation[]>();
    for (const r of calendarQuery.data?.reservations ?? []) {
      if (r.roomId) {
        const list = map.get(r.roomId) ?? [];
        list.push(r);
        map.set(r.roomId, list);
      }
    }
    return map;
  }, [calendarQuery.data]);

  function cellDate(roomTypeId: string, roomId: string, idx: number) {
    const from = days[idx];
    return { roomId, roomTypeId, dateFrom: from, dateTo: addDays(from, 1) };
  }

  function onRowMouseDown(e: MouseEvent, roomId: string, roomTypeId: string) {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const idx = Math.max(0, Math.min(days.length - 1, Math.floor((e.clientX - rect.left) / DAY_W)));
    setDrag({ roomId, roomTypeId, fromIdx: idx, toIdx: idx });
  }

  function onRowMouseMove(e: MouseEvent) {
    if (!drag) return;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const idx = Math.max(0, Math.min(days.length - 1, Math.floor((e.clientX - rect.left) / DAY_W)));
    if (idx !== drag.toIdx) setDrag({ ...drag, toIdx: idx });
  }

  function onRowMouseUp() {
    if (!drag) return;
    const [a, b] = [Math.min(drag.fromIdx, drag.toIdx), Math.max(drag.fromIdx, drag.toIdx)];
    if (days[a]) {
      setDialog({
        roomId: drag.roomId,
        roomTypeId: drag.roomTypeId,
        dateFrom: days[a],
        dateTo: addDays(days[b], 1),
      });
    }
    setDrag(null);
  }

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["calendar"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const label = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][d.getUTCDay()];
  };
  const isWeekend = (iso: string) => [0, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-slate-800">Zimmerplan</h1>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setStart(addDays(start, -spanDays))} className="rounded-md bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-slate-50">‹</button>
          <button onClick={() => setStart(startOfMonthIso())} className="rounded-md bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-slate-50">Heute</button>
          <button onClick={() => setStart(addDays(start, spanDays))} className="rounded-md bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-slate-50">›</button>
          <select value={spanDays} onChange={(e) => setSpanDays(Number(e.target.value))} className="rounded-md bg-white px-2 py-1.5 text-sm shadow-sm">
            <option value={14}>2 Wochen</option>
            <option value={31}>Monat</option>
            <option value={62}>2 Monate</option>
          </select>
          <button
            onClick={() => setDialog({ roomId: null, roomTypeId: "", dateFrom: addDays(todayIso(), 0), dateTo: addDays(todayIso(), 2) })}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
          >
            + Buchung
          </button>
        </div>
      </div>

      {calendarQuery.isLoading && <div className="text-slate-500">Lädt…</div>}
      {calendarQuery.data && (
        <div className="overflow-x-auto rounded-xl bg-white shadow">
          <div style={{ minWidth: 160 + days.length * DAY_W }}>
            {/* Kopfzeile: Tage */}
            <div className="flex border-b border-slate-200 bg-slate-50">
              <div className="sticky left-0 z-10 w-40 shrink-0 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">Zimmer</div>
              {days.map((d) => (
                <div key={d} className={`shrink-0 py-1 text-center text-xs ${isWeekend(d) ? "bg-slate-100 text-slate-700" : "text-slate-500"}`} style={{ width: DAY_W }}>
                  <div className="font-medium">{d.slice(8)}</div>
                  <div>{label(d)}</div>
                </div>
              ))}
            </div>

            {/* Zeilen nach Zimmertyp gruppiert */}
            {calendarQuery.data.roomTypes.map((rt) => {
              const rooms = calendarQuery.data!.rooms.filter((r) => r.roomTypeId === rt.id);
              const unassigned = calendarQuery.data!.reservations.filter((r) => r.roomTypeId === rt.id && !r.roomId && r.status !== "CANCELLED");
              return (
                <div key={rt.id}>
                  <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-3 py-1.5 text-sm font-semibold text-slate-700">
                    <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: rt.color }} />
                    {rt.name}
                    <span className="text-xs font-normal text-slate-400">{rooms.length} Zimmer · {rt.capacity} Pers.</span>
                    {unassigned.length > 0 && (
                      <span className="ml-auto flex items-center gap-1 text-xs font-normal text-amber-700">
                        ohne fixes Zimmer:
                        {unassigned.map((r) => (
                          <span
                            key={r.id}
                            onClick={() => setDetailId(r.bookingId)}
                            className="cursor-pointer rounded px-1 text-white"
                            style={{ backgroundColor: STATUS_COLORS[r.status] }}
                          >
                            {r.guestName} {days.includes(r.dateFrom) ? "" : "→"}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  {rooms.map((room) => {
                    const resList = byRoom.get(room.id) ?? [];
                    return (
                      <div key={room.id} className="relative flex border-b border-slate-100" style={{ height: ROW_H }}>
                        <div className="sticky left-0 z-10 flex w-40 shrink-0 items-center gap-2 bg-white px-3 text-sm text-slate-700">
                          <span className="font-medium">{room.number}</span>
                          <span className="text-xs text-slate-400">{room.roomTypeName}</span>
                        </div>
                        {/* Zell-/Balken-Bereich */}
                        <div
                          className="relative flex-1 cursor-cell select-none"
                          onMouseDown={(e) => onRowMouseDown(e, room.id, room.roomTypeId)}
                          onMouseMove={onRowMouseMove}
                          onMouseUp={onRowMouseUp}
                        >
                          {days.map((d) => (
                            <div key={d} className={`absolute top-0 h-full border-r border-slate-100 ${isWeekend(d) ? "bg-slate-50" : ""}`} style={{ left: (dayIdx.get(d) ?? 0) * DAY_W, width: DAY_W }} />
                          ))}
                          {/* Drag-Auswahl */}
                          {drag?.roomId === room.id && (
                            <div className="absolute top-1 bottom-1 rounded bg-blue-500/25 border-2 border-dashed border-blue-500" style={{ left: Math.min(drag.fromIdx, drag.toIdx) * DAY_W, width: (Math.abs(drag.toIdx - drag.fromIdx) + 1) * DAY_W }} />
                          )}
                          {/* Reservierungs-Balken */}
                          {resList.map((r) => {
                            const startIdx = dayIdx.get(r.dateFrom);
                            const endIdx = dayIdx.get(addDays(r.dateTo, -1));
                            if (startIdx === undefined) return null;
                            const visibleEnd = endIdx ?? days.length - 1;
                            const clippedStart = Math.max(0, startIdx);
                            return (
                              <div
                                key={r.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDetailId(r.bookingId);
                                }}
                                title={`${r.guestName} · ${r.dateFrom}–${r.dateTo} · ${STATUS_LABELS[r.status]} · ${eur(r.priceTotalCents)}`}
                                className="absolute top-1 flex h-[26px] cursor-pointer items-center overflow-hidden rounded-md px-2 text-xs font-medium text-white shadow-sm hover:brightness-110"
                                style={{
                                  left: clippedStart * DAY_W,
                                  width: (visibleEnd - clippedStart + 1) * DAY_W - 4,
                                  backgroundColor: STATUS_COLORS[r.status],
                                  opacity: r.status === "CANCELLED" || r.status === "INQUIRY" ? 0.75 : 1,
                                }}
                              >
                                {r.guestName}
                                {r.status !== "CONFIRMED" && <span className="ml-1 text-[10px] opacity-80">{STATUS_LABELS[r.status]}</span>}
                              </div>
                            );
                          })}
                          {/* Heute-Markierung */}
                          {days.includes(todayIso()) && (
                            <div className="absolute top-0 h-full w-0.5 bg-red-400" style={{ left: dayIdx.get(todayIso())! * DAY_W + DAY_W / 2 }} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legende */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        {(["INQUIRY", "OFFERED", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED", "NO_SHOW"] as BookingStatusValue[]).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: STATUS_COLORS[s] }} />
            {STATUS_LABELS[s]}
          </span>
        ))}
      </div>

      {dialog && <BookingDialog initial={{ roomId: dialog.roomId ?? undefined, dateFrom: dialog.dateFrom, dateTo: dialog.dateTo }} onClose={() => { setDialog(null); refresh(); }} />}
      {detailId && detailQuery.data && (
        <BookingDetail
          booking={detailQuery.data}
          onClose={() => { setDetailId(null); refresh(); }}
        />
      )}
    </div>
  );
}

function startOfMonthIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}
