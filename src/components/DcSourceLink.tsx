import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchDcSourceOptions } from "@/lib/delivery-challans-api";
import { DcSourceDialog } from "@/components/DcSourceDialog";

interface DcSourceLinkProps {
  dcLineId: string;
  itemLabel: string;
  lineQty: number;
  unit?: string | null;
}

// Shown on a plain (non job-card) DC line whose item has track_source = true,
// while the DC isn't issued yet. Renders "Source: Automatic" until an
// explicit choice exists, then the chosen breakdown — clicking either opens
// the picker dialog.
export function DcSourceLink({ dcLineId, itemLabel, lineQty, unit }: DcSourceLinkProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: options } = useQuery({
    queryKey: ["dc-source-options", dcLineId],
    queryFn: () => fetchDcSourceOptions(dcLineId),
  });

  const chosen = (options ?? []).filter((o) => o.chosen_qty > 0);
  const label =
    chosen.length === 0
      ? "Source: Automatic"
      : `Source: ${chosen
          .map((o) => `${o.source_type === "grn" ? o.grn_number : "Store"} ${o.chosen_qty}`)
          .join(", ")}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-medium text-primary hover:underline"
      >
        {label}
      </button>
      <DcSourceDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) queryClient.invalidateQueries({ queryKey: ["dc-source-options", dcLineId] });
        }}
        dcLineId={dcLineId}
        itemLabel={itemLabel}
        lineQty={lineQty}
        unit={unit}
      />
    </>
  );
}
