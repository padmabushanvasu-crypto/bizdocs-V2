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
  recordJobWorkDCReturn,
  recordLineItemReturn,
} from "@/lib/delivery-challans-api";
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
  returnable: "RETURNABLE", non_returnable: "NON-RETURNABLE", job_work_143: "JOB WORK (SEC 143)",
  job_work_out: "JOB WORK OUT", job_work_return: "JOB WORK RETURN",
};

const JOB_WORK_TYPES = ["job_work_out", "job_work_return", "returnable", "job_work_143"];
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
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [jwReturnOpen, setJwReturnOpen] = useState(false);
  const [jwReturnQtyAccepted, setJwReturnQtyAccepted] = useState(0);
  const [jwReturnQtyRejected, setJwReturnQtyRejected] = useState(0);
  const [jwReturnReason, setJwReturnReason] = useState("");
  const [jwReturnSaving, setJwReturnSaving] = useState(false);
  // Per-line return state
  const [lineReturnId, setLineReturnId] = useState<string | null>(null);
  const [lineReturnItem, setLineReturnItem] = useState<any>(null);
  const [lineReturnQtyReceived, setLineReturnQtyReceived] = useState(0);
  const [lineReturnQtyAccepted, setLineReturnQtyAccepted] = useState(0);
  const [lineReturnReason, setLineReturnReason] = useState("");
  const [lineReturnSaving, setLineReturnSaving] = useState(false);

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
  const isReturnable = dc.dc_type === "returnable" || dc.dc_type === "job_work_143";
  const isJobWork = JOB_WORK_TYPES.includes(dc.dc_type);
  const hasNatureOfProcess = items.some((i) => i.nature_of_process);
  const hasDrawingNumber = items.some((i) => i.drawing_number);
  const hasPerLineJW = items.some((i) => (i as any).job_work_id);
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
        Back to Delivery Challans
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
          <Button variant="outline" size="sm" onClick={() => { setIsDuplicate(true); setTimeout(() => { window.print(); setIsDuplicate(false); }, 100); }}>
            <Printer className="h-3.5 w-3.5 mr-1" /> Print Duplicate
          </Button>
          <DocumentActions documentNumber={dc.dc_number} documentType="Delivery Challan" documentData={dc as Record<string, unknown>} />
          {dc.status === "draft" && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/delivery-challans/${id}/edit`)}>
              <Edit className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          )}
          {isReturnable && ["issued", "partially_returned"].includes(dc.status) && (dc as any).job_work_id && !hasPerLineJW ? (
            <Button size="sm" onClick={() => setJwReturnOpen(true)}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Record Return
            </Button>
          ) : isReturnable && ["issued", "partially_returned"].includes(dc.status) && !hasPerLineJW ? (
            <Button size="sm" onClick={() => navigate(`/delivery-challans/${id}/record-return`)}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Record Return
            </Button>
          ) : null}
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
              Delivery Challan
            </h2>
            <p className="text-xs text-muted-foreground mt-1">[{typeLabels[dc.dc_type] || dc.dc_type}]</p>
            <span className="absolute top-0 right-0 text-xs font-bold border border-current px-2 py-0.5 rounded tracking-widest">
              {isDuplicate ? "DUPLICATE" : "ORIGINAL"}
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
              <div style={{ fontWeight: '700', fontSize: '13pt', color: '#1E3A5F', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Delivery Challan</div>
              <div style={{ fontSize: '8pt', color: '#64748b' }}>[{typeLabels[dc.dc_type] || dc.dc_type}]</div>
              <div style={{ fontWeight: '700', fontSize: '9pt' }}>DC No: {dc.dc_number}</div>
              <div style={{ fontSize: '9pt' }}>Date: {new Date(dc.dc_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
              {dc.vehicle_number && <div style={{ fontSize: '9pt' }}>Vehicle: {dc.vehicle_number}</div>}
              <div style={{ fontSize: '8pt', fontWeight: '700', border: '1pt solid currentColor', display: 'inline-block', padding: '1px 6px', marginTop: '2px' }}>
                {isDuplicate ? "DUPLICATE" : "ORIGINAL"}
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
                <p>{dc.driver_name}</p>
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
              {(dc as any).job_work_number && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Job Work Ref</span>
                  <button
                    onClick={() => navigate(`/job-works/${(dc as any).job_work_id}`)}
                    className="font-mono text-primary hover:underline text-sm"
                  >
                    {(dc as any).job_work_number}
                  </button>
                </div>
              )}
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
                {hasPerLineJW && <th className="print:hidden">Job Work</th>}
                {hasPerLineJW && <th className="print:hidden text-right">Returned</th>}
                {hasPerLineJW && <th className="print:hidden">Status</th>}
                {hasPerLineJW && isReturnable && ["issued", "partially_returned"].includes(dc.status) && <th className="print:hidden w-20"></th>}
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
                  {hasPerLineJW && (
                    <td className="print:hidden font-mono text-xs">
                      {(item as any).job_work_number ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium font-mono px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                          {(item as any).job_work_number}
                        </span>
                      ) : "—"}
                    </td>
                  )}
                  {hasPerLineJW && (
                    <td className="print:hidden text-right font-mono tabular-nums text-sm">
                      {(item as any).qty_accepted != null ? (item as any).qty_accepted : "—"}
                    </td>
                  )}
                  {hasPerLineJW && (
                    <td className="print:hidden">
                      {(item as any).return_status === "returned" ? (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">Returned</span>
                      ) : (item as any).job_work_id ? (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">Pending</span>
                      ) : null}
                    </td>
                  )}
                  {hasPerLineJW && isReturnable && ["issued", "partially_returned"].includes(dc.status) && (
                    <td className="print:hidden">
                      {(item as any).job_work_id && (item as any).return_status !== "returned" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                          onClick={() => {
                            setLineReturnId((item as any).id);
                            setLineReturnItem(item);
                            setLineReturnQtyReceived(item.quantity || 0);
                            setLineReturnQtyAccepted(item.quantity || 0);
                            setLineReturnReason("");
                          }}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" /> Return
                        </Button>
                      )}
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
            <h3 className="text-xs font-semibold text-slate-500">Return History</h3>
            {["issued", "partially_returned"].includes(dc.status) && !hasPerLineJW && (
              (dc as any).job_work_id ? (
                <Button size="sm" variant="outline" onClick={() => setJwReturnOpen(true)}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Record Return
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => navigate(`/delivery-challans/${id}/record-return`)}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Record Return
                </Button>
              )
            )}
            {hasPerLineJW && (
              <span className="text-xs text-muted-foreground italic">Use per-line Return buttons in the table above</span>
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

      {/* Job Work Return Dialog */}
      <Dialog open={jwReturnOpen} onOpenChange={(o) => { if (!o) { setJwReturnOpen(false); setJwReturnReason(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Job Work Return</DialogTitle>
            <DialogDescription>
              Enter received quantities for {(dc as any).job_work_number ?? dc.dc_number}. Accepted qty will be moved back to stock.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Qty Accepted</Label>
                <Input
                  type="number"
                  min={0}
                  value={jwReturnQtyAccepted || ""}
                  onChange={(e) => setJwReturnQtyAccepted(Number(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Qty Rejected</Label>
                <Input
                  type="number"
                  min={0}
                  value={jwReturnQtyRejected || ""}
                  onChange={(e) => setJwReturnQtyRejected(Number(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label>Rejection Reason</Label>
              <Textarea
                value={jwReturnReason}
                onChange={(e) => setJwReturnReason(e.target.value)}
                placeholder="Optional — note why units were rejected"
                rows={2}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJwReturnOpen(false)}>Cancel</Button>
            <Button
              disabled={jwReturnSaving || (jwReturnQtyAccepted === 0 && jwReturnQtyRejected === 0)}
              onClick={async () => {
                setJwReturnSaving(true);
                try {
                  const firstItem = dc.line_items?.[0];
                  await recordJobWorkDCReturn(id!, {
                    qty_accepted: jwReturnQtyAccepted,
                    qty_rejected: jwReturnQtyRejected,
                    rejection_reason: jwReturnReason,
                    item_code: firstItem?.item_code ?? null,
                    item_description: firstItem?.description ?? null,
                  });
                  queryClient.invalidateQueries({ queryKey: ["delivery-challan", id] });
                  queryClient.invalidateQueries({ queryKey: ["dc-stats"] });
                  setJwReturnOpen(false);
                  toast({
                    title: "Return recorded",
                    description: `${jwReturnQtyAccepted} units moved back to stock`,
                  });
                } catch (err: any) {
                  toast({ title: "Error", description: err.message, variant: "destructive" });
                } finally {
                  setJwReturnSaving(false);
                }
              }}
            >
              {jwReturnSaving ? "Recording…" : "Confirm Return"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Per-line Return Dialog */}
      <Dialog open={!!lineReturnId} onOpenChange={(o) => { if (!o) { setLineReturnId(null); setLineReturnItem(null); setLineReturnReason(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Return — Line Item</DialogTitle>
            <DialogDescription>
              {lineReturnItem && (
                <span>
                  {(lineReturnItem as any).job_work_number && <strong>{(lineReturnItem as any).job_work_number} · </strong>}
                  {lineReturnItem.description} (Sent: {lineReturnItem.quantity} {lineReturnItem.unit || "NOS"})
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Qty Received</Label>
              <Input
                type="number"
                min={0}
                value={lineReturnQtyReceived || ""}
                onChange={(e) => {
                  const v = Number(e.target.value) || 0;
                  setLineReturnQtyReceived(v);
                  if (lineReturnQtyAccepted > v) setLineReturnQtyAccepted(v);
                }}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Qty Accepted</Label>
              <Input
                type="number"
                min={0}
                max={lineReturnQtyReceived}
                value={lineReturnQtyAccepted || ""}
                onChange={(e) => setLineReturnQtyAccepted(Math.min(Number(e.target.value) || 0, lineReturnQtyReceived))}
                className="mt-1"
              />
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Qty Rejected (auto)</span>
              <span className="font-mono text-red-600">{Math.max(0, lineReturnQtyReceived - lineReturnQtyAccepted)}</span>
            </div>
            <div>
              <Label>Rejection Reason</Label>
              <Textarea
                value={lineReturnReason}
                onChange={(e) => setLineReturnReason(e.target.value)}
                placeholder="Optional — reason for rejection"
                rows={2}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLineReturnId(null)}>Cancel</Button>
            <Button
              disabled={lineReturnSaving || lineReturnQtyReceived === 0}
              onClick={async () => {
                if (!lineReturnId) return;
                setLineReturnSaving(true);
                try {
                  const qtyRejected = Math.max(0, lineReturnQtyReceived - lineReturnQtyAccepted);
                  await recordLineItemReturn(lineReturnId, {
                    qty_received: lineReturnQtyReceived,
                    qty_accepted: lineReturnQtyAccepted,
                    qty_rejected: qtyRejected,
                    rejection_reason: lineReturnReason || undefined,
                  });
                  queryClient.invalidateQueries({ queryKey: ["delivery-challan", id] });
                  queryClient.invalidateQueries({ queryKey: ["dc-stats"] });
                  setLineReturnId(null);
                  setLineReturnItem(null);
                  toast({ title: "Return recorded", description: `${lineReturnQtyAccepted} units moved to finished goods` });
                } catch (err: any) {
                  toast({ title: "Error", description: err.message, variant: "destructive" });
                } finally {
                  setLineReturnSaving(false);
                }
              }}
            >
              {lineReturnSaving ? "Recording…" : "Confirm Return"}
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
