import { describe, expect, it } from "vitest";
import { allowedTransitions, canTransition, isOccupied, type BookingStatusValue } from "./bookingStatus.js";

describe("Buchungs-Statusmaschine", () => {
  it("Happy Path: INQUIRY → OFFERED → CONFIRMED → CHECKED_IN → CHECKED_OUT", () => {
    expect(canTransition("INQUIRY", "OFFERED")).toBe(true);
    expect(canTransition("OFFERED", "CONFIRMED")).toBe(true);
    expect(canTransition("CONFIRMED", "CHECKED_IN")).toBe(true);
    expect(canTransition("CHECKED_IN", "CHECKED_OUT")).toBe(true);
  });

  it("Direktbuchung: INQUIRY → CONFIRMED erlaubt", () => {
    expect(canTransition("INQUIRY", "CONFIRMED")).toBe(true);
  });

  it("Storno aus laufenden Zuständen, nicht aus CHECKED_OUT", () => {
    expect(canTransition("CONFIRMED", "CANCELLED")).toBe(true);
    expect(canTransition("OFFERED", "CANCELLED")).toBe(true);
    expect(canTransition("CHECKED_OUT", "CANCELLED")).toBe(false);
    expect(canTransition("CANCELLED", "CONFIRMED")).toBe(false);
  });

  it("CHECKED_OUT ist Terminalzustand", () => {
    expect(allowedTransitions("CHECKED_OUT")).toEqual([]);
  });

  it("No-Show aus OFFERED/CONFIRMED", () => {
    expect(canTransition("CONFIRMED", "NO_SHOW")).toBe(true);
    expect(canTransition("CHECKED_IN", "NO_SHOW")).toBe(false);
  });

  it("isOccupied: Anfrage nicht belegt, Check-in belegt", () => {
    const statuses: BookingStatusValue[] = ["INQUIRY", "OFFERED", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED"];
    expect(statuses.filter(isOccupied)).toEqual(["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"]);
  });
});
