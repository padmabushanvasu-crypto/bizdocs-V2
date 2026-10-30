// Finished goods leave unit by unit, and the unit IS its serial (from the FG work
// order that built it). So a dispatch line carries its serials over automatically:
// for each finished-good line, keep whatever serials are already on it and top up
// to the line quantity from that item's in-stock serials — verified units first,
// then lowest serial number (oldest built). The team can still tap to swap a unit.

export interface PickedSerial {
  id: string;
  serial_number: string;
}

export interface AvailableSerial extends PickedSerial {
  needs_verification?: boolean;
}

export interface FillableLine {
  item_id: string;
  quantity: number;
  serials?: PickedSerial[];
}

/** Order the pool: verified first, then serial number ascending (numeric-aware). */
export function orderSerialPool<T extends AvailableSerial>(pool: T[]): T[] {
  return [...pool].sort((a, b) => {
    const va = a.needs_verification ? 1 : 0;
    const vb = b.needs_verification ? 1 : 0;
    if (va !== vb) return va - vb;
    return a.serial_number.localeCompare(b.serial_number, undefined, { numeric: true });
  });
}

/**
 * Returns the lines with serials carried over (one per unit), and whether
 * anything changed. Lines for resale items (no serials) are left alone, as are
 * lines with no item yet. Never hands the same serial to two lines.
 */
export function fillLineSerials<L extends FillableLine>(
  lines: L[],
  poolByItem: Record<string, AvailableSerial[]>,
  isResale: (itemId: string) => boolean,
): { lines: L[]; changed: boolean } {
  const used = new Set<string>();
  for (const l of lines) for (const s of l.serials ?? []) used.add(s.id);

  let changed = false;
  const next = lines.map((l) => {
    if (!l.item_id || isResale(l.item_id)) return l;
    const qty = Math.max(0, Math.floor(Number(l.quantity) || 0));
    const cur = l.serials ?? [];

    if (cur.length > qty) {
      changed = true;
      for (const s of cur.slice(qty)) used.delete(s.id);
      return { ...l, serials: cur.slice(0, qty) };
    }
    if (cur.length === qty) return l;

    const add: PickedSerial[] = [];
    for (const s of orderSerialPool(poolByItem[l.item_id] ?? [])) {
      if (cur.length + add.length >= qty) break;
      if (used.has(s.id)) continue;
      used.add(s.id);
      add.push({ id: s.id, serial_number: s.serial_number });
    }
    if (add.length === 0) return l;
    changed = true;
    return { ...l, serials: [...cur, ...add] };
  });

  return { lines: changed ? next : lines, changed };
}
