import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const reverseRmConversion = vi.fn();
const toast = vi.fn();

const baseRow = {
  awo_id: null,
  output_unit: "NOS",
  output_alt_unit: null,
  output_qty_alt: null,
  output_unit_cost: 12.5,
  status: "posted",
  posted_at: "2026-11-19T06:00:00Z",
  posted_by: "u1",
  posted_by_name: "Store",
  reversed_at: null,
  reversed_by_name: null,
  reversal_reason: null,
  notes: null,
};
const out = (line_no: number, item_code: string, qty_base: number) => ({
  line_no,
  item_id: item_code,
  item_code,
  description: `desc ${item_code}`,
  unit: "NOS",
  qty_base,
  alt_unit: null,
  qty_alt: null,
  unit_cost: 12.5,
});

const ROWS = [
  {
    ...baseRow,
    id: "multi",
    output_item_id: "DRG-A",
    output_item_code: "DRG-A",
    output_item_description: "desc DRG-A",
    output_qty_base: 10,
    outputs: [out(1, "DRG-A", 10), out(2, "DRG-B", 6), out(3, "DRG-C", 4)],
  },
  {
    ...baseRow,
    id: "single",
    output_item_id: "DRG-Z",
    output_item_code: "DRG-Z",
    output_item_description: "desc DRG-Z",
    output_qty_base: 250,
    outputs: [out(1, "DRG-Z", 250)],
  },
];

vi.mock("@/lib/rm-conversions-api", () => ({
  fetchRmConversions: vi.fn(async () => ({ rows: ROWS, count: ROWS.length })),
  fetchRmConversionInputs: vi.fn(async () => []),
  reverseRmConversion: (...args: unknown[]) => reverseRmConversion(...args),
}));
vi.mock("@/hooks/useCanEdit", () => ({ useCanEdit: () => true }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import RmConversionRegister from "./RmConversionRegister";

function renderRegister() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RmConversionRegister />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  reverseRmConversion.mockReset();
  reverseRmConversion.mockResolvedValue(undefined);
  toast.mockReset();
});

describe("RM Conversions register — multiple outputs", () => {
  it("shows a multi-output conversion as first item + count, and a single one as before", async () => {
    renderRegister();
    const multi = (await screen.findByText("DRG-A")).closest("tr")!;
    expect(within(multi).getByText("+2 more")).toBeInTheDocument();
    expect(within(multi).getByText("3 items")).toBeInTheDocument();

    const single = screen.getByText("DRG-Z").closest("tr")!;
    expect(within(single).queryByText(/more$/)).toBeNull();
    expect(within(single).getByText("250.00 NOS")).toBeInTheDocument();
  });

  it("lists every output line when the row is expanded", async () => {
    renderRegister();
    fireEvent.click((await screen.findByText("DRG-A")).closest("tr")!);
    expect(await screen.findByText("DRG-B")).toBeInTheDocument();
    expect(screen.getByText("DRG-C")).toBeInTheDocument();
    expect(screen.getByText("6.00 NOS")).toBeInTheDocument();
    expect(screen.getByText("4.00 NOS")).toBeInTheDocument();
    expect(screen.queryByText(/^return$/i)).toBeNull();
  });

  it("reverse dialog names every output and reverses the whole conversion once", async () => {
    renderRegister();
    const multi = (await screen.findByText("DRG-A")).closest("tr")!;
    fireEvent.click(within(multi).getByRole("button", { name: /reverse/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/3 outputs being reversed/i)).toBeInTheDocument();
    for (const code of ["DRG-A", "DRG-B", "DRG-C"]) {
      expect(within(dialog).getByText(code)).toBeInTheDocument();
    }

    // A reason is mandatory.
    const confirm = within(dialog).getByRole("button", { name: /reverse conversion/i });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "wrong quantities" } });
    fireEvent.click(confirm);

    await waitFor(() => expect(reverseRmConversion).toHaveBeenCalledTimes(1));
    expect(reverseRmConversion).toHaveBeenCalledWith("multi", "wrong quantities");
  });
});
