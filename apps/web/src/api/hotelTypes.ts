export type { DashboardStats } from "./types";

export interface HotelResponse {
  id: string;
  name: string;
  address: string | null;
  zip: string | null;
  city: string | null;
  country: "DE" | "AT" | "CH";
  currency: "EUR" | "CHF";
  systemConfig: { config: Record<string, unknown> } | null;
}