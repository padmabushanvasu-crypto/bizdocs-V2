import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// ── Fixtures ────────────────────────────────────────────────────────────────
// A tube bought in KGS, cut into drawing-number parts counted in NOS.
const ITEMS: Record<string, any> = {
  tube: { id: "tube", item_code: "MSSQTUBE", description: "MS SQ TUBE 40X40", unit: "KGS", stock_free: 3860, alt_unit: null },
  a: { id: "a", item_code: "DRG-A", description: "Width wise 454 mm", unit: "NOS", stock_free: 4, alt_unit: null },
  b: { id: "b", item_code: "DRG-B", description: "Vertical cover 850 mm", unit: "NOS", stock_free: 69, alt_unit: null },
  c: { id: "c", item_code: "DRG-C", description: "Top mid support 1518 mm", unit: "NOS", stock_free: 3, alt_unit: null },
  d: { id: "d", item_code: "DRG-D", description: "Width wise 453 mm", unit: "NOS", stock_free: 0, alt_unit: null },
};

// The tube's cutting list, as fetchSuggestedComponents returns it: grouped,
// in the sheet's order.
const CUTTING_LIST = [
  { item_id: "a", item_code: "DRG-A", description: "Width wise 454 mm", unit: "NOS", group: "11 KV PIPE", sl_no: 1 },
  { item_id: "b", item_code: "DRG-B", description: "Vertical cover 850 mm", unit: "NOS", group: "11 KV PIPE", sl_no: 2 },
  { item_id: "d", item_code: "DRG-D", description: "Width wise 453 mm", unit: "NOS", group: "22 KV PIPE", sl_no: 7 },
];
const fetchSuggestedComponents = vi.fn();

const postRmConversion = vi.fn();
const toast = vi.fn();

