import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit, X, Truck, CheckCircle2, RotateCcw, AlertTriangle, Printer, ChevronLeft } from "lucide-react";
import { EditableSection } from "@/components/EditableSection";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchDeliveryChallan,
  cancelDeliveryChallan,
  fetchDCReturns,
  recordEnhancedReturn,
  fetchBomStagesForItemDC,
  fetchComponentProcessingLog,
  type EnhancedReturnData,
} from "@/lib/delivery-challans-api";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatNumber, amountInWords } from "@/lib/gst-utils";
import { DocumentHeader } from "@/components/DocumentHeader";
import { DocumentActions } from "@/components/DocumentActions";
import { AuditTimeline } from "@/components/AuditTimeline";
import { DocumentSignature } from "@/components/DocumentSignature";
import { fetchCompanySettings } from "@/lib/settings-api";

const statusClass: Record<string, string> = {
  draft: "status-draft",
  issued: "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  partially_returned: "status-overdue",
  fully_returned: "status-paid",
  cancelled: "status-cancelled",
};
const statusLabels: Record<string, string> = {
  draft: "Draft", issued: "Issued", partially_returned: "Partially Returned",
  fully_returned: "Fully Returned", cancelled: "Cancelled",
};
const typeLabels: Record<string, string> = {
  returnable: "RETURNABLE", non_returnable: "NON-RETURNABLE",
  job_work_143: "RETURNABLE — SECTION 143",
  job_work_out: "RETURNABLE — PROCESSING",
  job_work_return: "PROCESSING RETURN",
};

const RETURNABLE_DC_TYPES = ["job_work_out", "job_work_return", "returnable", "job_work_143"];
const categoryLabels: Record<string, string> = {
  supply_on_approval: "Supply on Approval", job_work_return: "Job Work Return",
  sales_return: "Sales Return", others: "Others",
};

