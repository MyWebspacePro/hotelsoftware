import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { eur, type PriceRule, type RatePlan, type RoomType } from "../api/types";

export function Preise() {
  const queryClient = useQueryClient();
  const typesQuery = useQuery({ queryKey: ["roomTypes"], queryFn: () => api<RoomType[]>("/rooms/types") });
  const plansQuery = useQuery({ queryKey: ["ratePlans"], queryFn: () => api<RatePlan[]>("/pricing/rate-plans") });
  const rulesQuery = useQuery({ queryKey: ["priceRules"], queryFn: () => api<PriceRule[]>("/pricing/price-rules") });

  const [ruleForm, setRuleForm] = useState({ roomTypeId: "", name: "", dateFrom: "", dateTo: "", price: 0, minStay: 1, stopSell: false });
  const [planForm, setPlanForm] = useState({ name: "", basis: "NUR_LOGIS" as RatePlan["basis"] });
  const [error, setError] = useState<string | null>(null);

  const createRule = useMutation({
    mutationFn: (body: unknown) => api("/pricing/price-rules", { method: "POST", body }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["priceRules"] }); setRuleForm({ roomTypeId: "", name: "", dateFrom: "", dateTo: "", price: 0, minStay: 1, stopSell: false }); setError(null); },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const deleteRule = useMutation({
    mutationFn: (id: string) => api(`/pricing/price-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["priceRules"] }),
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const createPlan = useMutation({
    mutationFn: (body: unknown) => api("/pricing/rate-plans", { method: "POST", body }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["ratePlans"] }); setPlanForm({ name: "", basis: "NUR_LOGIS" }); setError(null); },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const deletePlan = useMutation({
    mutationFn: (id: string) => api(`/pricing/rate-plans/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["ratePlans"] }),
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">Preise & Raten</h1>
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* Preisregeln */}
      <section>
        <h2 className="mb-2 font-medium text-slate-700">Saison-/Preisregeln</h2>
        <div className="grid gap-2 rounded-xl bg-white p-4 shadow sm:grid-cols-4 lg:grid-cols-8">
          <select value={ruleForm.roomTypeId} onChange={(e) => setRuleForm({ ...ruleForm, roomTypeId: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">Zimmertyp…</option>
            {typesQuery.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input placeholder="Name (z. B. Wintersaison)" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input type="date" title="Von" value={ruleForm.dateFrom} onChange={(e) => setRuleForm({ ...ruleForm, dateFrom: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input type="date" title="Bis (exklusiv)" value={ruleForm.dateTo} onChange={(e) => setRuleForm({ ...ruleForm, dateTo: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input type="number" step={5} title="Preis pro Nacht (EUR)" placeholder="EUR/Nacht" value={ruleForm.price || ""} onChange={(e) => setRuleForm({ ...ruleForm, price: Number(e.target.value) })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input type="number" min={1} title="Mindestaufenthalt" value={ruleForm.minStay} onChange={(e) => setRuleForm({ ...ruleForm, minStay: Number(e.target.value) })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={ruleForm.stopSell} onChange={(e) => setRuleForm({ ...ruleForm, stopSell: e.target.checked })} />
            Stop-Sell
          </label>
          <button
            onClick={() => createRule.mutate({ roomTypeId: ruleForm.roomTypeId, name: ruleForm.name || undefined, dateFrom: ruleForm.dateFrom, dateTo: ruleForm.dateTo, priceCents: Math.round(ruleForm.price * 100), minStay: ruleForm.minStay, stopSell: ruleForm.stopSell })}
            disabled={!ruleForm.roomTypeId || !ruleForm.dateFrom || !ruleForm.dateTo || createRule.isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            + Regel
          </button>
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl bg-white shadow">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Typ</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Zeitraum</th>
                <th className="px-4 py-3 text-right">Preis/Nacht</th>
                <th className="px-4 py-3">Min. Nächte</th>
                <th className="px-4 py-3">Stop-Sell</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rulesQuery.data?.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 text-slate-700">
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded" style={{ backgroundColor: r.roomType?.color }} />
                      {r.roomType?.name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{r.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.dateFrom} → <span className="text-slate-400">{r.dateTo} (exkl.)</span></td>
                  <td className="px-4 py-2.5 text-right font-medium text-slate-800">{eur(r.priceCents)}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.minStay}</td>
                  <td className="px-4 py-2.5">{r.stopSell ? "🔒" : ""}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => deleteRule.mutate(r.id)} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">Löschen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Ratenpläne */}
      <section>
        <h2 className="mb-2 font-medium text-slate-700">Ratenpläne (Verpflegung)</h2>
        <div className="grid gap-2 sm:grid-cols-4">
          <input placeholder="Name (z. B. Halbpension)" value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <select value={planForm.basis} onChange={(e) => setPlanForm({ ...planForm, basis: e.target.value as RatePlan["basis"] })} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="NUR_LOGIS">Nur Logis</option>
            <option value="UE_F">Übernachtung + Frühstück</option>
            <option value="HP">Halbpension</option>
          </select>
          <button
            onClick={() => createPlan.mutate(planForm)}
            disabled={!planForm.name || createPlan.isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            + Rate
          </button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {plansQuery.data?.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-xl bg-white p-3 shadow">
              <span className="font-medium text-slate-800">{p.name}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{p.basis}</span>
              {!p.active && <span className="text-xs text-slate-400">(inaktiv)</span>}
              <button onClick={() => deletePlan.mutate(p.id)} className="ml-auto rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100">Löschen</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
