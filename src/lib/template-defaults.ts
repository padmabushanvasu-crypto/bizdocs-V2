// Default template configurations for each document type

export interface TemplateField {
  id: string;
  label: string;
  enabled: boolean;
  required: boolean;
  order: number;
}

export interface TemplateSection {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
  fields: TemplateField[];
}

export interface LineItemColumn {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
}

export interface SignatureField {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
}

export interface TemplateConfig {
  sections: TemplateSection[];
  lineItemColumns: LineItemColumn[];
  signatureFields: SignatureField[];
  termsText: string;
  showTerms: boolean;
}

const PO_DEFAULT: TemplateConfig = {
  sections: [
    {
      id: "header", label: "Header", enabled: true, order: 0,
      fields: [
        { id: "po_number", label: "PO Number", enabled: true, required: true, order: 0 },
        { id: "po_date", label: "PO Date", enabled: true, required: true, order: 1 },
        { id: "reference_number", label: "Reference Number", enabled: true, required: false, order: 2 },
      ],
    },
    {
      id: "company_info", label: "Company Info", enabled: true, order: 1,
      fields: [
        { id: "company_name", label: "Company Name", enabled: true, required: false, order: 0 },
        { id: "company_address", label: "Address", enabled: true, required: false, order: 1 },
        { id: "company_gstin", label: "GSTIN", enabled: true, required: false, order: 2 },
        { id: "company_phone", label: "Phone", enabled: true, required: false, order: 3 },
      ],
    },
    {
      id: "vendor_details", label: "Vendor Details", enabled: true, order: 2,
      fields: [
        { id: "vendor_name", label: "Vendor Name", enabled: true, required: true, order: 0 },
        { id: "vendor_address", label: "Address", enabled: true, required: false, order: 1 },
        { id: "vendor_gstin", label: "GSTIN", enabled: true, required: false, order: 2 },
        { id: "vendor_phone", label: "Phone", enabled: true, required: false, order: 3 },
        { id: "vendor_state_code", label: "State Code", enabled: true, required: false, order: 4 },
      ],
    },
    {
      id: "reference_fields", label: "Reference Fields", enabled: true, order: 3,
      fields: [
        { id: "payment_terms", label: "Payment Terms", enabled: true, required: false, order: 0 },
        { id: "delivery_address", label: "Delivery Address", enabled: true, required: false, order: 1 },
        { id: "special_instructions", label: "Special Instructions", enabled: true, required: false, order: 2 },
      ],
    },
    {
      id: "tax_totals", label: "Tax & Totals", enabled: true, order: 5,
      fields: [
        { id: "sub_total", label: "Sub Total", enabled: true, required: false, order: 0 },
        { id: "gst_breakup", label: "GST Breakup", enabled: true, required: false, order: 1 },
        { id: "grand_total", label: "Grand Total", enabled: true, required: false, order: 2 },
      ],
    },
    {
      id: "footer", label: "Footer", enabled: true, order: 6,
      fields: [
        { id: "internal_remarks", label: "Internal Remarks", enabled: true, required: false, order: 0 },
      ],
    },
  ],
  lineItemColumns: [
    { id: "serial_number", label: "#", enabled: true, order: 0 },
    { id: "item_code", label: "Item Code", enabled: true, order: 1 },
    { id: "description", label: "Description", enabled: true, order: 2 },
    { id: "drawing_number", label: "Drawing No.", enabled: true, order: 3 },
    { id: "hsn_sac_code", label: "HSN/SAC", enabled: true, order: 4 },
    { id: "quantity", label: "Qty", enabled: true, order: 5 },
    { id: "unit", label: "Unit", enabled: true, order: 6 },
    { id: "unit_price", label: "Rate (₹)", enabled: true, order: 7 },
    { id: "delivery_date", label: "Delivery Date", enabled: true, order: 8 },
    { id: "line_total", label: "Amount (₹)", enabled: true, order: 9 },
    { id: "remarks", label: "Remarks", enabled: false, order: 10 },
  ],
  signatureFields: [
    { id: "prepared_by", label: "Prepared By", enabled: true, order: 0 },
    { id: "checked_by", label: "Checked By", enabled: true, order: 1 },
    { id: "authorised_signatory", label: "Authorised Signatory", enabled: true, order: 2 },
  ],
  termsText: "",
  showTerms: true,
};