export default function DeliveryChallanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [copyLabel, setCopyLabel] = useState("ORIGINAL");
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printCopiesSelected, setPrintCopiesSelected] = useState(2);
  const DC_COPY_LABELS = ["ORIGINAL", "DUPLICATE", "TRIPLICATE"];
  const triggerPrint = (totalCopies: number, index = 0) => {
    if (index >= totalCopies) { setCopyLabel("ORIGINAL"); return; }
    setCopyLabel(DC_COPY_LABELS[index]);
    setTimeout(() => {
      const handler = () => { window.removeEventListener("afterprint", handler); setTimeout(() => triggerPrint(totalCopies, index + 1), 50); };
      window.addEventListener("afterprint", handler);
      window.print();
    }, 100);
  };
  // Enhanced return dialog state
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnLineItem, setReturnLineItem] = useState<any>(null);
  const [returnBomStages, setReturnBomStages] = useState<any[]>([]);
  const [returnProcessingLog, setReturnProcessingLog] = useState<any>(null);
  // Section A fields
  const [retQtyReturning, setRetQtyReturning] = useState(0);
  const [retQtyAccepted, setRetQtyAccepted] = useState(0);
  const [retQtyRejected, setRetQtyRejected] = useState(0);
  const [retRejectionReason, setRetRejectionReason] = useState('');
  // Section B fields
  const [retAcceptedAction, setRetAcceptedAction] = useState('hold');
  const [retSplitNext, setRetSplitNext] = useState(0);
  const [retSplitFg, setRetSplitFg] = useState(0);
  const [retSplitHold, setRetSplitHold] = useState(0);
  // Section C fields
  const [retRejectedAction, setRetRejectedAction] = useState('hold');
  const [retReworkVendorId, setRetReworkVendorId] = useState<string | null>(null);
  const [retReworkVendorName, setRetReworkVendorName] = useState('');
  const [retSaving, setRetSaving] = useState(false);

  const { data: dc, isLoading } = useQuery({
    queryKey: ["delivery-challan", id],
    queryFn: () => fetchDeliveryChallan(id!),
    enabled: !!id,
  });

  const { data: returns } = useQuery({
    queryKey: ["dc-returns", id],
    queryFn: () => fetchDCReturns(id!),
    enabled: !!id,
  });

  const { data: companySettings } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
    staleTime: 60_000,
  });

  const { data: processorPartiesData } = useQuery({
    queryKey: ['parties-processors'],
    queryFn: () => import('@/lib/parties-api').then(m => m.fetchParties({ status: 'active', pageSize: 500 })),
    staleTime: 60000,
  });
  const processorParties = (processorPartiesData?.data ?? []).filter((p: any) => p.vendor_type === 'processor' || p.vendor_type === 'both');

  const openReturnDialog = async (lineItem: any) => {
    setReturnLineItem(lineItem);
    setRetQtyReturning(0);
    setRetQtyAccepted(0);
    setRetQtyRejected(0);
    setRetRejectionReason('');
    setRetAcceptedAction('hold');
    setRetRejectedAction('hold');
    setRetReworkVendorId(null);
    setRetReworkVendorName('');
    setRetSplitNext(0); setRetSplitFg(0); setRetSplitHold(0);
    setReturnBomStages([]);
    setReturnProcessingLog(null);

    let itemIdHint: string | null = lineItem.item_id ?? null;
    if (!itemIdHint && lineItem.item_code) {
      const { data: itemRow } = await (supabase as any).from('items').select('id').eq('item_code', lineItem.item_code).maybeSingle();
      itemIdHint = itemRow?.id ?? null;
    }
    if (itemIdHint) {
      const [stages, log] = await Promise.all([
        fetchBomStagesForItemDC(itemIdHint),
        (async () => {
          const { data: dcRow } = await (supabase as any).from('delivery_challans').select('company_id').eq('id', id!).single();
          if (dcRow?.company_id) return fetchComponentProcessingLog(dcRow.company_id, itemIdHint!);
          return null;
        })(),
      ]);
      setReturnBomStages(stages);
      setReturnProcessingLog(log);
    }
    setReturnDialogOpen(true);
  };

  const cancelMutation = useMutation({
    mutationFn: () => cancelDeliveryChallan(id!, cancelReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-challan", id] });
      setCancelOpen(false);
      toast({ title: "DC Cancelled" });
    },
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!dc) return <div className="p-6 text-muted-foreground">Delivery challan not found.</div>;

  const items = dc.line_items || [];
  const isReturnable = RETURNABLE_DC_TYPES.includes(dc.dc_type);
  const hasNatureOfProcess = items.some((i) => i.nature_of_process);
  const hasDrawingNumber = items.some((i) => i.drawing_number);
  const hasQtyKgs = items.some((i) => (i as any).qty_kgs != null);
  const hasQtySft = items.some((i) => (i as any).qty_sft != null);
  const today = new Date().toISOString().split("T")[0];
  const isOverdue = dc.return_due_date && dc.return_due_date < today && !["fully_returned", "cancelled"].includes(dc.status);

  const subTotal = dc.sub_total || items.reduce((s, i) => s + (i.amount || 0), 0);
  const grandTotal = dc.grand_total || subTotal;
  const isCgstSgst = (dc.cgst_amount || 0) > 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <button
        onClick={() => navigate("/delivery-challans")}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-3 print:hidden"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to DC / Job Work Orders
      </button>
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-display font-bold font-mono text-foreground">{dc.dc_number}</h1>
          <span className={statusClass[dc.status] || "status-draft"}>{statusLabels[dc.status]}</span>
          {isOverdue && (
            <span className="bg-destructive/10 text-destructive border border-destructive/20 text-xs font-medium px-2.5 py-0.5 rounded-full">Overdue</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setPrintDialogOpen(true)}>
            <Printer className="h-3.5 w-3.5 mr-1" /> Print Options
          </Button>
          <DocumentActions documentNumber={dc.dc_number} documentType="Delivery Challan" documentData={dc as Record<string, unknown>} />
          {dc.status === "draft" && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/delivery-challans/${id}/edit`)}>
              <Edit className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          )}
          {isReturnable && ["issued", "partially_returned"].includes(dc.status) && (
            <Button size="sm" onClick={() => navigate(`/dc-grn/new?dc_id=${id}`)}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Record Return
            </Button>
          )}
          {!["cancelled", "fully_returned"].includes(dc.status) && (
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Document Preview */}
      <div className="paper-card space-y-4 po-print-wrapper">
        {/* ── SCREEN header ── */}
        <div className="print:hidden">
          <DocumentHeader />
          <div className="text-center border-b border-border pb-4 relative">
            <h2 className="text-lg font-display font-bold text-primary uppercase tracking-wider">
              Delivery Challan cum Job Work Order
            </h2>
            <p className="text-xs text-muted-foreground mt-1">[{typeLabels[dc.dc_type] || dc.dc_type}]</p>
            <span className="absolute top-0 right-0 text-xs font-bold border border-current px-2 py-0.5 rounded tracking-widest">
              {copyLabel}
            </span>
          </div>
        </div>

        {/* ── PRINT: compact 2-col header ── */}
        <div className="hidden print:block po-section" style={{ borderBottom: '0.5pt solid #CBD5E1', paddingBottom: '4mm' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <div style={{ flex: '0 0 58%' }}>
              {companySettings?.logo_url && (
                <img src={companySettings.logo_url} alt="Logo" style={{ height: '32px', marginBottom: '3px', objectFit: 'contain' }} />
              )}
              <div style={{ fontWeight: '700', fontSize: '11pt', lineHeight: 1.2 }}>{companySettings?.company_name}</div>
              <div style={{ fontSize: '8pt', color: '#475569', lineHeight: 1.4 }}>
                {[companySettings?.address_line1, companySettings?.address_line2, [companySettings?.city, companySettings?.state].filter(Boolean).join(', '), companySettings?.pin_code ? `PIN ${companySettings.pin_code}` : ''].filter(Boolean).join(', ')}
              </div>
              {companySettings?.gstin && <div style={{ fontSize: '8pt', fontFamily: 'monospace' }}>GSTIN: {companySettings.gstin}</div>}
              {companySettings?.phone && <div style={{ fontSize: '8pt', color: '#475569' }}>Ph: {companySettings.phone}</div>}
            </div>
            <div style={{ flex: '0 0 42%', textAlign: 'right' }}>
              <div style={{ fontWeight: '700', fontSize: '13pt', color: '#1E3A5F', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Delivery Challan cum Job Work Order</div>
              <div style={{ fontSize: '8pt', color: '#64748b' }}>[{typeLabels[dc.dc_type] || dc.dc_type}]</div>
              <div style={{ fontWeight: '700', fontSize: '9pt' }}>DC No: {dc.dc_number}</div>
              <div style={{ fontSize: '9pt' }}>Date: {new Date(dc.dc_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
              {dc.vehicle_number && <div style={{ fontSize: '9pt' }}>Vehicle: {dc.vehicle_number}</div>}
              {(dc as any).driver_name && (
                <div style={{ fontSize: '9pt' }}>
                  Driver: {(dc as any).driver_name}
                  {(dc as any).driver_contact ? ` — ${(dc as any).driver_contact}` : ''}
                </div>
              )}
              <div style={{ fontSize: '8pt', fontWeight: '700', border: '1pt solid currentColor', display: 'inline-block', padding: '1px 6px', marginTop: '2px' }}>
                {copyLabel}
              </div>
            </div>
          </div>
        </div>

        <EditableSection
          editable={dc.status === "draft"}
          onEdit={() => navigate(`/delivery-challans/${id}/edit`)}
          label="Click to edit"
          className="p-4 -mx-4"
        >
          {/* DC Info Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm border-b border-border pb-4">
            <div>
              <p className="text-xs text-muted-foreground">DC Number</p>
              <p className="font-mono font-medium">{dc.dc_number}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Date</p>
              <p>{new Date(dc.dc_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
            </div>
            {dc.vehicle_number && (
              <div>
                <p className="text-xs text-muted-foreground">Vehicle No.</p>
                <p className="font-mono">{dc.vehicle_number}</p>
              </div>
            )}
            {dc.driver_name && (
              <div>
                <p className="text-xs text-muted-foreground">Driver</p>
                <p>{dc.driver_name}{(dc as any).driver_contact ? ` — ${(dc as any).driver_contact}` : ''}</p>
              </div>
            )}
          </div>
        </EditableSection>

        {/* FROM / TO Block */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-border rounded-lg p-4 space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">FROM</p>
              {companySettings ? (
                <>
                  <p className="font-medium text-foreground">{companySettings.company_name}</p>
                  {companySettings.address_line1 && <p className="text-sm text-muted-foreground">{companySettings.address_line1}</p>}
                  {companySettings.address_line2 && <p className="text-sm text-muted-foreground">{companySettings.address_line2}</p>}
                  {(companySettings.city || companySettings.state) && (
                    <p className="text-sm text-muted-foreground">
                      {[companySettings.city, companySettings.state, companySettings.pin_code].filter(Boolean).join(", ")}
                    </p>
                  )}
                  {companySettings.gstin && <p className="text-sm font-mono">GSTIN: {companySettings.gstin}</p>}
                </>
              ) : null}
            </div>
            <div className="border-t border-border pt-3 space-y-1.5 text-sm">
              <p className="text-xs font-semibold text-slate-500 mb-2">Reference Details</p>
              {(dc as any).lo_number && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">L.O. No</span>
                  <span className="font-mono">{(dc as any).lo_number}</span>
                </div>
              )}
              {dc.po_reference && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">PO Reference</span>
                  <span className="font-mono">{dc.po_reference}</span>
                </div>
              )}
              {dc.po_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">PO Date</span>
                  <span>{new Date(dc.po_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                </div>
              )}
              {dc.challan_category && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Challan Type</span>
                  <span>{categoryLabels[dc.challan_category] || dc.challan_category}</span>
                </div>
              )}
              {(dc as any).approx_value != null && (dc as any).approx_value > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Approx. Value</span>
                  <span className="font-mono">{formatCurrency((dc as any).approx_value)}</span>
                </div>
              )}
              {dc.return_due_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Return Due</span>
                  <span className={isOverdue ? "text-destructive font-medium" : ""}>
                    {new Date(dc.return_due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    {isOverdue && " ⚠ OVERDUE"}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="border border-border rounded-lg p-4">
            <p className="text-xs font-semibold text-slate-500 mb-2">TO</p>
            <p className="font-medium text-foreground">{dc.party_name}</p>
            {dc.party_address && <p className="text-sm text-muted-foreground">{dc.party_address}</p>}
            {dc.party_gstin && <p className="text-sm font-mono">GSTIN: {dc.party_gstin}</p>}
            {dc.party_phone && <p className="text-sm text-muted-foreground">Ph: {dc.party_phone}</p>}
          </div>
        </div>

        {/* Line Items Table */}
        <div className="overflow-x-auto po-section">
          <table className="w-full data-table po-line-items-table">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th className="min-w-[110px]">Drawing No.</th>
                <th>Description</th>
                {hasNatureOfProcess && <th>Nature of Process</th>}
                <th>Unit</th>
                <th className="text-right">Qty (NOS)</th>
                {hasQtyKgs && <th className="text-right">Qty (KGS)</th>}
                {hasQtySft && <th className="text-right">Qty (SFT)</th>}
                <th className="text-right">Rate (₹)</th>
                <th className="text-right">Amount (₹)</th>
                <th>Remarks</th>
                {isReturnable && ["issued", "partially_returned"].includes(dc.status) && <th className="print:hidden">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.serial_number}>
                  <td className="font-mono text-muted-foreground">{item.serial_number}</td>
                  <td className="font-mono text-sm font-semibold text-blue-700">
                    {item.drawing_number || item.item_code || "—"}
                  </td>
                  <td className="font-medium">{item.description}</td>
                  {hasNatureOfProcess && <td className="text-sm">{(item as any).nature_of_process || "—"}</td>}
                  <td className="text-muted-foreground">{item.unit || "NOS"}</td>
                  <td className="text-right font-mono tabular-nums">{formatNumber(item.quantity || item.qty_nos || 0)}</td>
                  {hasQtyKgs && <td className="text-right font-mono tabular-nums">{(item as any).qty_kgs != null ? formatNumber((item as any).qty_kgs) : "—"}</td>}
                  {hasQtySft && <td className="text-right font-mono tabular-nums">{(item as any).qty_sft != null ? formatNumber((item as any).qty_sft) : "—"}</td>}
                  <td className="text-right font-mono tabular-nums">{formatCurrency(item.rate || 0)}</td>
                  <td className="text-right font-mono tabular-nums font-medium">{formatCurrency(item.amount || 0)}</td>
                  <td className="text-muted-foreground text-sm">{item.remarks || "—"}</td>
                  {isReturnable && ["issued", "partially_returned"].includes(dc.status) && (
                    <td className="print:hidden">
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => openReturnDialog(item)}>
                        Return
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Block */}
        <div className="flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sub Total</span>
              <span className="font-mono tabular-nums">{formatCurrency(subTotal)}</span>
            </div>
            {isCgstSgst ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CGST @ {(dc.gst_rate || 18) / 2}%</span>
                  <span className="font-mono tabular-nums">{formatCurrency(dc.cgst_amount || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SGST @ {(dc.gst_rate || 18) / 2}%</span>
                  <span className="font-mono tabular-nums">{formatCurrency(dc.sgst_amount || 0)}</span>
                </div>
              </>
            ) : (dc.igst_amount || 0) > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">IGST @ {dc.gst_rate || 18}%</span>
                <span className="font-mono tabular-nums">{formatCurrency(dc.igst_amount || 0)}</span>
              </div>
            ) : null}
            <div className="border-t border-border pt-2">
              <div className="flex justify-between text-base font-bold">
                <span>Total Amount</span>
                <span className="font-mono tabular-nums text-primary">{formatCurrency(grandTotal)}</span>
              </div>
            </div>
            <div className="bg-muted/50 rounded p-2 text-xs text-muted-foreground italic">
              {amountInWords(grandTotal)}
            </div>
          </div>
        </div>

        {/* Special Instructions */}
        {dc.special_instructions && (
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-slate-500 mb-1">Special Instructions</p>
            <p className="text-sm">{dc.special_instructions}</p>
          </div>
        )}

        {/* Not for Sale Banner */}
        {isReturnable && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-center text-sm font-bold text-primary uppercase tracking-wider">
            NOT FOR SALE — GOODS FOR JOB WORK / RETURNABLE
          </div>
        )}

        {/* Signature Block */}
        <div className="grid grid-cols-3 gap-6 border-t border-border pt-4 text-center text-sm po-footer">
          <div>
            <p className="text-muted-foreground mb-12">{dc.prepared_by || ""}</p>
            <div className="border-t border-border pt-1">
              <p className="text-xs text-muted-foreground font-medium">Prepared By</p>
            </div>
          </div>
          <div>
            <p className="text-muted-foreground mb-12">{dc.checked_by || ""}</p>
            <div className="border-t border-border pt-1">
              <p className="text-xs text-muted-foreground font-medium">Checked By</p>
            </div>
          </div>
          <DocumentSignature label="Authorised Signatory" />
        </div>

        {/* Receiver Box */}
        <div className="border-2 border-dashed border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground text-center mb-8">Received the above goods in good condition</p>
          <div className="flex justify-between items-end px-8">
            <div className="text-center">
              <div className="border-t border-border pt-1">
                <p className="text-xs text-muted-foreground px-6">Signature</p>
                <p className="text-xs text-muted-foreground">for {dc.party_name}</p>
              </div>
            </div>
            <div className="text-center">
              <div className="border-t border-border pt-1">
                <p className="text-xs text-muted-foreground px-6">Date</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Return History */}
      {isReturnable && (
        <div className="paper-card print:hidden">
          <div className="flex items-center justify-between border-b border-border pb-2 mb-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-500">Return History</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Records material physically returned by the job worker. To send goods back to a <em>vendor</em>, raise a new DC with type "Return to Vendor".</p>
            </div>
            {["issued", "partially_returned"].includes(dc.status) && (
              <Button size="sm" variant="outline" onClick={() => navigate(`/delivery-challans/${id}/record-return`)}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Record Return
              </Button>
            )}
          </div>
          {(returns ?? []).length === 0 ? (
            <div className="text-center py-6">
              <AlertTriangle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No returns recorded yet</p>
            </div>
          ) : (
            <table className="w-full data-table">
              <thead>
                <tr><th>Date</th><th>Received By</th><th>Items Returned</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {(returns ?? []).map((ret) => (
                  <tr key={ret.id}>
                    <td>{new Date(ret.return_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td>{ret.received_by || "—"}</td>
                    <td className="font-mono text-sm">{ret.items?.length ?? 0} items</td>
                    <td className="text-muted-foreground">{ret.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Audit Trail */}
      <div className="print:hidden">
        <AuditTimeline documentId={id!} />
      </div>

      {/* Enhanced Return Dialog */}
      <Dialog open={returnDialogOpen} onOpenChange={(o) => { if (!o) setReturnDialogOpen(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Record Return{returnLineItem?.drawing_number ? ` — ${returnLineItem.drawing_number}` : ''}
              {returnLineItem?.stage_number ? ` · Stage ${returnLineItem.stage_number}: ${returnLineItem.stage_name || returnLineItem.nature_of_process || ''}` : ''}
            </DialogTitle>
            <DialogDescription>
              {returnLineItem?.description}
              {returnLineItem?.is_rework && (
                <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
                  Rework — Cycle {returnLineItem?.rework_cycle ?? 1}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Section A: Quantities */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 border-b pb-1">Quantities</h3>
              {(() => {
                const priorReceived = returnLineItem?.qty_received ?? 0;
                const priorAccepted = returnLineItem?.qty_accepted ?? 0;
                const priorRejected = returnLineItem?.qty_rejected ?? 0;
                const totalSent = returnLineItem?.quantity ?? 0;
                const remaining = Math.max(0, totalSent - priorReceived);
                return (
                  <>
                    {priorReceived > 0 && (
                      <div className="text-xs text-slate-500 bg-slate-50 rounded p-2 space-y-0.5">
                        <p>Previously returned: <span className="font-medium">{priorReceived}</span> units ({priorAccepted} accepted, {priorRejected} rejected)</p>
                        <p>Remaining: <span className="font-medium">{remaining}</span> units</p>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Qty Arriving Today</Label>
                        <Input
                          type="number" min={0} max={remaining || totalSent}
                          value={retQtyReturning || ''}
                          onChange={e => {
                            const v = Math.min(Number(e.target.value) || 0, remaining || totalSent);
                            setRetQtyReturning(v);
                            setRetQtyAccepted(v);
                            setRetQtyRejected(0);
                          }}
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Qty Accepted</Label>
                        <Input
                          type="number" min={0} max={retQtyReturning}
                          value={retQtyAccepted || ''}
                          onChange={e => {
                            const v = Math.min(Number(e.target.value) || 0, retQtyReturning);
                            setRetQtyAccepted(v);
                            setRetQtyRejected(Math.max(0, retQtyReturning - v));
                          }}
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Qty Rejected</Label>
                        <Input
                          type="number" min={0} max={retQtyReturning}
                          value={retQtyRejected || ''}
                          onChange={e => {
                            const v = Math.min(Number(e.target.value) || 0, retQtyReturning);
                            setRetQtyRejected(v);
                            setRetQtyAccepted(Math.max(0, retQtyReturning - v));
                          }}
                          className={`mt-1 h-8 text-sm ${retQtyRejected > 0 ? 'text-red-600 border-red-300' : ''}`}
                        />
                      </div>
                    </div>
                    {retQtyRejected > 0 && (
                      <div>
                        <Label className="text-xs">Rejection Reason</Label>
                        <input
                          list="rejection-suggestions"
                          className="mt-1 w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                          value={retRejectionReason}
                          onChange={e => setRetRejectionReason(e.target.value)}
                          placeholder="Select or type a reason…"
                        />
                        <datalist id="rejection-suggestions">
                          {['Dimensional error','Surface defect','Wrong specification','Damaged in transit','Poor finish quality','Incomplete processing'].map(s => (
                            <option key={s} value={s} />
                          ))}
                        </datalist>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Section B: Accepted units action */}
            {retQtyAccepted > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700 border-b pb-1">For {retQtyAccepted} accepted units:</h3>
                <div className="space-y-2">
                  {(() => {
                    const currentStageNum = returnLineItem?.stage_number;
                    const nextStage = currentStageNum
                      ? returnBomStages.find((s: any) => s.stage_number === currentStageNum + 1)
                      : returnBomStages.length > 0 ? returnBomStages[0] : null;
                    const isFinalStage = currentStageNum
                      ? returnBomStages.find((s: any) => s.stage_number === currentStageNum)?.is_final_stage
                      : false;
                    return (
                      <>
                        {nextStage && (
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input type="radio" name="accepted_action" value="next_stage" checked={retAcceptedAction === 'next_stage'} onChange={() => setRetAcceptedAction('next_stage')} className="mt-0.5" />
                            <span className="text-sm">Send to Stage {nextStage.stage_number} — {nextStage.process_name}{nextStage.vendor_name ? ` (${nextStage.vendor_name})` : ''}</span>
                          </label>
                        )}
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input type="radio" name="accepted_action" value="hold" checked={retAcceptedAction === 'hold'} onChange={() => setRetAcceptedAction('hold')} className="mt-0.5" />
                          <span className="text-sm">Hold in stock — send for processing later</span>
                        </label>
                        {(isFinalStage || !nextStage) && (
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input type="radio" name="accepted_action" value="finished_goods" checked={retAcceptedAction === 'finished_goods'} onChange={() => setRetAcceptedAction('finished_goods')} className="mt-0.5" />
                            <span className="text-sm">Mark as finished goods</span>
                          </label>
                        )}
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input type="radio" name="accepted_action" value="split" checked={retAcceptedAction === 'split'} onChange={() => setRetAcceptedAction('split')} className="mt-0.5" />
                          <span className="text-sm">Split batch</span>
                        </label>
                        {retAcceptedAction === 'split' && (
                          <div className="ml-6 grid grid-cols-3 gap-2 mt-2">
                            {nextStage && <div><Label className="text-xs">→ Next stage</Label><Input type="number" min={0} max={retQtyAccepted} value={retSplitNext || ''} onChange={e => setRetSplitNext(Number(e.target.value) || 0)} className="h-7 text-xs mt-0.5" /></div>}
                            <div><Label className="text-xs">→ Finished goods</Label><Input type="number" min={0} max={retQtyAccepted} value={retSplitFg || ''} onChange={e => setRetSplitFg(Number(e.target.value) || 0)} className="h-7 text-xs mt-0.5" /></div>
                            <div><Label className="text-xs">→ Hold in stock</Label><Input type="number" min={0} max={retQtyAccepted} value={retSplitHold || ''} onChange={e => setRetSplitHold(Number(e.target.value) || 0)} className="h-7 text-xs mt-0.5" /></div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Section C: Rejected units action */}
            {retQtyRejected > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-red-700 border-b border-red-100 pb-1">For {retQtyRejected} rejected units:</h3>
                <div className="space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="rejected_action" value="rework_same_vendor" checked={retRejectedAction === 'rework_same_vendor'} onChange={() => setRetRejectedAction('rework_same_vendor')} className="mt-0.5" />
                    <div>
                      <span className="text-sm">Send back to same vendor for rework</span>
                      {dc?.party_name && <p className="text-xs text-muted-foreground">New DC → {dc.party_name}, Cycle {(returnLineItem?.rework_cycle ?? 1) + 1}</p>}
                    </div>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="rejected_action" value="rework_different_vendor" checked={retRejectedAction === 'rework_different_vendor'} onChange={() => setRetRejectedAction('rework_different_vendor')} className="mt-0.5" />
                    <span className="text-sm">Send to different vendor for rework</span>
                  </label>
                  {retRejectedAction === 'rework_different_vendor' && (
                    <div className="ml-6">
                      <select
                        className="w-full border rounded px-2 py-1.5 text-sm"
                        value={retReworkVendorId ?? ''}
                        onChange={e => {
                          const p = processorParties.find((x: any) => x.id === e.target.value);
                          setRetReworkVendorId(e.target.value || null);
                          setRetReworkVendorName((p as any)?.name ?? '');
                        }}
                      >
                        <option value="">Select vendor…</option>
                        {processorParties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  )}
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="rejected_action" value="scrap" checked={retRejectedAction === 'scrap'} onChange={() => setRetRejectedAction('scrap')} className="mt-0.5" />
                    <span className="text-sm">Scrap — write off</span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="rejected_action" value="hold" checked={retRejectedAction === 'hold'} onChange={() => setRetRejectedAction('hold')} className="mt-0.5" />
                    <span className="text-sm">Hold for inspection</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={retSaving || retQtyReturning === 0}
              onClick={async () => {
                if (!returnLineItem) return;
                if (retQtyRejected > 0 && retRejectedAction === 'scrap' && !retRejectionReason) {
                  toast({ title: 'Rejection reason required for scrap', variant: 'destructive' });
                  return;
                }
                if (retAcceptedAction === 'split') {
                  const splitSum = retSplitNext + retSplitFg + retSplitHold;
                  if (splitSum !== retQtyAccepted) {
                    toast({ title: `Split quantities must sum to ${retQtyAccepted}`, variant: 'destructive' });
                    return;
                  }
                }
                setRetSaving(true);
                try {
                  let itemId: string | null = null;
                  if (returnLineItem.item_code) {
                    const { data: itemRow } = await (supabase as any).from('items').select('id').eq('item_code', returnLineItem.item_code).maybeSingle();
                    itemId = itemRow?.id ?? null;
                  }

                  const result = await recordEnhancedReturn(returnLineItem.id, {
                    qty_returning: retQtyReturning,
                    qty_accepted: retQtyAccepted,
                    qty_rejected: retQtyRejected,
                    rejection_reason: retRejectionReason || null,
                    accepted_action: retAcceptedAction,
                    rejected_action: retQtyRejected > 0 ? retRejectedAction : null,
                    rejected_vendor_id: retRejectedAction === 'rework_different_vendor' ? retReworkVendorId : null,
                    rejected_vendor_name: retRejectedAction === 'rework_different_vendor' ? retReworkVendorName : null,
                    split_next_stage_qty: retSplitNext,
                    split_finished_qty: retSplitFg,
                    split_hold_qty: retSplitHold,
                    dc_id: id!,
                    dc_number: dc!.dc_number,
                    item_id: itemId,
                    drawing_number: returnLineItem.drawing_number ?? null,
                    current_stage_number: returnLineItem.stage_number ?? null,
                    current_rework_cycle: returnLineItem.rework_cycle ?? 1,
                    bom_stages: returnBomStages,
                  } as EnhancedReturnData);

                  queryClient.invalidateQueries({ queryKey: ['delivery-challan', id] });
                  queryClient.invalidateQueries({ queryKey: ['dc-stats'] });
                  setReturnDialogOpen(false);
                  toast({ title: 'Return recorded', description: `${retQtyAccepted} accepted, ${retQtyRejected} rejected. Stock updated.` });

                  if (result.nextDCPrefill) {
                    navigate('/delivery-challans/new', { state: { prefill: result.nextDCPrefill } });
                  } else if (result.reworkDCPrefill) {
                    navigate('/delivery-challans/new', { state: { prefill: result.reworkDCPrefill } });
                  }
                } catch (err: any) {
                  toast({ title: 'Error', description: err.message, variant: 'destructive' });
                } finally {
                  setRetSaving(false);
                }
              }}
            >
              {retSaving ? 'Recording…' : 'Confirm Return'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Options Dialog */}
      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Print Options</DialogTitle>
            <DialogDescription>Select number of copies to print.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-center py-2">
            {[1, 2, 3].map(n => (
              <button
                key={n}
                onClick={() => setPrintCopiesSelected(n)}
                className={`w-14 h-14 rounded-lg border-2 font-semibold text-sm transition-colors ${printCopiesSelected === n ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 hover:border-slate-400'}`}
              >
                {n}<br /><span className="text-[10px] font-normal">{n === 1 ? 'copy' : 'copies'}</span>
              </button>
            ))}
          </div>
          <div className="text-xs text-center text-muted-foreground">
            {DC_COPY_LABELS.slice(0, printCopiesSelected).join(" + ")}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => { setPrintDialogOpen(false); triggerPrint(printCopiesSelected); }}>
              <Printer className="h-3.5 w-3.5 mr-1" /> Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Delivery Challan</DialogTitle>
            <DialogDescription>This will cancel DC {dc.dc_number}. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason for cancellation..." rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Go Back</Button>
            <Button variant="destructive" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>Cancel DC</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