vi.mock("@/lib/rm-conversions-api", () => ({
  postRmConversion: (...args: unknown[]) => postRmConversion(...args),
  fetchSuggestedComponents: (...args: unknown[]) => fetchSuggestedComponents(...args),
}));
vi.mock("@/lib/items-api", () => ({
  fetchItem: vi.fn(async (id: string) => ITEMS[id]),
}));
vi.mock("@/lib/settings-api", () => ({
  fetchCompanySettings: vi.fn(async () => ({ conversion_factor_tolerance_pct: 15 })),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/components/GrnDrawPicker", () => ({ GrnDrawPicker: () => null }));
// The real picker is a portal dropdown backed by a search query. Here it is a
// text box (free typing, which clears the chosen item exactly like the real
// one) plus one "pick" button per fixture item.
vi.mock("@/components/ItemSuggest", () => ({
  ItemSuggest: ({ value, onChange, onSelect, placeholder }: any) => (
    <div data-testid="item-suggest">
      <input aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      {Object.keys(ITEMS).map((k) => (
        <button key={k} type="button" onClick={() => onSelect(ITEMS[k])}>
          pick {k}
        </button>
      ))}
    </div>
  ),
}));

import RmConversionNew from "./RmConversionNew";

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RmConversionNew />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** The n-th item picker on the page: 0 is the input row, 1.. are output rows. */
const picker = (n: number) => screen.getAllByTestId("item-suggest")[n];
const pick = (n: number, key: string) => fireEvent.click(within(picker(n)).getByText(`pick ${key}`));
const setNumber = (label: RegExp | string, value: string, index = 0) =>
  fireEvent.change(screen.getAllByLabelText(label)[index], { target: { value } });
const post = () => fireEvent.click(screen.getByRole("button", { name: /post conversion/i }));

/** Shadcn's <Label> is not tied to its <Input> by id, so find a number box by the label text beside it. */
function numberBoxes(labelText: RegExp): HTMLInputElement[] {
  return screen
    .getAllByText(labelText)
    .map((label) => label.parentElement!.querySelector("input[type=number]") as HTMLInputElement);
}

beforeEach(() => {
  postRmConversion.mockReset();
  postRmConversion.mockResolvedValue({ rm_conversion_id: "conv-1", output_item_code: "DRG-A", output_qty_base: 10, output_unit_cost: 0 });
  toast.mockReset();
  // Most tests use an input with no cutting list (free search on every row).
  fetchSuggestedComponents.mockReset();
  fetchSuggestedComponents.mockResolvedValue([]);
});

/** The output-row dropdowns (only rendered while the raw material has a list). */
const listSelects = () => screen.queryAllByRole("combobox") as HTMLSelectElement[];
const choose = (select: HTMLSelectElement, value: string) => fireEvent.change(select, { target: { value } });

describe("New RM Conversion — multiple outputs", () => {
  it("posts one input and three outputs as a single payload", async () => {
    fetchSuggestedComponents.mockResolvedValue(CUTTING_LIST);
    renderScreen();

    // Input: 100 KGS of tube, 2 KGS of it offcut.
    pick(0, "tube");
    fireEvent.change(numberBoxes(/qty used/i)[0], { target: { value: "100" } });
    fireEvent.change(numberBoxes(/of which scrap/i)[0], { target: { value: "2" } });

    // Outputs: two picked from the tube's list, one searched via "Other item".
    await waitFor(() => expect(listSelects()).toHaveLength(1));
    choose(listSelects()[0], "a");
    await waitFor(() => expect(numberBoxes(/qty produced/i)).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: /add output/i }));
    choose(listSelects()[1], "b");
    await waitFor(() => expect(numberBoxes(/qty produced/i)).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: /add output/i }));
    choose(listSelects()[2], "__search_other__");
    await waitFor(() => expect(screen.getAllByTestId("item-suggest")).toHaveLength(2));
    pick(1, "c");

    const qty = numberBoxes(/qty produced/i);
    expect(qty).toHaveLength(3);
    fireEvent.change(qty[0], { target: { value: "10" } });
    fireEvent.change(qty[1], { target: { value: "6" } });
    fireEvent.change(qty[2], { target: { value: "4" } });

    post();
    await waitFor(() => expect(postRmConversion).toHaveBeenCalledTimes(1));

    const [payload, idempotencyKey] = postRmConversion.mock.calls[0];
    expect(typeof idempotencyKey).toBe("string");
    expect(payload.outputs).toEqual([
      { item_id: "a", qty_base: 10, unit: "NOS", qty_alt: null, alt_unit: null },
      { item_id: "b", qty_base: 6, unit: "NOS", qty_alt: null, alt_unit: null },
      { item_id: "c", qty_base: 4, unit: "NOS", qty_alt: null, alt_unit: null },
    ]);
    expect(payload.inputs).toHaveLength(1);
    expect(payload.inputs[0]).toMatchObject({
      item_id: "tube",
      source: "store",
      entered_qty: 100,
      entered_unit: "KGS",
      qty_base: 100,
      scrap_qty_base: 2,
    });
    // Return Qty is gone, and the single-output fields are never sent.
    expect(payload.inputs[0]).not.toHaveProperty("return_qty_base");
    expect(payload).not.toHaveProperty("output_item_id");
    expect(payload).not.toHaveProperty("output_qty_base");
  });

  it("has no Return Qty field", () => {
    renderScreen();
    pick(0, "tube");
    expect(screen.queryByText(/return qty/i)).toBeNull();
  });

  it("shows the tube's cutting list as a grouped dropdown on each output row", async () => {
    fetchSuggestedComponents.mockResolvedValue(CUTTING_LIST);
    renderScreen();
    // No list until a raw material is picked.
    expect(listSelects()).toHaveLength(0);
    pick(0, "tube");

    const [select] = await waitFor(() => {
      const s = listSelects();
      expect(s).toHaveLength(1);
      return s;
    });
    const groups = [...select.querySelectorAll("optgroup")].map((g) => g.label);
    expect(groups).toEqual(["11 KV PIPE", "22 KV PIPE", "Not on the list"]);
    const options = [...select.querySelectorAll("option")].map((o) => o.textContent);
    expect(options).toEqual([
      "Select part from MSSQTUBE list…",
      "DRG-A — Width wise 454 mm",
      "DRG-B — Vertical cover 850 mm",
      "DRG-D — Width wise 453 mm",
      "Other item — search all items…",
    ]);
    // Only the output rows use the list; the input picker is still free search.
    expect(screen.getAllByTestId("item-suggest")).toHaveLength(1);
  });

  it("disables a part on other rows once it is picked", async () => {
    fetchSuggestedComponents.mockResolvedValue(CUTTING_LIST);
    renderScreen();
    pick(0, "tube");
    await waitFor(() => expect(listSelects()).toHaveLength(1));
    choose(listSelects()[0], "a");
    await waitFor(() => expect(numberBoxes(/qty produced/i)).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: /add output/i }));

    const second = listSelects()[1];
    const optA = second.querySelector('option[value="a"]') as HTMLOptionElement;
    const optB = second.querySelector('option[value="b"]') as HTMLOptionElement;
    expect(optA.disabled).toBe(true);
    expect(optB.disabled).toBe(false);
    // ...but stays selectable on the row that has it.
    expect((listSelects()[0].querySelector('option[value="a"]') as HTMLOptionElement).disabled).toBe(false);
    expect(listSelects()[0].value).toBe("a");
  });

  it("adds a whole tank set at once, filling the blank row first and skipping parts already added", async () => {
    fetchSuggestedComponents.mockResolvedValue(CUTTING_LIST);
    renderScreen();
    pick(0, "tube");
    await waitFor(() => expect(listSelects()).toHaveLength(1));
    choose(listSelects()[0], "b");
    await waitFor(() => expect(listSelects()[0].value).toBe("b"));

    fireEvent.click(screen.getByRole("button", { name: /all 11 kv pipe \(2\)/i }));
    await waitFor(() => expect(listSelects()).toHaveLength(2));
    expect(listSelects().map((s) => s.value)).toEqual(["b", "a"]);
    // Nothing left to add from that set.
    expect(screen.getByRole("button", { name: /all 11 kv pipe \(2\)/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /all 22 kv pipe \(1\)/i })).not.toBeDisabled();
  });

  it("lets a row switch to free search and back to the list", async () => {
    fetchSuggestedComponents.mockResolvedValue(CUTTING_LIST);
    renderScreen();
    pick(0, "tube");
    await waitFor(() => expect(listSelects()).toHaveLength(1));
    choose(listSelects()[0], "__search_other__");
    await waitFor(() => expect(listSelects()).toHaveLength(0));
    pick(1, "c");
    expect(numberBoxes(/qty produced/i)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /back to the mssqtube list/i }));
    await waitFor(() => expect(listSelects()).toHaveLength(1));
    expect(listSelects()[0].value).toBe("");
    expect(screen.queryAllByText(/qty produced/i)).toHaveLength(0);
  });

  it("blocks the same item on two output lines and flags it inline", async () => {
    renderScreen();
    pick(0, "tube");
    fireEvent.change(numberBoxes(/qty used/i)[0], { target: { value: "10" } });
    pick(1, "a");
    fireEvent.click(screen.getByRole("button", { name: /add output/i }));
    pick(2, "a");
    const qty = numberBoxes(/qty produced/i);
    fireEvent.change(qty[0], { target: { value: "1" } });
    fireEvent.change(qty[1], { target: { value: "2" } });

    expect(screen.getAllByText(/more than one output line/i)).toHaveLength(2);
    post();
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(postRmConversion).not.toHaveBeenCalled();
    expect(toast.mock.calls[0][0].description).toMatch(/listed more than once/i);
  });

  it("never silently drops an output row that has a quantity but no item", async () => {
    renderScreen();
    pick(0, "tube");
    fireEvent.change(numberBoxes(/qty used/i)[0], { target: { value: "10" } });
    pick(1, "a");
    fireEvent.change(numberBoxes(/qty produced/i)[0], { target: { value: "5" } });
    // Typing over the chosen item clears it, as in the real picker.
    fireEvent.change(within(picker(1)).getByRole("textbox"), { target: { value: "DRG" } });

    post();
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(postRmConversion).not.toHaveBeenCalled();
    expect(toast.mock.calls[0][0].description).toMatch(/output line 1: pick an item/i);
  });

  it("requires at least one output line and a positive quantity on each", async () => {
    renderScreen();
    pick(0, "tube");
    fireEvent.change(numberBoxes(/qty used/i)[0], { target: { value: "10" } });

    post();
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast.mock.calls[0][0].description).toMatch(/at least one output line/i);

    pick(1, "a");
    fireEvent.change(numberBoxes(/qty produced/i)[0], { target: { value: "0" } });
    post();
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(2));
    expect(toast.mock.calls[1][0].description).toMatch(/positive quantity for output DRG-A/i);
    expect(postRmConversion).not.toHaveBeenCalled();
  });

  it("rejects scrap larger than the quantity used", async () => {
    renderScreen();
    pick(0, "tube");
    fireEvent.change(numberBoxes(/qty used/i)[0], { target: { value: "10" } });
    fireEvent.change(numberBoxes(/of which scrap/i)[0], { target: { value: "11" } });
    pick(1, "a");
    fireEvent.change(numberBoxes(/qty produced/i)[0], { target: { value: "1" } });

    post();
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(postRmConversion).not.toHaveBeenCalled();
    expect(toast.mock.calls[0][0].description).toMatch(/scrap cannot exceed/i);
  });

  it("surfaces the server's message verbatim and keeps the same idempotency key for the retry", async () => {
    postRmConversion.mockRejectedValueOnce(new Error("Item MSSQTUBE: insufficient stock_free (5 available, 10 requested)"));
    renderScreen();
    pick(0, "tube");
    fireEvent.change(numberBoxes(/qty used/i)[0], { target: { value: "10" } });
    pick(1, "a");
    fireEvent.change(numberBoxes(/qty produced/i)[0], { target: { value: "1" } });

    post();
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0][0].description).toBe("Item MSSQTUBE: insufficient stock_free (5 available, 10 requested)");

    post();
    await waitFor(() => expect(postRmConversion).toHaveBeenCalledTimes(2));
    expect(postRmConversion.mock.calls[1][1]).toBe(postRmConversion.mock.calls[0][1]);
  });
});
