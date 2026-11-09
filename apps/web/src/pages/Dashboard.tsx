import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../state/auth";

interface HotelResponse {
  id: string;
  name: string;
  address: string | null;
  zip: string | null;
  city: string | null;
  country: "DE" | "AT" | "CH";
  currency: "EUR" | "CHF";
  systemConfig: { config: Record<string, unknown> } | null;
}

const COMING_MODULES = [
  "Zimmerplan & Reservierung (Phase 1)",
  "Rechnungslegung & Kurtaxe (Phase 2)",
  "Meldewesen & DSGVO-Löschläufe (Phase 3)",
  "Housekeeping & Personal (Phase 4)",
  "Buchungsanfrage & iCal-Kanäle (Phase 5)",
];

export function Dashboard() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { data: hotel, error } = useQuery({
    queryKey: ["hotel"],
    queryFn: () => api<HotelResponse>("/hotel"),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">{t("nav.overview")}</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl bg-white p-5 shadow">
          <div className="text-sm text-slate-500">Hotel</div>
          <div className="mt-1 text-lg font-semibold text-slate-800">
            {hotel?.name ?? "—"}
          </div>
          <div className="text-sm text-slate-500">
            {hotel ? `${hotel.zip ?? ""} ${hotel.city ?? ""} · ${hotel.country} · ${hotel.currency}` : ""}
          </div>
        </div>
        <div className="rounded-xl bg-white p-5 shadow">
          <div className="text-sm text-slate-500">Eingeloggt als</div>
          <div className="mt-1 text-lg font-semibold text-slate-800">
            {user?.firstName} {user?.lastName}
          </div>
          <div className="text-sm text-slate-500">{user?.role}</div>
        </div>
        <div className="rounded-xl bg-white p-5 shadow">
          <div className="text-sm text-slate-500">Länder-Konfiguration</div>
          <div className="mt-1 text-sm text-slate-700">
            DE · AT · CH ab Tag 1 aktiv (USt-Matrix, Kurtaxe-Engine, Meldeprofile in Phase 2/3)
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white p-5 shadow">
        <h2 className="font-medium text-slate-700">Roadmap</h2>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          {COMING_MODULES.map((m) => (
            <li key={m}>· {m}</li>
          ))}
        </ul>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {t("common.error")}: {error instanceof Error ? error.message : "unbekannt"}
        </div>
      )}
    </div>
  );
}
