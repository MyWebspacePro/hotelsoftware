import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../state/auth";
import type { DashboardStats, HotelResponse } from "../api/hotelTypes";

export function Dashboard() {
  const { user } = useAuth();
  const stats = useQuery({ queryKey: ["dashboard"], queryFn: () => api<DashboardStats>("/calendar/dashboard") });
  const hotel = useQuery({ queryKey: ["hotel"], queryFn: () => api<HotelResponse>("/hotel") });

  const cards = [
    { label: "Belegung heute Nacht", value: stats.data ? `${stats.data.occupiedTonight} / ${stats.data.totalRooms} (${stats.data.occupancyTonightPct} %)` : "…", color: "bg-blue-600" },
    { label: "Ankünfte heute", value: stats.data?.arrivalsToday ?? "…", color: "bg-green-600" },
    { label: "Abreisen heute", value: stats.data?.departuresToday ?? "…", color: "bg-amber-600" },
    { label: "Gäste im Haus", value: stats.data?.inHouseTonight ?? "…", color: "bg-violet-600" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">
        Guten Tag, {user?.firstName} 👋
      </h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl bg-white p-5 shadow">
            <div className="text-sm text-slate-500">{c.label}</div>
            <div className={`mt-1 text-2xl font-semibold ${c.color.replace("bg-", "text-")}`}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl bg-white p-5 shadow lg:col-span-1">
          <div className="text-sm text-slate-500">Hotel</div>
          <div className="mt-1 text-lg font-semibold text-slate-800">{hotel.data?.name ?? "—"}</div>
          <div className="text-sm text-slate-500">
            {hotel.data ? `${hotel.data.zip ?? ""} ${hotel.data.city ?? ""} · ${hotel.data.country} · ${hotel.data.currency}` : ""}
          </div>
          <div className="mt-3 text-xs text-slate-400">Länder-Konfiguration DE · AT · CH aktiv (USt-Matrix, Kurtaxe-Engine ab Phase 2)</div>
        </div>
        <div className="rounded-xl bg-white p-5 shadow lg:col-span-2">
          <h2 className="font-medium text-slate-700">Schnellzugriff</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Link to="/zimmerplan" className="rounded-lg bg-blue-50 p-3 text-sm font-medium text-blue-700 hover:bg-blue-100">Zimmerplan</Link>
            <Link to="/reservierungen" className="rounded-lg bg-green-50 p-3 text-sm font-medium text-green-700 hover:bg-green-100">Reservierungen</Link>
            <Link to="/gaeste" className="rounded-lg bg-violet-50 p-3 text-sm font-medium text-violet-700 hover:bg-violet-100">Gäste</Link>
            <Link to="/stammdaten" className="rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-700 hover:bg-amber-100">Stammdaten</Link>
          </div>
          <div className="mt-4 text-xs text-slate-400">
            Nächste Ausbaustufen: Rechnungslegung & Kurtaxe (Phase 2), Meldewesen & DSGVO (Phase 3), Housekeeping & Personal (Phase 4), Buchungsanfrage & iCal (Phase 5)
          </div>
        </div>
      </div>

      {stats.error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Kennzahlen konnten nicht geladen werden</div>
      )}
    </div>
  );
}
