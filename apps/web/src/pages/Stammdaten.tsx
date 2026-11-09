import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { eur, type Room, type RoomType } from "../api/types";

const COLORS = ["#6366f1", "#0ea5e9", "#22c55e", "#a855f7", "#f59e0b", "#ef4444", "#14b8a6", "#f97316"];

export function Stammdaten() {
  const queryClient = useQueryClient();
  const typesQuery = useQuery({ queryKey: ["roomTypes"], queryFn: () => api<RoomType[]>("/rooms/types") });
  const roomsQuery = useQuery({ queryKey: ["rooms"], queryFn: () => api<Room[]>("/rooms") });

  const [typeForm, setTypeForm] = useState({ name: "", capacity: 2, maxExtraBeds: 0, basePrice: 120, color: COLORS[0], description: "" });
  const [roomForm, setRoomForm] = useState({ roomTypeId: "", number: "", floor: "" });
  const [error, setError] = useState<string | null>(null);

  const createType = useMutation({
    mutationFn: (body: unknown) => api("/rooms/types", { method: "POST", body }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["roomTypes"] }); setTypeForm({ name: "", capacity: 2, maxExtraBeds: 0, basePrice: 120, color: COLORS[0], description: "" }); setError(null); },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const createRoom = useMutation({
    mutationFn: (body: unknown) => api("/rooms", { method: "POST", body }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["rooms"] }); void queryClient.invalidateQueries({ queryKey: ["roomTypes"] }); setRoomForm({ roomTypeId: "", number: "", floor: "" }); setError(null); },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const deleteRoom = useMutation({
    mutationFn: (id: string) => api(`/rooms/${id}`, { method: "DELETE" }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["rooms"] }); void queryClient.invalidateQueries({ queryKey: ["roomTypes"] }); },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const deleteType = useMutation({
    mutationFn: (id: string) => api(`/rooms/types/${id}`, { method: "DELETE" }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["roomTypes"] }); },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">Stammdaten</h1>
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* Zimmertypen */}
      <section>
        <h2 className="mb-2 font-medium text-slate-700">Zimmertypen</h2>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-8">
          <input placeholder="Name" value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input type="number" min={1} title="Kapazität" value={typeForm.capacity} onChange={(e) => setTypeForm({ ...typeForm, capacity: Number(e.target.value) })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input type="number" min={0} title="Extrabetten" value={typeForm.maxExtraBeds} onChange={(e) => setTypeForm({ ...typeForm, maxExtraBeds: Number(e.target.value) })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input type="number" min={0} step={5} title="Basispreis (EUR)" value={typeForm.basePrice} onChange={(e) => setTypeForm({ ...typeForm, basePrice: Number(e.target.value) })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <select value={typeForm.color} onChange={(e) => setTypeForm({ ...typeForm, color: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input placeholder="Beschreibung" value={typeForm.description} onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
          <button
            onClick={() => createType.mutate({ name: typeForm.name, capacity: typeForm.capacity, maxExtraBeds: typeForm.maxExtraBeds, basePriceCents: Math.round(typeForm.basePrice * 100), color: typeForm.color, description: typeForm.description || undefined })}
            disabled={!typeForm.name || createType.isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            + Typ
          </button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {typesQuery.data?.map((t) => (
            <div key={t.id} className="rounded-xl bg-white p-4 shadow">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: t.color }} />
                <span className="font-medium text-slate-800">{t.name}</span>
                <span className="ml-auto text-xs text-slate-400">{t._count.rooms} Zimmer</span>
              </div>
              <div className="mt-1 text-sm text-slate-600">
                {t.capacity} Pers. · {t.maxExtraBeds} Extrabetten · Basis {eur(t.basePriceCents)}
              </div>
              {t.description && <div className="text-xs text-slate-400">{t.description}</div>}
              <button
                onClick={() => { if (t._count.rooms === 0 && confirm(`Typ ${t.name} löschen?`)) deleteType.mutate(t.id); }}
                disabled={t._count.rooms > 0}
                className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-40"
                title={t._count.rooms > 0 ? "Erst alle Zimmer des Typs entfernen" : "Typ löschen"}
              >
                Löschen
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Zimmer */}
      <section>
        <h2 className="mb-2 font-medium text-slate-700">Zimmer ({roomsQuery.data?.length ?? 0})</h2>
        <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-5">
          <select value={roomForm.roomTypeId} onChange={(e) => setRoomForm({ ...roomForm, roomTypeId: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">Zimmertyp…</option>
            {typesQuery.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input placeholder="Nummer" value={roomForm.number} onChange={(e) => setRoomForm({ ...roomForm, number: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="Etage" type="number" value={roomForm.floor} onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <button
            onClick={() => createRoom.mutate({ roomTypeId: roomForm.roomTypeId, number: roomForm.number, floor: roomForm.floor ? Number(roomForm.floor) : undefined })}
            disabled={!roomForm.roomTypeId || !roomForm.number || createRoom.isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            + Zimmer
          </button>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-8 lg:grid-cols-12">
          {roomsQuery.data?.map((r) => (
            <div key={r.id} className="group relative rounded-md border border-slate-200 px-2 py-1.5 text-center text-sm">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: r.roomType.color }} />
              <span className="ml-1 font-medium text-slate-700">{r.number}</span>
              <span className="text-[10px] text-slate-400 block">{r.roomType.name}</span>
              <button
                onClick={() => { if (confirm(`Zimmer ${r.number} löschen?`)) deleteRoom.mutate(r.id); }}
                className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white group-hover:flex"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
