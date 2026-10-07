import { describe, it, expect } from "vitest";
import { todayIST, nowStampIST, monthRange, previousMonth, fyStartIST, formatDateIN } from "./date-ist";

describe("monthRange", () => {
  it("handles 30/31-day months", () => {
    expect(monthRange("2026-10")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(monthRange("2026-04")).toEqual({ from: "2026-04-01", to: "2026-04-30" });
    expect(monthRange("2026-12")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
  it("handles February in common, leap and century years", () => {
    expect(monthRange("2026-02").to).toBe("2026-02-28");
    expect(monthRange("2028-02").to).toBe("2028-02-29");
    expect(monthRange("2100-02").to).toBe("2100-02-28");
    expect(monthRange("2000-02").to).toBe("2000-02-29");
  });
  it("throws on malformed input", () => {
    expect(() => monthRange("2026-13")).toThrow();
    expect(() => monthRange("2026-1")).toThrow();
    expect(() => monthRange("")).toThrow();
  });
});

describe("previousMonth", () => {
  it("rolls over the year", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(previousMonth("2026-10")).toBe("2026-09");
  });
});

describe("fyStartIST", () => {
  it("is the previous calendar year up to 31 March", () => {
    expect(fyStartIST("2027-03-31")).toBe("2026-04-01");
    expect(fyStartIST("2027-01-01")).toBe("2026-04-01");
  });
  it("is the current calendar year from 1 April", () => {
    expect(fyStartIST("2026-04-01")).toBe("2026-04-01");
    expect(fyStartIST("2026-10-07")).toBe("2026-04-01");
    expect(fyStartIST("2026-12-31")).toBe("2026-04-01");
  });
});

describe("formatDateIN", () => {
  it("formats DD-Mon-YYYY", () => {
    expect(formatDateIN("2026-10-01")).toBe("01-Oct-2026");
    expect(formatDateIN("2026-02-28")).toBe("28-Feb-2026");
  });
  it("tolerates a timestamp suffix and empty input", () => {
    expect(formatDateIN("2026-10-01T10:00:00Z")).toBe("01-Oct-2026");
    expect(formatDateIN("")).toBe("");
  });
});

describe("todayIST / nowStampIST", () => {
  it("uses the IST calendar day, not UTC", () => {
    // 2026-10-06 20:00 UTC = 2026-10-07 01:30 IST
    const d = new Date("2026-10-06T20:00:00Z");
    expect(todayIST(d)).toBe("2026-10-07");
    expect(nowStampIST(d)).toBe("07-Oct-2026 01:30 IST");
  });
  it("stays on the same day before IST midnight", () => {
    expect(todayIST(new Date("2026-10-07T18:29:00Z"))).toBe("2026-10-07");
    expect(todayIST(new Date("2026-10-07T18:30:00Z"))).toBe("2026-10-08");
  });
});
