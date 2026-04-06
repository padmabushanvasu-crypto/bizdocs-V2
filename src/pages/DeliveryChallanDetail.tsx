import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit, X, Truck, CheckCircle2, RotateCcw, AlertTriangle, Printer, ChevronLeft, Trash2, Plus } from "lucide-react";
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
import { createGrnFromDC } from "@/lib/grn-api";
import { JobCardCreationDialog } from "@/components/JobCardCreationDialog";
import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";
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
  const [showDeletedReturns, setShowDeletedReturns] = useState(false);
  const [jcDialogOpen, setJcDialogOpen] = useState(false);
  const [existingJobCards, setExistingJobCards] = useState<Record<string, { id: string; jc_number: string; current_stage: number; status: string }[]>>({});

  const handleOpenJCDialog = async () => {
    const lineItems = dc?.line_items ?? [];
    const companyId = await getCompanyId();
    const byItemId: Record<string, { id: string; jc_number: string; current_stage: number; status: string }[]> = {};
    await Promise.all(
      lineItems
        .filter(li => (li as any).item_id)
        .map(async (li) => {
          const itemId = (li as any).item_id as string;
          const { data } = await (supabase as any)
            .from("job_cards")
            .select("id, jc_number, current_stage, status")
            .eq("item_id", itemId)
            .eq("status", "in_progress")
            .eq("company_id", companyId)
            .limit(1);
          if (data?.length) byItemId[itemId] = data;
        })
    );
    setExistingJobCards(byItemId);
    setJcDialogOpen(true);
  };

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

  const createGrnMutation = useMutation({
    mutationFn: () => createGrnFromDC({ dc_id: id!, date: new Date().toISOString().split("T")[0] }),
    onSuccess: (newGrn) => {
      navigate(`/grn/${(newGrn as any).id}`);
    },
    onError: (err: any) => {
      toast({ title: "Error creating GRN", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!dc) return <div className="p-6 text-muted-foreground">Delivery challan not found.</div>;

  const items = dc.line_items || [];
  const isReturnable = RETURNABLE_DC_TYPES.includes(dc.dc_type);
  const isDeleted = dc.status === "deleted";
  const isJobWorkDC = ["job_work_out", "job_work_143", "returnable"].includes(dc.dc_type ?? "");
  const hasNatureOfProcess = items.some((i) => i.nature_of_process);
  const hasDrawingNumber = items.some((i) => i.drawing_number);
  const hasQtyKgs = items.some((i) => (i as any).qty_kgs != null);
  const hasQtySft = items.some((i) => (i as any).qty_sft != null);
  const today = new Date().toISOString().split("T")[0];
  const isOverdue = dc.return_due_date && dc.return_due_date < today && !["fully_returned", "cancelled"].includes(dc.status);

  const subTotal = dc.sub_total || items.reduce((s, i) => s + (i.amount || 0), 0);
  const grandTotal = dc.grand_total || subTotal;
  const isCgstSgst = (dc.cgst_amount || 0) > 0;

  // ── Compact A4 print copy renderer ────────────────────────────────────────
  const renderDCPrintCopy = (label: string) => {
    const co = companySettings;
    const fromAddr = [co?.address_line1, co?.address_line2, [co?.city, co?.state].filter(Boolean).join(', '), co?.pin_code ? `PIN ${co.pin_code}` : ''].filter(Boolean).join(', ');
    return (
      <div className="dc-print-copy" style={{ fontFamily: 'Arial, sans-serif', fontSize: '7.5pt', color: '#000', lineHeight: 1.2 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1.5pt solid #1E3A5F', paddingBottom: '3pt', marginBottom: '3pt' }}>
          <div>
            {co?.logo_url && <img src={co.logo_url} alt="" style={{ height: '22pt', marginBottom: '1pt', objectFit: 'contain' }} />}
            <div style={{ fontWeight: 700, fontSize: '9.5pt', lineHeight: 1.15 }}>{co?.company_name}</div>
            <div style={{ fontSize: '6.5pt', color: '#475569' }}>{fromAddr}</div>
            {co?.gstin && <div style={{ fontSize: '6.5pt', fontFamily: 'monospace' }}>GSTIN: {co.gstin}</div>}
            {co?.phone && <div style={{ fontSize: '6.5pt', color: '#475569' }}>Ph: {co.phone}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700, fontSize: '10pt', color: '#1E3A5F', letterSpacing: '0.03em' }}>DELIVERY CHALLAN</div>
            <div style={{ fontSize: '6.5pt', color: '#64748b', marginBottom: '1pt' }}>cum Job Work Order · [{typeLabels[dc.dc_type] || dc.dc_type}]</div>
            <div style={{ fontWeight: 700, fontSize: '7pt' }}>DC No: {dc.dc_number}</div>
            <div style={{ fontSize: '7pt' }}>Date: {new Date(dc.dc_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            {dc.vehicle_number && <div style={{ fontSize: '6.5pt' }}>Vehicle: {dc.vehicle_number}</div>}
            {(dc as any).driver_name && <div style={{ fontSize: '6.5pt' }}>Driver: {(dc as any).driver_name}{(dc as any).driver_contact ? ` — ${(dc as any).driver_contact}` : ''}</div>}
            <div style={{ fontWeight: 700, border: '0.75pt solid #1E3A5F', display: 'inline-block', padding: '1pt 4pt', marginTop: '1pt', fontSize: '7pt', letterSpacing: '0.05em' }}>{label}</div>
          </div>
        </div>

        {/* From / To */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4pt', marginBottom: '3pt', fontSize: '7pt' }}>
          <div style={{ border: '0.5pt solid #CBD5E1', padding: '3pt', borderRadius: '2pt' }}>
            <div style={{ fontWeight: 700, fontSize: '6pt', color: '#64748b', textTransform: 'uppercase', marginBottom: '1pt' }}>From</div>
            <div style={{ fontWeight: 700 }}>{co?.company_name}</div>
            <div style={{ color: '#475569' }}>{fromAddr}</div>
            {co?.gstin && <div style={{ fontFamily: 'monospace', fontSize: '6pt' }}>GSTIN: {co.gstin}</div>}
          </div>
          <div style={{ border: '0.5pt solid #CBD5E1', padding: '3pt', borderRadius: '2pt' }}>
            <div style={{ fontWeight: 700, fontSize: '6pt', color: '#64748b', textTransform: 'uppercase', marginBottom: '1pt' }}>To</div>
            <div style={{ fontWeight: 700 }}>{dc.party_name}</div>
            {dc.party_address && <div style={{ color: '#475569' }}>{dc.party_address}</div>}
            {dc.party_gstin && <div style={{ fontFamily: 'monospace', fontSize: '6pt' }}>GSTIN: {dc.party_gstin}</div>}
            {dc.party_phone && <div style={{ color: '#475569' }}>Ph: {dc.party_phone}</div>}
          </div>
        </div>

        {/* Reference row */}
        {(dc.po_reference || dc.return_due_date || (dc as any).lo_number) && (
          <div style={{ display: 'flex', gap: '10pt', fontSize: '7pt', marginBottom: '3pt', color: '#475569' }}>
            {(dc as any).lo_number && <span>L.O. No: <strong style={{ color: '#000' }}>{(dc as any).lo_number}</strong></span>}
            {dc.po_reference && <span>PO Ref: <strong style={{ color: '#000' }}>{dc.po_reference}</strong></span>}
            {dc.return_due_date && <span>Return Due: <strong style={{ color: '#000' }}>{new Date(dc.return_due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></span>}
            {(dc as any).approx_value > 0 && <span>Approx. Value: <strong style={{ color: '#000' }}>₹{formatCurrency((dc as any).approx_value)}</strong></span>}
          </div>
        )}

        {/* Line Items */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7pt', marginBottom: '3pt' }}>
          <thead>
            <tr style={{ background: '#1E3A5F', color: '#fff' }}>
              <th style={{ padding: '2pt 3pt', textAlign: 'left', width: '16pt' }}>#</th>
              {hasDrawingNumber && <th style={{ padding: '2pt 3pt', textAlign: 'left', minWidth: '55pt' }}>Drawing No.</th>}
              <th style={{ padding: '2pt 3pt', textAlign: 'left' }}>Description</th>
              {hasNatureOfProcess && <th style={{ padding: '2pt 3pt', textAlign: 'left', minWidth: '55pt' }}>Process</th>}
              <th style={{ padding: '2pt 3pt', textAlign: 'center', width: '20pt' }}>Unit</th>
              <th style={{ padding: '2pt 3pt', textAlign: 'right', width: '28pt' }}>Qty</th>
              {hasQtyKgs && <th style={{ padding: '2pt 3pt', textAlign: 'right', width: '32pt' }}>KGS</th>}
              {hasQtySft && <th style={{ padding: '2pt 3pt', textAlign: 'right', width: '32pt' }}>SFT</th>}
              <th style={{ padding: '2pt 3pt', textAlign: 'right', width: '40pt' }}>Rate (₹)</th>
              <th style={{ padding: '2pt 3pt', textAlign: 'right', width: '46pt' }}>Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.serial_number} style={{ background: idx % 2 === 0 ? '#F8FAFC' : '#fff', borderBottom: '0.5pt solid #E2E8F0' }}>
                <td style={{ padding: '1.5pt 3pt', color: '#64748b' }}>{item.serial_number}</td>
                {hasDrawingNumber && <td style={{ padding: '1.5pt 3pt', fontFamily: 'monospace', fontWeight: 700, color: '#1E3A5F' }}>{item.drawing_number || item.item_code || '—'}</td>}
                <td style={{ padding: '1.5pt 3pt' }}>{item.description}</td>
                {hasNatureOfProcess && <td style={{ padding: '1.5pt 3pt', color: '#475569' }}>{(item as any).nature_of_process || '—'}</td>}
                <td style={{ padding: '1.5pt 3pt', textAlign: 'center', color: '#475569' }}>{item.unit || 'NOS'}</td>
                <td style={{ padding: '1.5pt 3pt', textAlign: 'right', fontFamily: 'monospace' }}>{formatNumber(item.quantity || item.qty_nos || 0)}</td>
                {hasQtyKgs && <td style={{ padding: '1.5pt 3pt', textAlign: 'right', fontFamily: 'monospace' }}>{(item as any).qty_kgs != null ? formatNumber((item as any).qty_kgs) : '—'}</td>}
                {hasQtySft && <td style={{ padding: '1.5pt 3pt', textAlign: 'right', fontFamily: 'monospace' }}>{(item as any).qty_sft != null ? formatNumber((item as any).qty_sft) : '—'}</td>}
                <td style={{ padding: '1.5pt 3pt', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(item.rate || 0)}</td>
                <td style={{ padding: '1.5pt 3pt', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{formatCurrency(item.amount || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals + Instructions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4pt' }}>
          <div style={{ maxWidth: '55%', fontSize: '7pt' }}>
            {dc.special_instructions && (
              <div><span style={{ fontWeight: 700 }}>Special Instructions: </span>{dc.special_instructions}</div>
            )}
            {isReturnable && (
              <div style={{ fontWeight: 700, fontSize: '6.5pt', borderTop: '0.75pt solid #1E3A5F', borderBottom: '0.75pt solid #1E3A5F', padding: '1.5pt 0', marginTop: '3pt', letterSpacing: '0.05em' }}>
                NOT FOR SALE — GOODS FOR JOB WORK / RETURNABLE
              </div>
            )}
          </div>
          <div style={{ minWidth: '120pt', fontSize: '7pt' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5pt 0' }}>
              <span style={{ color: '#475569' }}>Sub Total</span>
              <span style={{ fontFamily: 'monospace' }}>{formatCurrency(subTotal)}</span>
            </div>
            {isCgstSgst ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5pt 0' }}>
                  <span style={{ color: '#475569' }}>CGST @ {(dc.gst_rate || 18) / 2}%</span>
                  <span style={{ fontFamily: 'monospace' }}>{formatCurrency(dc.cgst_amount || 0)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5pt 0' }}>
                  <span style={{ color: '#475569' }}>SGST @ {(dc.gst_rate || 18) / 2}%</span>
                  <span style={{ fontFamily: 'monospace' }}>{formatCurrency(dc.sgst_amount || 0)}</span>
                </div>
              </>
            ) : (dc.igst_amount || 0) > 0 ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5pt 0' }}>
                <span style={{ color: '#475569' }}>IGST @ {dc.gst_rate || 18}%</span>
                <span style={{ fontFamily: 'monospace' }}>{formatCurrency(dc.igst_amount || 0)}</span>
              </div>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '0.75pt solid #000', paddingTop: '1.5pt', fontWeight: 700, fontSize: '8pt', marginTop: '1pt' }}>
              <span>Total</span>
              <span style={{ fontFamily: 'monospace' }}>{formatCurrency(grandTotal)}</span>
            </div>
            <div style={{ fontSize: '6pt', color: '#475569', fontStyle: 'italic', marginTop: '1pt' }}>{amountInWords(grandTotal)}</div>
          </div>
        </div>

        {/* Signature + Receiver — single combined row */}
        <div style={{ borderTop: '0.75pt solid #CBD5E1', paddingTop: '3pt' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '6pt', fontSize: '7pt', textAlign: 'center' }}>
            {[
              { label: 'Prepared By', name: dc.prepared_by },
              { label: 'Checked By', name: dc.checked_by },
              { label: 'Authorised Signatory', name: '' },
              { label: `Receiver (${dc.party_name})`, name: '' },
            ].map(({ label, name }) => (
              <div key={label} style={{ borderTop: '0.5pt solid #000', paddingTop: '2pt', marginTop: '10pt' }}>
                {name && <div style={{ fontSize: '6pt', color: '#64748b', marginBottom: '1pt' }}>{name}</div>}
                <div style={{ fontWeight: 700, fontSize: '6.5pt' }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '6.5pt', color: '#475569', textAlign: 'center', marginTop: '2pt' }}>
            Received the above goods in good condition · Date: ___________
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Print CSS — hides everything except #dc-print-view */}
      <style>{`
        @media print {
          * { visibility: hidden !important; }
          #dc-print-view, #dc-print-view * { visibility: visible !important; }
          #dc-print-view { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }
          .dc-page-break { page-break-before: always; break-before: always; }
          .dc-print-copy { page-break-inside: avoid; }
          @page { size: A4 portrait; margin: 10mm 12mm 8mm 12mm; }
          body { font-size: 7.5pt !important; line-height: 1.2 !important; }
        }
      `}</style>

      {/* Always-present A4 print view */}
      <div id="dc-print-view" style={{ display: 'none' }}>
        {DC_COPY_LABELS.slice(0, printCopiesSelected).map((label, idx) => (
          <div key={label}>
            {idx > 0 && <div className="dc-page-break" />}
            {renderDCPrintCopy(label)}
          </div>
        ))}
      </div>

      <button
        onClick={() => navigate("/delivery-challans")}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-3 print:hidden"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to DC / Job Work Orders
      </button>
      {/* Deleted banner */}
      {isDeleted && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 print:hidden">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive font-medium">This DC has been deleted and is read-only.</p>
        </div>
      )}

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
          {isJobWorkDC && ["issued", "partially_returned"].includes(dc.status) && !isDeleted && (
            <Button variant="outline" size="sm" onClick={handleOpenJCDialog}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Create Job Cards
            </Button>
          )}
          {isReturnable && ["issued", "partially_returned"].includes(dc.status) && !isDeleted && (
            <Button size="sm" disabled={createGrnMutation.isPending} onClick={() => createGrnMutation.mutate()}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              {createGrnMutation.isPending ? "Creating GRN…" : "Record Return"}
            </Button>
          )}
          {!["cancelled", "fully_returned", "deleted"].includes(dc.status) && (
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
        <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-6 print:gap-2">
          <div className="border border-border rounded-lg p-4 print:p-1 print:border-0 space-y-4 print:space-y-1">
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

          <div className="border border-border rounded-lg p-4 print:p-1 print:border-0">
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
        <div className="border-2 border-dashed border-border rounded-lg p-4 print:p-2">
          <p className="text-sm text-muted-foreground text-center mb-8 print:mb-4">Received the above goods in good condition</p>
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
      <div className="paper-card print:hidden">
          <div className="flex items-center justify-between border-b border-border pb-2 mb-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-500">Return History</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Records material physically returned by the job worker. To send goods back to a <em>vendor</em>, raise a new DC with type "Return to Vendor".</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={showDeletedReturns ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowDeletedReturns(v => !v)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                {showDeletedReturns ? "Hide Deleted" : "Show Deleted"}
              </Button>
              {["issued", "partially_returned"].includes(dc.status) && !isDeleted && (
                <Button size="sm" variant="outline" disabled={createGrnMutation.isPending} onClick={() => createGrnMutation.mutate()}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> {createGrnMutation.isPending ? "Creating GRN…" : "Record Return"}
                </Button>
              )}
            </div>
          </div>
          {(() => {
            const filteredReturns = showDeletedReturns
              ? (returns ?? [])
              : (returns ?? []).filter(r => (r as any).status !== "deleted");
            return filteredReturns.length === 0 ? (
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
                  {filteredReturns.map((ret) => (
                    <tr key={ret.id} className={(ret as any).status === "deleted" ? "opacity-50" : ""}>
                      <td>{new Date(ret.return_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td>{ret.received_by || "—"}</td>
                      <td className="font-mono text-sm">{ret.items?.length ?? 0} items</td>
                      <td className="text-muted-foreground">{ret.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
      </div>

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
            <Button onClick={() => { setPrintDialogOpen(false); setTimeout(() => window.print(), 100); }}>
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

      {/* Job Card Creation Dialog */}
      <JobCardCreationDialog
        open={jcDialogOpen}
        onOpenChange={setJcDialogOpen}
        dcId={id!}
        dcNumber={dc.dc_number}
        lineItems={(dc.line_items ?? []).map(li => ({
          ...li,
          item_id: (li as any).item_id ?? null,
        }))}
        partyId={dc.party_id}
        partyName={dc.party_name}
        existingJobCards={existingJobCards}
      />
    </div>
  );
}
