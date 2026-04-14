export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          details: Json | null
          document_id: string
          document_type: string
          id: string
          user_email: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          details?: Json | null
          document_id: string
          document_type: string
          id?: string
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          details?: Json | null
          document_id?: string
          document_type?: string
          id?: string
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          bank_account: string | null
          bank_branch: string | null
          bank_ifsc: string | null
          bank_name: string | null
          city: string | null
          company_id: string | null
          company_name: string | null
          created_at: string
          default_terms: string | null
          email: string | null
          financial_year_label: string | null
          financial_year_start: string | null
          gstin: string | null
          id: string
          logo_url: string | null
          pan: string | null
          phone: string | null
          pin_code: string | null
          signature_url: string | null
          state: string | null
          state_code: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          bank_account?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          city?: string | null
          company_id?: string | null
          company_name?: string | null
          created_at?: string
          default_terms?: string | null
          email?: string | null
          financial_year_label?: string | null
          financial_year_start?: string | null
          gstin?: string | null
          id?: string
          logo_url?: string | null
          pan?: string | null
          phone?: string | null
          pin_code?: string | null
          signature_url?: string | null
          state?: string | null
          state_code?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          bank_account?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          city?: string | null
          company_id?: string | null
          company_name?: string | null
          created_at?: string
          default_terms?: string | null
          email?: string | null
          financial_year_label?: string | null
          financial_year_start?: string | null
          gstin?: string | null
          id?: string
          logo_url?: string | null
          pan?: string | null
          phone?: string | null
          pin_code?: string | null
          signature_url?: string | null
          state?: string | null
          state_code?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_fields: {
        Row: {
          company_id: string | null
          created_at: string
          default_value: string | null
          document_type: string
          dropdown_options: Json | null
          field_key: string
          field_label: string
          field_type: string
          id: string
          is_required: boolean | null
          is_searchable: boolean | null
          location: string
          print_on_document: boolean | null
          sort_order: number | null
          status: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          default_value?: string | null
          document_type: string
          dropdown_options?: Json | null
          field_key: string
          field_label: string
          field_type?: string
          id?: string
          is_required?: boolean | null
          is_searchable?: boolean | null
          location?: string
          print_on_document?: boolean | null
          sort_order?: number | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          default_value?: string | null
          document_type?: string
          dropdown_options?: Json | null
          field_key?: string
          field_label?: string
          field_type?: string
          id?: string
          is_required?: boolean | null
          is_searchable?: boolean | null
          location?: string
          print_on_document?: boolean | null
          sort_order?: number | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_fields_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dc_line_items: {
        Row: {
          amount: number | null
          company_id: string | null
          created_at: string
          dc_id: string
          description: string
          drawing_number: string | null
          hsn_sac_code: string | null
          id: string
          item_code: string | null
          material_type: string | null
          nature_of_process: string | null
          qty_kg: number | null
          qty_nos: number | null
          qty_sft: number | null
          quantity: number | null
          rate: number | null
          remarks: string | null
          returned_qty_kg: number | null
          returned_qty_nos: number | null
          returned_qty_sft: number | null
          serial_number: number
          unit: string | null
        }
        Insert: {
          amount?: number | null
          company_id?: string | null
          created_at?: string
          dc_id: string
          description: string
          drawing_number?: string | null
          hsn_sac_code?: string | null
          id?: string
          item_code?: string | null
          material_type?: string | null
          nature_of_process?: string | null
          qty_kg?: number | null
          qty_nos?: number | null
          qty_sft?: number | null
          quantity?: number | null
          rate?: number | null
          remarks?: string | null
          returned_qty_kg?: number | null
          returned_qty_nos?: number | null
          returned_qty_sft?: number | null
          serial_number: number
          unit?: string | null
        }
        Update: {
          amount?: number | null
          company_id?: string | null
          created_at?: string
          dc_id?: string
          description?: string
          drawing_number?: string | null
          hsn_sac_code?: string | null
          id?: string
          item_code?: string | null
          material_type?: string | null
          nature_of_process?: string | null
          qty_kg?: number | null
          qty_nos?: number | null
          qty_sft?: number | null
          quantity?: number | null
          rate?: number | null
          remarks?: string | null
          returned_qty_kg?: number | null
          returned_qty_nos?: number | null
          returned_qty_sft?: number | null
          serial_number?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dc_line_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dc_line_items_dc_id_fkey"
            columns: ["dc_id"]
            isOneToOne: false
            referencedRelation: "delivery_challans"
            referencedColumns: ["id"]
          },
        ]
      }
      dc_return_items: {
        Row: {
          company_id: string | null
          created_at: string
          dc_line_item_id: string
          id: string
          remarks: string | null
          return_id: string
          returned_kg: number | null
          returned_nos: number | null
          returned_sft: number | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          dc_line_item_id: string
          id?: string
          remarks?: string | null
          return_id: string
          returned_kg?: number | null
          returned_nos?: number | null
          returned_sft?: number | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          dc_line_item_id?: string
          id?: string
          remarks?: string | null
          return_id?: string
          returned_kg?: number | null
          returned_nos?: number | null
          returned_sft?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dc_return_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dc_return_items_dc_line_item_id_fkey"
            columns: ["dc_line_item_id"]
            isOneToOne: false
            referencedRelation: "dc_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dc_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "dc_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      dc_returns: {
        Row: {
          company_id: string | null
          created_at: string
          dc_id: string
          id: string
          notes: string | null
          received_by: string | null
          return_date: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          dc_id: string
          id?: string
          notes?: string | null
          received_by?: string | null
          return_date?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          dc_id?: string
          id?: string
          notes?: string | null
          received_by?: string | null
          return_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "dc_returns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dc_returns_dc_id_fkey"
            columns: ["dc_id"]
            isOneToOne: false
            referencedRelation: "delivery_challans"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_challans: {
        Row: {
          approximate_value: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cgst_amount: number | null
          challan_category: string | null
          checked_by: string | null
          company_id: string | null
          created_at: string
          dc_date: string
          dc_number: string
          dc_type: string
          driver_name: string | null
          grand_total: number | null
          gst_rate: number | null
          id: string
          igst_amount: number | null
          internal_remarks: string | null
          issued_at: string | null
          nature_of_job_work: string | null
          party_address: string | null
          party_gstin: string | null
          party_id: string | null
          party_name: string | null
          party_phone: string | null
          party_state_code: string | null
          po_date: string | null
          po_reference: string | null
          prepared_by: string | null
          reference_number: string | null
          return_due_date: string | null
          sgst_amount: number | null
          special_instructions: string | null
          status: string | null
          sub_total: number | null
          total_gst: number | null
          total_items: number | null
          total_qty: number | null
          updated_at: string
          vehicle_number: string | null
        }
        Insert: {
          approximate_value?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cgst_amount?: number | null
          challan_category?: string | null
          checked_by?: string | null
          company_id?: string | null
          created_at?: string
          dc_date?: string
          dc_number: string
          dc_type?: string
          driver_name?: string | null
          grand_total?: number | null
          gst_rate?: number | null
          id?: string
          igst_amount?: number | null
          internal_remarks?: string | null
          issued_at?: string | null
          nature_of_job_work?: string | null
          party_address?: string | null
          party_gstin?: string | null
          party_id?: string | null
          party_name?: string | null
          party_phone?: string | null
          party_state_code?: string | null
          po_date?: string | null
          po_reference?: string | null
          prepared_by?: string | null
          reference_number?: string | null
          return_due_date?: string | null
          sgst_amount?: number | null
          special_instructions?: string | null
          status?: string | null
          sub_total?: number | null
          total_gst?: number | null
          total_items?: number | null
          total_qty?: number | null
          updated_at?: string
          vehicle_number?: string | null
        }
        Update: {
          approximate_value?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cgst_amount?: number | null
          challan_category?: string | null
          checked_by?: string | null
          company_id?: string | null
          created_at?: string
          dc_date?: string
          dc_number?: string
          dc_type?: string
          driver_name?: string | null
          grand_total?: number | null
          gst_rate?: number | null
          id?: string
          igst_amount?: number | null
          internal_remarks?: string | null
          issued_at?: string | null
          nature_of_job_work?: string | null
          party_address?: string | null
          party_gstin?: string | null
          party_id?: string | null
          party_name?: string | null
          party_phone?: string | null
          party_state_code?: string | null
          po_date?: string | null
          po_reference?: string | null
          prepared_by?: string | null
          reference_number?: string | null
          return_due_date?: string | null
          sgst_amount?: number | null
          special_instructions?: string | null
          status?: string | null
          sub_total?: number | null
          total_gst?: number | null
          total_items?: number | null
          total_qty?: number | null
          updated_at?: string
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_challans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_challans_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      document_settings: {
        Row: {
          column_label_overrides: Json | null
          company_id: string | null
          copies_per_page: number | null
          created_at: string
          document_type: string
          footer_note: string | null
          header_note: string | null
          id: string
          numbering_current: number | null
          numbering_prefix: string | null
          numbering_start: number | null
          paper_size: string | null
          show_bank_details: boolean | null
          show_drawing_number: boolean | null
          show_gst_breakup: boolean | null
          show_logo: boolean | null
          show_not_for_sale: boolean | null
          show_signature: boolean | null
          template_config: Json | null
          terms_and_conditions: string | null
          updated_at: string
        }
        Insert: {
          column_label_overrides?: Json | null
          company_id?: string | null
          copies_per_page?: number | null
          created_at?: string
          document_type: string
          footer_note?: string | null
          header_note?: string | null
          id?: string
          numbering_current?: number | null
          numbering_prefix?: string | null
          numbering_start?: number | null
          paper_size?: string | null
          show_bank_details?: boolean | null
          show_drawing_number?: boolean | null
          show_gst_breakup?: boolean | null
          show_logo?: boolean | null
          show_not_for_sale?: boolean | null
          show_signature?: boolean | null
          template_config?: Json | null
          terms_and_conditions?: string | null
          updated_at?: string
        }
        Update: {
          column_label_overrides?: Json | null
          company_id?: string | null
          copies_per_page?: number | null
          created_at?: string
          document_type?: string
          footer_note?: string | null
          header_note?: string | null
          id?: string
          numbering_current?: number | null
          numbering_prefix?: string | null
          numbering_start?: number | null
          paper_size?: string | null
          show_bank_details?: boolean | null
          show_drawing_number?: boolean | null
          show_gst_breakup?: boolean | null
          show_logo?: boolean | null
          show_not_for_sale?: boolean | null
          show_signature?: boolean | null
          template_config?: Json | null
          terms_and_conditions?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      grn_line_items: {
        Row: {
          accepted_quantity: number | null
          company_id: string | null
          created_at: string
          description: string
          drawing_number: string | null
          grn_id: string
          id: string
          pending_quantity: number | null
          po_line_item_id: string | null
          po_quantity: number | null
          previously_received: number | null
          receiving_now: number | null
          rejected_quantity: number | null
          rejection_reason: string | null
          remarks: string | null
          serial_number: number
          unit: string | null
        }
        Insert: {
          accepted_quantity?: number | null
          company_id?: string | null
          created_at?: string
          description: string
          drawing_number?: string | null
          grn_id: string
          id?: string
          pending_quantity?: number | null
          po_line_item_id?: string | null
          po_quantity?: number | null
          previously_received?: number | null
          receiving_now?: number | null
          rejected_quantity?: number | null
          rejection_reason?: string | null
          remarks?: string | null
          serial_number: number
          unit?: string | null
        }
        Update: {
          accepted_quantity?: number | null
          company_id?: string | null
          created_at?: string
          description?: string
          drawing_number?: string | null
          grn_id?: string
          id?: string
          pending_quantity?: number | null
          po_line_item_id?: string | null
          po_quantity?: number | null
          previously_received?: number | null
          receiving_now?: number | null
          rejected_quantity?: number | null
          rejection_reason?: string | null
          remarks?: string | null
          serial_number?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grn_line_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_line_items_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "grns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_line_items_po_line_item_id_fkey"
            columns: ["po_line_item_id"]
            isOneToOne: false
            referencedRelation: "po_line_items"
            referencedColumns: ["id"]
          },
        ]
      }
      grns: {
        Row: {
          company_id: string | null
          created_at: string
          grn_date: string
          grn_number: string
          id: string
          lr_reference: string | null
          notes: string | null
          po_id: string | null
          po_number: string | null
          received_by: string | null
          recorded_at: string | null
          status: string | null
          total_accepted: number | null
          total_received: number | null
          total_rejected: number | null
          updated_at: string
          vehicle_number: string | null
          vendor_id: string | null
          vendor_invoice_date: string | null
          vendor_invoice_number: string | null
          vendor_name: string | null
          verified_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          grn_date?: string
          grn_number: string
          id?: string
          lr_reference?: string | null
          notes?: string | null
          po_id?: string | null
          po_number?: string | null
          received_by?: string | null
          recorded_at?: string | null
          status?: string | null
          total_accepted?: number | null
          total_received?: number | null
          total_rejected?: number | null
          updated_at?: string
          vehicle_number?: string | null
          vendor_id?: string | null
          vendor_invoice_date?: string | null
          vendor_invoice_number?: string | null
          vendor_name?: string | null
          verified_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          grn_date?: string
          grn_number?: string
          id?: string
          lr_reference?: string | null
          notes?: string | null
          po_id?: string | null
          po_number?: string | null
          received_by?: string | null
          recorded_at?: string | null
          status?: string | null
          total_accepted?: number | null
          total_received?: number | null
          total_rejected?: number | null
          updated_at?: string
          vehicle_number?: string | null
          vendor_id?: string | null
          vendor_invoice_date?: string | null
          vendor_invoice_number?: string | null
          vendor_name?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grns_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grns_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          cgst: number | null
          company_id: string | null
          created_at: string
          description: string
          discount_amount: number | null
          discount_percent: number | null
          drawing_number: string | null
          gst_rate: number | null
          hsn_sac_code: string | null
          id: string
          igst: number | null
          invoice_id: string
          line_total: number | null
          quantity: number
          serial_number: number
          sgst: number | null
          taxable_amount: number | null
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          cgst?: number | null
          company_id?: string | null
          created_at?: string
          description: string
          discount_amount?: number | null
          discount_percent?: number | null
          drawing_number?: string | null
          gst_rate?: number | null
          hsn_sac_code?: string | null
          id?: string
          igst?: number | null
          invoice_id: string
          line_total?: number | null
          quantity?: number
          serial_number: number
          sgst?: number | null
          taxable_amount?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          cgst?: number | null
          company_id?: string | null
          created_at?: string
          description?: string
          discount_amount?: number | null
          discount_percent?: number | null
          drawing_number?: string | null
          gst_rate?: number | null
          hsn_sac_code?: string | null
          id?: string
          igst?: number | null
          invoice_id?: string
          line_total?: number | null
          quantity?: number
          serial_number?: number
          sgst?: number | null
          taxable_amount?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_outstanding: number | null
          amount_paid: number | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_ifsc: string | null
          bank_name: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cgst_amount: number | null
          company_id: string | null
          created_at: string
          customer_address: string | null
          customer_gstin: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_po_reference: string | null
          customer_state_code: string | null
          dc_id: string | null
          dc_reference: string | null
          due_date: string | null
          grand_total: number | null
          gst_rate: number | null
          id: string
          igst_amount: number | null
          internal_remarks: string | null
          invoice_date: string
          invoice_number: string
          issued_at: string | null
          payment_terms: string | null
          place_of_supply: string | null
          round_off: number | null
          sgst_amount: number | null
          special_instructions: string | null
          status: string | null
          sub_total: number | null
          taxable_value: number | null
          terms_and_conditions: string | null
          total_discount: number | null
          total_gst: number | null
          updated_at: string
        }
        Insert: {
          amount_outstanding?: number | null
          amount_paid?: number | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cgst_amount?: number | null
          company_id?: string | null
          created_at?: string
          customer_address?: string | null
          customer_gstin?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_po_reference?: string | null
          customer_state_code?: string | null
          dc_id?: string | null
          dc_reference?: string | null
          due_date?: string | null
          grand_total?: number | null
          gst_rate?: number | null
          id?: string
          igst_amount?: number | null
          internal_remarks?: string | null
          invoice_date?: string
          invoice_number: string
          issued_at?: string | null
          payment_terms?: string | null
          place_of_supply?: string | null
          round_off?: number | null
          sgst_amount?: number | null
          special_instructions?: string | null
          status?: string | null
          sub_total?: number | null
          taxable_value?: number | null
          terms_and_conditions?: string | null
          total_discount?: number | null
          total_gst?: number | null
          updated_at?: string
        }
        Update: {
          amount_outstanding?: number | null
          amount_paid?: number | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cgst_amount?: number | null
          company_id?: string | null
          created_at?: string
          customer_address?: string | null
          customer_gstin?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_po_reference?: string | null
          customer_state_code?: string | null
          dc_id?: string | null
          dc_reference?: string | null
          due_date?: string | null
          grand_total?: number | null
          gst_rate?: number | null
          id?: string
          igst_amount?: number | null
          internal_remarks?: string | null
          invoice_date?: string
          invoice_number?: string
          issued_at?: string | null
          payment_terms?: string | null
          place_of_supply?: string | null
          round_off?: number | null
          sgst_amount?: number | null
          special_instructions?: string | null
          status?: string | null
          sub_total?: number | null
          taxable_value?: number | null
          terms_and_conditions?: string | null
          total_discount?: number | null
          total_gst?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_dc_id_fkey"
            columns: ["dc_id"]
            isOneToOne: false
            referencedRelation: "delivery_challans"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          company_id: string | null
          created_at: string
          current_stock: number | null
          description: string
          drawing_number: string | null
          gst_rate: number | null
          hsn_sac_code: string | null
          id: string
          item_code: string
          item_type: string
          min_stock: number | null
          notes: string | null
          purchase_price: number | null
          sale_price: number | null
          status: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          current_stock?: number | null
          description: string
          drawing_number?: string | null
          gst_rate?: number | null
          hsn_sac_code?: string | null
          id?: string
          item_code: string
          item_type?: string
          min_stock?: number | null
          notes?: string | null
          purchase_price?: number | null
          sale_price?: number | null
          status?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          current_stock?: number | null
          description?: string
          drawing_number?: string | null
          gst_rate?: number | null
          hsn_sac_code?: string | null
          id?: string
          item_code?: string
          item_type?: string
          min_stock?: number | null
          notes?: string | null
          purchase_price?: number | null
          sale_price?: number | null
          status?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      parties: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          address_line3: string | null
          city: string | null
          company_id: string | null
          contact_person: string | null
          created_at: string
          credit_limit: number | null
          email1: string | null
          email2: string | null
          gstin: string | null
          id: string
          name: string
          notes: string | null
          pan: string | null
          party_type: string
          payment_terms: string | null
          phone1: string | null
          phone2: string | null
          pin_code: string | null
          state: string | null
          state_code: string | null
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          address_line3?: string | null
          city?: string | null
          company_id?: string | null
          contact_person?: string | null
          created_at?: string
          credit_limit?: number | null
          email1?: string | null
          email2?: string | null
          gstin?: string | null
          id?: string
          name: string
          notes?: string | null
          pan?: string | null
          party_type?: string
          payment_terms?: string | null
          phone1?: string | null
          phone2?: string | null
          pin_code?: string | null
          state?: string | null
          state_code?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          address_line3?: string | null
          city?: string | null
          company_id?: string | null
          contact_person?: string | null
          created_at?: string
          credit_limit?: number | null
          email1?: string | null
          email2?: string | null
          gstin?: string | null
          id?: string
          name?: string
          notes?: string | null
          pan?: string | null
          party_type?: string
          payment_terms?: string | null
          phone1?: string | null
          phone2?: string | null
          pin_code?: string | null
          state?: string | null
          state_code?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parties_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bank_name: string | null
          company_id: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          id: string
          invoice_id: string
          invoice_number: string | null
          notes: string | null
          payment_date: string
          payment_mode: string
          receipt_number: string
          received_by: string | null
          reference_number: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          bank_name?: string | null
          company_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          invoice_id: string
          invoice_number?: string | null
          notes?: string | null
          payment_date?: string
          payment_mode?: string
          receipt_number: string
          received_by?: string | null
          reference_number?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_name?: string | null
          company_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          invoice_id?: string
          invoice_number?: string | null
          notes?: string | null
          payment_date?: string
          payment_mode?: string
          receipt_number?: string
          received_by?: string | null
          reference_number?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      po_line_items: {
        Row: {
          company_id: string | null
          created_at: string
          delivery_date: string | null
          description: string
          drawing_number: string | null
          gst_rate: number | null
          hsn_sac_code: string | null
          id: string
          line_total: number | null
          pending_quantity: number | null
          po_id: string
          quantity: number
          received_quantity: number | null
          serial_number: number
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          delivery_date?: string | null
          description: string
          drawing_number?: string | null
          gst_rate?: number | null
          hsn_sac_code?: string | null
          id?: string
          line_total?: number | null
          pending_quantity?: number | null
          po_id: string
          quantity?: number
          received_quantity?: number | null
          serial_number: number
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          delivery_date?: string | null
          description?: string
          drawing_number?: string | null
          gst_rate?: number | null
          hsn_sac_code?: string | null
          id?: string
          line_total?: number | null
          pending_quantity?: number | null
          po_id?: string
          quantity?: number
          received_quantity?: number | null
          serial_number?: number
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "po_line_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_line_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          tour_completed: boolean | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          tour_completed?: boolean | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          tour_completed?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          additional_charges: Json | null
          approval_requested_at: string | null
          approval_requested_by: string | null
          approved_at: string | null
          approved_by: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cgst_amount: number | null
          company_id: string | null
          created_at: string
          delivery_address: string | null
          grand_total: number | null
          gst_rate: number | null
          id: string
          igst_amount: number | null
          internal_remarks: string | null
          issued_at: string | null
          payment_terms: string | null
          po_date: string
          po_number: string
          reference_number: string | null
          rejection_noted: boolean
          rejection_reason: string | null
          sgst_amount: number | null
          special_instructions: string | null
          status: string | null
          sub_total: number | null
          taxable_value: number | null
          total_gst: number | null
          updated_at: string
          vendor_address: string | null
          vendor_gstin: string | null
          vendor_id: string | null
          vendor_name: string | null
          vendor_phone: string | null
          vendor_state_code: string | null
        }
        Insert: {
          additional_charges?: Json | null
          approval_requested_at?: string | null
          approval_requested_by?: string | null
          approved_at?: string | null
          approved_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cgst_amount?: number | null
          company_id?: string | null
          created_at?: string
          delivery_address?: string | null
          grand_total?: number | null
          gst_rate?: number | null
          id?: string
          igst_amount?: number | null
          internal_remarks?: string | null
          issued_at?: string | null
          payment_terms?: string | null
          po_date?: string
          po_number: string
          reference_number?: string | null
          rejection_noted?: boolean
          rejection_reason?: string | null
          sgst_amount?: number | null
          special_instructions?: string | null
          status?: string | null
          sub_total?: number | null
          taxable_value?: number | null
          total_gst?: number | null
          updated_at?: string
          vendor_address?: string | null
          vendor_gstin?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
          vendor_phone?: string | null
          vendor_state_code?: string | null
        }
        Update: {
          additional_charges?: Json | null
          approval_requested_at?: string | null
          approval_requested_by?: string | null
          approved_at?: string | null
          approved_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cgst_amount?: number | null
          company_id?: string | null
          created_at?: string
          delivery_address?: string | null
          grand_total?: number | null
          gst_rate?: number | null
          id?: string
          igst_amount?: number | null
          internal_remarks?: string | null
          issued_at?: string | null
          payment_terms?: string | null
          po_date?: string
          po_number?: string
          reference_number?: string | null
          rejection_noted?: boolean
          rejection_reason?: string | null
          sgst_amount?: number | null
          special_instructions?: string | null
          status?: string | null
          sub_total?: number | null
          taxable_value?: number | null
          total_gst?: number | null
          updated_at?: string
          vendor_address?: string | null
          vendor_gstin?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
          vendor_phone?: string | null
          vendor_state_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_company_id: { Args: never; Returns: string }
      setup_company: {
        Args: {
          _company_name: string
          _gstin?: string
          _phone?: string
          _state?: string
          _state_code?: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
