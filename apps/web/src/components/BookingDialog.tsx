import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { eur, type AvailabilityRow, type BookingView, type Guest, type RatePlan, type RoomType } from "../api/types";
import { addDays } from "@hg/shared";

interface Props {
  /** Vorauswahl: Zimmer + Aufenthaltszeitraum (aus dem Zimmerplan). */
  initial?: { roomId?: string; dateFrom?: string; dateTo?: string };
  onClose: () => void;
}

const SOURCES = ["PHONE", "EMAIL", "WALK_IN"] as const;

/**
 * Neue Buchung: Gast (suchen oder neu), Zimmertyp mit Verfügbarkeit/Preis,
 * Daten, Personen, Rate. Drag/Click aus dem Zimmerplan vorbefüllt.
 */
export function BookingDialog({ initial, onClose }: Props) {
  const queryClient = useQueryClient();
  const [dateFrom, setDateFrom] = useState(initial?.dateFrom ?? addDays(todayIsoWeb(), 0));
  const [dateTo, setDateTo] = useState(initial?.dateTo ?? addDays(todayIsoWeb(), 1));
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [roomTypeId, setRoomTypeId] = useState<string>("");
  const [ratePlanId, setRatePlanId] = useState("");
  const [source, setSource] = useState<(typeof SOURCES)[number]>("PHONE");
  const [status, setStatus] = useState<"INQUIRY" | "OFFERED" | "CONFIRMED">("CONFIRMED");
  const [notes, setNotes] = useState("");
  const [force, setForce] = useState(false);
  const [guestMode, setGuestMode] = useState<"search" | "new">("search");
  const [guestId, setGuestId] = useState("");
  const [guestQuery, setGuestQuery] = useState("");
  const [newGuest, setNewGuest] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [error, setError] = useState<string | null>(null);

  const guestsQuery = useQuery({
    queryKey: ["guests", guestQuery],
    queryFn: () => api<Guest[]>(`/guests?q=${encodeURIComponent(guestQuery)}`),
  });
  const typesQuery = useQuery({ queryKey: ["roomTypes"], queryFn: () => api<RoomType[]>("/rooms/types") });
  const plansQuery = useQuery({ queryKey: ["ratePlans"], queryFn: () => api<RatePlan[]>("/pricing/rate-plans") });
  const availQuery = useQuery({
    queryKey: ["availability", dateFrom, dateTo],
    queryFn: () => api<AvailabilityRow[]>(`/calendar/availability?dateFrom=${dateFrom}&dateTo=${dateTo}`),
    enabled: dateFrom < dateTo,
  });

  const selectedAvail = useMemo(
    () => availQuery.data?.find((a) => a.roomTypeId === roomTypeId),
    [availQuery.data, roomTypeId],
  );

  const createMutation = useMutation({
    mutationFn: (body: unknown) => api<{ booking: BookingView; warnings: string[] }>("/bookings", { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["calendar"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });

  function submit() {
    setError(null);
    if (dateFrom >= dateTo) {
      setError("Abreise muss nach der Anreise liegen");
      return;
    }
    if (!roomTypeId) {
      setError("Zimmertyp wählen");
      return;
    }
    const guestPayload =
      guestMode === "new"
        ? { guest: { firstName: newGuest.firstName, lastName: newGuest.lastName, email: newGuest.email, phone: newGuest.phone } }
        : { guestId };
    createMutation.mutate({
      ...guestPayload,
      source,
      status,
      notes: notes || undefined,
      force: force || undefined,
      reservations: [{ roomTypeId, dateFrom, dateTo, adults, children, ratePlanId: ratePlanId || undefined }],
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Neue Buchung</h2>

        {/* Aufenthalt */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="text-sm">
            <span className="text-slate-500">Anreise</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-sm">
            <span className="text-slate-500">Abreise</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-sm">
            <span className="text-slate-500">Erwachsene</span>
            <input type="number" min={1} max={10} value={adults} onChange={(e) => setAdults(Number(e.target.value))} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-sm">
            <span className="text-slate-500">Kinder</span>
            <input type="number" min={0} max={10} value={children} onChange={(e) => setChildren(Number(e.target.value))} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
        </div>

        {/* Zimmertypen mit Verfügbarkeit */}
        <div className="mt-4">
          <span className="text-sm text-slate-500">Zimmertyp</span>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {availQuery.data?.map((a) => {
              const disabled = a.availableForStay < 1 || a.stopSellNights > 0;
              return (
                <button
                  key={a.roomTypeId}
                  type="button"
                  disabled={disabled}
                  onClick={() => setRoomTypeId(a.roomTypeId)}
                  className={`rounded-lg border p-2 text-left text-sm ${roomTypeId === a.roomTypeId ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"} ${disabled ? "opacity-40" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-medium text-slate-700">
                      <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: a.color }} />
                      {a.name}
                    </span>
                    <span className={a.availableForStay < 1 ? "text-red-600" : "text-green-700"}>
                      {a.availableForStay}/{a.totalRooms} frei
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {a.capacity} Pers. +{a.maxExtraBeds} Betten · {eur(a.suggestedPriceCents)} gesamt ({eur(a.suggestedPerNightCents)}/Nacht)
                    {a.minStayRequired > 1 ? ` · Min. ${a.minStayRequired} Nächte` : ""}
                    {a.stopSellNights > 0 ? " · Stop-Sell" : ""}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Gast */}
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Gast</span>
            <button type="button" onClick={() => setGuestMode(guestMode === "search" ? "new" : "search")} className="text-xs text-blue-600 hover:underline">
              {guestMode === "search" ? "Neuen Gast anlegen" : "Bestehenden Gast suchen"}
            </button>
          </div>
          {guestMode === "search" ? (
            <>
              <input
                type="text"
                placeholder="Name oder Ort suchen…"
                value={guestQuery}
                onChange={(e) => setGuestQuery(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
              <select value={guestId} onChange={(e) => setGuestId(e.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" size={4}>
                {guestsQuery.data?.slice(0, 50).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.lastName}, {g.firstName} {g.city ? `· ${g.city}` : ""}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <div className="mt-1 grid grid-cols-2 gap-2">
              <input placeholder="Vorname" value={newGuest.firstName} onChange={(e) => setNewGuest({ ...newGuest, firstName: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              <input placeholder="Nachname" value={newGuest.lastName} onChange={(e) => setNewGuest({ ...newGuest, lastName: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              <input placeholder="E-Mail" value={newGuest.email} onChange={(e) => setNewGuest({ ...newGuest, email: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              <input placeholder="Telefon" value={newGuest.phone} onChange={(e) => setNewGuest({ ...newGuest, phone: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
          )}
        </div>

        {/* Rate, Quelle, Status */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="text-slate-500">Rate</span>
            <select value={ratePlanId} onChange={(e) => setRatePlanId(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">—</option>
              {plansQuery.data?.filter((p) => p.active).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-500">Quelle</span>
            <select value={source} onChange={(e) => setSource(e.target.value as typeof source)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-500">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              <option value="INQUIRY">Anfrage</option>
              <option value="OFFERED">Angebot</option>
              <option value="CONFIRMED">Bestätigt</option>
            </select>
          </label>
        </div>
        <input placeholder="Notizen (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-3 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />

        {selectedAvail && selectedAvail.availableForStay < 1 && (
          <label className="mt-3 flex items-center gap-2 text-sm text-amber-700">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            Überbuchung erzwingen (force)
          </label>
        )}

        {error && <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md bg-slate-100 px-4 py-2 text-sm text-slate-700 hover:bg-slate-200">Abbrechen</button>
          <button type="button" onClick={submit} disabled={createMutation.isPending} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
            {createMutation.isPending ? "Speichert…" : "Buchung anlegen"}
          </button>
        </div>
      </div>
    </div>
  );
}

function todayIsoWeb(): string {
  return new Date().toISOString().slice(0, 10);
}
