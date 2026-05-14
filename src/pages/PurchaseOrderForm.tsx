import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Search, Info, ChevronDown, ChevronLeft, Lock } from "lucide-react";
import { ItemSuggest } from "@/components/ItemSuggest";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { fetchParties, type Party } from "@/lib/parties-api";
import { fetchCompanySettings } from "@/lib/settings-api";
import { fetchItems, type Item } from "@/lib/items-api";
import {
  fetchPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
  issuePurchaseOrder,
  type POLineItem,
} from "@/lib/purchase-orders-api";
import { formatCurrency, formatNumber, amountInWords } from "@/lib/gst-utils";
import { getGSTType, calculateLineTax, round2, resolveStateCode, getStateName, type GSTType } from "@/lib/tax-utils";
import { UNITS } from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCanEdit } from "@/hooks/useCanEdit";
import { logAudit } from "@/lib/audit-api";
import { fetchDeliveryContacts, saveDeliveryContact } from "@/lib/delivery-contacts-api";

const PAYMENT_TERMS = ["Immediate", "7 Days", "15 Days", "30 Days", "45 Days", "60 Days", "Custom"];
const GST_RATES = [0, 5, 12, 18, 28];

const CURRENCIES = [
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "KRW", symbol: "₩", name: "South Korean Won" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
];

// Company state code fetched dynamically from settings

function emptyLineItem(serial: number): POLineItem {
  return {
    serial_number: serial,
    description: "",
    drawing_number: "",
    quantity: 0,
    unit: "NOS",
    quantity_2: null,
    unit_2: null,
    unit_price: 0,
    line_total: 0,
    gst_rate: 18,
  };
}