const DC_DEFAULT: TemplateConfig = {
  sections: [
    {
      id: "header", label: "Header", enabled: true, order: 0,
      fields: [
        { id: "dc_number", label: "DC Number", enabled: true, required: true, order: 0 },
        { id: "dc_date", label: "DC Date", enabled: true, required: true, order: 1 },
        { id: "vehicle_number", label: "Vehicle Number", enabled: true, required: false, order: 2 },
        { id: "driver_name", label: "Driver Name", enabled: true, required: false, order: 3 },
      ],
    },
    {
      id: "company_info", label: "Company Info", enabled: true, order: 1,
      fields: [
        { id: "company_name", label: "Company Name", enabled: true, required: false, order: 0 },
        { id: "company_address", label: "Address", enabled: true, required: false, order: 1 },
        { id: "company_gstin", label: "GSTIN", enabled: true, required: false, order: 2 },
        { id: "company_phone", label: "Phone", enabled: true, required: false, order: 3 },
      ],
    },
    {
      id: "consignee_details", label: "Consignee / Party Details", enabled: true, order: 2,
      fields: [
        { id: "party_name", label: "Party Name", enabled: true, required: true, order: 0 },
        { id: "party_address", label: "Address", enabled: true, required: false, order: 1 },
        { id: "party_gstin", label: "GSTIN", enabled: true, required: false, order: 2 },
        { id: "party_phone", label: "Phone", enabled: true, required: false, order: 3 },
        { id: "party_state_code", label: "State Code", enabled: true, required: false, order: 4 },
      ],
    },
    {
      id: "reference_fields", label: "Reference Fields", enabled: true, order: 3,
      fields: [
        { id: "po_reference", label: "PO Reference", enabled: true, required: false, order: 0 },
        { id: "po_date", label: "PO Date", enabled: true, required: false, order: 1 },
        { id: "challan_category", label: "Challan Type", enabled: true, required: false, order: 2 },
        { id: "return_due_date", label: "Return Due Date", enabled: true, required: false, order: 3 },
      ],
    },
    {
      id: "tax_totals", label: "Tax & Totals", enabled: true, order: 5,
      fields: [
        { id: "sub_total", label: "Sub Total", enabled: true, required: false, order: 0 },
        { id: "gst_breakup", label: "GST Breakup", enabled: true, required: false, order: 1 },
        { id: "grand_total", label: "Grand Total", enabled: true, required: false, order: 2 },
        { id: "amount_in_words", label: "Amount in Words", enabled: true, required: false, order: 3 },
      ],
    },
    {
      id: "footer", label: "Footer", enabled: true, order: 6,
      fields: [
        { id: "special_instructions", label: "Special Instructions", enabled: true, required: false, order: 0 },
        { id: "internal_remarks", label: "Internal Remarks", enabled: true, required: false, order: 1 },
      ],
    },
  ],
  lineItemColumns: [
    { id: "serial_number", label: "#", enabled: true, order: 0 },
    { id: "item_code", label: "Item Code", enabled: true, order: 1 },
    { id: "description", label: "Description", enabled: true, order: 2 },
    { id: "unit", label: "Unit", enabled: true, order: 3 },
    { id: "quantity", label: "Qty", enabled: true, order: 4 },
    { id: "rate", label: "Rate (₹)", enabled: true, order: 5 },
    { id: "amount", label: "Amount (₹)", enabled: true, order: 6 },
    { id: "remarks", label: "Remarks", enabled: true, order: 7 },
  ],
  signatureFields: [
    { id: "prepared_by", label: "Prepared By", enabled: true, order: 0 },
    { id: "checked_by", label: "Checked By", enabled: true, order: 1 },
    { id: "authorised_signatory", label: "Authorised Signatory", enabled: true, order: 2 },
    { id: "receiver_signature", label: "Receiver's Signature", enabled: true, order: 3 },
  ],
  termsText: "",
  showTerms: true,
};

