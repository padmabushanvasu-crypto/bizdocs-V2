import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  fetchDeliveryChallan,
  recordDCReturn,
  type DCReturnItem,
} from "@/lib/delivery-challans-api";

interface ReturnRow {
  dc_line_item_id: string;
  description: string;
  drawing_number: string;
  sent_nos: number;
  sent_kg: number;
  sent_sft: number;
  prev_returned_nos: number;
  prev_returned_kg: number;
  prev_returned_sft: number;
  pending_nos: number;
  pending_kg: number;
  pending_sft: number;
  returning_nos: number;
  returning_kg: number;
  returning_sft: number;
  remarks: string;
}

export default function DCRecordReturn() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [returnDate, setReturnDate] = useState<Date>(new Date());
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<ReturnRow[]>([]);

  const { data: dc, isLoading } = useQuery({
    queryKey: ["delivery-challan", id],
    queryFn: () => fetchDeliveryChallan(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (dc?.line_items) {
      setRows(
        dc.line_items.map((item) => ({
          dc_line_item_id: item.id!,
          description: item.description,
          drawing_number: item.drawing_number || "",
          sent_nos: item.qty_nos || 0,
          sent_kg: item.qty_kg || 0,
          sent_sft: item.qty_sft || 0,
          prev_returned_nos: item.returned_qty_nos || 0,
          prev_returned_kg: item.returned_qty_kg || 0,
          prev_returned_sft: item.returned_qty_sft || 0,
          pending_nos: (item.qty_nos || 0) - (item.returned_qty_nos || 0),
          pending_kg: (item.qty_kg || 0) - (item.returned_qty_kg || 0),
          pending_sft: (item.qty_sft || 0) - (item.returned_qty_sft || 0),
          returning_nos: 0,
          returning_kg: 0,
          returning_sft: 0,
          remarks: "",
        }))
      );
    }
  }, [dc]);

  const updateRow = (index: number, field: keyof ReturnRow, value: any) => {
    setRows((prev) => {
      const updated = [...prev];
      const row = { ...updated[index] };

      if (field === "returning_nos") {
        row.returning_nos = Math.min(Math.max(0, Number(value)), row.pending_nos);
      } else if (field === "returning_kg") {
        row.returning_kg = Math.min(Math.max(0, Number(value)), row.pending_kg);
      } else if (field === "returning_sft") {
        row.returning_sft = Math.min(Math.max(0, Number(value)), row.pending_sft);
      } else {
        (row as any)[field] = value;
      }

      updated[index] = row;
      return updated;
    });
  };

  const hasReturns = rows.some((r) => r.returning_nos > 0 || r.returning_kg > 0 || r.returning_sft > 0);

  // Summary
  const fullyReturnedAfter = rows.filter((r) => {
    const newPendingNos = r.pending_nos - r.returning_nos;
    const newPendingKg = r.pending_kg - r.returning_kg;
    const newPendingSft = r.pending_sft - r.returning_sft;
    return newPendingNos <= 0 && newPendingKg <= 0 && newPendingSft <= 0;
  }).length;
  const stillPendingAfter = rows.length - fullyReturnedAfter;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const returnItems: DCReturnItem[] = rows
        .filter((r) => r.returning_nos > 0 || r.returning_kg > 0 || r.returning_sft > 0)
        .map((r) => ({
          dc_line_item_id: r.dc_line_item_id,
          returned_nos: r.returning_nos,
          returned_kg: r.returning_kg,
          returned_sft: r.returning_sft,
          remarks: r.remarks || undefined,
        }));

      await recordDCReturn(id!, format(returnDate, "yyyy-MM-dd"), receivedBy, notes, returnItems);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-challan", id] });
      queryClient.invalidateQueries({ queryKey: ["dc-returns", id] });
      queryClient.invalidateQueries({ queryKey: ["delivery-challans"] });
      queryClient.invalidateQueries({ queryKey: ["dc-stats"] });
      toast({
        title: "Return recorded",
        description: `DC updated. ${fullyReturnedAfter} items fully returned, ${stillPendingAfter} still pending.`,
      });
      navigate(`/delivery-challans/${id}`);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!dc) return <div className="p-6 text-muted-foreground">DC not found.</div>;

  return (
    <div className="p-4 md:p-6 pb-24 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-display font-bold text-foreground">
          Record Return — DC {dc.dc_number}
        </h1>
        <p className="text-sm text-muted-foreground">
          Party: {dc.party_name} | Issued: {new Date(dc.dc_date).toLocaleDateString("en-IN")}
        </p>
      </div>

      {/* Header */}
      <div className="paper-card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-sm font-medium text-slate-700">Return Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full mt-1 justify-start font-normal")}>
                  {format(returnDate, "dd MMM yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={returnDate} onSelect={(d) => d && setReturnDate(d)} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label className="text-sm font-medium text-slate-700">Received By</Label>
            <Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} className="mt-1" placeholder="Name of person" />
          </div>
          <div>
            <Label className="text-sm font-medium text-slate-700">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" placeholder="Optional notes" />
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="paper-card !p-0">
        <div className="px-4 md:px-6 py-3 border-b border-border">
          <h2 className="text-sm uppercase text-muted-foreground font-bold tracking-wider">Items</h2>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Description</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Drawing</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Sent</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Prev Ret</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Pending</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Returning Now *</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const hasPending = row.pending_nos > 0 || row.pending_kg > 0 || row.pending_sft > 0;
                return (
                  <tr key={row.dc_line_item_id} className={cn("border-t border-border", !hasPending && "opacity-50")}>
                    <td className="px-3 py-2 text-sm font-medium">{row.description}</td>
                    <td className="px-3 py-2 text-sm font-mono">{row.drawing_number || "—"}</td>
                    <td className="px-3 py-2 text-right text-sm font-mono tabular-nums">
                      {row.sent_nos > 0 && <div>{row.sent_nos} nos</div>}
                      {row.sent_kg > 0 && <div>{row.sent_kg} kg</div>}
                      {row.sent_sft > 0 && <div>{row.sent_sft} sft</div>}
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-mono tabular-nums">
                      {row.prev_returned_nos > 0 && <div>{row.prev_returned_nos} nos</div>}
                      {row.prev_returned_kg > 0 && <div>{row.prev_returned_kg} kg</div>}
                      {row.prev_returned_sft > 0 && <div>{row.prev_returned_sft} sft</div>}
                      {row.prev_returned_nos === 0 && row.prev_returned_kg === 0 && row.prev_returned_sft === 0 && "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-mono tabular-nums">
                      {row.pending_nos > 0 && <div className="text-amber-600 font-medium">{row.pending_nos} nos</div>}
                      {row.pending_kg > 0 && <div className="text-amber-600 font-medium">{row.pending_kg} kg</div>}
                      {row.pending_sft > 0 && <div className="text-amber-600 font-medium">{row.pending_sft} sft</div>}
                      {!hasPending && <span className="text-emerald-600">✓</span>}
                    </td>
                    <td className="px-3 py-2">
                      {hasPending && (
                        <div className="space-y-1">
                          {row.pending_nos > 0 && (
                            <Input
                              type="number"
                              min={0}
                              max={row.pending_nos}
                              value={row.returning_nos || ""}
                              onChange={(e) => updateRow(index, "returning_nos", e.target.value)}
                              className="h-7 text-sm text-right font-mono w-20"
                              placeholder="nos"
                            />
                          )}
                          {row.pending_kg > 0 && (
                            <Input
                              type="number"
                              min={0}
                              max={row.pending_kg}
                              step="0.01"
                              value={row.returning_kg || ""}
                              onChange={(e) => updateRow(index, "returning_kg", e.target.value)}
                              className="h-7 text-sm text-right font-mono w-20"
                              placeholder="kg"
                            />
                          )}
                          {row.pending_sft > 0 && (
                            <Input
                              type="number"
                              min={0}
                              max={row.pending_sft}
                              step="0.01"
                              value={row.returning_sft || ""}
                              onChange={(e) => updateRow(index, "returning_sft", e.target.value)}
                              className="h-7 text-sm text-right font-mono w-20"
                              placeholder="sft"
                            />
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {hasPending && (
                        <Input
                          value={row.remarks}
                          onChange={(e) => updateRow(index, "remarks", e.target.value)}
                          className="h-7 text-sm"
                          placeholder="Optional"
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary */}
      {hasReturns && (
        <div className="paper-card bg-muted/50">
          <p className="text-sm text-muted-foreground">
            After this receipt: <span className="font-medium text-emerald-600">{fullyReturnedAfter} items fully returned</span>,{" "}
            <span className="font-medium text-amber-600">{stillPendingAfter} items still pending</span>
          </p>
        </div>
      )}

      {/* Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-3 flex justify-end gap-2 z-40">
        <Button variant="outline" onClick={() => navigate(`/delivery-challans/${id}`)}>Cancel</Button>
        <Button onClick={() => saveMutation.mutate()} disabled={!hasReturns || saveMutation.isPending}>
          <RotateCcw className="h-4 w-4 mr-1" /> Save Return Entry
        </Button>
      </div>
    </div>
  );
}
