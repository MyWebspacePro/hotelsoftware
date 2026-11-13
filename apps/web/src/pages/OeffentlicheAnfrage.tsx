import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { eur } from "../api/types";

/**
 * Öffentliche Buchungsanfrage (Phase 5) — ohne Login erreichbar unter /anfrage.
 * Verfügbarkeitscheck → Kategorienwahl → Kontaktformular → INQUIRY im Backoffice.
 */

interface PublicRoomType {
  roomTypeId: string;
  name: string;
  description: string | null;
  capacity: number;
  maxExtraBeds: number;
  fitsGuests: boolean;
  available: number;
  totalRooms: number;
  availableForStay: number;
  nights: number;
  suggestedTotalCents: number;
  suggestedPerNightCents: number;
  minStayRequired: number;
  stopSellNights: number;
}

interface AvailabilityResponse {
  hotel: { name: string; currency: string };
  dateFrom: string;
  dateTo: string;
  nights: number;
  roomTypes: PublicRoomType[];
}

interface InquiryResponse {
  ok: boolean;
  reference: string;
  nights: number;
  suggestedTotalCents: number;
}

function todayIsoWeb(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function OeffentlicheAnfrage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [selectedType, setSelectedType] = useState<PublicRoomType | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", arrivalTime: "", message: "", company: "" });
  const [error, setError] = useState<string | null>(null);

  const hotelQuery = useQuery({
    queryKey: ["publicHotel"],
    queryFn: () => api<{ hotel: { name: string; city: string | null } | null }>("/public/hotel"),
  });

  const availabilityMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<AvailabilityResponse>("/public/availability", { method: "POST", body }),
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler beim Verfügbarkeitscheck"),
  });

  const inquiryMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<InquiryResponse>("/public/inquiry", { method: "POST", body }),
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler beim Senden der Anfrage"),
  });

  const hotel = availabilityMutation.data?.hotel ?? hotelQuery.data?.hotel ?? null;

  function checkAvailability() {
    setError(null);
    if (!dateFrom || !dateTo || dateFrom >= dateTo) {
      setError("Bitte Anreise vor Abreise wählen.");
      return;
    }
    setSelectedType(null);
    availabilityMutation.mutate({ dateFrom, dateTo, adults, children });
  }

  function submitInquiry() {
    setError(null);
    if (!form.firstName || !form.lastName || !form.email) {
      setError("Bitte Name und E-Mail angeben.");
      return;
    }
    if (!selectedType) return;
    inquiryMutation.mutate({
      dateFrom: availabilityMutation.data!.dateFrom,
      dateTo: availabilityMutation.data!.dateTo,
      adults,
      children,
      roomTypeId: selectedType.roomTypeId,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      arrivalTime: form.arrivalTime,
      message: form.message,
      company: form.company, // Honeypot — bleibt unsichtbar
    });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <header className="bg-gradient-to-br from-sky-700 via-sky-600 to-indigo-700 px-4 py-12 text-center text-white">
        <h1 className="text-3xl font-bold sm:text-4xl">{hotel?.name ?? ""}</h1>
        <p className="mt-2 text-sky-100">Unverbindliche Buchungsanfrage — wir antworten innerhalb eines Werktags</p>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {inquiryMutation.data ? (
          /* ── Erfolg ── */
          <div className="rounded-2xl bg-white p-8 text-center shadow">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-3xl">✓</div>
            <h2 className="mt-4 text-xl font-semibold text-slate-800">Anfrage eingegangen!</h2>
            <p className="mt-2 text-slate-600">
              Vielen Dank, {form.firstName}! Ihre Anfrage für{" "}
              <strong>{selectedType?.name}</strong> ({availabilityMutation.data?.nights} Nächte,{" "}
              {availabilityMutation.data?.dateFrom} – {availabilityMutation.data?.dateTo}) ist bei uns eingegangen.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Referenz: <span className="font-mono font-medium">{inquiryMutation.data.reference}</span> · Preisvorschlag ca.{" "}
              <strong>{eur(inquiryMutation.data.suggestedTotalCents)}</strong>
            </p>
            <p className="mt-4 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">
              Wir melden uns per E-Mail ({form.email}) mit einem verbindlichen Angebot.
            </p>
          </div>
        ) : (
          <>
            {/* ── Schritt 1: Zeitraum ── */}
            <section className="rounded-2xl bg-white p-6 shadow">
              <h2 className="font-semibold text-slate-800">1 · Wann möchten Sie kommen?</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Anreise</span>
                  <input type="date" min={todayIsoWeb()} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Abreise</span>
                  <input type="date" min={dateFrom || todayIsoWeb()} value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Erwachsene</span>
                  <select value={adults} onChange={(e) => setAdults(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                    {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">Kinder</span>
                  <select value={children} onChange={(e) => setChildren(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                    {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>
              <button
                onClick={checkAvailability}
                disabled={availabilityMutation.isPending}
                className="mt-4 w-full rounded-lg bg-sky-600 px-6 py-3 font-semibold text-white hover:bg-sky-500 disabled:opacity-50 sm:w-auto"
              >
                {availabilityMutation.isPending ? "Prüfe Verfügbarkeit …" : "Verfügbarkeit prüfen"}
              </button>
            </section>

            {/* ── Schritt 2: Kategorien ── */}
            {availabilityMutation.data && (
              <section className="mt-6 rounded-2xl bg-white p-6 shadow">
                <h2 className="font-semibold text-slate-800">
                  2 · Verfügbare Kategorien ({availabilityMutation.data.nights} Nächte)
                </h2>
                <div className="mt-4 space-y-3">
                  {availabilityMutation.data.roomTypes.filter((rt) => rt.fitsGuests).map((rt) => {
                    const stopSell = rt.stopSellNights > 0;
                    const tooShort = rt.minStayRequired > rt.nights;
                    const full = rt.availableForStay < 1;
                    const disabled = stopSell || tooShort || full;
                    return (
                      <div
                        key={rt.roomTypeId}
                        className={`rounded-xl border p-4 ${selectedType?.roomTypeId === rt.roomTypeId ? "border-sky-500 bg-sky-50" : "border-slate-200"} ${disabled ? "opacity-60" : ""}`}
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex-1">
                            <div className="font-medium text-slate-800">{rt.name}</div>
                            {rt.description && <div className="text-sm text-slate-500">{rt.description}</div>}
                            <div className="mt-1 text-xs text-slate-500">
                              {rt.capacity} Pers. +{rt.maxExtraBeds} Zustellbetten · {rt.available} von {rt.totalRooms} Zimmern frei
                            </div>
                          </div>
                          <div className="text-right">
                            {full || stopSell || tooShort ? (
                              <div className="text-sm font-medium text-slate-500">
                                {stopSell ? "Saison gesperrt" : tooShort ? `mind. ${rt.minStayRequired} Nächte` : "ausgebucht"}
                              </div>
                            ) : (
                              <>
                                <div className="font-semibold text-slate-800">{eur(rt.suggestedPerNightCents)} / Nacht</div>
                                <div className="text-xs text-slate-500">ca. {eur(rt.suggestedTotalCents)} gesamt</div>
                              </>
                            )}
                          </div>
                          <button
                            onClick={() => setSelectedType(rt)}
                            disabled={disabled}
                            className={`rounded-lg px-4 py-2 text-sm font-medium ${selectedType?.roomTypeId === rt.roomTypeId ? "bg-sky-700 text-white" : "bg-sky-100 text-sky-700 hover:bg-sky-200"} disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            {selectedType?.roomTypeId === rt.roomTypeId ? "gewählt ✓" : "anfragen"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {availabilityMutation.data.roomTypes.every((rt) => !rt.fitsGuests) && (
                    <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      Für {adults + children} Personen ist keine Kategorie groß genug — bitte Gästezahl anpassen.
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── Schritt 3: Kontakt ── */}
            {selectedType && (
              <section className="mt-6 rounded-2xl bg-white p-6 shadow">
                <h2 className="font-semibold text-slate-800">
                  3 · Ihre Kontaktdaten <span className="text-sm font-normal text-slate-500">({selectedType.name}, unverbindlich)</span>
                </h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    <span className="mb-1 block text-slate-600">Vorname *</span>
                    <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-slate-600">Nachname *</span>
                    <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-slate-600">E-Mail *</span>
                    <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-slate-600">Telefon</span>
                    <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-slate-600">Gewünschte Anreisezeit</span>
                    <input placeholder="z. B. ab 15:00" value={form.arrivalTime} onChange={(e) => setForm({ ...form, arrivalTime: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  {/* Honeypot: für Menschen unsichtbar, Bots füllen es aus */}
                  <label className="hidden" aria-hidden="true">
                    <span>Firma</span>
                    <input tabIndex={-1} autoComplete="off" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <span className="mb-1 block text-slate-600">Nachricht</span>
                    <textarea rows={3} placeholder="Sonderwünsche, Kinderbetten, …" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                </div>
                <button
                  onClick={submitInquiry}
                  disabled={inquiryMutation.isPending}
                  className="mt-4 w-full rounded-lg bg-sky-600 px-6 py-3 font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                >
                  {inquiryMutation.isPending ? "Sende Anfrage …" : `Anfrage senden — ca. ${eur(selectedType.suggestedTotalCents)} unverbindlich`}
                </button>
                <p className="mt-2 text-xs text-slate-400">
                  Die Anfrage ist unverbindlich. Sie erhalten ein Angebot per E-Mail; erst dessen Bestätigung sichert das Zimmer.
                </p>
              </section>
            )}
          </>
        )}
      </main>
      <footer className="py-8 text-center text-xs text-slate-400">Powered by HotelGuru</footer>
    </div>
  );
}