const INV_DEFAULT: TemplateConfig = {
  sections: [
    {
      id: "header", label: "Header", enabled: true, order: 0,
      fields: [
        { id: "invoice_number", label: "Invoice Number", enabled: true, required: true, order: 0 },
        { id: "invoice_date", label: "Invoice Date", enabled: true, required: true, order: 1 },
        { id: "due_date", label: "Due Date", enabled: true, required: false, order: 2 },
        { id: "place_of_supply", label: "Place of Supply", enabled: true, required: false, order: 3 },
      ],
    },
    {
      id: "company_info", label: "Company Info", enabled: true, order: 1,
      fields: [
        { id: "company_name", label: "Company Name", enabled: true, required: false, order: 0 },
        { id: "company_address", label: "Address", enabled: true, required: false, order: 1 },
        { id: "company_gstin", label: "GSTIN", enabled: true, required: false, order: 2 },
        { id: "company_phone", label: "Phone", enabled: true, required: false, order: 3 },
      ],
    },
    {
      id: "customer_details", label: "Customer / Bill To", enabled: true, order: 2,
      fields: [
        { id: "customer_name", label: "Customer Name", enabled: true, required: true, order: 0 },
        { id: "customer_address", label: "Address", enabled: true, required: false, order: 1 },
        { id: "customer_gstin", label: "GSTIN", enabled: true, required: false, order: 2 },
        { id: "customer_phone", label: "Phone", enabled: true, required: false, order: 3 },
        { id: "customer_state_code", label: "State Code", enabled: true, required: false, order: 4 },
        { id: "customer_po_reference", label: "Customer PO Ref", enabled: true, required: false, order: 5 },
      ],
    },
    {
      id: "reference_fields", label: "Reference Fields", enabled: true, order: 3,
      fields: [
        { id: "dc_reference", label: "DC Reference", enabled: true, required: false, order: 0 },
        { id: "payment_terms", label: "Payment Terms", enabled: true, required: false, order: 1 },
      ],
    },
    {
      id: "tax_totals", label: "Tax & Totals", enabled: true, order: 5,
      fields: [
        { id: "sub_total", label: "Sub Total", enabled: true, required: false, order: 0 },
        { id: "discount", label: "Discount", enabled: true, required: false, order: 1 },
        { id: "taxable_value", label: "Taxable Value", enabled: true, required: false, order: 2 },
        { id: "gst_breakup", label: "GST Breakup", enabled: true, required: false, order: 3 },
        { id: "round_off", label: "Round Off", enabled: true, required: false, order: 4 },
        { id: "grand_total", label: "Grand Total", enabled: true, required: false, order: 5 },
        { id: "amount_in_words", label: "Amount in Words", enabled: true, required: false, order: 6 },
      ],
    },
    {
      id: "bank_details", label: "Bank Details", enabled: true, order: 6,
      fields: [
        { id: "bank_name", label: "Bank Name", enabled: true, required: false, order: 0 },
        { id: "bank_account_number", label: "Account Number", enabled: true, required: false, order: 1 },
        { id: "bank_ifsc", label: "IFSC Code", enabled: true, required: false, order: 2 },
        { id: "bank_branch", label: "Branch", enabled: true, required: false, order: 3 },
      ],
    },
    {
      id: "footer", label: "Footer", enabled: true, order: 7,
      fields: [
        { id: "special_instructions", label: "Special Instructions", enabled: true, required: false, order: 0 },
        { id: "internal_remarks", label: "Internal Remarks", enabled: true, required: false, order: 1 },
      ],
    },
  ],
  lineItemColumns: [
    { id: "serial_number", label: "#", enabled: true, order: 0 },
    { id: "description", label: "Description", enabled: true, order: 1 },
    { id: "hsn_sac_code", label: "HSN/SAC", enabled: true, order: 2 },
    { id: "quantity", label: "Qty", enabled: true, order: 3 },
    { id: "unit", label: "Unit", enabled: true, order: 4 },
    { id: "unit_price", label: "Rate (₹)", enabled: true, order: 5 },
    { id: "discount_percent", label: "Disc %", enabled: true, order: 6 },
    { id: "gst_rate", label: "GST %", enabled: true, order: 7 },
    { id: "taxable_amount", label: "Taxable (₹)", enabled: true, order: 8 },
    { id: "line_total", label: "Amount (₹)", enabled: true, order: 9 },
  ],
  signatureFields: [
    { id: "prepared_by", label: "Prepared By", enabled: true, order: 0 },
    { id: "authorised_signatory", label: "Authorised Signatory", enabled: true, order: 1 },
  ],
  termsText: "",
  showTerms: true,
};

export const TEMPLATE_DEFAULTS: Record<string, TemplateConfig> = {
  purchase_order: PO_DEFAULT,
  delivery_challan: DC_DEFAULT,
  invoice: INV_DEFAULT,
};

export function getDefaultTemplate(docType: string): TemplateConfig {
  return JSON.parse(JSON.stringify(TEMPLATE_DEFAULTS[docType] || PO_DEFAULT));
}
