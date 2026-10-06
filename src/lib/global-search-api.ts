import { supabase } from "@/integrations/supabase/client";
import { getCompanyId, sanitizeSearchTerm } from "@/lib/auth-helpers";

export type SearchGroup =
  | "Items"
  | "Dispatch Records"
  | "Serial Numbers"
  | "Purchase Orders"
  | "GRNs"
  | "Delivery Challans"
  | "Work Orders"
  | "Invoices"
  | "Parties";

export interface SearchHit {
  id: string;
  group: SearchGroup;
  title: string;
  subtitle: string;
  url: string;
}

interface Source {
  group: SearchGroup;
  table: string;
  select: string;
  /** Columns matched with ilike. */
  fields: string[];
  /** Extra filter (e.g. exclude soft-deleted). */
  extra?: (q: any) => any;
  map: (r: any) => Omit<SearchHit, "group">;
}

const PER_GROUP = 5;
const FETCH_PER_GROUP = 25;

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

const SOURCES: Source[] = [
  {
    group: "Items",
    table: "items",
    select: "id, item_code, description, drawing_number, drawing_revision, item_type, status",
    fields: ["item_code", "description", "drawing_number", "drawing_revision"],
    map: (r) => ({
      id: r.id,
      title: r.item_code ?? "—",
      subtitle: join(r.description, r.drawing_number && `Dwg ${r.drawing_number}`, r.item_type?.replace(/_/g, " ")),
      url: `/stock-register?q=${encodeURIComponent(r.item_code ?? "")}`,
    }),
  },
  {
    group: "Dispatch Records",
    table: "dispatch_records",
    select: "id, dr_number, customer_name, status",
    fields: ["dr_number", "customer_name", "vehicle_number"],
    map: (r) => ({ id: r.id, title: r.dr_number, subtitle: join(r.customer_name, r.status), url: `/dispatch-records/${r.id}` }),
  },
  {
    group: "Serial Numbers",
    table: "serial_numbers",
    select: "id, serial_number, item_code, status, customer_name",
    fields: ["serial_number", "item_code", "customer_name"],
    map: (r) => ({
      id: r.id,
      title: r.serial_number,
      subtitle: join(r.item_code, r.status?.replace(/_/g, " "), r.customer_name),
      url: `/serial-numbers?q=${encodeURIComponent(r.serial_number ?? "")}`,
    }),
  },
  {
    group: "Purchase Orders",
    table: "purchase_orders",
    select: "id, po_number, vendor_name, status",
    fields: ["po_number", "vendor_name"],
    map: (r) => ({ id: r.id, title: r.po_number, subtitle: join(r.vendor_name, r.status), url: `/purchase-orders/${r.id}` }),
  },
  {
    group: "GRNs",
    table: "grns",
    select: "id, grn_number, po_number, vendor_name, status",
    fields: ["grn_number", "po_number", "vendor_name"],
    map: (r) => ({
      id: r.id,
      title: r.grn_number,
      subtitle: join(r.vendor_name, r.po_number && `PO ${r.po_number}`, r.status),
      url: `/grn/${r.id}`,
    }),
  },
  {
    group: "Delivery Challans",
    table: "delivery_challans",
    select: "id, dc_number, party_name, status",
    fields: ["dc_number", "party_name"],
    map: (r) => ({ id: r.id, title: r.dc_number, subtitle: join(r.party_name, r.status), url: `/delivery-challans/${r.id}` }),
  },
  {
    group: "Work Orders",
    table: "assembly_work_orders",
    select: "id, awo_number, item_code, status",
    fields: ["awo_number", "item_code"],
    extra: (q) => q.is("deleted_at", null),
    map: (r) => ({ id: r.id, title: r.awo_number, subtitle: join(r.item_code, r.status), url: `/assembly-work-orders/${r.id}` }),
  },
  {
    group: "Invoices",
    table: "invoices",
    select: "id, invoice_number, customer_name, status",
    fields: ["invoice_number", "customer_name"],
    map: (r) => ({ id: r.id, title: r.invoice_number, subtitle: join(r.customer_name, r.status), url: `/invoices/${r.id}` }),
  },
  {
    group: "Parties",
    table: "parties",
    select: "id, name, party_type, status",
    fields: ["name"],
    map: (r) => ({ id: r.id, title: r.name, subtitle: join(r.party_type, r.status), url: `/parties/${r.id}` }),
  },
];

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Universal search across the main records. The longest word is matched in the
 * database (ilike, tenant-scoped); every other word is then required client-side,
 * so "11kv 17 pos" or "voltamp 003" narrow as you type. Results are ranked:
 * exact title, title starts-with, then the rest.
 */
export async function globalSearch(raw: string): Promise<SearchHit[]> {
  const words = norm(sanitizeSearchTerm(raw)).split(" ").filter(Boolean);
  if (words.length === 0 || norm(raw).length < 2) return [];
  const companyId = await getCompanyId();
  if (!companyId) return [];

  const lead = [...words].sort((a, b) => b.length - a.length)[0];
  const pattern = `%${lead}%`;
  const whole = norm(raw);

  const perSource = await Promise.all(
    SOURCES.map(async (src) => {
      let q = (supabase as any)
        .from(src.table)
        .select(src.select)
        .eq("company_id", companyId)
        .or(src.fields.map((f) => `${f}.ilike.${pattern}`).join(","))
        .limit(FETCH_PER_GROUP);
      if (src.extra) q = src.extra(q);
      const { data, error } = await q;
      // Fail loud for the caller, never silently drop a group.
      if (error) throw new Error(`${src.group}: ${error.message}`);

      return ((data ?? []) as any[])
        .filter((r) => {
          const hay = norm(src.fields.map((f) => r[f]).join(" "));
          return words.every((w) => hay.includes(w));
        })
        .map((r) => {
          const hit = src.map(r);
          const t = norm(hit.title);
          const rank = t === whole ? 0 : t.startsWith(whole) ? 1 : 2;
          return { hit: { ...hit, group: src.group } as SearchHit, rank };
        })
        .sort((a, b) => a.rank - b.rank)
        .slice(0, PER_GROUP);
    })
  );

  // Groups whose best hit ranks highest come first.
  return perSource
    .filter((g) => g.length > 0)
    .sort((a, b) => a[0].rank - b[0].rank)
    .flatMap((g) => g.map((x) => x.hit));
}
