import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  de: {
    translation: {
      app: { name: "HotelGuru", tagline: "Hotelverwaltung für den DACH-Raum" },
      nav: {
        overview: "Übersicht",
        users: "Benutzer",
        profile: "Profil",
        logout: "Abmelden",
      },
      login: {
        title: "Anmeldung",
        email: "E-Mail",
        password: "Passwort",
        submit: "Einloggen",
        demoHint: "Demo-Zugang nach Seed: admin@hotelguru.local / Admin1234!",
      },
      common: {
        loading: "Lädt…",
        save: "Speichern",
        cancel: "Abbrechen",
        error: "Fehler",
      },
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: "de",
  fallbackLng: "de",
  interpolation: { escapeValue: false },
});

export default i18n;
