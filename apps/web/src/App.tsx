import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Users } from "./pages/Users";
import { Profile } from "./pages/Profile";
import { Zimmerplan } from "./pages/Zimmerplan";
import { Reservierungen } from "./pages/Reservierungen";
import { Gaeste } from "./pages/Gaeste";
import { Stammdaten } from "./pages/Stammdaten";
import { Preise } from "./pages/Preise";

const page = (element: React.ReactNode) => (
  <ProtectedRoute>
    <Layout>{element}</Layout>
  </ProtectedRoute>
);

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={page(<Dashboard />)} />
      <Route path="/zimmerplan" element={page(<Zimmerplan />)} />
      <Route path="/reservierungen" element={page(<Reservierungen />)} />
      <Route path="/gaeste" element={page(<Gaeste />)} />
      <Route path="/stammdaten" element={page(<Stammdaten />)} />
      <Route path="/preise" element={page(<Preise />)} />
      <Route path="/benutzer" element={page(<Users />)} />
      <Route path="/profil" element={page(<Profile />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
