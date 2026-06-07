// Per-line-item visual cue — a fixed, restrained, low-saturation palette cycled
// by the item's index within a document (palette[idx % len]); deterministic.
// FULL STATIC Tailwind class strings (no interpolation) so JIT emits them.
//   ITEM_HEADER_PALETTE — card header bars: light tint bg + colored border.
//   ITEM_ROW_ACCENT     — table rows: colored border only (row bg stays semantic).
export const ITEM_HEADER_PALETTE = [
  "bg-blue-50 border-blue-400",
  "bg-emerald-50 border-emerald-400",
  "bg-amber-50 border-amber-400",
  "bg-violet-50 border-violet-400",
  "bg-rose-50 border-rose-400",
  "bg-cyan-50 border-cyan-400",
];

export const ITEM_ROW_ACCENT = [
  "border-blue-400",
  "border-emerald-400",
  "border-amber-400",
  "border-violet-400",
  "border-rose-400",
  "border-cyan-400",
];
