import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../state/auth";

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-2 text-sm ${
      isActive ? "bg-slate-700 text-white" : "text-slate-200 hover:bg-slate-700/60"
    }`;

  return (
    <div className="min-h-screen">
      <header className="bg-slate-800">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <div className="mr-6">
            <span className="text-lg font-semibold text-white">{t("app.name")}</span>
            <span className="ml-2 hidden text-xs text-slate-400 sm:inline">
              {t("app.tagline")}
            </span>
          </div>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navClass}>{t("nav.overview")}</NavLink>
            <NavLink to="/zimmerplan" className={navClass}>Zimmerplan</NavLink>
            <NavLink to="/reservierungen" className={navClass}>Reservierungen</NavLink>
            <NavLink to="/gaeste" className={navClass}>Gäste</NavLink>
            <NavLink to="/stammdaten" className={navClass}>Stammdaten</NavLink>
            <NavLink to="/preise" className={navClass}>Preise</NavLink>
            <NavLink to="/rechnungen" className={navClass}>Rechnungen</NavLink>
            <NavLink to="/abrechnung" className={navClass}>Kasse</NavLink>
            <NavLink to="/meldewesen" className={navClass}>Meldewesen</NavLink>
            <NavLink to="/housekeeping" className={navClass}>Housekeeping</NavLink>
            <NavLink to="/personal" className={navClass}>Personal</NavLink>
            <NavLink to="/benutzer" className={navClass}>{t("nav.users")}</NavLink>
            <NavLink to="/profil" className={navClass}>{t("nav.profile")}</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-slate-300 sm:inline">
              {user?.firstName} {user?.lastName} · {user?.role}
            </span>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="rounded-md bg-slate-600 px-3 py-2 text-sm text-white hover:bg-slate-500"
            >
              {t("nav.logout")}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
