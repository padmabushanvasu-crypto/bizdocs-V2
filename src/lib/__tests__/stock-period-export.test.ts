import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx-js-style";
import { buildStockPeriodWorkbook } from "@/lib/export-utils";
import { validatePeriod } from "@/components/StockPeriodExportModal";

const row = (o: Partial<Record<string, any>> = {}) => ({
  item_code: "A-1", drawing_number: "D-1", description: "Gear", item_type: "bought_out", unit: "NOS",
  opening: 10, inward: 5, outward: 3, adjustment: -1, closing: 11, ...o,
});

describe("buildStockPeriodWorkbook", () => {
  const { workbook, filename } = buildStockPeriodWorkbook(
    [
      { sheetName: "In Store", title: "Stock Register — In Store", rows: [row(), row({ item_code: "B-2", opening: 0.1, inward: 0.2, outward: 0, adjustment: 0, closing: 0.3 })] },
      { sheetName: "At Vendor", title: "Stock Register — At Vendor", rows: [] },
    ],
    { companyName: "Acme Works Pvt", from: "2026-10-01", to: "2026-10-07", generatedAt: "07-Oct-2026 10:00 IST" },
  );
  const aoa = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets["In Store"], { header: 1, blankrows: true });

  it("names the file and sheets", () => {
    expect(filename).toBe("Stock-Register_acme-works-pvt_2026-10-01_to_2026-10-07.xlsx");
    expect(workbook.SheetNames).toEqual(["In Store", "At Vendor"]);
  });
  it("writes header lines, columns, totals and footnote", () => {
    expect(aoa[0][0]).toBe("Acme Works Pvt");
    expect(aoa[1][0]).toBe("Stock Register — In Store");
    expect(aoa[2][0]).toBe("Period: 01-Oct-2026 to 07-Oct-2026");
    expect(aoa[3][0]).toBe("Generated: 07-Oct-2026 10:00 IST");
    expect(aoa[5]).toEqual(["S.No", "Item Code", "Drawing No", "Description", "Type", "UOM", "Opening", "Inward", "Outward", "Adjustment", "Closing"]);
    expect(aoa[6].slice(0, 6)).toEqual([1, "A-1", "D-1", "Gear", "Bought Out", "NOS"]);
    const totals = aoa[8];
    expect(totals[1]).toBe("TOTAL");
    expect(totals[6]).toBeCloseTo(10.1, 6);
    expect(totals[10]).toBeCloseTo(11.3, 6);
    expect(aoa[10][0]).toContain("Opening + Inward − Outward + Adjustment = Closing");
  });
  it("uses #,##0.### on quantity cells", () => {
    expect(workbook.Sheets["In Store"]["G7"].z).toBe("#,##0.###");
  });
});

describe("buildStockPeriodWorkbook — values", () => {
  const rows = [
    row({ standard_cost: 12.5 }),
    row({ item_code: "B-2", opening: 0.1, inward: 0.2, outward: 0, adjustment: 0, closing: 0.3, standard_cost: 100 }),
    row({ item_code: "C-3", opening: 4, inward: 0, outward: 0, adjustment: 0, closing: 4, standard_cost: 0 }),
  ];
  const mk = (includeValues: boolean) =>
    buildStockPeriodWorkbook([{ sheetName: "In Store", title: "T", rows, includeValues }], {
      companyName: "Acme", from: "2026-10-01", to: "2026-10-07", generatedAt: "x",
    }).workbook;
  const aoa = XLSX.utils.sheet_to_json<any[]>(mk(true).Sheets["In Store"], { header: 1, blankrows: true });

  it("adds cost and value columns", () => {
    expect(aoa[5].slice(11)).toEqual(["Standard Cost (₹)", "Opening Value (₹)", "Inward Value (₹)", "Outward Value (₹)", "Adjustment Value (₹)", "Closing Value (₹)"]);
    expect(aoa[6].slice(11)).toEqual([12.5, 125, 62.5, 37.5, -12.5, 137.5]);
  });
  it("totals sum full-precision values and flags unpriced items", () => {
    const t = aoa[9];
    expect(t[1]).toBe("TOTAL");
    expect(t[12]).toBeCloseTo(125 + 10, 6);
    expect(t[16]).toBeCloseTo(137.5 + 30, 6);
    expect(aoa[11][0]).toContain("1 item(s)");
  });
  it("omits value columns when not requested (cost-hidden roles)", () => {
    const plain = XLSX.utils.sheet_to_json<any[]>(mk(false).Sheets["In Store"], { header: 1, blankrows: true });
    expect(plain[5]).toHaveLength(11);
  });
});

describe("validatePeriod", () => {
  it("accepts a valid range", () => expect(validatePeriod("2026-10-01", "2026-10-07", "2026-10-07")).toBeNull());
  it("requires both dates", () => expect(validatePeriod("", "2026-10-07", "2026-10-07")).toMatch(/required/));
  it("rejects from > to", () => expect(validatePeriod("2026-10-08", "2026-10-07", "2026-10-09")).toMatch(/on or before/));
  it("rejects a future To", () => expect(validatePeriod("2026-10-01", "2026-10-08", "2026-10-07")).toMatch(/future/));
});
