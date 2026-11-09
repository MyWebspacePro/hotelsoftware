import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../state/auth";

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "ADMIN" | "MANAGER" | "RECEPTION" | "HOUSEKEEPING" | "SERVICE";
  active: boolean;
  lastLoginAt: string | null;
}

const ROLES: UserRow["role"][] = ["ADMIN", "MANAGER", "RECEPTION", "HOUSEKEEPING", "SERVICE"];

export function Users() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<UserRow["role"]>("RECEPTION");
  const [error, setError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: () => api<UserRow[]>("/users"),
  });

  const createMutation = useMutation({
    mutationFn: (body: unknown) => api("/users", { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      setEmail("");
      setPassword("");
      setFirstName("");
      setLastName("");
      setRole("RECEPTION");
      setError(null);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler beim Anlegen"),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api(`/users/${id}`, { method: "PATCH", body: { active } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["users"] }),
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["users"] }),
    onError: (err) => setError(err instanceof Error ? err.message : "Fehler beim Löschen"),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    createMutation.mutate({ email, password, firstName, lastName, role, active: true });
  }

  const isAdmin = me?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">Benutzerverwaltung</h1>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {isAdmin && (
        <form
          onSubmit={onSubmit}
          className="grid gap-3 rounded-xl bg-white p-5 shadow sm:grid-cols-3 lg:grid-cols-6"
        >
          <input
            type="email"
            required
            placeholder="E-Mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            minLength={8}
            placeholder="Passwort (min. 8)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            required
            placeholder="Vorname"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            required
            placeholder="Nachname"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRow["role"])}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Anlegen
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">E-Mail</th>
              <th className="px-4 py-3">Rolle</th>
              <th className="px-4 py-3">Status</th>
              {isAdmin && <th className="px-4 py-3">Aktionen</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {usersQuery.data?.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {u.firstName} {u.lastName}
                </td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                <td className="px-4 py-3 text-slate-600">{u.role}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      u.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {u.active ? "aktiv" : "inaktiv"}
                  </span>
                </td>
                {isAdmin && (
                  <td className="px-4 py-3">
                    {u.id !== me?.id && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => toggleActiveMutation.mutate({ id: u.id, active: !u.active })}
                          className="rounded bg-slate-100 px-2 py-1 text-xs hover:bg-slate-200"
                        >
                          {u.active ? "Deaktivieren" : "Aktivieren"}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMutation.mutate(u.id)}
                          className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                        >
                          Löschen
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
