import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import { useAuth } from "../state/auth";

export function Profile() {
  const { user } = useAuth();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (newPassword !== confirm) {
      setError("Neue Passwörter stimmen nicht überein");
      return;
    }
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: { oldPassword, newPassword },
      });
      setMessage("Passwort geändert");
      setOldPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Ändern");
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">Profil</h1>

      <div className="rounded-xl bg-white p-5 shadow">
        <div className="text-sm text-slate-500">Angemeldeter Benutzer</div>
        <div className="mt-1 font-medium text-slate-800">
          {user?.firstName} {user?.lastName}
        </div>
        <div className="text-sm text-slate-600">
          {user?.email} · {user?.role}
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl bg-white p-5 shadow">
        <h2 className="font-medium text-slate-700">Passwort ändern</h2>
        <input
          type="password"
          required
          placeholder="Altes Passwort"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          autoComplete="current-password"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Neues Passwort (min. 8 Zeichen)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          autoComplete="new-password"
        />
        <input
          type="password"
          required
          placeholder="Neues Passwort wiederholen"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          autoComplete="new-password"
        />
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {message && (
          <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>
        )}
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          Speichern
        </button>
      </form>
    </div>
  );
}