export default function PurchaseOrderForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const DRAFT_KEY = 'bizdocs_draft_po';
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { role, profile } = useAuth();
  const isPurchaseTeam = role === 'purchase_team';
  const canEditPO = useCanEdit('purchase-orders');
  const [accessBlocked, setAccessBlocked] = useState(false);

  const prefillState = location.state as { vendor_id?: string; prefill_items?: { item_id: string; description: string; qty: number; unit: string }[] } | null;
  const [prefillApplied, setPrefillApplied] = useState(false);
  const firstQtyRef = useRef<HTMLInputElement | null>(null);

  // Form state
  const [poNumber, setPONumber] = useState("");
  const [poDate, setPODate] = useState<Date>(new Date());
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<Party | null>(null);
  const [vendorOpen, setVendorOpen] = useState(false);
  const [poDateOpen, setPoDateOpen] = useState(false);
  const [vendorReference, setVendorReference] = useState("");
  const [vendorEmail, setVendorEmail] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [customPaymentTerms, setCustomPaymentTerms] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryContactPerson, setDeliveryContactPerson] = useState("");
  const [deliveryContactPhone, setDeliveryContactPhone] = useState("");
  const [contactPersonOpen, setContactPersonOpen] = useState(false);
  const [contactPhoneOpen, setContactPhoneOpen] = useState(false);
  const [deliveryAddressAutoFilled, setDeliveryAddressAutoFilled] = useState(false);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [internalRemarks, setInternalRemarks] = useState("");
  const [lineItems, setLineItems] = useState<POLineItem[]>([emptyLineItem(1)]);
  const [gstRate, setGstRate] = useState(18);
  const [additionalCharges, setAdditionalCharges] = useState<{ label: string; amount: number }[]>([]);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [savedPOId, setSavedPOId] = useState<string | null>(null);

  // Foreign currency state
  const [currency, setCurrency] = useState("INR");
  const [currencySymbol, setCurrencySymbol] = useState("₹");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [isForeignVendor, setIsForeignVendor] = useState(false);
  const [fetchingRate, setFetchingRate] = useState(false);
  const [rateFetchStatus, setRateFetchStatus] = useState<"idle" | "live" | "manual">("idle");

  // Fetch company settings for state code
  const { data: companySettings } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
    staleTime: 5 * 60 * 1000,
  });
  const COMPANY_STATE_CODE = resolveStateCode(companySettings?.state_code, companySettings?.gstin);

  // Profiles for delivery contact person dropdown (internal staff)
  const { data: companyProfiles } = useQuery({
    queryKey: ["profiles-for-company", profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const { data } = await (supabase as any)
        .from("profiles")
        .select("full_name, email")
        .eq("company_id", profile.company_id)
        .not("full_name", "is", null)
        .order("full_name");
      return (data ?? []) as { full_name: string; email: string | null }[];
    },
    enabled: !!profile?.company_id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: deliveryContacts } = useQuery({
    queryKey: ["delivery-contacts", profile?.company_id],
    queryFn: () => fetchDeliveryContacts(profile!.company_id!),
    enabled: !!profile?.company_id,
    staleTime: 30 * 60 * 1000,
  });

  const companyDeliveryAddress = useMemo(() => {
    if (!companySettings) return "";
    return [
      companySettings.address_line1,
      companySettings.address_line2,
      companySettings.city,
      companySettings.state,
      companySettings.pin_code,
    ].filter(Boolean).join(", ");
  }, [companySettings]);

  // Fetch vendors
  const { data: vendorsData } = useQuery({
    queryKey: ["parties-vendors"],
    queryFn: () => fetchParties({ type: "vendor", status: "active", pageSize: 500 }),
  });
  const vendors = vendorsData?.data ?? [];

  // PO number is now assigned by the DB trigger
  // trg_purchase_orders_assign_number on insert (see migration
  // 20260513000020). The form passes an empty string and reads the
  // assigned value back from the insert result.

  // Load existing PO for edit
  const { data: existingPO } = useQuery({
    queryKey: ["purchase-order", id],
    queryFn: () => fetchPurchaseOrder(id!),
    enabled: isEdit,
  });

  // Block roles where canEdit = false (e.g. inward_team, storekeeper).
  // Wait until profile loads so we don't redirect on the 'admin' default.
  useEffect(() => {
    if (!profile) return;
    if (!canEditPO) {
      setAccessBlocked(true);
      const timer = setTimeout(() => navigate('/purchase-orders', { replace: true }), 2000);
      return () => clearTimeout(timer);
    }
  }, [profile, canEditPO]); // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => {
    if (existingPO) {
      setPONumber(existingPO.po_number);
      setPODate(new Date(existingPO.po_date));
      setVendorId(existingPO.vendor_id);
      setVendorReference((existingPO as any).vendor_reference || "");
      setVendorEmail((existingPO as any).vendor_email || "");
      setReferenceNumber(existingPO.reference_number || "");
      setPaymentTerms(existingPO.payment_terms || "");
      setDeliveryAddress(existingPO.delivery_address || "");
      setDeliveryContactPerson((existingPO as any).delivery_contact_person || "");
      setDeliveryContactPhone((existingPO as any).delivery_contact_phone || "");
      setSpecialInstructions(existingPO.special_instructions || "");
      setInternalRemarks(existingPO.internal_remarks || "");
      setGstRate(existingPO.gst_rate || 18);
      setAdditionalCharges(existingPO.additional_charges || []);
      if (existingPO.line_items?.length) {
        setLineItems(existingPO.line_items);
      }
      // Restore currency
      const poCurrency = (existingPO as any).currency || "INR";
      const poCurrencySymbol = (existingPO as any).currency_symbol || "₹";
      const poExchangeRate = (existingPO as any).exchange_rate || 1;
      setCurrency(poCurrency);
      setCurrencySymbol(poCurrencySymbol);
      setExchangeRate(poExchangeRate);
      setIsForeignVendor(poCurrency !== "INR");
      if (poCurrency !== "INR") setRateFetchStatus("manual");
      // Find vendor
      if (existingPO.vendor_id) {
        const v = vendors.find((v) => v.id === existingPO.vendor_id);
        if (v) setSelectedVendor(v);
      }
    }
  }, [existingPO, vendors]);

  // Pre-fill from Reorder Intelligence
  useEffect(() => {
    if (isEdit || !prefillState || prefillApplied || vendors.length === 0) return;
    if (prefillState.vendor_id) {
      const v = vendors.find((v) => v.id === prefillState.vendor_id);
      if (v) {
        setVendorId(v.id);
        setSelectedVendor(v);
        if (v.payment_terms) setPaymentTerms(v.payment_terms);
      }
    }
    if (prefillState.prefill_items?.length) {
      const items: POLineItem[] = prefillState.prefill_items.map((pi, idx) => ({
        serial_number: idx + 1,
        item_id: pi.item_id || null,
        description: pi.description,
        drawing_number: "",
        quantity: pi.qty,
        unit: pi.unit || "NOS",
        unit_price: 0,
        line_total: 0,
        gst_rate: 18,
      }));
      setLineItems(items);
    }
    setPrefillApplied(true);
  }, [isEdit, prefillState, prefillApplied, vendors]);

  // Pre-fill from Stock Register (single item)
  useEffect(() => {
    if (isEdit || prefillApplied) return;
    const prefillItem = (location.state as any)?.prefillItem;
    if (!prefillItem) return;
    setLineItems([{
      serial_number: 1,
      description: prefillItem.description || "",
      drawing_number: "",
      quantity: 0,
      unit: prefillItem.unit || "NOS",
      unit_price: 0,
      line_total: 0,
      gst_rate: 18,
      hsn_sac_code: prefillItem.hsn_sac_code || "",
    }]);
    setPrefillApplied(true);
    setTimeout(() => { firstQtyRef.current?.focus(); firstQtyRef.current?.select(); }, 150);
  }, [isEdit, prefillApplied, location.state]);

  useEffect(() => {
    if (!isEdit && !deliveryAddressAutoFilled && companyDeliveryAddress) {
      setDeliveryAddress(companyDeliveryAddress);
      setDeliveryAddressAutoFilled(true);
    }
  }, [isEdit, deliveryAddressAutoFilled, companyDeliveryAddress]);

  // Restore draft from sessionStorage (once on mount, create mode only)
  useEffect(() => {
    if (isEdit) return;
    if (prefillState || (location.state as any)?.prefillItem) return;
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      if (draft.poDate) setPODate(new Date(draft.poDate));
      if (draft.vendorId) setVendorId(draft.vendorId);
      if (draft.selectedVendor) setSelectedVendor(draft.selectedVendor as Party);
      if (draft.vendorReference !== undefined) setVendorReference(draft.vendorReference);
      if (draft.vendorEmail !== undefined) setVendorEmail(draft.vendorEmail);
      if (draft.referenceNumber !== undefined) setReferenceNumber(draft.referenceNumber);
      if (draft.paymentTerms !== undefined) setPaymentTerms(draft.paymentTerms);
      if (draft.customPaymentTerms !== undefined) setCustomPaymentTerms(draft.customPaymentTerms);
      if (draft.deliveryAddress !== undefined) {
        setDeliveryAddress(draft.deliveryAddress);
        setDeliveryAddressAutoFilled(true);
      }
      if (draft.deliveryContactPerson !== undefined) setDeliveryContactPerson(String(draft.deliveryContactPerson));
      if (draft.deliveryContactPhone !== undefined) setDeliveryContactPhone(String(draft.deliveryContactPhone));
      if (draft.specialInstructions !== undefined) setSpecialInstructions(draft.specialInstructions);
      if (draft.internalRemarks !== undefined) setInternalRemarks(draft.internalRemarks);
      if (draft.lineItems?.length) setLineItems(draft.lineItems as POLineItem[]);
      if (draft.gstRate !== undefined) setGstRate(draft.gstRate);
      if (draft.additionalCharges !== undefined) setAdditionalCharges(draft.additionalCharges);
      if (draft.currency !== undefined) { setCurrency(draft.currency); setIsForeignVendor(draft.currency !== "INR"); }
      if (draft.currencySymbol !== undefined) setCurrencySymbol(draft.currencySymbol);
      if (draft.exchangeRate !== undefined) { setExchangeRate(draft.exchangeRate); if (draft.currency !== "INR") setRateFetchStatus("manual"); }
    } catch {
      sessionStorage.removeItem(DRAFT_KEY);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save draft to sessionStorage (debounced 500ms, create mode only)
  useEffect(() => {
    if (isEdit) return;
    const timer = setTimeout(() => {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        poDate: poDate.toISOString(),
        vendorId,
        selectedVendor,
        vendorReference,
        vendorEmail,
        referenceNumber,
        paymentTerms,
        customPaymentTerms,
        deliveryAddress,
        deliveryContactPerson,
        deliveryContactPhone,
        specialInstructions,
        internalRemarks,
        lineItems,
        gstRate,
        additionalCharges,
        currency,
        currencySymbol,
        exchangeRate,
      }));
    }, 500);
    return () => clearTimeout(timer);
  }, [isEdit, poDate, vendorId, selectedVendor, vendorReference, vendorEmail, referenceNumber, paymentTerms, customPaymentTerms, deliveryAddress, deliveryContactPerson, deliveryContactPhone, specialInstructions, internalRemarks, lineItems, gstRate, additionalCharges, currency, currencySymbol, exchangeRate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vendor auto-fill from item_id in prefill state (Stock Alerts Board flow).
  // Looks up the most recent PO vendor for this item via po_line_items.
  // Silently skips if no match — vendor remains blank for manual selection.
  useEffect(() => {
    if (isEdit || !prefillApplied || vendorId || vendors.length === 0) return;
    const firstItem = prefillState?.prefill_items?.[0];
    if (!firstItem?.item_id) return;

    const itemId = firstItem.item_id;
    (async () => {
      try {
        const { data: lineData } = await (supabase as any)
          .from("po_line_items")
          .select("po_id")
          .eq("item_id", itemId)
          .order("created_at", { ascending: false })
          .limit(1);

        const poId = lineData?.[0]?.po_id;
        if (!poId) return;

        const { data: poData } = await (supabase as any)
          .from("purchase_orders")
          .select("vendor_id")
          .eq("id", poId)
          .single();

        const foundVendorId = poData?.vendor_id;
        if (!foundVendorId) return;

        const v = vendors.find((vv) => vv.id === foundVendorId);
        if (v && !vendorId) {
          setVendorId(v.id);
          setSelectedVendor(v);
          if (v.payment_terms && !paymentTerms) setPaymentTerms(v.payment_terms);
        }
      } catch {
        // Silently ignore — vendor stays blank for manual selection
      }
    })();
  }, [isEdit, prefillApplied, vendors]);

  const fetchExchangeRate = async (targetCurrency: string) => {
    if (targetCurrency === "INR") {
      setExchangeRate(1);
      setRateFetchStatus("idle");
      return;
    }
    setFetchingRate(true);
    setRateFetchStatus("idle");
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/INR");
      const data = await res.json();
      if (data?.rates?.[targetCurrency]) {
        // data.rates[X] = how many X per 1 INR, so INR per X = 1 / rate
        const rate = Math.round((1 / data.rates[targetCurrency]) * 10000) / 10000;
        setExchangeRate(rate);
        setRateFetchStatus("live");
      }
    } catch {
      setRateFetchStatus("manual");
    } finally {
      setFetchingRate(false);
    }
  };

  const handleVendorSelect = (vendor: Party) => {
    setVendorId(vendor.id);
    setSelectedVendor(vendor);
    setVendorOpen(false);
    if (vendor.payment_terms && !paymentTerms) {
      setPaymentTerms(vendor.payment_terms);
    }
    if ((vendor as any).email1) {
      setVendorEmail((vendor as any).email1);
    }
    // Detect foreign vendor
    const vendorCountry = (vendor as any).country;
    const isForeign = vendorCountry && vendorCountry !== "India";
    setIsForeignVendor(!!isForeign);
    if (isForeign) {
      // Map common countries to currencies
      const countryCurrencyMap: Record<string, string> = {
        "United Arab Emirates": "AED",
        "China": "CNY",
        "United States": "USD",
        "United Kingdom": "GBP",
        "Germany": "EUR",
        "France": "EUR",
        "Italy": "EUR",
        "Japan": "JPY",
        "South Korea": "KRW",
        "Singapore": "SGD",
        "Switzerland": "CHF",
        "Canada": "CAD",
        "Australia": "AUD",
      };
      const detectedCurrency = countryCurrencyMap[vendorCountry] || "USD";
      const currencyInfo = CURRENCIES.find(c => c.code === detectedCurrency) || CURRENCIES[1];
      setCurrency(currencyInfo.code);
      setCurrencySymbol(currencyInfo.symbol);
      fetchExchangeRate(currencyInfo.code);
    } else {
      setCurrency("INR");
      setCurrencySymbol("₹");
      setExchangeRate(1);
      setIsForeignVendor(false);
      setRateFetchStatus("idle");
    }
  };

  // Line item handlers
  const updateLineItem = (index: number, field: keyof POLineItem, value: any) => {
    setLineItems((items) => {
      const updated = [...items];
      (updated[index] as any)[field] = value;
      if (field === "quantity" || field === "unit_price") {
        updated[index].line_total = Math.round(updated[index].quantity * updated[index].unit_price * 100) / 100;
      }
      return updated;
    });
  };

  const addLineItem = () => {
    setLineItems((items) => [...items, emptyLineItem(items.length + 1)]);
  };

  const removeLineItem = (index: number) => {
    setLineItems((items) => {
      const updated = items.filter((_, i) => i !== index);
      return updated.map((item, i) => ({ ...item, serial_number: i + 1 }));
    });
  };

  const addCharge = () => setAdditionalCharges((c) => [...c, { label: "", amount: 0 }]);
  const removeCharge = (index: number) => setAdditionalCharges((c) => c.filter((_, i) => i !== index));
  const updateCharge = (index: number, field: "label" | "amount", value: any) => {
    setAdditionalCharges((c) => {
      const updated = [...c];
      updated[index] = { ...updated[index], [field]: field === "amount" ? Number(value) : value };
      return updated;
    });
  };

  // Calculations
  const subTotal = useMemo(() => lineItems.reduce((s, i) => round2(s + (i.line_total || 0)), 0), [lineItems]);
  const additionalTotal = useMemo(() => additionalCharges.reduce((s, c) => round2(s + (c.amount || 0)), 0), [additionalCharges]);
  const taxableValue = round2(subTotal + additionalTotal);

  // GST type — intra vs inter state based on vendor selection
  const gstType = useMemo<GSTType>(
    () => getGSTType(COMPANY_STATE_CODE, selectedVendor?.state_code),
    [COMPANY_STATE_CODE, selectedVendor?.state_code],
  );

  const taxResult = useMemo(
    () => calculateLineTax(taxableValue, gstRate, gstType),
    [taxableValue, gstRate, gstType],
  );
  const grandTotal = round2(taxableValue + taxResult.total);

  const personSuggestions = useMemo(() => {
    const profileNames = (companyProfiles ?? []).map(p => p.full_name);
    const savedNames = (deliveryContacts ?? []).map(c => c.name);
    const all = Array.from(new Set([...profileNames, ...savedNames]));
    const q = deliveryContactPerson.trim().toLowerCase();
    return q ? all.filter(n => n.toLowerCase().includes(q)) : all;
  }, [companyProfiles, deliveryContacts, deliveryContactPerson]);

  const isPersonSaved = useMemo(() =>
    (deliveryContacts ?? []).some(c => c.name.toLowerCase() === deliveryContactPerson.trim().toLowerCase()),
    [deliveryContacts, deliveryContactPerson]);

  const phoneSuggestions = useMemo(() => {
    const all = (deliveryContacts ?? []).filter(c => c.phone).map(c => ({ name: c.name, phone: c.phone! }));
    const match = (deliveryContacts ?? []).find(c => c.name.toLowerCase() === deliveryContactPerson.trim().toLowerCase());
    const sorted = match?.phone ? [{ name: match.name, phone: match.phone }, ...all.filter(p => p.phone !== match.phone)] : all;
    const q = deliveryContactPhone.trim().toLowerCase();
    return q ? sorted.filter(p => p.phone.toLowerCase().includes(q)) : sorted;
  }, [deliveryContacts, deliveryContactPerson, deliveryContactPhone]);

  const isPhoneSaved = useMemo(() =>
    (deliveryContacts ?? []).some(c =>
      c.name.toLowerCase() === deliveryContactPerson.trim().toLowerCase() && c.phone === deliveryContactPhone.trim()
    ), [deliveryContacts, deliveryContactPerson, deliveryContactPhone]);

  // Save
  const saveMutation = useMutation({
    mutationFn: async (status: string) => {
      const previousStatus = existingPO?.status;
      // All edits always go to pending_approval for re-approval workflow
      const effectiveStatus = isEdit ? 'pending_approval' : status;
      const effectiveGstRate = isForeignVendor ? 0 : gstRate;
      const poData = {
        po_number: poNumber,
        po_date: format(poDate, "yyyy-MM-dd"),
        vendor_id: vendorId,
        vendor_name: selectedVendor?.name || null,
        vendor_address: selectedVendor
          ? [selectedVendor.address_line1, selectedVendor.address_line2, selectedVendor.city, selectedVendor.state]
              .filter(Boolean)
              .join(", ")
          : null,
        vendor_gstin: selectedVendor?.gstin || null,
        vendor_state_code: selectedVendor?.state_code || null,
        vendor_phone: selectedVendor?.phone1 || null,
        vendor_contact_person: selectedVendor?.contact_person || null,
        vendor_reference: vendorReference || null,
        vendor_email: vendorEmail || null,
        reference_number: referenceNumber || null,
        payment_terms: paymentTerms === "Custom" ? customPaymentTerms : paymentTerms || null,
        delivery_address: deliveryAddress || null,
        delivery_contact_person: deliveryContactPerson || null,
        delivery_contact_phone: deliveryContactPhone || null,
        special_instructions: specialInstructions || null,
        internal_remarks: internalRemarks || null,
        sub_total: subTotal,
        additional_charges: additionalCharges,
        taxable_value: taxableValue,
        igst_amount: isForeignVendor ? 0 : taxResult.igst,
        cgst_amount: isForeignVendor ? 0 : taxResult.cgst,
        sgst_amount: isForeignVendor ? 0 : taxResult.sgst,
        total_gst: isForeignVendor ? 0 : taxResult.total,
        grand_total: isForeignVendor ? taxableValue : grandTotal,
        gst_rate: effectiveGstRate,
        currency,
        currency_symbol: currencySymbol,
        exchange_rate: exchangeRate,
        status: effectiveStatus,
        issued_at: effectiveStatus === "issued" ? new Date().toISOString() : null,
        cancelled_at: null,
        cancellation_reason: null,
        approval_requested_at: effectiveStatus === "pending_approval" ? new Date().toISOString() : null,
        approval_requested_by: effectiveStatus === "pending_approval" ? (profile?.display_name || profile?.full_name || profile?.email || null) : null,
        approved_at: null,
        approved_by: null,
        rejection_reason: null,
        rejection_noted: false,
      };

      const items = lineItems
        .filter((i) => i.description.trim())
        .map((i, idx) => ({ ...i, serial_number: idx + 1, gst_rate: effectiveGstRate }));

      if (isEdit) {
        await updatePurchaseOrder(id!, { po: poData, lineItems: items });
        const userName = profile?.display_name || profile?.full_name || profile?.email || null;
        await logAudit("purchase_order", id!, "po_edited", {
          previous_status: previousStatus,
          new_status: effectiveStatus,
          details: `PO edited by ${userName}. Previous status: ${previousStatus}. New status: ${effectiveStatus}.`,
          performed_by: userName,
        });
        return { id: id!, poNumber };
      } else {
        const result = await createPurchaseOrder({ po: poData, lineItems: items });
        if (effectiveStatus === "issued") await issuePurchaseOrder(result.id);
        // po_number was assigned by trg_purchase_orders_assign_number; read it back.
        return { id: result.id, poNumber: (result as any).po_number ?? "" };
      }
    },
    onSuccess: (data, intendedStatus) => {
      const assignedNumber = data.poNumber || poNumber;
      if (assignedNumber && assignedNumber !== poNumber) {
        setPONumber(assignedNumber);
      }
      sessionStorage.removeItem(DRAFT_KEY);
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["po-stats"] });
      queryClient.invalidateQueries({ queryKey: ["po-pending-approval-count"] });
      if (isEdit) {
        const prevStatus = existingPO?.status;
        const wasResubmitted = prevStatus && ['approved', 'issued', 'partially_received'].includes(prevStatus);
        toast({
          title: wasResubmitted ? "PO updated and sent for re-approval." : "PO submitted for approval",
          description: wasResubmitted ? "Approval required before this PO can be re-issued." : `PO ${assignedNumber} sent to Finance for approval.`,
        });
        navigate(`/purchase-orders/${data.id}`);
        return;
      }
      if (intendedStatus === "issued") {
        setSavedPOId(data.id);
        setSuccessDialogOpen(true);
      } else if (intendedStatus === "pending_approval") {
        toast({ title: "PO submitted for approval", description: `PO ${assignedNumber} sent to Finance for approval.` });
        navigate("/purchase-orders");
      } else {
        toast({ title: "Purchase order saved", description: `PO ${assignedNumber} saved as draft.` });
        navigate("/purchase-orders");
      }
    },
    onError: (err: any) => {
      console.error("[PurchaseOrderForm] save error:", err);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = (status: string) => {
    if (!selectedVendor) {
      toast({ title: "Vendor required", description: "Please select a vendor.", variant: "destructive" });
      return;
    }
    if (!lineItems.some((i) => i.description.trim())) {
      toast({ title: "Items required", description: "Add at least one line item.", variant: "destructive" });
      return;
    }
    saveMutation.mutate(status);
  };

  if (accessBlocked) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center p-6">
        <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
          <Info className="h-5 w-5 text-amber-600" />
        </div>
        <p className="font-semibold text-foreground">You don't have permission to edit purchase orders</p>
        <p className="text-sm text-muted-foreground">Redirecting…</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-32 space-y-6 max-w-5xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-3"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>
      <div>
        <h1 className="text-xl font-display font-bold text-foreground">
          {isEdit ? "Edit Purchase Order" : "New Purchase Order"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isEdit ? `Editing PO ${poNumber}` : "Create a new purchase order for your vendor"}
        </p>
      </div>

      {isEdit && existingPO?.status === 'rejected' && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>This PO was rejected. Make your changes and re-submit for approval.</span>
        </div>
      )}

      {isEdit && ['issued', 'partially_received'].includes(existingPO?.status ?? '') && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>Editing this PO will require re-approval before it can be re-issued.</span>
        </div>
      )}

      {prefillApplied && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
          <span>Pre-filled from Reorder Intelligence — please review quantities and unit prices before saving.</span>
        </div>
      )}

      {/* Header Section */}
      <div className="paper-card space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">Vendor *</Label>
              <Popover open={vendorOpen} onOpenChange={setVendorOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between mt-1 font-normal">
                    {selectedVendor
                      ? selectedVendor.name
                      : ((existingPO as any)?.vendor_name ?? "Select vendor...")}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search vendors..." />
                    <CommandList>
                      <CommandEmpty>
                        No vendor found.{" "}
                        <Button variant="link" size="sm" onClick={() => navigate("/parties/new")}>
                          + Add New Vendor
                        </Button>
                      </CommandEmpty>
                      <CommandGroup>
                        {vendors.map((v) => (
                          <CommandItem
                            key={v.id}
                            value={v.id}
                            keywords={[v.name, v.gstin ?? "", v.city ?? ""].filter(Boolean)}
                            onSelect={() => handleVendorSelect(v)}
                          >
                            <div>
                              <p className="font-medium">{v.name}</p>
                              <p className="text-xs text-muted-foreground">{v.city}{v.gstin ? ` · ${v.gstin}` : ""}</p>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Vendor Card */}
            {selectedVendor && (
              <div className="bg-muted/50 rounded-lg p-3 border border-border text-sm space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-foreground">{selectedVendor.name}</p>
                  {selectedVendor.vendor_type && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                      selectedVendor.vendor_type === "raw_material_supplier" ? "bg-teal-50 text-teal-700 border-teal-200" :
                      selectedVendor.vendor_type === "processor" ? "bg-purple-50 text-purple-700 border-purple-200" :
                      selectedVendor.vendor_type === "customer" ? "bg-blue-50 text-blue-700 border-blue-200" :
                      "bg-slate-100 text-slate-600 border-slate-200"
                    }`}>
                      {selectedVendor.vendor_type === "raw_material_supplier" ? "Supplier" :
                       selectedVendor.vendor_type === "processor" ? "Processor" :
                       selectedVendor.vendor_type === "customer" ? "Customer" : "Supplier & Processor"}
                    </span>
                  )}
                  {isForeignVendor && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30">
                      Foreign Vendor
                    </span>
                  )}
                </div>
                {selectedVendor.address_line1 && <p className="text-muted-foreground">{selectedVendor.address_line1}</p>}
                {selectedVendor.city && (
                  <p className="text-muted-foreground">
                    {selectedVendor.city}{selectedVendor.state ? `, ${selectedVendor.state}` : ""}
                    {(selectedVendor as any).country && (selectedVendor as any).country !== "India" ? `, ${(selectedVendor as any).country}` : ""}
                  </p>
                )}
                {selectedVendor.gstin && <p className="font-mono text-xs">GSTIN: {selectedVendor.gstin}</p>}
                {selectedVendor.phone1 && <p className="text-muted-foreground">Ph: {selectedVendor.phone1}</p>}
                {selectedVendor.contact_person && <p className="text-xs text-muted-foreground">Contact: {selectedVendor.contact_person}</p>}
                {selectedVendor.email1 && <p className="text-muted-foreground">{selectedVendor.email1}</p>}
              </div>
            )}

            {/* Foreign Currency Section */}
            {isForeignVendor && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/30 p-3 space-y-3">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">Foreign Currency</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-slate-600 dark:text-slate-400">Currency</Label>
                    <Select
                      value={currency}
                      onValueChange={(v) => {
                        const c = CURRENCIES.find(x => x.code === v) || CURRENCIES[0];
                        setCurrency(c.code);
                        setCurrencySymbol(c.symbol);
                        setRateFetchStatus("manual");
                        fetchExchangeRate(c.code);
                      }}
                    >
                      <SelectTrigger className="mt-1 h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.filter(c => c.code !== "INR").map((c) => (
                          <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-600 dark:text-slate-400">Exchange Rate (1 {currency} = ? INR)</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={exchangeRate}
                      onChange={(e) => { setExchangeRate(Number(e.target.value)); setRateFetchStatus("manual"); }}
                      className="mt-1 h-8 text-sm font-mono"
                    />
                  </div>
                  <div className="flex flex-col justify-end">
                    {fetchingRate ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400 pb-1">Fetching live rate…</p>
                    ) : rateFetchStatus === "live" ? (
                      <p className="text-xs text-green-600 dark:text-green-400 pb-1">Live rate fetched</p>
                    ) : rateFetchStatus === "manual" ? (
                      <p className="text-xs text-amber-600 dark:text-amber-400 pb-1">Manual rate</p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => fetchExchangeRate(currency)}
                      className="text-xs text-blue-600 hover:underline text-left"
                    >
                      Refresh rate
                    </button>
                  </div>
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-400">No GST applicable for foreign vendors. Amounts shown in {currency}.</p>
              </div>
            )}

            <div>
              <Label className="text-sm font-medium text-slate-700">Vendor Reference</Label>
              <Input value={vendorReference} onChange={(e) => setVendorReference(e.target.value)} className="mt-1" placeholder="Vendor quotation / reference" />
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Vendor Email</Label>
              <Input value={vendorEmail} onChange={(e) => setVendorEmail(e.target.value)} className="mt-1" placeholder="vendor@example.com" type="email" />
              {selectedVendor && (selectedVendor as any).email1 && vendorEmail === (selectedVendor as any).email1 && (
                <p className="text-[10px] text-muted-foreground mt-1">Auto-filled from vendor record</p>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Reference / L.O. Number</Label>
              <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className="mt-1" placeholder="Optional" />
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Special Instructions</Label>
              <Textarea value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} className="mt-1" rows={2} />
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Internal Remarks</Label>
              <Textarea value={internalRemarks} onChange={(e) => setInternalRemarks(e.target.value)} className="mt-1" rows={2} />
              <p className="text-[10px] text-muted-foreground mt-1">Not printed on document</p>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">PO Number</Label>
              {isEdit ? (
                <Input
                  value={poNumber}
                  onChange={(e) => setPONumber(e.target.value)}
                  className="mt-1 font-mono"
                  readOnly
                />
              ) : (
                <>
                  <div className="relative mt-1">
                    <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      value={poNumber}
                      readOnly
                      disabled
                      placeholder="(will be assigned on save)"
                      className="pl-8 font-mono bg-muted text-muted-foreground cursor-not-allowed"
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Auto-generated when you save. Cannot be edited.
                  </p>
                </>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">PO Date *</Label>
              <Popover open={poDateOpen} onOpenChange={setPoDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full mt-1 justify-start font-normal", !poDate && "text-muted-foreground")}>
                    {poDate ? format(poDate, "dd MMM yyyy") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={poDate} onSelect={(d) => { if (d) { setPODate(d); setPoDateOpen(false); } }} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Payment Terms</Label>
              <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select terms" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {paymentTerms === "Custom" && (
                <Input
                  value={customPaymentTerms}
                  onChange={(e) => setCustomPaymentTerms(e.target.value)}
                  className="mt-2"
                  placeholder="Enter custom payment terms"
                />
              )}
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Delivery Address</Label>
              {!isEdit && deliveryAddressAutoFilled && deliveryAddress === companyDeliveryAddress && (
                <div className="flex items-center justify-between mt-1 mb-1 rounded-md bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs text-blue-700">
                  <span>Auto-filled from company address · Edit if delivering elsewhere</span>
                </div>
              )}
              {!isEdit && deliveryAddressAutoFilled && deliveryAddress !== companyDeliveryAddress && companyDeliveryAddress && (
                <button
                  type="button"
                  onClick={() => setDeliveryAddress(companyDeliveryAddress)}
                  className="text-[10px] text-blue-600 hover:underline mt-1 mb-1 block"
                >
                  Reset to company address
                </button>
              )}
              <Textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} className="mt-1" rows={2} placeholder="Delivery address" />
              <div className="grid grid-cols-2 gap-3 mt-2">
                {/* Contact Person */}
                <div className="relative">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">Contact Person</Label>
                  <input
                    type="text"
                    value={deliveryContactPerson}
                    onChange={(e) => { setDeliveryContactPerson(e.target.value); setContactPersonOpen(true); }}
                    onFocus={() => setContactPersonOpen(true)}
                    onBlur={() => setTimeout(() => setContactPersonOpen(false), 150)}
                    placeholder="Name"
                    className="mt-1 w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  />
                  {contactPersonOpen && (personSuggestions.length > 0 || (deliveryContactPerson.trim() && !isPersonSaved)) && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-md max-h-48 overflow-y-auto">
                      {personSuggestions.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onMouseDown={() => {
                            setDeliveryContactPerson(name);
                            const contact = (deliveryContacts ?? []).find(c => c.name === name);
                            if (contact?.phone) setDeliveryContactPhone(contact.phone);
                            setContactPersonOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          {name}
                        </button>
                      ))}
                      {deliveryContactPerson.trim() && !isPersonSaved && (
                        <button
                          type="button"
                          onMouseDown={async () => {
                            if (!profile?.company_id) return;
                            try {
                              await saveDeliveryContact(profile.company_id, deliveryContactPerson.trim(), deliveryContactPhone || undefined);
                              queryClient.invalidateQueries({ queryKey: ["delivery-contacts", profile.company_id] });
                              toast({ title: "Contact saved" });
                            } catch {
                              toast({ title: "Could not save contact", variant: "destructive" });
                            }
                            setContactPersonOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-xs italic text-muted-foreground hover:bg-slate-100 dark:hover:bg-slate-700 border-t border-slate-100 dark:border-slate-800"
                        >
                          + Save "{deliveryContactPerson.trim()}" for future use
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {/* Contact Phone */}
                <div className="relative">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">Contact Phone</Label>
                  <input
                    type="text"
                    value={deliveryContactPhone}
                    onChange={(e) => { setDeliveryContactPhone(e.target.value); setContactPhoneOpen(true); }}
                    onFocus={() => setContactPhoneOpen(true)}
                    onBlur={() => setTimeout(() => setContactPhoneOpen(false), 150)}
                    placeholder="Phone number"
                    className="mt-1 w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  />
                  {contactPhoneOpen && (phoneSuggestions.length > 0 || (deliveryContactPerson.trim() && deliveryContactPhone.trim() && !isPhoneSaved)) && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-md max-h-48 overflow-y-auto">
                      {phoneSuggestions.map(({ name, phone }) => (
                        <button
                          key={phone}
                          type="button"
                          onMouseDown={() => { setDeliveryContactPhone(phone); setContactPhoneOpen(false); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          {phone}
                          <span className="ml-2 text-xs text-muted-foreground">{name}</span>
                        </button>
                      ))}
                      {deliveryContactPerson.trim() && deliveryContactPhone.trim() && !isPhoneSaved && (
                        <button
                          type="button"
                          onMouseDown={async () => {
                            if (!profile?.company_id) return;
                            try {
                              await saveDeliveryContact(profile.company_id, deliveryContactPerson.trim(), deliveryContactPhone.trim());
                              queryClient.invalidateQueries({ queryKey: ["delivery-contacts", profile.company_id] });
                              toast({ title: "Contact saved" });
                            } catch {
                              toast({ title: "Could not save contact", variant: "destructive" });
                            }
                            setContactPhoneOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-xs italic text-muted-foreground hover:bg-slate-100 dark:hover:bg-slate-700 border-t border-slate-100 dark:border-slate-800"
                        >
                          + Save this contact for future use
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="paper-card !p-0">
        <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <h2 className="text-sm uppercase text-muted-foreground font-bold tracking-wider">Items</h2>
            <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
              {lineItems.filter((i) => i.description.trim()).length}
            </span>
          </div>
          {!isForeignVendor && (
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground">GST Rate:</Label>
              <Select value={String(gstRate)} onValueChange={(v) => setGstRate(Number(v))}>
                <SelectTrigger className="w-[90px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GST_RATES.map((r) => (
                    <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left w-8">#</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Description</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left w-24">HSN</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left w-32">Drawing No</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right w-20">Qty</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left w-24">Unit</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right w-20">Alt. Qty</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left w-24">Alt. Unit</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right w-28">Unit Price {currencySymbol}</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left w-36">Delivery Date</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right w-28">Amount {currencySymbol}</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, index) => (
                <tr key={index} className="group border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-3 py-2 text-sm text-muted-foreground font-mono w-8">{item.serial_number}</td>
                  <td className="px-1 py-1">
                    <ItemSuggest
                      value={item.description}
                      onChange={(v) => updateLineItem(index, "description", v)}
                      onSelect={(selectedItem) => {
                        updateLineItem(index, "item_id", selectedItem.id);
                        updateLineItem(index, "description", selectedItem.description);
                        updateLineItem(index, "drawing_number", selectedItem.drawing_number || selectedItem.drawing_revision || "");
                        updateLineItem(index, "unit", selectedItem.unit || "NOS");
                        if (!item.unit_price) updateLineItem(index, "unit_price", selectedItem.standard_cost || 0);
                        updateLineItem(index, "gst_rate", selectedItem.gst_rate || 18);
                        if (selectedItem.hsn_sac_code) updateLineItem(index, "hsn_sac_code", selectedItem.hsn_sac_code);
                      }}
                      placeholder="Type to search items..."
                      className="h-8 text-sm w-full"
                    />
                  </td>
                  <td className="p-0 w-24">
                    <input
                      type="text"
                      value={(item as any).hsn_sac_code || ""}
                      onChange={(e) => updateLineItem(index, "hsn_sac_code", e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 bg-transparent border-none outline-none focus:bg-blue-50 text-sm font-mono"
                      placeholder="HSN"
                    />
                  </td>
                  <td className="p-0 w-32">
                    <input
                      type="text"
                      value={item.drawing_number || ""}
                      onChange={(e) => updateLineItem(index, "drawing_number", e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 bg-transparent border-none outline-none focus:bg-blue-50 text-sm font-mono"
                    />
                  </td>
                  <td className="p-0 w-20">
                    <input
                      type="number"
                      ref={(el) => { if (index === 0) firstQtyRef.current = el; }}
                      value={item.quantity || ""}
                      onChange={(e) => updateLineItem(index, "quantity", Number(e.target.value))}
                      step="any"
                      className="w-full min-h-[44px] px-3 py-2 bg-transparent border-none outline-none focus:bg-blue-50 text-sm text-right font-mono tabular-nums"
                    />
                  </td>
                  <td className="px-1 py-1 w-24">
                    <Select value={item.unit} onValueChange={(v) => updateLineItem(index, "unit", v)}>
                      <SelectTrigger className="h-8 text-sm border-slate-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNITS.map((u) => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-0 w-20">
                    <input
                      type="number"
                      value={item.quantity_2 ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        updateLineItem(index, "quantity_2", raw === "" ? null : Number(raw));
                      }}
                      step="any"
                      min={0}
                      placeholder="—"
                      className="w-full min-h-[44px] px-3 py-2 bg-transparent border-none outline-none focus:bg-blue-50 dark:focus:bg-[#0a0e1a] dark:text-slate-100 text-sm text-right font-mono tabular-nums"
                    />
                  </td>
                  <td className="px-1 py-1 w-24">
                    {(item.quantity_2 ?? 0) > 0 ? (
                      <Select
                        value={item.unit_2 || "NOS"}
                        onValueChange={(v) => updateLineItem(index, "unit_2", v)}
                      >
                        <SelectTrigger className="h-8 text-sm border-slate-200 dark:border-white/20 dark:bg-[#0a0e1a] dark:text-slate-100">
                          <SelectValue placeholder="Unit" />
                        </SelectTrigger>
                        <SelectContent>
                          {UNITS.map((u) => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-0 w-28">
                    <input
                      type="number"
                      value={item.unit_price || ""}
                      onChange={(e) => updateLineItem(index, "unit_price", Number(e.target.value))}
                      step="any"
                      className="w-full min-h-[44px] px-3 py-2 bg-transparent border-none outline-none focus:bg-blue-50 text-sm text-right font-mono tabular-nums"
                    />
                  </td>
                  <td className="p-0 w-36">
                    <input
                      type="date"
                      value={item.delivery_date || ""}
                      onChange={(e) => updateLineItem(index, "delivery_date", e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 bg-transparent border-none outline-none focus:bg-blue-50 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2 w-28 bg-slate-50 text-right text-sm font-medium text-slate-700 font-mono tabular-nums">
                    {item.line_total
                      ? `${currencySymbol}${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(item.line_total)}`
                      : "—"}
                  </td>
                  <td className="px-2 w-10">
                    {lineItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLineItem(index)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity p-1 rounded"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          onClick={addLineItem}
          className="w-full h-10 border-t border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:bg-slate-50 transition-colors flex items-center justify-center gap-1"
        >
          <Plus className="h-4 w-4" /> Add Line Item
        </button>
      </div>

      {/* Footer: GST Info + Additional Charges + Totals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* GST Info */}
        <div className="paper-card space-y-2">
          <h3 className="text-sm font-medium text-slate-700 border-b border-border pb-2">GST Information</h3>
          {isForeignVendor ? (
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-300 text-xs font-semibold">
              <Info className="h-3 w-3 shrink-0" /> No tax applicable for foreign vendor
            </div>
          ) : (
            <>
              {!COMPANY_STATE_CODE && (
                <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
                  <Info className="h-3 w-3 shrink-0" /> Company state not set —{" "}
                  <button type="button" className="underline hover:no-underline" onClick={() => navigate("/settings/company")}>
                    set it in Settings
                  </button>
                </div>
              )}
              {selectedVendor ? (
                <>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Vendor:</span>{" "}
                    <span className="font-medium">{getStateName(selectedVendor.state_code) || selectedVendor.state || "N/A"} ({selectedVendor.state_code || "??"})</span>
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Your Company:</span>{" "}
                    <span className="font-medium">{getStateName(COMPANY_STATE_CODE) || companySettings?.state || "N/A"} ({COMPANY_STATE_CODE || "?"})</span>
                  </p>
                  {gstType === 'cgst_sgst' ? (
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold mt-1">
                      <Info className="h-3 w-3 shrink-0" /> Intra-state — Input CGST + SGST
                    </div>
                  ) : !selectedVendor.state_code ? (
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold mt-1">
                      <Info className="h-3 w-3 shrink-0" /> Vendor state unknown — defaulting to IGST
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold mt-1">
                      <Info className="h-3 w-3 shrink-0" /> Inter-state — Input IGST
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Select a vendor to see GST details</p>
              )}
            </>
          )}
        </div>

        {/* Additional Charges */}
        <div className="paper-card space-y-2">
          <h3 className="text-sm font-medium text-slate-700 border-b border-border pb-2">Additional Charges</h3>
          {additionalCharges.map((charge, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input
                value={charge.label}
                onChange={(e) => updateCharge(i, "label", e.target.value)}
                placeholder="Label"
                className="h-8 text-sm flex-1"
              />
              <Input
                type="number"
                value={charge.amount || ""}
                onChange={(e) => updateCharge(i, "amount", e.target.value)}
                placeholder="₹"
                className="h-8 text-sm w-24 text-right"
              />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeCharge(i)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addCharge} className="w-full border-dashed">
            <Plus className="h-3 w-3 mr-1" /> Add Charge
          </Button>
        </div>

        {/* Totals */}
        <div className="paper-card">
          <h3 className="text-sm font-medium text-slate-700 border-b border-border pb-2 mb-3">Totals</h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sub Total</span>
              <span className="font-mono tabular-nums">{currencySymbol}{new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(subTotal)}</span>
            </div>
            {additionalTotal > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Additional</span>
                <span className="font-mono tabular-nums">{currencySymbol}{new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(additionalTotal)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Taxable Value</span>
              <span className="font-mono tabular-nums">{currencySymbol}{new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(taxableValue)}</span>
            </div>
            <div className="border-t border-border my-2" />
            {isForeignVendor ? (
              <div className="text-xs text-blue-600 dark:text-blue-400 italic">No tax applicable for foreign vendor</div>
            ) : gstType === 'cgst_sgst' ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Input CGST @ {gstRate / 2}%</span>
                  <span className="font-mono tabular-nums">{formatCurrency(taxResult.cgst)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Input SGST @ {gstRate / 2}%</span>
                  <span className="font-mono tabular-nums">{formatCurrency(taxResult.sgst)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Input IGST @ {gstRate}%</span>
                <span className="font-mono tabular-nums">{formatCurrency(taxResult.igst)}</span>
              </div>
            )}
            <div className="border-t border-border my-2" />
            <div className="flex justify-between text-base font-bold">
              <span>Grand Total</span>
              <span className="font-mono tabular-nums text-primary">
                {currencySymbol}{new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(isForeignVendor ? taxableValue : grandTotal)}
              </span>
            </div>
            {isForeignVendor && exchangeRate > 0 && (
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>≈ INR Equivalent</span>
                <span className="font-mono tabular-nums">₹{new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(taxableValue * exchangeRate)}</span>
              </div>
            )}
          </div>
          {!isForeignVendor && (
            <p className="text-[10px] text-muted-foreground mt-3 italic">
              {amountInWords(grandTotal)}
            </p>
          )}
        </div>
      </div>

      {/* Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 md:left-[var(--sidebar-width)] bg-card border-t border-border p-3 flex justify-end gap-2 z-40">
        <Button variant="outline" onClick={() => { sessionStorage.removeItem(DRAFT_KEY); navigate("/purchase-orders"); }}>Cancel</Button>
        {isEdit ? (
          <Button onClick={() => handleSave("pending_approval")} disabled={saveMutation.isPending} className="active:scale-[0.98] transition-transform">
            {saveMutation.isPending ? "Saving…" : "Save & Submit for Approval →"}
          </Button>
        ) : isPurchaseTeam ? (
          <Button onClick={() => handleSave("pending_approval")} disabled={saveMutation.isPending} className="active:scale-[0.98] transition-transform">
            Submit for Approval →
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => handleSave("draft")} disabled={saveMutation.isPending}>
              Save as Draft
            </Button>
            <Button onClick={() => handleSave("issued")} disabled={saveMutation.isPending} className="active:scale-[0.98] transition-transform">
              Issue PO →
            </Button>
          </>
        )}
      </div>

      {/* Success Dialog */}
      <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Purchase Order Issued! 🎉</DialogTitle>
            <DialogDescription>PO {poNumber} has been issued successfully.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => { setSuccessDialogOpen(false); navigate(`/purchase-orders/${savedPOId}`); }}>
              View PO
            </Button>
            <Button variant="outline" onClick={() => { setSuccessDialogOpen(false); navigate("/purchase-orders/new"); }}>
              Create Another
            </Button>
            <Button onClick={() => { setSuccessDialogOpen(false); navigate("/purchase-orders"); }}>
              Back to List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
