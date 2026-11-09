import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Guest } from "../api/types";

const emptyForm = { firstName: "", lastName: "", email: "", phone: "", city: "", country: "" };

export function Gaeste() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<typeof emptyForm | null>(null);
  const [error, setError] = useState<string | null>(null);

  const guestsQuery = useQuery({
    queryKey: ["guests", query],
    queryFn: () => api<Guest[]>(`/guests?q=${encodeURIComponent(query)}`),
  });

  const createMutation = useMutation({
    mutationFn: (body: unknown) => api("/guests", { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["guests"] });
      setForm(null);
      setError(null);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/guests/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["guests"] }),
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });

  function submit() {
    if (!form) return;
    if (!form.firstName || !form.lastName) {
      setError("Vor- und Nachname erforderlich");
      return;
    }
    createMutation.mutate(form);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold text-slate-800">Gäste</h1>
        <button onClick={() => setForm({ ...emptyForm })} className="ml-auto rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500">
          + Neuer Gast
        </button>
      </div>

      <input
        placeholder="Name, E-Mail oder Ort suchen…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-72 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />

      {form && (
        <div className="grid gap-2 rounded-xl bg-white p-4 shadow sm:grid-cols-3 lg:grid-cols-6">
          {(["firstName", "lastName", "email", "phone", "city", "country"] as const).map((field) => (
            <input
              key={field}
              placeholder={{ firstName: "Vorname", lastName: "Nachname", email: "E-Mail", phone: "Telefon", city: "Ort", country: "Land" }[field]}
              value={form[field]}
              onChange={(e) => setForm({ ...form, [field]: e.target.value })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          ))}
          <div className="flex gap-2 sm:col-span-3 lg:col-span-6">
            <button onClick={submit} disabled={createMutation.isPending} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Speichern</button>
            <button onClick={() => { setForm(null); setError(null); }} className="rounded-md bg-slate-100 px-4 py-2 text-sm text-slate-700 hover:bg-slate-200">Abbrechen</button>
          </div>
        </div>
      )}

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">E-Mail</th>
              <th className="px-4 py-3">Telefon</th>
              <th className="px-4 py-3">Ort</th>
              <th className="px-4 py-3">Land</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {guestsQuery.data?.map((g) => (
              <tr key={g.id}>
                <td className="px-4 py-2.5 font-medium text-slate-800">{g.lastName}, {g.firstName}</td>
                <td className="px-4 py-2.5 text-slate-600">{g.email ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-600">{g.phone ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-600">{g.city ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-600">{g.country ?? "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => { if (confirm(`Gast ${g.firstName} ${g.lastName} archivieren?`)) deleteMutation.mutate(g.id); }}
                    className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                  >
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
