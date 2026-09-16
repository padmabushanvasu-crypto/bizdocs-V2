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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      assembly_orders: {
        Row: {
          ao_date: string
          ao_number: string
          backflushed: boolean | null
          bom_snapshot: Json | null
          company_id: string | null
          completed_at: string | null
          created_at: string | null
          fat_drafts_created: boolean | null
          id: string
          item_code: string | null
          item_description: string | null
          item_id: string | null
          notes: string | null
          planned_date: string | null
          production_trigger: string | null
          quantity_built: number | null
          quantity_to_build: number
          serial_numbers_generated: boolean | null
          status: string | null
          updated_at: string | null
          work_order_ref: string | null
        }
        Insert: {
          ao_date?: string
          ao_number: string
          backflushed?: boolean | null
          bom_snapshot?: Json | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          fat_drafts_created?: boolean | null
          id?: string
          item_code?: string | null
          item_description?: string | null
          item_id?: string | null
          notes?: string | null
          planned_date?: string | null
          production_trigger?: string | null
          quantity_built?: number | null
          quantity_to_build?: number
          serial_numbers_generated?: boolean | null
          status?: string | null
          updated_at?: string | null
          work_order_ref?: string | null
        }
        Update: {
          ao_date?: string
          ao_number?: string
          backflushed?: boolean | null
          bom_snapshot?: Json | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          fat_drafts_created?: boolean | null
          id?: string
          item_code?: string | null
          item_description?: string | null
          item_id?: string | null
          notes?: string | null
          planned_date?: string | null
          production_trigger?: string | null
          quantity_built?: number | null
          quantity_to_build?: number
          serial_numbers_generated?: boolean | null
          status?: string | null
          updated_at?: string | null
          work_order_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assembly_orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "assembly_orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "assembly_orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "assembly_orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
        ]
      }
      assembly_work_orders: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          actual_quantity_produced: number | null
          awo_date: string
          awo_number: string
          awo_type: string
          bom_variant_id: string | null
          company_id: string | null
          completed_at: string | null
          created_at: string | null
          delete_disposition: string | null
          delete_notes: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          issued_by: string | null
          issued_by_user_id: string | null
          item_code: string | null
          item_description: string | null
          item_id: string | null
          notes: string | null
          planned_date: string | null
          quantity_to_build: number
          raised_by: string | null
          raised_by_user_id: string | null
          serial_number: string | null
          status: string | null
          store_location: string | null
          updated_at: string | null
          work_order_ref: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          actual_quantity_produced?: number | null
          awo_date?: string
          awo_number: string
          awo_type: string
          bom_variant_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          delete_disposition?: string | null
          delete_notes?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          issued_by?: string | null
          issued_by_user_id?: string | null
          item_code?: string | null
          item_description?: string | null
          item_id?: string | null
          notes?: string | null
          planned_date?: string | null
          quantity_to_build?: number
          raised_by?: string | null
          raised_by_user_id?: string | null
          serial_number?: string | null
          status?: string | null
          store_location?: string | null
          updated_at?: string | null
          work_order_ref?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          actual_quantity_produced?: number | null
          awo_date?: string
          awo_number?: string
          awo_type?: string
          bom_variant_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          delete_disposition?: string | null
          delete_notes?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          issued_by?: string | null
          issued_by_user_id?: string | null
          item_code?: string | null
          item_description?: string | null
          item_id?: string | null
          notes?: string | null
          planned_date?: string | null
          quantity_to_build?: number
          raised_by?: string | null
          raised_by_user_id?: string | null
          serial_number?: string | null
          status?: string | null
          store_location?: string | null
          updated_at?: string | null
          work_order_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assembly_work_orders_bom_variant_id_fkey"
            columns: ["bom_variant_id"]
            isOneToOne: false
            referencedRelation: "bom_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_work_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_work_orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_work_orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_work_orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_work_orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "assembly_work_orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "assembly_work_orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "assembly_work_orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
        ]
      }
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
        Relationships: []
      }
      audit_month_end_stock: {
        Row: {
          bucket: string
          company_id: string
          computed_at: string
          finding_ref: string | null
          grade: string
          id: string
          item_id: string
          month_end: string
          qty: number
        }
        Insert: {
          bucket: string
          company_id: string
          computed_at?: string
          finding_ref?: string | null
          grade: string
          id?: string
          item_id: string
          month_end: string
          qty: number
        }
        Update: {
          bucket?: string
          company_id?: string
          computed_at?: string
          finding_ref?: string | null
          grade?: string
          id?: string
          item_id?: string
          month_end?: string
          qty?: number
        }
        Relationships: []
      }
      awo_line_items: {
        Row: {
          awo_id: string | null
          company_id: string | null
          concession_at: string | null
          concession_by: string | null
          concession_note: string | null
          concession_qty: number
          consumed_qty: number | null
          created_at: string | null
          damage_dispositioned_qty: number
          damage_qty: number | null
          damage_reason: string | null
          damage_resolved_qty: number | null
          disposition: string | null
          drawing_number: string | null
          id: string
          is_critical: boolean | null
          issued_qty: number | null
          item_code: string | null
          item_description: string | null
          item_id: string | null
          notes: string | null
          required_qty: number
          returned_qty: number
          scrapped_qty: number
          shortage_qty: number | null
          unit: string | null
        }
        Insert: {
          awo_id?: string | null
          company_id?: string | null
          concession_at?: string | null
          concession_by?: string | null
          concession_note?: string | null
          concession_qty?: number
          consumed_qty?: number | null
          created_at?: string | null
          damage_dispositioned_qty?: number
          damage_qty?: number | null
          damage_reason?: string | null
          damage_resolved_qty?: number | null
          disposition?: string | null
          drawing_number?: string | null
          id?: string
          is_critical?: boolean | null
          issued_qty?: number | null
          item_code?: string | null
          item_description?: string | null
          item_id?: string | null
          notes?: string | null
          required_qty: number
          returned_qty?: number
          scrapped_qty?: number
          shortage_qty?: number | null
          unit?: string | null
        }
        Update: {
          awo_id?: string | null
          company_id?: string | null
          concession_at?: string | null
          concession_by?: string | null
          concession_note?: string | null
          concession_qty?: number
          consumed_qty?: number | null
          created_at?: string | null
          damage_dispositioned_qty?: number
          damage_qty?: number | null
          damage_reason?: string | null
          damage_resolved_qty?: number | null
          disposition?: string | null
          drawing_number?: string | null
          id?: string
          is_critical?: boolean | null
          issued_qty?: number | null
          item_code?: string | null
          item_description?: string | null
          item_id?: string | null
          notes?: string | null
          required_qty?: number
          returned_qty?: number
          scrapped_qty?: number
          shortage_qty?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "awo_line_items_awo_id_fkey"
            columns: ["awo_id"]
            isOneToOne: false
            referencedRelation: "assembly_work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awo_line_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awo_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awo_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awo_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awo_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "awo_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "awo_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "awo_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
        ]
      }
      bom_line_vendors: {
        Row: {
          bom_line_id: string
          company_id: string
          created_at: string | null
          currency: string | null
          id: string
          is_preferred: boolean | null
          lead_time_days: number | null
          min_order_qty: number | null
          notes: string | null
          preference_order: number | null
          unit_price: number | null
          updated_at: string | null
          vendor_code: string | null
          vendor_id: string | null
          vendor_name: string
        }
        Insert: {
          bom_line_id: string
          company_id: string
          created_at?: string | null
          currency?: string | null
          id?: string
          is_preferred?: boolean | null
          lead_time_days?: number | null
          min_order_qty?: number | null
          notes?: string | null
          preference_order?: number | null
          unit_price?: number | null
          updated_at?: string | null
          vendor_code?: string | null
          vendor_id?: string | null
          vendor_name: string
        }
        Update: {
          bom_line_id?: string
          company_id?: string
          created_at?: string | null
          currency?: string | null
          id?: string
          is_preferred?: boolean | null
          lead_time_days?: number | null
          min_order_qty?: number | null
          notes?: string | null
          preference_order?: number | null
          unit_price?: number | null
          updated_at?: string | null
          vendor_code?: string | null
          vendor_id?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "bom_line_vendors_bom_line_id_fkey"
            columns: ["bom_line_id"]
            isOneToOne: false
            referencedRelation: "bom_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_line_vendors_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_line_vendors_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_scorecard"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      bom_lines: {
        Row: {
          bom_level: number | null
          child_item_id: string | null
          company_id: string | null
          created_at: string | null
          drawing_number: string | null
          has_processing_stages: boolean | null
          id: string
          is_critical: boolean | null
          lead_time_days: number | null
          make_or_buy: string | null
          notes: string | null
          parent_item_id: string | null
          quantity: number
          reference_designator: string | null
          scrap_factor: number | null
          unit: string | null
          updated_at: string | null
          variant_id: string | null
        }
        Insert: {
          bom_level?: number | null
          child_item_id?: string | null
          company_id?: string | null
          created_at?: string | null
          drawing_number?: string | null
          has_processing_stages?: boolean | null
          id?: string
          is_critical?: boolean | null
          lead_time_days?: number | null
          make_or_buy?: string | null
          notes?: string | null
          parent_item_id?: string | null
          quantity?: number
          reference_designator?: string | null
          scrap_factor?: number | null
          unit?: string | null
          updated_at?: string | null
          variant_id?: string | null
        }
        Update: {
          bom_level?: number | null
          child_item_id?: string | null
          company_id?: string | null
          created_at?: string | null
          drawing_number?: string | null
          has_processing_stages?: boolean | null
          id?: string
          is_critical?: boolean | null
          lead_time_days?: number | null
          make_or_buy?: string | null
          notes?: string | null
          parent_item_id?: string | null
          quantity?: number
          reference_designator?: string | null
          scrap_factor?: number | null
          unit?: string | null
          updated_at?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bom_lines_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "bom_lines_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "bom_lines_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "bom_lines_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "bom_lines_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "bom_lines_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "bom_lines_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "bom_lines_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "bom_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "bom_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_processing_routes: {
        Row: {
          company_id: string
          created_at: string
          entry_allowed: boolean
          id: string
          is_active: boolean
          is_gate: boolean
          item_id: string
          lead_time_days: number
          notes: string | null
          process_code: string | null
          process_code_id: string | null
          process_name: string
          stage_number: number
          stage_type: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          entry_allowed?: boolean
          id?: string
          is_active?: boolean
          is_gate?: boolean
          item_id: string
          lead_time_days?: number
          notes?: string | null
          process_code?: string | null
          process_code_id?: string | null
          process_name: string
          stage_number: number
          stage_type?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          entry_allowed?: boolean
          id?: string
          is_active?: boolean
          is_gate?: boolean
          item_id?: string
          lead_time_days?: number
          notes?: string | null
          process_code?: string | null
          process_code_id?: string | null
          process_name?: string
          stage_number?: number
          stage_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bom_processing_routes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_processing_routes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_processing_routes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_processing_routes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_processing_routes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "bom_processing_routes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "bom_processing_routes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "bom_processing_routes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "bom_processing_routes_process_code_id_fkey"
            columns: ["process_code_id"]
            isOneToOne: false
            referencedRelation: "process_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_processing_stages: {
        Row: {
          bom_line_id: string | null
          company_id: string
          created_at: string | null
          expected_days: number | null
          id: string
          is_final_stage: boolean | null
          item_id: string | null
          process_name: string
          stage_name: string
          stage_number: number
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          bom_line_id?: string | null
          company_id: string
          created_at?: string | null
          expected_days?: number | null
          id?: string
          is_final_stage?: boolean | null
          item_id?: string | null
          process_name: string
          stage_name: string
          stage_number: number
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          bom_line_id?: string | null
          company_id?: string
          created_at?: string | null
          expected_days?: number | null
          id?: string
          is_final_stage?: boolean | null
          item_id?: string | null
          process_name?: string
          stage_name?: string
          stage_number?: number
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bom_processing_stages_bom_line_id_fkey"
            columns: ["bom_line_id"]
            isOneToOne: false
            referencedRelation: "bom_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_processing_stages_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_processing_stages_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_processing_stages_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_processing_stages_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "bom_processing_stages_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "bom_processing_stages_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "bom_processing_stages_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "bom_processing_stages_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_processing_stages_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_scorecard"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      bom_variants: {
        Row: {
          company_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          item_id: string | null
          notes: string | null
          updated_at: string | null
          variant_code: string | null
          variant_name: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          item_id?: string | null
          notes?: string | null
          updated_at?: string | null
          variant_code?: string | null
          variant_name: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          item_id?: string | null
          notes?: string | null
          updated_at?: string | null
          variant_code?: string | null
          variant_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "bom_variants_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_variants_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_variants_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_variants_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "bom_variants_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "bom_variants_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "bom_variants_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
        ]
      }
      bpr_vendors: {
        Row: {
          company_id: string
          id: string
          is_preferred: boolean
          route_id: string
          unit_cost: number
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          company_id: string
          id?: string
          is_preferred?: boolean
          route_id: string
          unit_cost?: number
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          company_id?: string
          id?: string
          is_preferred?: boolean
          route_id?: string
          unit_cost?: number
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bpr_vendors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bpr_vendors_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "bom_processing_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bpr_vendors_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bpr_vendors_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_scorecard"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          address_line3: string | null
          ao_prefix: string | null
          authorized_signatory: string | null
          bank_account: string | null
          bank_branch: string | null
          bank_ifsc: string | null
          bank_name: string | null
          cin: string | null
          city: string | null
          company_id: string | null
          company_name: string | null
          conversion_factor_tolerance_pct: number
          copies_per_page: number | null
          created_at: string
          dc_email_day: string | null
          dc_email_enabled: boolean | null
          dc_email_recipients: string | null
          dc_email_time: string | null
          dc_next_number: number | null
          dc_prefix: string | null
          default_bank_account: string | null
          default_bank_branch: string | null
          default_bank_ifsc: string | null
          default_bank_name: string | null
          default_dc_terms: string | null
          default_footer_text: string | null
          default_invoice_terms: string | null
          default_payment_terms: string | null
          default_terms: string | null
          default_terms_conditions: string | null
          dn_prefix: string | null
          email: string | null
          fat_prefix: string | null
          financial_year_label: string | null
          financial_year_start: string | null
          fy_year: string | null
          grn_next_number: number | null
          grn_prefix: string | null
          grn_qc_email_enabled: boolean | null
          grn_qc_email_recipients: Json | null
          gstin: string | null
          id: string
          invoice_next_number: number | null
          invoice_prefix: string | null
          invoice_theme: string | null
          invoice_title: string | null
          jc_prefix: string | null
          jw_prefix: string | null
          logo_url: string | null
          notification_email: string | null
          notification_enabled: boolean | null
          over_receipt_tolerance_percent: number | null
          pan: string | null
          paper_size: string | null
          partial_issue_enabled: boolean | null
          partial_issue_recipients: Json | null
          phone: string | null
          pin_code: string | null
          po_email_day: string | null
          po_email_enabled: boolean | null
          po_email_recipients: Json | null
          po_email_time: string | null
          po_next_number: number | null
          po_prefix: string | null
          process_library_enabled: boolean | null
          rcp_prefix: string | null
          registered_address_line1: string | null
          registered_address_line2: string | null
          registered_address_line3: string | null
          registered_city: string | null
          registered_pin_code: string | null
          registered_state: string | null
          registered_state_code: string | null
          show_bank_details_on_print: boolean | null
          show_discount_column: boolean | null
          show_drawing_number: boolean | null
          show_gst_breakup_on_print: boolean | null
          show_hsn_code: boolean | null
          show_logo: boolean | null
          show_logo_on_print: boolean | null
          show_not_for_sale: boolean | null
          show_original_duplicate: boolean | null
          show_signature: boolean | null
          show_signature_on_print: boolean | null
          signature_url: string | null
          so_prefix: string | null
          state: string | null
          state_code: string | null
          stock_editor_names: Json | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          address_line3?: string | null
          ao_prefix?: string | null
          authorized_signatory?: string | null
          bank_account?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          cin?: string | null
          city?: string | null
          company_id?: string | null
          company_name?: string | null
          conversion_factor_tolerance_pct?: number
          copies_per_page?: number | null
          created_at?: string
          dc_email_day?: string | null
          dc_email_enabled?: boolean | null
          dc_email_recipients?: string | null
          dc_email_time?: string | null
          dc_next_number?: number | null
          dc_prefix?: string | null
          default_bank_account?: string | null
          default_bank_branch?: string | null
          default_bank_ifsc?: string | null
          default_bank_name?: string | null
          default_dc_terms?: string | null
          default_footer_text?: string | null
          default_invoice_terms?: string | null
          default_payment_terms?: string | null
          default_terms?: string | null
          default_terms_conditions?: string | null
          dn_prefix?: string | null
          email?: string | null
          fat_prefix?: string | null
          financial_year_label?: string | null
          financial_year_start?: string | null
          fy_year?: string | null
          grn_next_number?: number | null
          grn_prefix?: string | null
          grn_qc_email_enabled?: boolean | null
          grn_qc_email_recipients?: Json | null
          gstin?: string | null
          id?: string
          invoice_next_number?: number | null
          invoice_prefix?: string | null
          invoice_theme?: string | null
          invoice_title?: string | null
          jc_prefix?: string | null
          jw_prefix?: string | null
          logo_url?: string | null
          notification_email?: string | null
          notification_enabled?: boolean | null
          over_receipt_tolerance_percent?: number | null
          pan?: string | null
          paper_size?: string | null
          partial_issue_enabled?: boolean | null
          partial_issue_recipients?: Json | null
          phone?: string | null
          pin_code?: string | null
          po_email_day?: string | null
          po_email_enabled?: boolean | null
          po_email_recipients?: Json | null
          po_email_time?: string | null
          po_next_number?: number | null
          po_prefix?: string | null
          process_library_enabled?: boolean | null
          rcp_prefix?: string | null
          registered_address_line1?: string | null
          registered_address_line2?: string | null
          registered_address_line3?: string | null
          registered_city?: string | null
          registered_pin_code?: string | null
          registered_state?: string | null
          registered_state_code?: string | null
          show_bank_details_on_print?: boolean | null
          show_discount_column?: boolean | null
          show_drawing_number?: boolean | null
          show_gst_breakup_on_print?: boolean | null
          show_hsn_code?: boolean | null
          show_logo?: boolean | null
          show_logo_on_print?: boolean | null
          show_not_for_sale?: boolean | null
          show_original_duplicate?: boolean | null
          show_signature?: boolean | null
          show_signature_on_print?: boolean | null
          signature_url?: string | null
          so_prefix?: string | null
          state?: string | null
          state_code?: string | null
          stock_editor_names?: Json | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          address_line3?: string | null
          ao_prefix?: string | null
          authorized_signatory?: string | null
          bank_account?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          cin?: string | null
          city?: string | null
          company_id?: string | null
          company_name?: string | null
          conversion_factor_tolerance_pct?: number
          copies_per_page?: number | null
          created_at?: string
          dc_email_day?: string | null
          dc_email_enabled?: boolean | null
          dc_email_recipients?: string | null
          dc_email_time?: string | null
          dc_next_number?: number | null
          dc_prefix?: string | null
          default_bank_account?: string | null
          default_bank_branch?: string | null
          default_bank_ifsc?: string | null
          default_bank_name?: string | null
          default_dc_terms?: string | null
          default_footer_text?: string | null
          default_invoice_terms?: string | null
          default_payment_terms?: string | null
          default_terms?: string | null
          default_terms_conditions?: string | null
          dn_prefix?: string | null
          email?: string | null
          fat_prefix?: string | null
          financial_year_label?: string | null
          financial_year_start?: string | null
          fy_year?: string | null
          grn_next_number?: number | null
          grn_prefix?: string | null
          grn_qc_email_enabled?: boolean | null
          grn_qc_email_recipients?: Json | null
          gstin?: string | null
          id?: string
          invoice_next_number?: number | null
          invoice_prefix?: string | null
          invoice_theme?: string | null
          invoice_title?: string | null
          jc_prefix?: string | null
          jw_prefix?: string | null
          logo_url?: string | null
          notification_email?: string | null
          notification_enabled?: boolean | null
          over_receipt_tolerance_percent?: number | null
          pan?: string | null
          paper_size?: string | null
          partial_issue_enabled?: boolean | null
          partial_issue_recipients?: Json | null
          phone?: string | null
          pin_code?: string | null
          po_email_day?: string | null
          po_email_enabled?: boolean | null
          po_email_recipients?: Json | null
          po_email_time?: string | null
          po_next_number?: number | null
          po_prefix?: string | null
          process_library_enabled?: boolean | null
          rcp_prefix?: string | null
          registered_address_line1?: string | null
          registered_address_line2?: string | null
          registered_address_line3?: string | null
          registered_city?: string | null
          registered_pin_code?: string | null
          registered_state?: string | null
          registered_state_code?: string | null
          show_bank_details_on_print?: boolean | null
          show_discount_column?: boolean | null
          show_drawing_number?: boolean | null
          show_gst_breakup_on_print?: boolean | null
          show_hsn_code?: boolean | null
          show_logo?: boolean | null
          show_logo_on_print?: boolean | null
          show_not_for_sale?: boolean | null
          show_original_duplicate?: boolean | null
          show_signature?: boolean | null
          show_signature_on_print?: boolean | null
          signature_url?: string | null
          so_prefix?: string | null
          state?: string | null
          state_code?: string | null
          stock_editor_names?: Json | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      component_processing_log: {
        Row: {
          accepted_qty: number | null
          batch_ref: string | null
          company_id: string
          created_at: string | null
          current_stage: number | null
          current_status: string | null
          drawing_number: string | null
          id: string
          item_id: string | null
          last_dc_id: string | null
          last_return_date: string | null
          notes: string | null
          rejected_qty: number | null
          scrapped_qty: number | null
          total_qty: number
          total_stages: number | null
          updated_at: string | null
        }
        Insert: {
          accepted_qty?: number | null
          batch_ref?: string | null
          company_id: string
          created_at?: string | null
          current_stage?: number | null
          current_status?: string | null
          drawing_number?: string | null
          id?: string
          item_id?: string | null
          last_dc_id?: string | null
          last_return_date?: string | null
          notes?: string | null
          rejected_qty?: number | null
          scrapped_qty?: number | null
          total_qty: number
          total_stages?: number | null
          updated_at?: string | null
        }
        Update: {
          accepted_qty?: number | null
          batch_ref?: string | null
          company_id?: string
          created_at?: string | null
          current_stage?: number | null
          current_status?: string | null
          drawing_number?: string | null
          id?: string
          item_id?: string | null
          last_dc_id?: string | null
          last_return_date?: string | null
          notes?: string | null
          rejected_qty?: number | null
          scrapped_qty?: number | null
          total_qty?: number
          total_stages?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "component_processing_log_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "component_processing_log_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "component_processing_log_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "component_processing_log_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "component_processing_log_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "component_processing_log_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "component_processing_log_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "component_processing_log_last_dc_id_fkey"
            columns: ["last_dc_id"]
            isOneToOne: false
            referencedRelation: "delivery_challans"
            referencedColumns: ["id"]
          },
        ]
      }
      consumable_issue_lines: {
        Row: {
          company_id: string
          consumable_issue_id: string
          created_at: string | null
          disposition: string | null
          drawing_number: string | null
          id: string
          item_code: string | null
          item_description: string | null
          item_id: string | null
          qty_issued: number
          qty_returned: number | null
          return_reason: string | null
          return_status: string
          unit: string | null
        }
        Insert: {
          company_id: string
          consumable_issue_id: string
          created_at?: string | null
          disposition?: string | null
          drawing_number?: string | null
          id?: string
          item_code?: string | null
          item_description?: string | null
          item_id?: string | null
          qty_issued?: number
          qty_returned?: number | null
          return_reason?: string | null
          return_status: string
          unit?: string | null
        }
        Update: {
          company_id?: string
          consumable_issue_id?: string
          created_at?: string | null
          disposition?: string | null
          drawing_number?: string | null
          id?: string
          item_code?: string | null
          item_description?: string | null
          item_id?: string | null
          qty_issued?: number
          qty_returned?: number | null
          return_reason?: string | null
          return_status?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consumable_issue_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumable_issue_lines_consumable_issue_id_fkey"
            columns: ["consumable_issue_id"]
            isOneToOne: false
            referencedRelation: "consumable_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumable_issue_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumable_issue_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumable_issue_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumable_issue_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "consumable_issue_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "consumable_issue_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "consumable_issue_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
        ]
      }
      consumable_issues: {
        Row: {
          company_id: string
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          issue_date: string
          issue_number: string
          issued_by: string
          issued_by_user_id: string | null
          issued_to: string
          notes: string | null
          status: string
          stock_action: string | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          issue_date?: string
          issue_number?: string
          issued_by: string
          issued_by_user_id?: string | null
          issued_to: string
          notes?: string | null
          status?: string
          stock_action?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          issue_date?: string
          issue_number?: string
          issued_by?: string
          issued_by_user_id?: string | null
          issued_to?: string
          notes?: string | null
          status?: string
          stock_action?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consumable_issues_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      consumable_returns: {
        Row: {
          company_id: string
          consumable_issue_line_id: string
          created_at: string
          deleted_at: string | null
          disposition: string
          id: string
          notes: string | null
          qty_returned: number
          returned_at: string
          returned_by_name: string | null
          returned_by_user_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          consumable_issue_line_id: string
          created_at?: string
          deleted_at?: string | null
          disposition: string
          id?: string
          notes?: string | null
          qty_returned: number
          returned_at?: string
          returned_by_name?: string | null
          returned_by_user_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          consumable_issue_line_id?: string
          created_at?: string
          deleted_at?: string | null
          disposition?: string
          id?: string
          notes?: string | null
          qty_returned?: number
          returned_at?: string
          returned_by_name?: string | null
          returned_by_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consumable_returns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumable_returns_consumable_issue_line_id_fkey"
            columns: ["consumable_issue_line_id"]
            isOneToOne: false
            referencedRelation: "consumable_issue_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_master_bindings: {
        Row: {
          company_id: string
          confirmed_at: string
          confirmed_by: string | null
          id: string
          item_id: string
          source_text: string
          source_text_norm: string
        }
        Insert: {
          company_id: string
          confirmed_at?: string
          confirmed_by?: string | null
          id?: string
          item_id: string
          source_text: string
          source_text_norm: string
        }
        Update: {
          company_id?: string
          confirmed_at?: string
          confirmed_by?: string | null
          id?: string
          item_id?: string
          source_text?: string
          source_text_norm?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_master_bindings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_master_bindings_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_master_bindings_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_master_bindings_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_master_bindings_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "cost_master_bindings_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "cost_master_bindings_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "cost_master_bindings_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
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
          is_rework: boolean | null
          item_code: string | null
          item_id: string | null
          jigs_sent: Json | null
          job_card_id: string | null
          job_card_link_reviewed: boolean
          job_work_id: string | null
          job_work_number: string | null
          job_work_step_id: string | null
          material_type: string | null
          nature_of_process: string | null
          parent_dc_line_id: string | null
          processing_log_id: string | null
          qty_accepted: number | null
          qty_kg: number | null
          qty_kgs: number | null
          qty_nos: number | null
          qty_received: number | null
          qty_rejected: number | null
          qty_sft: number | null
          quantity: number | null
          quantity_2: number | null
          rate: number | null
          rate_basis: string
          rejection_action: string | null
          rejection_reason: string | null
          remarks: string | null
          return_status: string | null
          returned_qty_2: number | null
          returned_qty_kg: number | null
          returned_qty_nos: number | null
          returned_qty_rejected_kg: number | null
          returned_qty_rejected_nos: number | null
          returned_qty_rejected_sft: number | null
          returned_qty_sft: number | null
          rework_cycle: number | null
          route_id: string | null
          serial_number: number
          stage_name: string | null
          stage_number: number | null
          step_number: number | null
          total_stages: number | null
          unit: string | null
          unit_2: string | null
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
          is_rework?: boolean | null
          item_code?: string | null
          item_id?: string | null
          jigs_sent?: Json | null
          job_card_id?: string | null
          job_card_link_reviewed?: boolean
          job_work_id?: string | null
          job_work_number?: string | null
          job_work_step_id?: string | null
          material_type?: string | null
          nature_of_process?: string | null
          parent_dc_line_id?: string | null
          processing_log_id?: string | null
          qty_accepted?: number | null
          qty_kg?: number | null
          qty_kgs?: number | null
          qty_nos?: number | null
          qty_received?: number | null
          qty_rejected?: number | null
          qty_sft?: number | null
          quantity?: number | null
          quantity_2?: number | null
          rate?: number | null
          rate_basis?: string
          rejection_action?: string | null
          rejection_reason?: string | null
          remarks?: string | null
          return_status?: string | null
          returned_qty_2?: number | null
          returned_qty_kg?: number | null
          returned_qty_nos?: number | null
          returned_qty_rejected_kg?: number | null
          returned_qty_rejected_nos?: number | null
          returned_qty_rejected_sft?: number | null
          returned_qty_sft?: number | null
          rework_cycle?: number | null
          route_id?: string | null
          serial_number: number
          stage_name?: string | null
          stage_number?: number | null
          step_number?: number | null
          total_stages?: number | null
          unit?: string | null
          unit_2?: string | null
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
          is_rework?: boolean | null
          item_code?: string | null
          item_id?: string | null
          jigs_sent?: Json | null
          job_card_id?: string | null
          job_card_link_reviewed?: boolean
          job_work_id?: string | null
          job_work_number?: string | null
          job_work_step_id?: string | null
          material_type?: string | null
          nature_of_process?: string | null
          parent_dc_line_id?: string | null
          processing_log_id?: string | null
          qty_accepted?: number | null
          qty_kg?: number | null
          qty_kgs?: number | null
          qty_nos?: number | null
          qty_received?: number | null
          qty_rejected?: number | null
          qty_sft?: number | null
          quantity?: number | null
          quantity_2?: number | null
          rate?: number | null
          rate_basis?: string
          rejection_action?: string | null
          rejection_reason?: string | null
          remarks?: string | null
          return_status?: string | null
          returned_qty_2?: number | null
          returned_qty_kg?: number | null
          returned_qty_nos?: number | null
          returned_qty_rejected_kg?: number | null
          returned_qty_rejected_nos?: number | null
          returned_qty_rejected_sft?: number | null
          returned_qty_sft?: number | null
          rework_cycle?: number | null
          route_id?: string | null
          serial_number?: number
          stage_name?: string | null
          stage_number?: number | null
          step_number?: number | null
          total_stages?: number | null
          unit?: string | null
          unit_2?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dc_line_items_dc_id_fkey"
            columns: ["dc_id"]
            isOneToOne: false
            referencedRelation: "delivery_challans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dc_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dc_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dc_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dc_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "dc_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "dc_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "dc_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "dc_line_items_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_card_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dc_line_items_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dc_line_items_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "v_job_card_status"
            referencedColumns: ["job_card_id"]
          },
          {
            foreignKeyName: "dc_line_items_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "wip_register"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dc_line_items_job_work_id_fkey"
            columns: ["job_work_id"]
            isOneToOne: false
            referencedRelation: "job_card_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dc_line_items_job_work_id_fkey"
            columns: ["job_work_id"]
            isOneToOne: false
            referencedRelation: "job_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dc_line_items_job_work_id_fkey"
            columns: ["job_work_id"]
            isOneToOne: false
            referencedRelation: "v_job_card_status"
            referencedColumns: ["job_card_id"]
          },
          {
            foreignKeyName: "dc_line_items_job_work_id_fkey"
            columns: ["job_work_id"]
            isOneToOne: false
            referencedRelation: "wip_register"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dc_line_items_job_work_step_id_fkey"
            columns: ["job_work_step_id"]
            isOneToOne: false
            referencedRelation: "job_card_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dc_line_items_job_work_step_id_fkey"
            columns: ["job_work_step_id"]
            isOneToOne: false
            referencedRelation: "wip_register"
            referencedColumns: ["current_step_id"]
          },
          {
            foreignKeyName: "dc_line_items_parent_dc_line_id_fkey"
            columns: ["parent_dc_line_id"]
            isOneToOne: false
            referencedRelation: "dc_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dc_line_items_processing_log_id_fkey"
            columns: ["processing_log_id"]
            isOneToOne: false
            referencedRelation: "component_processing_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dc_line_items_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "bom_processing_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      dedup_decisions: {
        Row: {
          action: string
          cluster: string
          description: string | null
          id: number
          item_code: string
          resolution_note: string | null
          resolved_item_id: string | null
          stock_hint: number | null
        }
        Insert: {
          action: string
          cluster: string
          description?: string | null
          id?: never
          item_code: string
          resolution_note?: string | null
          resolved_item_id?: string | null
          stock_hint?: number | null
        }
        Update: {
          action?: string
          cluster?: string
          description?: string | null
          id?: never
          item_code?: string
          resolution_note?: string | null
          resolved_item_id?: string | null
          stock_hint?: number | null
        }
        Relationships: []
      }
      delivery_challans: {
        Row: {
          approval_requested_at: string | null
          approval_requested_by: string | null
          approved_at: string | null
          approved_by: string | null
          approx_value: number | null
          approximate_value: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cgst_amount: number | null
          challan_category: string | null
          checked_by: string | null
          company_id: string | null
          created_at: string
          currency: string | null
          currency_symbol: string | null
          dc_date: string
          dc_number: string
          dc_type: string
          deletion_reason: string | null
          driver_contact: string | null
          driver_name: string | null
          exchange_rate: number | null
          grand_total: number | null
          gst_rate: number | null
          id: string
          igst_amount: number | null
          internal_remarks: string | null
          issued_at: string | null
          job_work_id: string | null
          job_work_number: string | null
          nature_of_job_work: string | null
          party_address: string | null
          party_contact_person: string | null
          party_email: string | null
          party_gstin: string | null
          party_id: string | null
          party_name: string | null
          party_phone: string | null
          party_state_code: string | null
          po_date: string | null
          po_reference: string | null
          prepared_by: string | null
          reference_number: string | null
          rejection_noted: boolean
          rejection_reason: string | null
          return_due_date: string | null
          rule45_due_date: string | null
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
          approval_requested_at?: string | null
          approval_requested_by?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approx_value?: number | null
          approximate_value?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cgst_amount?: number | null
          challan_category?: string | null
          checked_by?: string | null
          company_id?: string | null
          created_at?: string
          currency?: string | null
          currency_symbol?: string | null
          dc_date?: string
          dc_number: string
          dc_type?: string
          deletion_reason?: string | null
          driver_contact?: string | null
          driver_name?: string | null
          exchange_rate?: number | null
          grand_total?: number | null
          gst_rate?: number | null
          id?: string
          igst_amount?: number | null
          internal_remarks?: string | null
          issued_at?: string | null
          job_work_id?: string | null
          job_work_number?: string | null
          nature_of_job_work?: string | null
          party_address?: string | null
          party_contact_person?: string | null
          party_email?: string | null
          party_gstin?: string | null
          party_id?: string | null
          party_name?: string | null
          party_phone?: string | null
          party_state_code?: string | null
          po_date?: string | null
          po_reference?: string | null
          prepared_by?: string | null
          reference_number?: string | null
          rejection_noted?: boolean
          rejection_reason?: string | null
          return_due_date?: string | null
          rule45_due_date?: string | null
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
          approval_requested_at?: string | null
          approval_requested_by?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approx_value?: number | null
          approximate_value?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cgst_amount?: number | null
          challan_category?: string | null
          checked_by?: string | null
          company_id?: string | null
          created_at?: string
          currency?: string | null
          currency_symbol?: string | null
          dc_date?: string
          dc_number?: string
          dc_type?: string
          deletion_reason?: string | null
          driver_contact?: string | null
          driver_name?: string | null
          exchange_rate?: number | null
          grand_total?: number | null
          gst_rate?: number | null
          id?: string
          igst_amount?: number | null
          internal_remarks?: string | null
          issued_at?: string | null
          job_work_id?: string | null
          job_work_number?: string | null
          nature_of_job_work?: string | null
          party_address?: string | null
          party_contact_person?: string | null
          party_email?: string | null
          party_gstin?: string | null
          party_id?: string | null
          party_name?: string | null
          party_phone?: string | null
          party_state_code?: string | null
          po_date?: string | null
          po_reference?: string | null
          prepared_by?: string | null
          reference_number?: string | null
          rejection_noted?: boolean
          rejection_reason?: string | null
          return_due_date?: string | null
          rule45_due_date?: string | null
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
            foreignKeyName: "delivery_challans_job_work_id_fkey"
            columns: ["job_work_id"]
            isOneToOne: false
            referencedRelation: "job_card_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_challans_job_work_id_fkey"
            columns: ["job_work_id"]
            isOneToOne: false
            referencedRelation: "job_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_challans_job_work_id_fkey"
            columns: ["job_work_id"]
            isOneToOne: false
            referencedRelation: "v_job_card_status"
            referencedColumns: ["job_card_id"]
          },
          {
            foreignKeyName: "delivery_challans_job_work_id_fkey"
            columns: ["job_work_id"]
            isOneToOne: false
            referencedRelation: "wip_register"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_challans_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_challans_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "vendor_scorecard"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      delivery_contacts: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_notes: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cgst_amount: number
          company_id: string
          created_at: string
          customer_address: string | null
          customer_gstin: string | null
          customer_id: string | null
          customer_name: string | null
          customer_state_code: string | null
          dn_date: string
          dn_number: string
          driver_name: string | null
          grand_total: number
          gst_rate: number
          id: string
          igst_amount: number
          internal_remarks: string | null
          issued_at: string | null
          lr_date: string | null
          lr_number: string | null
          reference_number: string | null
          sgst_amount: number
          shipping_address: string | null
          so_id: string | null
          so_number: string | null
          special_instructions: string | null
          status: string
          sub_total: number
          total_gst: number
          transporter: string | null
          updated_at: string
          vehicle_number: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cgst_amount?: number
          company_id: string
          created_at?: string
          customer_address?: string | null
          customer_gstin?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_state_code?: string | null
          dn_date?: string
          dn_number?: string
          driver_name?: string | null
          grand_total?: number
          gst_rate?: number
          id?: string
          igst_amount?: number
          internal_remarks?: string | null
          issued_at?: string | null
          lr_date?: string | null
          lr_number?: string | null
          reference_number?: string | null
          sgst_amount?: number
          shipping_address?: string | null
          so_id?: string | null
          so_number?: string | null
          special_instructions?: string | null
          status?: string
          sub_total?: number
          total_gst?: number
          transporter?: string | null
          updated_at?: string
          vehicle_number?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cgst_amount?: number
          company_id?: string
          created_at?: string
          customer_address?: string | null
          customer_gstin?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_state_code?: string | null
          dn_date?: string
          dn_number?: string
          driver_name?: string | null
          grand_total?: number
          gst_rate?: number
          id?: string
          igst_amount?: number
          internal_remarks?: string | null
          issued_at?: string | null
          lr_date?: string | null
          lr_number?: string | null
          reference_number?: string | null
          sgst_amount?: number
          shipping_address?: string | null
          so_id?: string | null
          so_number?: string | null
          special_instructions?: string | null
          status?: string
          sub_total?: number
          total_gst?: number
          transporter?: string | null
          updated_at?: string
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "vendor_scorecard"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "dispatch_notes_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_record_items: {
        Row: {
          company_id: string | null
          created_at: string | null
          dispatch_record_id: string | null
          id: string
          item_code: string | null
          item_description: string | null
          item_id: string | null
          notes: string | null
          quantity: number | null
          serial_number: string | null
          serial_number_id: string | null
          unit: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          dispatch_record_id?: string | null
          id?: string
          item_code?: string | null
          item_description?: string | null
          item_id?: string | null
          notes?: string | null
          quantity?: number | null
          serial_number?: string | null
          serial_number_id?: string | null
          unit?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          dispatch_record_id?: string | null
          id?: string
          item_code?: string | null
          item_description?: string | null
          item_id?: string | null
          notes?: string | null
          quantity?: number | null
          serial_number?: string | null
          serial_number_id?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_record_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_record_items_dispatch_record_id_fkey"
            columns: ["dispatch_record_id"]
            isOneToOne: false
            referencedRelation: "dispatch_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_record_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_record_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_record_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_record_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "dispatch_record_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "dispatch_record_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "dispatch_record_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "dispatch_record_items_serial_number_id_fkey"
            columns: ["serial_number_id"]
            isOneToOne: false
            referencedRelation: "serial_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_records: {
        Row: {
          company_id: string | null
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          customer_po_ref: string | null
          delivered_at: string | null
          dispatch_date: string
          dispatched_at: string | null
          dispatched_by: string | null
          dr_number: string
          driver_contact: string | null
          driver_name: string | null
          id: string
          notes: string | null
          status: string | null
          updated_at: string | null
          vehicle_number: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_po_ref?: string | null
          delivered_at?: string | null
          dispatch_date?: string
          dispatched_at?: string | null
          dispatched_by?: string | null
          dr_number: string
          driver_contact?: string | null
          driver_name?: string | null
          id?: string
          notes?: string | null
          status?: string | null
          updated_at?: string | null
          vehicle_number?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_po_ref?: string | null
          delivered_at?: string | null
          dispatch_date?: string
          dispatched_at?: string | null
          dispatched_by?: string | null
          dr_number?: string
          driver_contact?: string | null
          driver_name?: string | null
          id?: string
          notes?: string | null
          status?: string | null
          updated_at?: string | null
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_records_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_records_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "vendor_scorecard"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      dn_line_items: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          description: string
          dn_id: string
          id: string
          item_code: string | null
          quantity: number
          rate: number
          remarks: string | null
          serial_number: number
          serial_number_ref: string | null
          unit: string
        }
        Insert: {
          amount?: number
          company_id: string
          created_at?: string
          description?: string
          dn_id: string
          id?: string
          item_code?: string | null
          quantity?: number
          rate?: number
          remarks?: string | null
          serial_number: number
          serial_number_ref?: string | null
          unit?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          description?: string
          dn_id?: string
          id?: string
          item_code?: string | null
          quantity?: number
          rate?: number
          remarks?: string | null
          serial_number?: number
          serial_number_ref?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "dn_line_items_dn_id_fkey"
            columns: ["dn_id"]
            isOneToOne: false
            referencedRelation: "dispatch_notes"
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
          show_hsn: boolean | null
          show_logo: boolean | null
          show_nature_of_process: boolean | null
          show_not_for_sale: boolean | null
          show_rate_amount: boolean | null
          show_signature: boolean | null
          show_vehicle_details: boolean | null
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
          show_hsn?: boolean | null
          show_logo?: boolean | null
          show_nature_of_process?: boolean | null
          show_not_for_sale?: boolean | null
          show_rate_amount?: boolean | null
          show_signature?: boolean | null
          show_vehicle_details?: boolean | null
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
          show_hsn?: boolean | null
          show_logo?: boolean | null
          show_nature_of_process?: boolean | null
          show_not_for_sale?: boolean | null
          show_rate_amount?: boolean | null
          show_signature?: boolean | null
          show_vehicle_details?: boolean | null
          template_config?: Json | null
          terms_and_conditions?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      edit_requests: {
        Row: {
          applied_at: string | null
          company_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          previous_values: Json
          proposed_changes: Json
          reason: string | null
          record_id: string
          requested_at: string
          requested_by: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          table_name: string
        }
        Insert: {
          applied_at?: string | null
          company_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          previous_values?: Json
          proposed_changes: Json
          reason?: string | null
          record_id: string
          requested_at?: string
          requested_by: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          table_name: string
        }
        Update: {
          applied_at?: string | null
          company_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          previous_values?: Json
          proposed_changes?: Json
          reason?: string | null
          record_id?: string
          requested_at?: string
          requested_by?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "edit_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edit_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edit_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fat_certificates: {
        Row: {
          assembly_order_id: string | null
          assembly_order_number: string | null
          company_id: string | null
          completed_at: string | null
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          customer_po_ref: string | null
          drawing_number: string | null
          drawing_revision: string | null
          fat_date: string
          fat_number: string
          id: string
          item_code: string | null
          item_description: string | null
          item_id: string | null
          notes: string | null
          overall_result: string | null
          serial_number: string | null
          serial_number_id: string | null
          status: string | null
          test_date: string | null
          tested_by: string | null
          updated_at: string | null
          witnessed_by: string | null
        }
        Insert: {
          assembly_order_id?: string | null
          assembly_order_number?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_po_ref?: string | null
          drawing_number?: string | null
          drawing_revision?: string | null
          fat_date?: string
          fat_number: string
          id?: string
          item_code?: string | null
          item_description?: string | null
          item_id?: string | null
          notes?: string | null
          overall_result?: string | null
          serial_number?: string | null
          serial_number_id?: string | null
          status?: string | null
          test_date?: string | null
          tested_by?: string | null
          updated_at?: string | null
          witnessed_by?: string | null
        }
        Update: {
          assembly_order_id?: string | null
          assembly_order_number?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_po_ref?: string | null
          drawing_number?: string | null
          drawing_revision?: string | null
          fat_date?: string
          fat_number?: string
          id?: string
          item_code?: string | null
          item_description?: string | null
          item_id?: string | null
          notes?: string | null
          overall_result?: string | null
          serial_number?: string | null
          serial_number_id?: string | null
          status?: string | null
          test_date?: string | null
          tested_by?: string | null
          updated_at?: string | null
          witnessed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fat_certificates_assembly_order_id_fkey"
            columns: ["assembly_order_id"]
            isOneToOne: false
            referencedRelation: "assembly_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fat_certificates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fat_certificates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "vendor_scorecard"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "fat_certificates_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fat_certificates_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fat_certificates_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fat_certificates_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "fat_certificates_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "fat_certificates_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "fat_certificates_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "fat_certificates_serial_number_id_fkey"
            columns: ["serial_number_id"]
            isOneToOne: false
            referencedRelation: "serial_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      fat_test_results: {
        Row: {
          actual_value: string | null
          company_id: string | null
          created_at: string | null
          fat_certificate_id: string | null
          id: string
          remarks: string | null
          required_value: string | null
          result: string | null
          sort_order: number | null
          test_name: string
          test_standard: string | null
          unit: string | null
        }
        Insert: {
          actual_value?: string | null
          company_id?: string | null
          created_at?: string | null
          fat_certificate_id?: string | null
          id?: string
          remarks?: string | null
          required_value?: string | null
          result?: string | null
          sort_order?: number | null
          test_name: string
          test_standard?: string | null
          unit?: string | null
        }
        Update: {
          actual_value?: string | null
          company_id?: string | null
          created_at?: string | null
          fat_certificate_id?: string | null
          id?: string
          remarks?: string | null
          required_value?: string | null
          result?: string | null
          sort_order?: number | null
          test_name?: string
          test_standard?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fat_test_results_fat_certificate_id_fkey"
            columns: ["fat_certificate_id"]
            isOneToOne: false
            referencedRelation: "fat_certificates"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_logs: {
        Row: {
          company_id: string
          created_at: string
          document_id: string
          document_number: string | null
          document_type: string
          follow_up_1_at: string | null
          follow_up_1_note: string | null
          follow_up_1_type: string | null
          follow_up_2_at: string | null
          follow_up_2_note: string | null
          follow_up_2_type: string | null
          follow_up_3_at: string | null
          follow_up_3_note: string | null
          follow_up_3_type: string | null
          follow_up_4_at: string | null
          follow_up_4_note: string | null
          follow_up_4_type: string | null
          id: string
          manual_received: boolean
          manual_received_at: string | null
          manual_received_by: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          document_id: string
          document_number?: string | null
          document_type: string
          follow_up_1_at?: string | null
          follow_up_1_note?: string | null
          follow_up_1_type?: string | null
          follow_up_2_at?: string | null
          follow_up_2_note?: string | null
          follow_up_2_type?: string | null
          follow_up_3_at?: string | null
          follow_up_3_note?: string | null
          follow_up_3_type?: string | null
          follow_up_4_at?: string | null
          follow_up_4_note?: string | null
          follow_up_4_type?: string | null
          id?: string
          manual_received?: boolean
          manual_received_at?: string | null
          manual_received_by?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          document_id?: string
          document_number?: string | null
          document_type?: string
          follow_up_1_at?: string | null
          follow_up_1_note?: string | null
          follow_up_1_type?: string | null
          follow_up_2_at?: string | null
          follow_up_2_note?: string | null
          follow_up_2_type?: string | null
          follow_up_3_at?: string | null
          follow_up_3_note?: string | null
          follow_up_3_type?: string | null
          follow_up_4_at?: string | null
          follow_up_4_note?: string | null
          follow_up_4_type?: string | null
          id?: string
          manual_received?: boolean
          manual_received_at?: string | null
          manual_received_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      grn_inspection_lines: {
        Row: {
          characteristic: string
          company_id: string | null
          created_at: string | null
          grn_id: string
          id: string
          measuring_instrument: string | null
          non_conformance_reason: string | null
          qty_checked: number | null
          result: string | null
          sl_no: number
          specification: string | null
        }
        Insert: {
          characteristic: string
          company_id?: string | null
          created_at?: string | null
          grn_id: string
          id?: string
          measuring_instrument?: string | null
          non_conformance_reason?: string | null
          qty_checked?: number | null
          result?: string | null
          sl_no: number
          specification?: string | null
        }
        Update: {
          characteristic?: string
          company_id?: string | null
          created_at?: string | null
          grn_id?: string
          id?: string
          measuring_instrument?: string | null
          non_conformance_reason?: string | null
          qty_checked?: number | null
          result?: string | null
          sl_no?: number
          specification?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grn_inspection_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_inspection_lines_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "grns"
            referencedColumns: ["id"]
          },
        ]
      }
      grn_line_items: {
        Row: {
          accepted_qty: number | null
          accepted_qty_2: number | null
          accepted_quantity: number | null
          company_id: string | null
          condition_on_arrival: string | null
          conforming_qty: number | null
          conforming_qty_2: number | null
          created_at: string
          damaged_qty: number | null
          damaged_reason: string | null
          dc_line_item_id: string | null
          description: string
          deviation_description: string | null
          disposal_method: string | null
          disposition: string | null
          drawing_number: string | null
          final_grn_auto_detected: boolean | null
          final_grn_reason: string | null
          grn_id: string
          id: string
          identity_matched_qty: number | null
          identity_mismatch_remarks: string | null
          identity_not_matched_qty: number | null
          inspection_method: string | null
          is_final_grn: boolean | null
          is_replacement: boolean | null
          item_id: string | null
          item_identity_match: boolean | null
          jig_confirmed: boolean | null
          jigs_returned: Json | null
          jigs_sent: Json | null
          legacy_deemed_confirmed: boolean
          legacy_orphaned_dc_line_item_id: string | null
          matching_units: number | null
          mismatch_disposition: string | null
          mismatch_reason: string | null
          nature_of_process: string | null
          non_conformance_type: string | null
          non_conforming_qty: number | null
          non_matching_units: number | null
          ordered_qty: number | null
          ordered_qty_2: number | null
          over_receipt_decision: string | null
          over_receipt_qty: number | null
          packing_intact: boolean | null
          parent_grn_line_id: string | null
          pending_quantity: number | null
          po_line_item_id: string | null
          po_quantity: number | null
          previously_received: number | null
          previously_received_qty: number | null
          product_match: string | null
          qc_inspected_at: string | null
          qc_inspected_by: string | null
          qc_notes: string | null
          qty_inspected: number | null
          qty_matched: boolean | null
          qty_matched_qty: number | null
          quantitative_notes: string | null
          quantitative_verified_at: string | null
          quantitative_verified_by: string | null
          rate_basis: string
          received_now: number | null
          received_now_2: number | null
          received_qty: number | null
          receiving_now: number | null
          reference_drawing: string | null
          rejected_qty: number | null
          rejected_quantity: number | null
          rejection_action: string | null
          rejection_reason: string | null
          remarks: string | null
          replacement_cycle: number | null
          serial_number: number
          stage1_checked_by: string | null
          stage1_complete: boolean | null
          stage1_date: string | null
          stage1_rejected_qty: number | null
          stage1_verified_by: string | null
          stage2_approved_by: string | null
          stage2_complete: boolean | null
          stage2_date: string | null
          stage2_inspected_by: string | null
          stock_posted_at: string | null
          store_confirmation_notes: string | null
          store_confirmed: boolean | null
          store_confirmed_at: string | null
          store_confirmed_by: string | null
          store_confirmed_qty: number | null
          store_location: string | null
          unit: string | null
          unit_2: string | null
          unit_rate: number | null
          vendor_invoice_ref: string | null
        }
        Insert: {
          accepted_qty?: number | null
          accepted_qty_2?: number | null
          accepted_quantity?: number | null
          company_id?: string | null
          condition_on_arrival?: string | null
          conforming_qty?: number | null
          conforming_qty_2?: number | null
          created_at?: string
          damaged_qty?: number | null
          damaged_reason?: string | null
          dc_line_item_id?: string | null
          description: string
          deviation_description?: string | null
          disposal_method?: string | null
          disposition?: string | null
          drawing_number?: string | null
          final_grn_auto_detected?: boolean | null
          final_grn_reason?: string | null
          grn_id: string
          id?: string
          identity_matched_qty?: number | null
          identity_mismatch_remarks?: string | null
          identity_not_matched_qty?: number | null
          inspection_method?: string | null
          is_final_grn?: boolean | null
          is_replacement?: boolean | null
          item_id?: string | null
          item_identity_match?: boolean | null
          jig_confirmed?: boolean | null
          jigs_returned?: Json | null
          jigs_sent?: Json | null
          legacy_deemed_confirmed?: boolean
          legacy_orphaned_dc_line_item_id?: string | null
          matching_units?: number | null
          mismatch_disposition?: string | null
          mismatch_reason?: string | null
          nature_of_process?: string | null
          non_conformance_type?: string | null
          non_conforming_qty?: number | null
          non_matching_units?: number | null
          ordered_qty?: number | null
          ordered_qty_2?: number | null
          over_receipt_decision?: string | null
          over_receipt_qty?: number | null
          packing_intact?: boolean | null
          parent_grn_line_id?: string | null
          pending_quantity?: number | null
          po_line_item_id?: string | null
          po_quantity?: number | null
          previously_received?: number | null
          previously_received_qty?: number | null
          product_match?: string | null
          qc_inspected_at?: string | null
          qc_inspected_by?: string | null
          qc_notes?: string | null
          qty_inspected?: number | null
          qty_matched?: boolean | null
          qty_matched_qty?: number | null
          quantitative_notes?: string | null
          quantitative_verified_at?: string | null
          quantitative_verified_by?: string | null
          rate_basis?: string
          received_now?: number | null
          received_now_2?: number | null
          received_qty?: number | null
          receiving_now?: number | null
          reference_drawing?: string | null
          rejected_qty?: number | null
          rejected_quantity?: number | null
          rejection_action?: string | null
          rejection_reason?: string | null
          remarks?: string | null
          replacement_cycle?: number | null
          serial_number: number
          stage1_checked_by?: string | null
          stage1_complete?: boolean | null
          stage1_date?: string | null
          stage1_rejected_qty?: number | null
          stage1_verified_by?: string | null
          stage2_approved_by?: string | null
          stage2_complete?: boolean | null
          stage2_date?: string | null
          stage2_inspected_by?: string | null
          stock_posted_at?: string | null
          store_confirmation_notes?: string | null
          store_confirmed?: boolean | null
          store_confirmed_at?: string | null
          store_confirmed_by?: string | null
          store_confirmed_qty?: number | null
          store_location?: string | null
          unit?: string | null
          unit_2?: string | null
          unit_rate?: number | null
          vendor_invoice_ref?: string | null
        }
        Update: {
          accepted_qty?: number | null
          accepted_qty_2?: number | null
          accepted_quantity?: number | null
          company_id?: string | null
          condition_on_arrival?: string | null
          conforming_qty?: number | null
          conforming_qty_2?: number | null
          created_at?: string
          damaged_qty?: number | null
          damaged_reason?: string | null
          dc_line_item_id?: string | null
          description?: string
          deviation_description?: string | null
          disposal_method?: string | null
          disposition?: string | null
          drawing_number?: string | null
          final_grn_auto_detected?: boolean | null
          final_grn_reason?: string | null
          grn_id?: string
          id?: string
          identity_matched_qty?: number | null
          identity_mismatch_remarks?: string | null
          identity_not_matched_qty?: number | null
          inspection_method?: string | null
          is_final_grn?: boolean | null
          is_replacement?: boolean | null
          item_id?: string | null
          item_identity_match?: boolean | null
          jig_confirmed?: boolean | null
          jigs_returned?: Json | null
          jigs_sent?: Json | null
          legacy_deemed_confirmed?: boolean
          legacy_orphaned_dc_line_item_id?: string | null
          matching_units?: number | null
          mismatch_disposition?: string | null
          mismatch_reason?: string | null
          nature_of_process?: string | null
          non_conformance_type?: string | null
          non_conforming_qty?: number | null
          non_matching_units?: number | null
          ordered_qty?: number | null
          ordered_qty_2?: number | null
          over_receipt_decision?: string | null
          over_receipt_qty?: number | null
          packing_intact?: boolean | null
          parent_grn_line_id?: string | null
          pending_quantity?: number | null
          po_line_item_id?: string | null
          po_quantity?: number | null
          previously_received?: number | null
          previously_received_qty?: number | null
          product_match?: string | null
          qc_inspected_at?: string | null
          qc_inspected_by?: string | null
          qc_notes?: string | null
          qty_inspected?: number | null
          qty_matched?: boolean | null
          qty_matched_qty?: number | null
          quantitative_notes?: string | null
          quantitative_verified_at?: string | null
          quantitative_verified_by?: string | null
          rate_basis?: string
          received_now?: number | null
          received_now_2?: number | null
          received_qty?: number | null
          receiving_now?: number | null
          reference_drawing?: string | null
          rejected_qty?: number | null
          rejected_quantity?: number | null
          rejection_action?: string | null
          rejection_reason?: string | null
          remarks?: string | null
          replacement_cycle?: number | null
          serial_number?: number
          stage1_checked_by?: string | null
          stage1_complete?: boolean | null
          stage1_date?: string | null
          stage1_rejected_qty?: number | null
          stage1_verified_by?: string | null
          stage2_approved_by?: string | null
          stage2_complete?: boolean | null
          stage2_date?: string | null
          stage2_inspected_by?: string | null
          stock_posted_at?: string | null
          store_confirmation_notes?: string | null
          store_confirmed?: boolean | null
          store_confirmed_at?: string | null
          store_confirmed_by?: string | null
          store_confirmed_qty?: number | null
          store_location?: string | null
          unit?: string | null
          unit_2?: string | null
          unit_rate?: number | null
          vendor_invoice_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_grn_line_items_dc_line_item"
            columns: ["dc_line_item_id"]
            isOneToOne: false
            referencedRelation: "dc_line_items"
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
            foreignKeyName: "grn_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "grn_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "grn_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "grn_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "grn_line_items_parent_grn_line_id_fkey"
            columns: ["parent_grn_line_id"]
            isOneToOne: false
            referencedRelation: "grn_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_line_items_parent_grn_line_id_fkey"
            columns: ["parent_grn_line_id"]
            isOneToOne: false
            referencedRelation: "v_grn_lines_available_for_conversion"
            referencedColumns: ["grn_line_item_id"]
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
      grn_qc_measurements: {
        Row: {
          characteristic: string
          company_id: string | null
          conforming_qty: number | null
          conforming_qty_2: number | null
          created_at: string | null
          grn_id: string
          grn_line_item_id: string
          id: string
          measuring_instrument: string | null
          non_conforming_qty: number | null
          qty_checked: number | null
          remarks: string | null
          result: string | null
          sample_1: string | null
          sample_2: string | null
          sample_3: string | null
          sample_4: string | null
          sample_5: string | null
          sl_no: number
          specification: string | null
          updated_at: string | null
        }
        Insert: {
          characteristic: string
          company_id?: string | null
          conforming_qty?: number | null
          conforming_qty_2?: number | null
          created_at?: string | null
          grn_id: string
          grn_line_item_id: string
          id?: string
          measuring_instrument?: string | null
          non_conforming_qty?: number | null
          qty_checked?: number | null
          remarks?: string | null
          result?: string | null
          sample_1?: string | null
          sample_2?: string | null
          sample_3?: string | null
          sample_4?: string | null
          sample_5?: string | null
          sl_no: number
          specification?: string | null
          updated_at?: string | null
        }
        Update: {
          characteristic?: string
          company_id?: string | null
          conforming_qty?: number | null
          conforming_qty_2?: number | null
          created_at?: string | null
          grn_id?: string
          grn_line_item_id?: string
          id?: string
          measuring_instrument?: string | null
          non_conforming_qty?: number | null
          qty_checked?: number | null
          remarks?: string | null
          result?: string | null
          sample_1?: string | null
          sample_2?: string | null
          sample_3?: string | null
          sample_4?: string | null
          sample_5?: string | null
          sl_no?: number
          specification?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grn_qc_measurements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_qc_measurements_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "grns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_qc_measurements_grn_line_item_id_fkey"
            columns: ["grn_line_item_id"]
            isOneToOne: false
            referencedRelation: "grn_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_qc_measurements_grn_line_item_id_fkey"
            columns: ["grn_line_item_id"]
            isOneToOne: false
            referencedRelation: "v_grn_lines_available_for_conversion"
            referencedColumns: ["grn_line_item_id"]
          },
        ]
      }
      grn_receipt_events: {
        Row: {
          company_id: string | null
          created_at: string | null
          driver_contact: string | null
          driver_name: string | null
          grn_id: string | null
          id: string
          notes: string | null
          receipt_date: string
          vehicle_number: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          driver_contact?: string | null
          driver_name?: string | null
          grn_id?: string | null
          id?: string
          notes?: string | null
          receipt_date?: string
          vehicle_number?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          driver_contact?: string | null
          driver_name?: string | null
          grn_id?: string | null
          id?: string
          notes?: string | null
          receipt_date?: string
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grn_receipt_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_receipt_events_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "grns"
            referencedColumns: ["id"]
          },
        ]
      }
      grn_scrap_items: {
        Row: {
          company_id: string | null
          created_at: string | null
          grn_id: string
          id: string
          material_type: string
          notes: string | null
          quantity: number | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          grn_id: string
          id?: string
          material_type: string
          notes?: string | null
          quantity?: number | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          grn_id?: string
          id?: string
          material_type?: string
          notes?: string | null
          quantity?: number | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grn_scrap_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_scrap_items_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "grns"
            referencedColumns: ["id"]
          },
        ]
      }
      grns: {
        Row: {
          acceptance_basis: string
          company_id: string | null
          created_at: string
          deletion_reason: string | null
          driver_contact: string | null
          driver_name: string | null
          final_grn_reason: string | null
          grn_date: string
          grn_number: string
          grn_stage: string | null
          grn_type: string | null
          id: string
          inward_fy: number | null
          inward_sl_no: number | null
          is_final_grn: boolean | null
          legacy_deemed_closed: boolean
          linked_dc_id: string | null
          linked_dc_number: string | null
          lr_reference: string | null
          notes: string | null
          overall_quality_verdict: string | null
          partial_store_confirmed: boolean | null
          po_id: string | null
          po_number: string | null
          qc_approved_by: string | null
          qc_email_sent_at: string | null
          qc_inspected_by: string | null
          qc_prepared_by: string | null
          qc_remarks: string | null
          quality_completed_at: string | null
          quality_completed_by: string | null
          quality_remarks: string | null
          quantitative_completed_at: string | null
          quantitative_completed_by: string | null
          received_by: string | null
          recorded_at: string | null
          scrap_notes: string | null
          scrap_returned: boolean | null
          status: string | null
          store_confirmed: boolean | null
          store_confirmed_at: string | null
          store_confirmed_by: string | null
          store_location: string | null
          store_notes: string | null
          total_accepted: number | null
          total_accepted_qty: number | null
          total_ordered_qty: number | null
          total_received: number | null
          total_received_qty: number | null
          total_rejected: number | null
          transporter_name: string | null
          updated_at: string
          vehicle_number: string | null
          vendor_id: string | null
          vendor_invoice_date: string | null
          vendor_invoice_number: string | null
          vendor_name: string | null
          verified_at: string | null
        }
        Insert: {
          acceptance_basis?: string
          company_id?: string | null
          created_at?: string
          deletion_reason?: string | null
          driver_contact?: string | null
          driver_name?: string | null
          final_grn_reason?: string | null
          grn_date?: string
          grn_number: string
          grn_stage?: string | null
          grn_type?: string | null
          id?: string
          inward_fy?: number | null
          inward_sl_no?: number | null
          is_final_grn?: boolean | null
          legacy_deemed_closed?: boolean
          linked_dc_id?: string | null
          linked_dc_number?: string | null
          lr_reference?: string | null
          notes?: string | null
          overall_quality_verdict?: string | null
          partial_store_confirmed?: boolean | null
          po_id?: string | null
          po_number?: string | null
          qc_approved_by?: string | null
          qc_email_sent_at?: string | null
          qc_inspected_by?: string | null
          qc_prepared_by?: string | null
          qc_remarks?: string | null
          quality_completed_at?: string | null
          quality_completed_by?: string | null
          quality_remarks?: string | null
          quantitative_completed_at?: string | null
          quantitative_completed_by?: string | null
          received_by?: string | null
          recorded_at?: string | null
          scrap_notes?: string | null
          scrap_returned?: boolean | null
          status?: string | null
          store_confirmed?: boolean | null
          store_confirmed_at?: string | null
          store_confirmed_by?: string | null
          store_location?: string | null
          store_notes?: string | null
          total_accepted?: number | null
          total_accepted_qty?: number | null
          total_ordered_qty?: number | null
          total_received?: number | null
          total_received_qty?: number | null
          total_rejected?: number | null
          transporter_name?: string | null
          updated_at?: string
          vehicle_number?: string | null
          vendor_id?: string | null
          vendor_invoice_date?: string | null
          vendor_invoice_number?: string | null
          vendor_name?: string | null
          verified_at?: string | null
        }
        Update: {
          acceptance_basis?: string
          company_id?: string | null
          created_at?: string
          deletion_reason?: string | null
          driver_contact?: string | null
          driver_name?: string | null
          final_grn_reason?: string | null
          grn_date?: string
          grn_number?: string
          grn_stage?: string | null
          grn_type?: string | null
          id?: string
          inward_fy?: number | null
          inward_sl_no?: number | null
          is_final_grn?: boolean | null
          legacy_deemed_closed?: boolean
          linked_dc_id?: string | null
          linked_dc_number?: string | null
          lr_reference?: string | null
          notes?: string | null
          overall_quality_verdict?: string | null
          partial_store_confirmed?: boolean | null
          po_id?: string | null
          po_number?: string | null
          qc_approved_by?: string | null
          qc_email_sent_at?: string | null
          qc_inspected_by?: string | null
          qc_prepared_by?: string | null
          qc_remarks?: string | null
          quality_completed_at?: string | null
          quality_completed_by?: string | null
          quality_remarks?: string | null
          quantitative_completed_at?: string | null
          quantitative_completed_by?: string | null
          received_by?: string | null
          recorded_at?: string | null
          scrap_notes?: string | null
          scrap_returned?: boolean | null
          status?: string | null
          store_confirmed?: boolean | null
          store_confirmed_at?: string | null
          store_confirmed_by?: string | null
          store_location?: string | null
          store_notes?: string | null
          total_accepted?: number | null
          total_accepted_qty?: number | null
          total_ordered_qty?: number | null
          total_received?: number | null
          total_received_qty?: number | null
          total_rejected?: number | null
          transporter_name?: string | null
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
            foreignKeyName: "grns_linked_dc_id_fkey"
            columns: ["linked_dc_id"]
            isOneToOne: false
            referencedRelation: "delivery_challans"
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
          {
            foreignKeyName: "grns_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_scorecard"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          backflushed_qty: number
          cgst: number | null
          company_id: string | null
          created_at: string
          description: string
          discount_amount: number | null
          discount_percent: number | null
          drained_qty: number
          drawing_number: string | null
          gst_rate: number | null
          hsn_sac_code: string | null
          id: string
          igst: number | null
          invoice_id: string
          item_id: string | null
          line_total: number | null
          quantity: number
          serial_number: number
          sgst: number | null
          taxable_amount: number | null
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          backflushed_qty?: number
          cgst?: number | null
          company_id?: string | null
          created_at?: string
          description: string
          discount_amount?: number | null
          discount_percent?: number | null
          drained_qty?: number
          drawing_number?: string | null
          gst_rate?: number | null
          hsn_sac_code?: string | null
          id?: string
          igst?: number | null
          invoice_id: string
          item_id?: string | null
          line_total?: number | null
          quantity?: number
          serial_number: number
          sgst?: number | null
          taxable_amount?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          backflushed_qty?: number
          cgst?: number | null
          company_id?: string | null
          created_at?: string
          description?: string
          discount_amount?: number | null
          discount_percent?: number | null
          drained_qty?: number
          drawing_number?: string | null
          gst_rate?: number | null
          hsn_sac_code?: string | null
          id?: string
          igst?: number | null
          invoice_id?: string
          item_id?: string | null
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
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_sale_reconciliation"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoice_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "invoice_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "invoice_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "invoice_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
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
          cancelled_by: string | null
          cgst_amount: number | null
          company_id: string | null
          completed_by: string | null
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
          destination: string | null
          dispatch_through: string | null
          due_date: string | null
          eway_bill_number: string | null
          grand_total: number | null
          gst_rate: number | null
          id: string
          igst_amount: number | null
          internal_remarks: string | null
          invoice_date: string
          invoice_number: string | null
          issued_at: string | null
          lr_date: string | null
          lr_number: string | null
          payment_terms: string | null
          place_of_supply: string | null
          reverse_charge: boolean | null
          round_off: number | null
          serial_number_ref: string | null
          sgst_amount: number | null
          special_instructions: string | null
          status: string | null
          sub_total: number | null
          supply_type: string | null
          taxable_value: number | null
          terms_and_conditions: string | null
          total_discount: number | null
          total_gst: number | null
          transporter_name: string | null
          updated_at: string
          vehicle_number: string | null
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
          cancelled_by?: string | null
          cgst_amount?: number | null
          company_id?: string | null
          completed_by?: string | null
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
          destination?: string | null
          dispatch_through?: string | null
          due_date?: string | null
          eway_bill_number?: string | null
          grand_total?: number | null
          gst_rate?: number | null
          id?: string
          igst_amount?: number | null
          internal_remarks?: string | null
          invoice_date?: string
          invoice_number?: string | null
          issued_at?: string | null
          lr_date?: string | null
          lr_number?: string | null
          payment_terms?: string | null
          place_of_supply?: string | null
          reverse_charge?: boolean | null
          round_off?: number | null
          serial_number_ref?: string | null
          sgst_amount?: number | null
          special_instructions?: string | null
          status?: string | null
          sub_total?: number | null
          supply_type?: string | null
          taxable_value?: number | null
          terms_and_conditions?: string | null
          total_discount?: number | null
          total_gst?: number | null
          transporter_name?: string | null
          updated_at?: string
          vehicle_number?: string | null
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
          cancelled_by?: string | null
          cgst_amount?: number | null
          company_id?: string | null
          completed_by?: string | null
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
          destination?: string | null
          dispatch_through?: string | null
          due_date?: string | null
          eway_bill_number?: string | null
          grand_total?: number | null
          gst_rate?: number | null
          id?: string
          igst_amount?: number | null
          internal_remarks?: string | null
          invoice_date?: string
          invoice_number?: string | null
          issued_at?: string | null
          lr_date?: string | null
          lr_number?: string | null
          payment_terms?: string | null
          place_of_supply?: string | null
          reverse_charge?: boolean | null
          round_off?: number | null
          serial_number_ref?: string | null
          sgst_amount?: number | null
          special_instructions?: string | null
          status?: string | null
          sub_total?: number | null
          supply_type?: string | null
          taxable_value?: number | null
          terms_and_conditions?: string | null
          total_discount?: number | null
          total_gst?: number | null
          transporter_name?: string | null
          updated_at?: string
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "vendor_scorecard"
            referencedColumns: ["vendor_id"]
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
      item_classifications: {
        Row: {
          affects_bom: boolean | null
          affects_reorder: boolean | null
          affects_stock: boolean | null
          color: string | null
          company_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_system: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          affects_bom?: boolean | null
          affects_reorder?: boolean | null
          affects_stock?: boolean | null
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          affects_bom?: boolean | null
          affects_reorder?: boolean | null
          affects_stock?: boolean | null
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_classifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      item_conversion_map: {
        Row: {
          company_id: string
          component_drg_no: string
          component_item_id: string | null
          component_name: string | null
          created_at: string
          id: string
          match_status: string
          one_oltc_qty: number | null
          raw_material_item_id: string | null
          raw_material_size_text: string
          raw_material_text: string
          sl_no: number | null
          source_file: string | null
        }
        Insert: {
          company_id: string
          component_drg_no: string
          component_item_id?: string | null
          component_name?: string | null
          created_at?: string
          id?: string
          match_status?: string
          one_oltc_qty?: number | null
          raw_material_item_id?: string | null
          raw_material_size_text: string
          raw_material_text: string
          sl_no?: number | null
          source_file?: string | null
        }
        Update: {
          company_id?: string
          component_drg_no?: string
          component_item_id?: string | null
          component_name?: string | null
          created_at?: string
          id?: string
          match_status?: string
          one_oltc_qty?: number | null
          raw_material_item_id?: string | null
          raw_material_size_text?: string
          raw_material_text?: string
          sl_no?: number | null
          source_file?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_conversion_map_component_item_id_fkey"
            columns: ["component_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_conversion_map_component_item_id_fkey"
            columns: ["component_item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_conversion_map_component_item_id_fkey"
            columns: ["component_item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_conversion_map_component_item_id_fkey"
            columns: ["component_item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_conversion_map_component_item_id_fkey"
            columns: ["component_item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_conversion_map_component_item_id_fkey"
            columns: ["component_item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_conversion_map_component_item_id_fkey"
            columns: ["component_item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_conversion_map_raw_material_item_id_fkey"
            columns: ["raw_material_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_conversion_map_raw_material_item_id_fkey"
            columns: ["raw_material_item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_conversion_map_raw_material_item_id_fkey"
            columns: ["raw_material_item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_conversion_map_raw_material_item_id_fkey"
            columns: ["raw_material_item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_conversion_map_raw_material_item_id_fkey"
            columns: ["raw_material_item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_conversion_map_raw_material_item_id_fkey"
            columns: ["raw_material_item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_conversion_map_raw_material_item_id_fkey"
            columns: ["raw_material_item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
        ]
      }
      item_conversions: {
        Row: {
          company_id: string
          created_at: string
          from_item_id: string
          has_vac: boolean | null
          id: string
          is_sgb: boolean
          label: string | null
          posn: number | null
          to_item_id: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          from_item_id: string
          has_vac?: boolean | null
          id?: string
          is_sgb?: boolean
          label?: string | null
          posn?: number | null
          to_item_id: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          from_item_id?: string
          has_vac?: boolean | null
          id?: string
          is_sgb?: boolean
          label?: string | null
          posn?: number | null
          to_item_id?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_conversions_from_item_id_fkey"
            columns: ["from_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_conversions_from_item_id_fkey"
            columns: ["from_item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_conversions_from_item_id_fkey"
            columns: ["from_item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_conversions_from_item_id_fkey"
            columns: ["from_item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_conversions_from_item_id_fkey"
            columns: ["from_item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_conversions_from_item_id_fkey"
            columns: ["from_item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_conversions_from_item_id_fkey"
            columns: ["from_item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_conversions_to_item_id_fkey"
            columns: ["to_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_conversions_to_item_id_fkey"
            columns: ["to_item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_conversions_to_item_id_fkey"
            columns: ["to_item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_conversions_to_item_id_fkey"
            columns: ["to_item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_conversions_to_item_id_fkey"
            columns: ["to_item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_conversions_to_item_id_fkey"
            columns: ["to_item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_conversions_to_item_id_fkey"
            columns: ["to_item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
        ]
      }
      item_locations: {
        Row: {
          company_id: string
          id: string
          item_id: string
          rack: string
          shelf: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          id?: string
          item_id: string
          rack: string
          shelf: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          id?: string
          item_id?: string
          rack?: string
          shelf?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_locations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_locations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_locations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_locations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_locations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_locations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "item_locations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
        ]
      }
      items: {
        Row: {
          aimed_stock: number | null
          alt_factor: number | null
          alt_factor_mode: string | null
          alt_unit: string | null
          company_id: string | null
          created_at: string
          current_stock: number | null
          custom_classification_id: string | null
          description: string
          drawing_number: string | null
          drawing_revision: string | null
          gst_rate: number | null
          hsn_sac_code: string | null
          id: string
          is_consumable: boolean
          is_critical: boolean | null
          item_code: string
          item_type: string
          last_stock_check: string | null
          min_finished_stock: number | null
          min_stock: number | null
          min_stock_override: number | null
          notes: string | null
          parent_item_id: string | null
          production_batch_size: number | null
          purchase_price: number | null
          sale_price: number | null
          standard_cost: number
          status: string | null
          stock_alert_level: string | null
          stock_finished_goods: number | null
          stock_free: number | null
          stock_in_fg_ready: number | null
          stock_in_fg_wip: number | null
          stock_in_process: number | null
          stock_in_subassembly_wip: number | null
          stock_raw_material: number | null
          stock_wip: number | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          aimed_stock?: number | null
          alt_factor?: number | null
          alt_factor_mode?: string | null
          alt_unit?: string | null
          company_id?: string | null
          created_at?: string
          current_stock?: number | null
          custom_classification_id?: string | null
          description: string
          drawing_number?: string | null
          drawing_revision?: string | null
          gst_rate?: number | null
          hsn_sac_code?: string | null
          id?: string
          is_consumable?: boolean
          is_critical?: boolean | null
          item_code: string
          item_type?: string
          last_stock_check?: string | null
          min_finished_stock?: number | null
          min_stock?: number | null
          min_stock_override?: number | null
          notes?: string | null
          parent_item_id?: string | null
          production_batch_size?: number | null
          purchase_price?: number | null
          sale_price?: number | null
          standard_cost?: number
          status?: string | null
          stock_alert_level?: string | null
          stock_finished_goods?: number | null
          stock_free?: number | null
          stock_in_fg_ready?: number | null
          stock_in_fg_wip?: number | null
          stock_in_process?: number | null
          stock_in_subassembly_wip?: number | null
          stock_raw_material?: number | null
          stock_wip?: number | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          aimed_stock?: number | null
          alt_factor?: number | null
          alt_factor_mode?: string | null
          alt_unit?: string | null
          company_id?: string | null
          created_at?: string
          current_stock?: number | null
          custom_classification_id?: string | null
          description?: string
          drawing_number?: string | null
          drawing_revision?: string | null
          gst_rate?: number | null
          hsn_sac_code?: string | null
          id?: string
          is_consumable?: boolean
          is_critical?: boolean | null
          item_code?: string
          item_type?: string
          last_stock_check?: string | null
          min_finished_stock?: number | null
          min_stock?: number | null
          min_stock_override?: number | null
          notes?: string | null
          parent_item_id?: string | null
          production_batch_size?: number | null
          purchase_price?: number | null
          sale_price?: number | null
          standard_cost?: number
          status?: string | null
          stock_alert_level?: string | null
          stock_finished_goods?: number | null
          stock_free?: number | null
          stock_in_fg_ready?: number | null
          stock_in_fg_wip?: number | null
          stock_in_process?: number | null
          stock_in_subassembly_wip?: number | null
          stock_raw_material?: number | null
          stock_wip?: number | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_alt_unit_fkey"
            columns: ["alt_unit"]
            isOneToOne: false
            referencedRelation: "uom_master"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "items_custom_classification_id_fkey"
            columns: ["custom_classification_id"]
            isOneToOne: false
            referencedRelation: "item_classifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
        ]
      }
      jig_master: {
        Row: {
          associated_process: string | null
          company_id: string
          created_at: string
          drawing_number: string
          id: string
          jig_number: string
          notes: string | null
          status: string
        }
        Insert: {
          associated_process?: string | null
          company_id: string
          created_at?: string
          drawing_number: string
          id?: string
          jig_number: string
          notes?: string | null
          status?: string
        }
        Update: {
          associated_process?: string | null
          company_id?: string
          created_at?: string
          drawing_number?: string
          id?: string
          jig_number?: string
          notes?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "jig_master_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      job_card_stage_ledger: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          event: string
          id: string
          job_card_id: string
          qty: number
          reason: string | null
          ref_id: string | null
          ref_type: string | null
          reverses_ledger_id: string | null
          step_number: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          event: string
          id?: string
          job_card_id: string
          qty: number
          reason?: string | null
          ref_id?: string | null
          ref_type?: string | null
          reverses_ledger_id?: string | null
          step_number: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          event?: string
          id?: string
          job_card_id?: string
          qty?: number
          reason?: string | null
          ref_id?: string | null
          ref_type?: string | null
          reverses_ledger_id?: string | null
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_card_stage_ledger_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_card_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_card_stage_ledger_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_card_stage_ledger_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "v_job_card_status"
            referencedColumns: ["job_card_id"]
          },
          {
            foreignKeyName: "job_card_stage_ledger_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "wip_register"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_card_stage_ledger_reverses_ledger_id_fkey"
            columns: ["reverses_ledger_id"]
            isOneToOne: false
            referencedRelation: "job_card_stage_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      job_card_step_dcs: {
        Row: {
          company_id: string
          created_at: string
          dc_id: string
          dc_line_item_id: string | null
          direction: string
          id: string
          job_card_step_id: string
          qty: number
        }
        Insert: {
          company_id: string
          created_at?: string
          dc_id: string
          dc_line_item_id?: string | null
          direction?: string
          id?: string
          job_card_step_id: string
          qty?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          dc_id?: string
          dc_line_item_id?: string | null
          direction?: string
          id?: string
          job_card_step_id?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_card_step_dcs_dc_id_fkey"
            columns: ["dc_id"]
            isOneToOne: false
            referencedRelation: "delivery_challans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_card_step_dcs_dc_line_item_id_fkey"
            columns: ["dc_line_item_id"]
            isOneToOne: false
            referencedRelation: "dc_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_card_step_dcs_job_card_step_id_fkey"
            columns: ["job_card_step_id"]
            isOneToOne: false
            referencedRelation: "job_card_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_card_step_dcs_job_card_step_id_fkey"
            columns: ["job_card_step_id"]
            isOneToOne: false
            referencedRelation: "wip_register"
            referencedColumns: ["current_step_id"]
          },
        ]
      }
      job_card_steps: {
        Row: {
          actual_qty: number | null
          additional_cost: number | null
          company_id: string | null
          completed_at: string | null
          created_at: string
          entry_allowed: boolean
          expected_return_date: string | null
          id: string
          inspected_at: string | null
          inspected_by: string | null
          inspection_result: string | null
          is_gate: boolean
          is_rework: boolean | null
          job_card_id: string
          job_work_charges: number | null
          labour_cost: number | null
          legacy: boolean
          material_consumed: number | null
          material_cost: number | null
          name: string
          notes: string | null
          outward_dc_id: string | null
          qty_accepted: number | null
          qty_rejected: number | null
          qty_returned: number | null
          qty_sent: number | null
          rejection_reason: string | null
          return_dc_id: string | null
          return_grn_id: string | null
          rework_reason: string | null
          stage_template_id: string | null
          started_at: string | null
          status: string | null
          step_number: number
          step_type: string
          transport_cost_in: number | null
          transport_cost_out: number | null
          unit: string | null
          updated_at: string
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          actual_qty?: number | null
          additional_cost?: number | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          entry_allowed?: boolean
          expected_return_date?: string | null
          id?: string
          inspected_at?: string | null
          inspected_by?: string | null
          inspection_result?: string | null
          is_gate?: boolean
          is_rework?: boolean | null
          job_card_id: string
          job_work_charges?: number | null
          labour_cost?: number | null
          legacy?: boolean
          material_consumed?: number | null
          material_cost?: number | null
          name: string
          notes?: string | null
          outward_dc_id?: string | null
          qty_accepted?: number | null
          qty_rejected?: number | null
          qty_returned?: number | null
          qty_sent?: number | null
          rejection_reason?: string | null
          return_dc_id?: string | null
          return_grn_id?: string | null
          rework_reason?: string | null
          stage_template_id?: string | null
          started_at?: string | null
          status?: string | null
          step_number: number
          step_type: string
          transport_cost_in?: number | null
          transport_cost_out?: number | null
          unit?: string | null
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          actual_qty?: number | null
          additional_cost?: number | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          entry_allowed?: boolean
          expected_return_date?: string | null
          id?: string
          inspected_at?: string | null
          inspected_by?: string | null
          inspection_result?: string | null
          is_gate?: boolean
          is_rework?: boolean | null
          job_card_id?: string
          job_work_charges?: number | null
          labour_cost?: number | null
          legacy?: boolean
          material_consumed?: number | null
          material_cost?: number | null
          name?: string
          notes?: string | null
          outward_dc_id?: string | null
          qty_accepted?: number | null
          qty_rejected?: number | null
          qty_returned?: number | null
          qty_sent?: number | null
          rejection_reason?: string | null
          return_dc_id?: string | null
          return_grn_id?: string | null
          rework_reason?: string | null
          stage_template_id?: string | null
          started_at?: string | null
          status?: string | null
          step_number?: number
          step_type?: string
          transport_cost_in?: number | null
          transport_cost_out?: number | null
          unit?: string | null
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_card_steps_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_card_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_card_steps_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_card_steps_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "v_job_card_status"
            referencedColumns: ["job_card_id"]
          },
          {
            foreignKeyName: "job_card_steps_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "wip_register"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_card_steps_outward_dc_id_fkey"
            columns: ["outward_dc_id"]
            isOneToOne: false
            referencedRelation: "delivery_challans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_card_steps_return_dc_id_fkey"
            columns: ["return_dc_id"]
            isOneToOne: false
            referencedRelation: "delivery_challans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_card_steps_return_grn_id_fkey"
            columns: ["return_grn_id"]
            isOneToOne: false
            referencedRelation: "grns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_card_steps_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_card_steps_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_scorecard"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      job_cards: {
        Row: {
          batch_ref: string | null
          company_id: string | null
          completed_at: string | null
          created_at: string
          current_location: string | null
          current_stage: number | null
          current_stage_name: string | null
          current_vendor_name: string | null
          current_vendor_since: string | null
          drawing_number: string | null
          drawing_revision: string | null
          due_date: string | null
          entry_stage: number | null
          id: string
          initial_cost: number | null
          item_code: string | null
          item_description: string | null
          item_id: string | null
          jc_number: string
          legacy: boolean
          linked_grn_id: string | null
          notes: string | null
          planned_start_date: string | null
          priority: string | null
          quantity_accepted: number
          quantity_original: number
          quantity_rejected: number
          route_version: number | null
          sales_order_ref: string | null
          standard_cost: number | null
          status: string | null
          total_accumulated_cost: number | null
          tracking_mode: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          batch_ref?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          current_location?: string | null
          current_stage?: number | null
          current_stage_name?: string | null
          current_vendor_name?: string | null
          current_vendor_since?: string | null
          drawing_number?: string | null
          drawing_revision?: string | null
          due_date?: string | null
          entry_stage?: number | null
          id?: string
          initial_cost?: number | null
          item_code?: string | null
          item_description?: string | null
          item_id?: string | null
          jc_number: string
          legacy?: boolean
          linked_grn_id?: string | null
          notes?: string | null
          planned_start_date?: string | null
          priority?: string | null
          quantity_accepted?: number
          quantity_original?: number
          quantity_rejected?: number
          route_version?: number | null
          sales_order_ref?: string | null
          standard_cost?: number | null
          status?: string | null
          total_accumulated_cost?: number | null
          tracking_mode?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          batch_ref?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          current_location?: string | null
          current_stage?: number | null
          current_stage_name?: string | null
          current_vendor_name?: string | null
          current_vendor_since?: string | null
          drawing_number?: string | null
          drawing_revision?: string | null
          due_date?: string | null
          entry_stage?: number | null
          id?: string
          initial_cost?: number | null
          item_code?: string | null
          item_description?: string | null
          item_id?: string | null
          jc_number?: string
          legacy?: boolean
          linked_grn_id?: string | null
          notes?: string | null
          planned_start_date?: string | null
          priority?: string | null
          quantity_accepted?: number
          quantity_original?: number
          quantity_rejected?: number
          route_version?: number | null
          sales_order_ref?: string | null
          standard_cost?: number | null
          status?: string | null
          total_accumulated_cost?: number | null
          tracking_mode?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "job_cards_linked_grn_id_fkey"
            columns: ["linked_grn_id"]
            isOneToOne: false
            referencedRelation: "grns"
            referencedColumns: ["id"]
          },
        ]
      }
      material_issue_requests: {
        Row: {
          awo_id: string | null
          company_id: string | null
          created_at: string | null
          id: string
          issue_date: string | null
          issued_by: string | null
          issued_by_user_id: string | null
          mir_number: string
          notes: string | null
          request_date: string | null
          requested_by: string | null
          requested_by_user_id: string | null
          status: string | null
        }
        Insert: {
          awo_id?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          issue_date?: string | null
          issued_by?: string | null
          issued_by_user_id?: string | null
          mir_number: string
          notes?: string | null
          request_date?: string | null
          requested_by?: string | null
          requested_by_user_id?: string | null
          status?: string | null
        }
        Update: {
          awo_id?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          issue_date?: string | null
          issued_by?: string | null
          issued_by_user_id?: string | null
          mir_number?: string
          notes?: string | null
          request_date?: string | null
          requested_by?: string | null
          requested_by_user_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_issue_requests_awo_id_fkey"
            columns: ["awo_id"]
            isOneToOne: false
            referencedRelation: "assembly_work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_issue_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mir_line_items: {
        Row: {
          awo_line_item_id: string | null
          company_id: string | null
          created_at: string | null
          drawing_number: string | null
          id: string
          issued_qty: number | null
          item_code: string | null
          item_description: string | null
          item_id: string | null
          mir_id: string | null
          requested_qty: number
          shortage_notes: string | null
          shortage_qty: number | null
          unit: string | null
        }
        Insert: {
          awo_line_item_id?: string | null
          company_id?: string | null
          created_at?: string | null
          drawing_number?: string | null
          id?: string
          issued_qty?: number | null
          item_code?: string | null
          item_description?: string | null
          item_id?: string | null
          mir_id?: string | null
          requested_qty: number
          shortage_notes?: string | null
          shortage_qty?: number | null
          unit?: string | null
        }
        Update: {
          awo_line_item_id?: string | null
          company_id?: string | null
          created_at?: string | null
          drawing_number?: string | null
          id?: string
          issued_qty?: number | null
          item_code?: string | null
          item_description?: string | null
          item_id?: string | null
          mir_id?: string | null
          requested_qty?: number
          shortage_notes?: string | null
          shortage_qty?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mir_line_items_awo_line_item_id_fkey"
            columns: ["awo_line_item_id"]
            isOneToOne: false
            referencedRelation: "awo_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mir_line_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mir_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mir_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mir_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mir_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "mir_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "mir_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "mir_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "mir_line_items_mir_id_fkey"
            columns: ["mir_id"]
            isOneToOne: false
            referencedRelation: "material_issue_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      mould_items: {
        Row: {
          alert_message: string | null
          company_id: string | null
          created_at: string | null
          description: string
          drawing_number: string
          drawing_revision: string | null
          id: string
          notes: string | null
          vendor_id: string | null
          vendor_name: string
        }
        Insert: {
          alert_message?: string | null
          company_id?: string | null
          created_at?: string | null
          description: string
          drawing_number: string
          drawing_revision?: string | null
          id?: string
          notes?: string | null
          vendor_id?: string | null
          vendor_name: string
        }
        Update: {
          alert_message?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string
          drawing_number?: string
          drawing_revision?: string | null
          id?: string
          notes?: string | null
          vendor_id?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "mould_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mould_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mould_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_scorecard"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      notifications: {
        Row: {
          category: string
          company_id: string | null
          created_at: string | null
          created_by: string | null
          dismissed_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
          message: string
          priority: string
          read_at: string | null
          reference_id: string | null
          reference_type: string | null
          target_role: string | null
          target_user: string | null
          title: string
          type: string
        }
        Insert: {
          category?: string
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          dismissed_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message: string
          priority?: string
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          target_role?: string | null
          target_user?: string | null
          title: string
          type: string
        }
        Update: {
          category?: string
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          dismissed_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string
          priority?: string
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          target_role?: string | null
          target_user?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      parties: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          address_line3: string | null
          city: string | null
          company_id: string | null
          contact_person: string | null
          country: string | null
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
          vendor_type: string | null
          website: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          address_line3?: string | null
          city?: string | null
          company_id?: string | null
          contact_person?: string | null
          country?: string | null
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
          vendor_type?: string | null
          website?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          address_line3?: string | null
          city?: string | null
          company_id?: string | null
          contact_person?: string | null
          country?: string | null
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
          vendor_type?: string | null
          website?: string | null
        }
        Relationships: []
      }
      physical_counts: {
        Row: {
          company_id: string
          counted_qty: number
          id: string
          item_code: string | null
          item_id: string
          ledger_id: string | null
          notes: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          submitted_by: string | null
          system_qty_at_submission: number
          variance: number | null
        }
        Insert: {
          company_id: string
          counted_qty: number
          id?: string
          item_code?: string | null
          item_id: string
          ledger_id?: string | null
          notes?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          system_qty_at_submission: number
          variance?: number | null
        }
        Update: {
          company_id?: string
          counted_qty?: number
          id?: string
          item_code?: string | null
          item_id?: string
          ledger_id?: string | null
          notes?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          system_qty_at_submission?: number
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "physical_counts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_counts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_counts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_counts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "physical_counts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "physical_counts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "physical_counts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "physical_counts_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "stock_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_counts_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "v_stock_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_counts_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "v_stock_ledger_net"
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
          item_id: string | null
          line_total: number | null
          pending_quantity: number | null
          po_id: string
          quantity: number
          quantity_2: number | null
          rate_basis: string
          received_quantity: number | null
          serial_number: number
          unit: string | null
          unit_2: string | null
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
          item_id?: string | null
          line_total?: number | null
          pending_quantity?: number | null
          po_id: string
          quantity?: number
          quantity_2?: number | null
          rate_basis?: string
          received_quantity?: number | null
          serial_number: number
          unit?: string | null
          unit_2?: string | null
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
          item_id?: string | null
          line_total?: number | null
          pending_quantity?: number | null
          po_id?: string
          quantity?: number
          quantity_2?: number | null
          rate_basis?: string
          received_quantity?: number | null
          serial_number?: number
          unit?: string | null
          unit_2?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "po_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "po_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "po_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "po_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
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
      process_code_vendors: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          is_preferred: boolean | null
          process_code_id: string | null
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_preferred?: boolean | null
          process_code_id?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_preferred?: boolean | null
          process_code_id?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_code_vendors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_code_vendors_process_code_id_fkey"
            columns: ["process_code_id"]
            isOneToOne: false
            referencedRelation: "process_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_code_vendors_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_code_vendors_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_scorecard"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      process_codes: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          process_code: string | null
          process_name: string
          stage_type: string
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          process_code?: string | null
          process_name: string
          stage_type?: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          process_code?: string | null
          process_name?: string
          stage_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_codes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string
          display_name: string | null
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean | null
          role: string | null
          tour_completed: boolean | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean | null
          role?: string | null
          tour_completed?: boolean | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          role?: string | null
          tour_completed?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      purchase_orders: {
        Row: {
          additional_charges: Json | null
          amount_paid: number | null
          approval_requested_at: string | null
          approval_requested_by: string | null
          approved_at: string | null
          approved_by: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cgst_amount: number | null
          company_id: string | null
          created_at: string
          currency: string | null
          currency_symbol: string | null
          deletion_reason: string | null
          delivery_address: string | null
          delivery_contact_person: string | null
          delivery_contact_phone: string | null
          exchange_rate: number | null
          grand_total: number | null
          gst_rate: number | null
          id: string
          igst_amount: number | null
          internal_remarks: string | null
          issued_at: string | null
          payment_date: string | null
          payment_notes: string | null
          payment_reference: string | null
          payment_status: string | null
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
          vendor_contact_person: string | null
          vendor_email: string | null
          vendor_gstin: string | null
          vendor_id: string | null
          vendor_name: string | null
          vendor_phone: string | null
          vendor_reference: string | null
          vendor_state_code: string | null
        }
        Insert: {
          additional_charges?: Json | null
          amount_paid?: number | null
          approval_requested_at?: string | null
          approval_requested_by?: string | null
          approved_at?: string | null
          approved_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cgst_amount?: number | null
          company_id?: string | null
          created_at?: string
          currency?: string | null
          currency_symbol?: string | null
          deletion_reason?: string | null
          delivery_address?: string | null
          delivery_contact_person?: string | null
          delivery_contact_phone?: string | null
          exchange_rate?: number | null
          grand_total?: number | null
          gst_rate?: number | null
          id?: string
          igst_amount?: number | null
          internal_remarks?: string | null
          issued_at?: string | null
          payment_date?: string | null
          payment_notes?: string | null
          payment_reference?: string | null
          payment_status?: string | null
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
          vendor_contact_person?: string | null
          vendor_email?: string | null
          vendor_gstin?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
          vendor_phone?: string | null
          vendor_reference?: string | null
          vendor_state_code?: string | null
        }
        Update: {
          additional_charges?: Json | null
          amount_paid?: number | null
          approval_requested_at?: string | null
          approval_requested_by?: string | null
          approved_at?: string | null
          approved_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cgst_amount?: number | null
          company_id?: string | null
          created_at?: string
          currency?: string | null
          currency_symbol?: string | null
          deletion_reason?: string | null
          delivery_address?: string | null
          delivery_contact_person?: string | null
          delivery_contact_phone?: string | null
          exchange_rate?: number | null
          grand_total?: number | null
          gst_rate?: number | null
          id?: string
          igst_amount?: number | null
          internal_remarks?: string | null
          issued_at?: string | null
          payment_date?: string | null
          payment_notes?: string | null
          payment_reference?: string | null
          payment_status?: string | null
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
          vendor_contact_person?: string | null
          vendor_email?: string | null
          vendor_gstin?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
          vendor_phone?: string | null
          vendor_reference?: string | null
          vendor_state_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_scorecard"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      receipts: {
        Row: {
          amount_received: number
          bank_name: string | null
          company_id: string | null
          created_at: string | null
          id: string
          invoice_id: string | null
          invoice_number: string | null
          notes: string | null
          party_id: string | null
          party_name: string | null
          payment_mode: string | null
          receipt_date: string
          receipt_number: string
          updated_at: string | null
          utr_reference: string | null
        }
        Insert: {
          amount_received?: number
          bank_name?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          invoice_number?: string | null
          notes?: string | null
          party_id?: string | null
          party_name?: string | null
          payment_mode?: string | null
          receipt_date?: string
          receipt_number: string
          updated_at?: string | null
          utr_reference?: string | null
        }
        Update: {
          amount_received?: number
          bank_name?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          invoice_number?: string | null
          notes?: string | null
          party_id?: string | null
          party_name?: string | null
          payment_mode?: string | null
          receipt_date?: string
          receipt_number?: string
          updated_at?: string | null
          utr_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_sale_reconciliation"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "receipts_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "vendor_scorecard"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      reorder_rules: {
        Row: {
          aimed_qty: number | null
          company_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          item_id: string | null
          lead_time_days: number | null
          notes: string | null
          preferred_vendor_id: string | null
          reorder_point: number | null
          reorder_qty: number | null
          updated_at: string | null
        }
        Insert: {
          aimed_qty?: number | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          item_id?: string | null
          lead_time_days?: number | null
          notes?: string | null
          preferred_vendor_id?: string | null
          reorder_point?: number | null
          reorder_qty?: number | null
          updated_at?: string | null
        }
        Update: {
          aimed_qty?: number | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          item_id?: string | null
          lead_time_days?: number | null
          notes?: string | null
          preferred_vendor_id?: string | null
          reorder_point?: number | null
          reorder_qty?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reorder_rules_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_rules_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_rules_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_rules_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "reorder_rules_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "reorder_rules_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "reorder_rules_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "reorder_rules_preferred_vendor_id_fkey"
            columns: ["preferred_vendor_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_rules_preferred_vendor_id_fkey"
            columns: ["preferred_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_scorecard"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      rm_conversion_grn_allocations: {
        Row: {
          allocated_at: string
          allocated_by: string | null
          awo_line_item_id: string | null
          company_id: string
          grn_line_item_id: string
          id: string
          item_id: string | null
          notes: string | null
          qty_allocated: number
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
        }
        Insert: {
          allocated_at?: string
          allocated_by?: string | null
          awo_line_item_id?: string | null
          company_id: string
          grn_line_item_id: string
          id?: string
          item_id?: string | null
          notes?: string | null
          qty_allocated: number
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
        }
        Update: {
          allocated_at?: string
          allocated_by?: string | null
          awo_line_item_id?: string | null
          company_id?: string
          grn_line_item_id?: string
          id?: string
          item_id?: string | null
          notes?: string | null
          qty_allocated?: number
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rm_conversion_grn_allocations_awo_line_item_id_fkey"
            columns: ["awo_line_item_id"]
            isOneToOne: false
            referencedRelation: "awo_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rm_conversion_grn_allocations_grn_line_item_id_fkey"
            columns: ["grn_line_item_id"]
            isOneToOne: false
            referencedRelation: "grn_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rm_conversion_grn_allocations_grn_line_item_id_fkey"
            columns: ["grn_line_item_id"]
            isOneToOne: false
            referencedRelation: "v_grn_lines_available_for_conversion"
            referencedColumns: ["grn_line_item_id"]
          },
          {
            foreignKeyName: "rm_conversion_grn_allocations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rm_conversion_grn_allocations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rm_conversion_grn_allocations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rm_conversion_grn_allocations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "rm_conversion_grn_allocations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "rm_conversion_grn_allocations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "rm_conversion_grn_allocations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
        ]
      }
      rm_conversion_inputs: {
        Row: {
          allocation_id: string | null
          alt_unit: string | null
          company_id: string
          entered_qty: number
          entered_unit: string
          grn_line_item_id: string | null
          id: string
          implied_factor: number | null
          item_id: string
          notes: string | null
          qty_alt: number | null
          qty_base: number
          return_qty_base: number
          rm_conversion_id: string
          scrap_qty_base: number
          self_allocated: boolean
          source: string
        }
        Insert: {
          allocation_id?: string | null
          alt_unit?: string | null
          company_id: string
          entered_qty: number
          entered_unit: string
          grn_line_item_id?: string | null
          id?: string
          implied_factor?: number | null
          item_id: string
          notes?: string | null
          qty_alt?: number | null
          qty_base: number
          return_qty_base?: number
          rm_conversion_id: string
          scrap_qty_base?: number
          self_allocated?: boolean
          source: string
        }
        Update: {
          allocation_id?: string | null
          alt_unit?: string | null
          company_id?: string
          entered_qty?: number
          entered_unit?: string
          grn_line_item_id?: string | null
          id?: string
          implied_factor?: number | null
          item_id?: string
          notes?: string | null
          qty_alt?: number | null
          qty_base?: number
          return_qty_base?: number
          rm_conversion_id?: string
          scrap_qty_base?: number
          self_allocated?: boolean
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "rm_conversion_inputs_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "rm_conversion_grn_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rm_conversion_inputs_alt_unit_fkey"
            columns: ["alt_unit"]
            isOneToOne: false
            referencedRelation: "uom_master"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "rm_conversion_inputs_entered_unit_fkey"
            columns: ["entered_unit"]
            isOneToOne: false
            referencedRelation: "uom_master"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "rm_conversion_inputs_grn_line_item_id_fkey"
            columns: ["grn_line_item_id"]
            isOneToOne: false
            referencedRelation: "grn_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rm_conversion_inputs_grn_line_item_id_fkey"
            columns: ["grn_line_item_id"]
            isOneToOne: false
            referencedRelation: "v_grn_lines_available_for_conversion"
            referencedColumns: ["grn_line_item_id"]
          },
          {
            foreignKeyName: "rm_conversion_inputs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rm_conversion_inputs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rm_conversion_inputs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rm_conversion_inputs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "rm_conversion_inputs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "rm_conversion_inputs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "rm_conversion_inputs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "rm_conversion_inputs_rm_conversion_id_fkey"
            columns: ["rm_conversion_id"]
            isOneToOne: false
            referencedRelation: "rm_conversions"
            referencedColumns: ["id"]
          },
        ]
      }
      rm_conversions: {
        Row: {
          awo_id: string | null
          company_id: string
          id: string
          idempotency_key: string | null
          notes: string | null
          output_alt_unit: string | null
          output_item_id: string
          output_qty_alt: number | null
          output_qty_base: number
          output_unit: string
          output_unit_cost: number | null
          posted_at: string
          posted_by: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string
          yield_pct: number | null
        }
        Insert: {
          awo_id?: string | null
          company_id: string
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          output_alt_unit?: string | null
          output_item_id: string
          output_qty_alt?: number | null
          output_qty_base: number
          output_unit: string
          output_unit_cost?: number | null
          posted_at?: string
          posted_by?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          yield_pct?: number | null
        }
        Update: {
          awo_id?: string | null
          company_id?: string
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          output_alt_unit?: string | null
          output_item_id?: string
          output_qty_alt?: number | null
          output_qty_base?: number
          output_unit?: string
          output_unit_cost?: number | null
          posted_at?: string
          posted_by?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          yield_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rm_conversions_awo_id_fkey"
            columns: ["awo_id"]
            isOneToOne: false
            referencedRelation: "assembly_work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rm_conversions_output_alt_unit_fkey"
            columns: ["output_alt_unit"]
            isOneToOne: false
            referencedRelation: "uom_master"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "rm_conversions_output_item_id_fkey"
            columns: ["output_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rm_conversions_output_item_id_fkey"
            columns: ["output_item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rm_conversions_output_item_id_fkey"
            columns: ["output_item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rm_conversions_output_item_id_fkey"
            columns: ["output_item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "rm_conversions_output_item_id_fkey"
            columns: ["output_item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "rm_conversions_output_item_id_fkey"
            columns: ["output_item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "rm_conversions_output_item_id_fkey"
            columns: ["output_item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "rm_conversions_output_unit_fkey"
            columns: ["output_unit"]
            isOneToOne: false
            referencedRelation: "uom_master"
            referencedColumns: ["code"]
          },
        ]
      }
      sale_backflush_lines: {
        Row: {
          bom_qty_per_unit: number
          child_item_id: string
          company_id: string
          created_at: string
          id: string
          invoice_id: string
          invoice_line_id: string
          ledger_id: string
          qty_consumed: number
          reversal_ledger_id: string | null
          units: number
        }
        Insert: {
          bom_qty_per_unit: number
          child_item_id: string
          company_id: string
          created_at?: string
          id?: string
          invoice_id: string
          invoice_line_id: string
          ledger_id: string
          qty_consumed: number
          reversal_ledger_id?: string | null
          units: number
        }
        Update: {
          bom_qty_per_unit?: number
          child_item_id?: string
          company_id?: string
          created_at?: string
          id?: string
          invoice_id?: string
          invoice_line_id?: string
          ledger_id?: string
          qty_consumed?: number
          reversal_ledger_id?: string | null
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_backflush_lines_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_backflush_lines_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_backflush_lines_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_backflush_lines_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "sale_backflush_lines_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "sale_backflush_lines_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "sale_backflush_lines_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "sale_backflush_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_backflush_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_sale_reconciliation"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "sale_backflush_lines_invoice_line_id_fkey"
            columns: ["invoice_line_id"]
            isOneToOne: false
            referencedRelation: "invoice_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_backflush_lines_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: true
            referencedRelation: "stock_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_backflush_lines_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: true
            referencedRelation: "v_stock_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_backflush_lines_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: true
            referencedRelation: "v_stock_ledger_net"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_backflush_lines_reversal_ledger_id_fkey"
            columns: ["reversal_ledger_id"]
            isOneToOne: false
            referencedRelation: "stock_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_backflush_lines_reversal_ledger_id_fkey"
            columns: ["reversal_ledger_id"]
            isOneToOne: false
            referencedRelation: "v_stock_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_backflush_lines_reversal_ledger_id_fkey"
            columns: ["reversal_ledger_id"]
            isOneToOne: false
            referencedRelation: "v_stock_ledger_net"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_shortfalls: {
        Row: {
          child_item_id: string
          company_id: string
          created_at: string
          id: string
          invoice_id: string
          invoice_line_id: string
          position_after: number
          qty_short: number
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          child_item_id: string
          company_id: string
          created_at?: string
          id?: string
          invoice_id: string
          invoice_line_id: string
          position_after: number
          qty_short: number
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          child_item_id?: string
          company_id?: string
          created_at?: string
          id?: string
          invoice_id?: string
          invoice_line_id?: string
          position_after?: number
          qty_short?: number
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_shortfalls_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_shortfalls_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_shortfalls_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_shortfalls_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "sale_shortfalls_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "sale_shortfalls_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "sale_shortfalls_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "sale_shortfalls_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_shortfalls_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_sale_reconciliation"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "sale_shortfalls_invoice_line_id_fkey"
            columns: ["invoice_line_id"]
            isOneToOne: false
            referencedRelation: "invoice_line_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          billing_address: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cgst_amount: number
          company_id: string
          confirmed_at: string | null
          created_at: string
          customer_address: string | null
          customer_gstin: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_state_code: string | null
          delivery_date: string | null
          grand_total: number
          gst_rate: number
          id: string
          igst_amount: number
          internal_remarks: string | null
          payment_terms: string | null
          priority: string
          reference_number: string | null
          sgst_amount: number
          shipping_address: string | null
          so_date: string
          so_number: string
          special_instructions: string | null
          status: string
          sub_total: number
          taxable_value: number
          total_gst: number
          updated_at: string
        }
        Insert: {
          billing_address?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cgst_amount?: number
          company_id: string
          confirmed_at?: string | null
          created_at?: string
          customer_address?: string | null
          customer_gstin?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_state_code?: string | null
          delivery_date?: string | null
          grand_total?: number
          gst_rate?: number
          id?: string
          igst_amount?: number
          internal_remarks?: string | null
          payment_terms?: string | null
          priority?: string
          reference_number?: string | null
          sgst_amount?: number
          shipping_address?: string | null
          so_date?: string
          so_number?: string
          special_instructions?: string | null
          status?: string
          sub_total?: number
          taxable_value?: number
          total_gst?: number
          updated_at?: string
        }
        Update: {
          billing_address?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cgst_amount?: number
          company_id?: string
          confirmed_at?: string | null
          created_at?: string
          customer_address?: string | null
          customer_gstin?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_state_code?: string | null
          delivery_date?: string | null
          grand_total?: number
          gst_rate?: number
          id?: string
          igst_amount?: number
          internal_remarks?: string | null
          payment_terms?: string | null
          priority?: string
          reference_number?: string | null
          sgst_amount?: number
          shipping_address?: string | null
          so_date?: string
          so_number?: string
          special_instructions?: string | null
          status?: string
          sub_total?: number
          taxable_value?: number
          total_gst?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "vendor_scorecard"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      scrap_register: {
        Row: {
          assembly_order_id: string | null
          assembly_order_number: string | null
          company_id: string | null
          cost_per_unit: number | null
          created_at: string | null
          disposal_method: string | null
          drawing_number: string | null
          id: string
          item_code: string | null
          item_description: string | null
          item_id: string | null
          job_card_id: string | null
          job_card_number: string | null
          qty_scrapped: number
          recorded_by: string | null
          remarks: string | null
          scrap_category: string | null
          scrap_date: string
          scrap_number: string
          scrap_reason: string
          scrap_sale_value: number | null
          total_scrap_value: number | null
          unit: string | null
          updated_at: string | null
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          assembly_order_id?: string | null
          assembly_order_number?: string | null
          company_id?: string | null
          cost_per_unit?: number | null
          created_at?: string | null
          disposal_method?: string | null
          drawing_number?: string | null
          id?: string
          item_code?: string | null
          item_description?: string | null
          item_id?: string | null
          job_card_id?: string | null
          job_card_number?: string | null
          qty_scrapped?: number
          recorded_by?: string | null
          remarks?: string | null
          scrap_category?: string | null
          scrap_date?: string
          scrap_number: string
          scrap_reason: string
          scrap_sale_value?: number | null
          total_scrap_value?: number | null
          unit?: string | null
          updated_at?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          assembly_order_id?: string | null
          assembly_order_number?: string | null
          company_id?: string | null
          cost_per_unit?: number | null
          created_at?: string | null
          disposal_method?: string | null
          drawing_number?: string | null
          id?: string
          item_code?: string | null
          item_description?: string | null
          item_id?: string | null
          job_card_id?: string | null
          job_card_number?: string | null
          qty_scrapped?: number
          recorded_by?: string | null
          remarks?: string | null
          scrap_category?: string | null
          scrap_date?: string
          scrap_number?: string
          scrap_reason?: string
          scrap_sale_value?: number | null
          total_scrap_value?: number | null
          unit?: string | null
          updated_at?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scrap_register_assembly_order_id_fkey"
            columns: ["assembly_order_id"]
            isOneToOne: false
            referencedRelation: "assembly_work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrap_register_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrap_register_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrap_register_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrap_register_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "scrap_register_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "scrap_register_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "scrap_register_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "scrap_register_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_card_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrap_register_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrap_register_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "v_job_card_status"
            referencedColumns: ["job_card_id"]
          },
          {
            foreignKeyName: "scrap_register_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "wip_register"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrap_register_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrap_register_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_scorecard"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      serial_numbers: {
        Row: {
          assembly_order_id: string | null
          company_id: string | null
          created_at: string | null
          customer_name: string | null
          dispatch_date: string | null
          fat_completed: boolean | null
          fat_completed_at: string | null
          id: string
          invoice_id: string | null
          invoice_number: string | null
          item_code: string | null
          item_description: string | null
          item_id: string | null
          notes: string | null
          serial_number: string
          status: string | null
          updated_at: string | null
          warranty_expiry: string | null
          warranty_months: number | null
        }
        Insert: {
          assembly_order_id?: string | null
          company_id?: string | null
          created_at?: string | null
          customer_name?: string | null
          dispatch_date?: string | null
          fat_completed?: boolean | null
          fat_completed_at?: string | null
          id?: string
          invoice_id?: string | null
          invoice_number?: string | null
          item_code?: string | null
          item_description?: string | null
          item_id?: string | null
          notes?: string | null
          serial_number: string
          status?: string | null
          updated_at?: string | null
          warranty_expiry?: string | null
          warranty_months?: number | null
        }
        Update: {
          assembly_order_id?: string | null
          company_id?: string | null
          created_at?: string | null
          customer_name?: string | null
          dispatch_date?: string | null
          fat_completed?: boolean | null
          fat_completed_at?: string | null
          id?: string
          invoice_id?: string | null
          invoice_number?: string | null
          item_code?: string | null
          item_description?: string | null
          item_id?: string | null
          notes?: string | null
          serial_number?: string
          status?: string | null
          updated_at?: string | null
          warranty_expiry?: string | null
          warranty_months?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "serial_numbers_assembly_order_id_fkey"
            columns: ["assembly_order_id"]
            isOneToOne: false
            referencedRelation: "assembly_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serial_numbers_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serial_numbers_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_sale_reconciliation"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "serial_numbers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serial_numbers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serial_numbers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serial_numbers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "serial_numbers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "serial_numbers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "serial_numbers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
        ]
      }
      so_line_items: {
        Row: {
          company_id: string
          created_at: string
          delivery_date: string | null
          description: string
          gst_rate: number
          hsn_sac_code: string | null
          id: string
          item_code: string | null
          item_id: string | null
          line_total: number
          quantity: number
          remarks: string | null
          serial_number: number
          so_id: string
          unit: string
          unit_price: number
        }
        Insert: {
          company_id: string
          created_at?: string
          delivery_date?: string | null
          description?: string
          gst_rate?: number
          hsn_sac_code?: string | null
          id?: string
          item_code?: string | null
          item_id?: string | null
          line_total?: number
          quantity?: number
          remarks?: string | null
          serial_number: number
          so_id: string
          unit?: string
          unit_price?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          delivery_date?: string | null
          description?: string
          gst_rate?: number
          hsn_sac_code?: string | null
          id?: string
          item_code?: string | null
          item_id?: string | null
          line_total?: number
          quantity?: number
          remarks?: string | null
          serial_number?: number
          so_id?: string
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "so_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "so_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "so_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "so_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "so_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "so_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "so_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "so_line_items_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_bucket_sync_log: {
        Row: {
          caller_intended: number | null
          created_at: string
          created_by: string | null
          id: string
          item_code: string | null
          item_id: string
          ledger_position: number | null
          requested_delta: number | null
          stored_before: number | null
        }
        Insert: {
          caller_intended?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_code?: string | null
          item_id: string
          ledger_position?: number | null
          requested_delta?: number | null
          stored_before?: number | null
        }
        Update: {
          caller_intended?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_code?: string | null
          item_id?: string
          ledger_position?: number | null
          requested_delta?: number | null
          stored_before?: number | null
        }
        Relationships: []
      }
      stock_drift_log: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_new: boolean
          item_code: string | null
          item_id: string
          ledger_free: number | null
          run_id: string
          stored_free: number | null
          value_at_stake: number | null
          variance_qty: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_new?: boolean
          item_code?: string | null
          item_id: string
          ledger_free?: number | null
          run_id: string
          stored_free?: number | null
          value_at_stake?: number | null
          variance_qty?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_new?: boolean
          item_code?: string | null
          item_id?: string
          ledger_free?: number | null
          run_id?: string
          stored_free?: number | null
          value_at_stake?: number | null
          variance_qty?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_drift_log_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "stock_drift_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_drift_log_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "v_stock_drift_latest"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_drift_runs: {
        Row: {
          company_id: string
          id: string
          items_checked: number
          items_drifting: number
          new_drifting: number
          pct_ok: number
          resolved: number
          run_at: string
          sale_recon_mismatches: number
          sale_shortfalls_open: number
          triggered_by: string
          value_at_stake: number
        }
        Insert: {
          company_id: string
          id?: string
          items_checked: number
          items_drifting: number
          new_drifting: number
          pct_ok: number
          resolved: number
          run_at?: string
          sale_recon_mismatches?: number
          sale_shortfalls_open?: number
          triggered_by?: string
          value_at_stake?: number
        }
        Update: {
          company_id?: string
          id?: string
          items_checked?: number
          items_drifting?: number
          new_drifting?: number
          pct_ok?: number
          resolved?: number
          run_at?: string
          sale_recon_mismatches?: number
          sale_shortfalls_open?: number
          triggered_by?: string
          value_at_stake?: number
        }
        Relationships: []
      }
      stock_ledger: {
        Row: {
          balance_qty: number
          company_id: string | null
          created_at: string | null
          created_by: string | null
          from_bucket: string | null
          from_state: string | null
          id: string
          item_code: string | null
          item_description: string | null
          item_id: string | null
          movement: string | null
          notes: string | null
          posted_by_fn: string | null
          qty: number | null
          qty_in: number | null
          qty_out: number | null
          reason: string | null
          reference_id: string | null
          reference_line_id: string | null
          reference_number: string | null
          reference_type: string | null
          reverses_ledger_id: string | null
          seq: number | null
          to_bucket: string | null
          to_state: string | null
          total_value: number | null
          transaction_date: string
          transaction_type: string
          unit_cost: number | null
        }
        Insert: {
          balance_qty: number
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          from_bucket?: string | null
          from_state?: string | null
          id?: string
          item_code?: string | null
          item_description?: string | null
          item_id?: string | null
          movement?: string | null
          notes?: string | null
          posted_by_fn?: string | null
          qty?: number | null
          qty_in?: number | null
          qty_out?: number | null
          reason?: string | null
          reference_id?: string | null
          reference_line_id?: string | null
          reference_number?: string | null
          reference_type?: string | null
          reverses_ledger_id?: string | null
          seq?: number | null
          to_bucket?: string | null
          to_state?: string | null
          total_value?: number | null
          transaction_date?: string
          transaction_type: string
          unit_cost?: number | null
        }
        Update: {
          balance_qty?: number
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          from_bucket?: string | null
          from_state?: string | null
          id?: string
          item_code?: string | null
          item_description?: string | null
          item_id?: string | null
          movement?: string | null
          notes?: string | null
          posted_by_fn?: string | null
          qty?: number | null
          qty_in?: number | null
          qty_out?: number | null
          reason?: string | null
          reference_id?: string | null
          reference_line_id?: string | null
          reference_number?: string | null
          reference_type?: string | null
          reverses_ledger_id?: string | null
          seq?: number | null
          to_bucket?: string | null
          to_state?: string | null
          total_value?: number | null
          transaction_date?: string
          transaction_type?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_ledger_reverses_ledger_id_fkey"
            columns: ["reverses_ledger_id"]
            isOneToOne: false
            referencedRelation: "stock_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_reverses_ledger_id_fkey"
            columns: ["reverses_ledger_id"]
            isOneToOne: false
            referencedRelation: "v_stock_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_reverses_ledger_id_fkey"
            columns: ["reverses_ledger_id"]
            isOneToOne: false
            referencedRelation: "v_stock_ledger_net"
            referencedColumns: ["id"]
          },
        ]
      }
      uom_master: {
        Row: {
          category: string
          code: string
          decimals: number
          is_active: boolean
          name: string
        }
        Insert: {
          category: string
          code: string
          decimals?: number
          is_active?: boolean
          name: string
        }
        Update: {
          category?: string
          code?: string
          decimals?: number
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      z_clean_returns: {
        Row: {
          grn_id: string | null
          linked_dc_id: string | null
          return_desc: string | null
          return_line_id: string | null
          return_qty: number | null
        }
        Insert: {
          grn_id?: string | null
          linked_dc_id?: string | null
          return_desc?: string | null
          return_line_id?: string | null
          return_qty?: number | null
        }
        Update: {
          grn_id?: string | null
          linked_dc_id?: string | null
          return_desc?: string | null
          return_line_id?: string | null
          return_qty?: number | null
        }
        Relationships: []
      }
      z_dc_dup_reversal_20260728: {
        Row: {
          excess: number | null
          excess_rows: number | null
          item_code: string | null
          item_id: string | null
          reversed_at: string | null
          stock_free_before: number | null
          stock_in_process_before: number | null
        }
        Insert: {
          excess?: number | null
          excess_rows?: number | null
          item_code?: string | null
          item_id?: string | null
          reversed_at?: string | null
          stock_free_before?: number | null
          stock_in_process_before?: number | null
        }
        Update: {
          excess?: number | null
          excess_rows?: number | null
          item_code?: string | null
          item_id?: string | null
          reversed_at?: string | null
          stock_free_before?: number | null
          stock_in_process_before?: number | null
        }
        Relationships: []
      }
      z_dc_missing_issue_backfill_20260728: {
        Row: {
          backfilled_at: string | null
          dc_id: string | null
          dc_number: string | null
          item_code: string | null
          item_id: string | null
          quantity: number | null
          stock_free_before: number | null
        }
        Insert: {
          backfilled_at?: string | null
          dc_id?: string | null
          dc_number?: string | null
          item_code?: string | null
          item_id?: string | null
          quantity?: number | null
          stock_free_before?: number | null
        }
        Update: {
          backfilled_at?: string | null
          dc_id?: string | null
          dc_number?: string | null
          item_code?: string | null
          item_id?: string | null
          quantity?: number | null
          stock_free_before?: number | null
        }
        Relationships: []
      }
      z_dcr_apply: {
        Row: {
          candidate_item_id: string | null
          grn_id: string | null
          item_code: string | null
          parent_desc: string | null
          parent_qty: number | null
          qty_diff: number | null
          qty_exact: boolean | null
          return_desc: string | null
          return_line_id: string | null
          return_qty: number | null
          rnk: number | null
          sim: number | null
          verdict: string | null
        }
        Insert: {
          candidate_item_id?: string | null
          grn_id?: string | null
          item_code?: string | null
          parent_desc?: string | null
          parent_qty?: number | null
          qty_diff?: number | null
          qty_exact?: boolean | null
          return_desc?: string | null
          return_line_id?: string | null
          return_qty?: number | null
          rnk?: number | null
          sim?: number | null
          verdict?: string | null
        }
        Update: {
          candidate_item_id?: string | null
          grn_id?: string | null
          item_code?: string | null
          parent_desc?: string | null
          parent_qty?: number | null
          qty_diff?: number | null
          qty_exact?: boolean | null
          return_desc?: string | null
          return_line_id?: string | null
          return_qty?: number | null
          rnk?: number | null
          sim?: number | null
          verdict?: string | null
        }
        Relationships: []
      }
      z_dcr_best: {
        Row: {
          candidate_item_id: string | null
          grn_id: string | null
          item_code: string | null
          parent_desc: string | null
          parent_qty: number | null
          qty_diff: number | null
          qty_exact: boolean | null
          return_desc: string | null
          return_line_id: string | null
          return_qty: number | null
          rnk: number | null
          sim: number | null
          verdict: string | null
        }
        Insert: {
          candidate_item_id?: string | null
          grn_id?: string | null
          item_code?: string | null
          parent_desc?: string | null
          parent_qty?: number | null
          qty_diff?: number | null
          qty_exact?: boolean | null
          return_desc?: string | null
          return_line_id?: string | null
          return_qty?: number | null
          rnk?: number | null
          sim?: number | null
          verdict?: string | null
        }
        Update: {
          candidate_item_id?: string | null
          grn_id?: string | null
          item_code?: string | null
          parent_desc?: string | null
          parent_qty?: number | null
          qty_diff?: number | null
          qty_exact?: boolean | null
          return_desc?: string | null
          return_line_id?: string | null
          return_qty?: number | null
          rnk?: number | null
          sim?: number | null
          verdict?: string | null
        }
        Relationships: []
      }
      z_dcr_scores: {
        Row: {
          candidate_item_id: string | null
          grn_id: string | null
          item_code: string | null
          parent_desc: string | null
          parent_qty: number | null
          qty_diff: number | null
          qty_exact: boolean | null
          return_desc: string | null
          return_line_id: string | null
          return_qty: number | null
          rnk: number | null
          sim: number | null
        }
        Insert: {
          candidate_item_id?: string | null
          grn_id?: string | null
          item_code?: string | null
          parent_desc?: string | null
          parent_qty?: number | null
          qty_diff?: number | null
          qty_exact?: boolean | null
          return_desc?: string | null
          return_line_id?: string | null
          return_qty?: number | null
          rnk?: number | null
          sim?: number | null
        }
        Update: {
          candidate_item_id?: string | null
          grn_id?: string | null
          item_code?: string | null
          parent_desc?: string | null
          parent_qty?: number | null
          qty_diff?: number | null
          qty_exact?: boolean | null
          return_desc?: string | null
          return_line_id?: string | null
          return_qty?: number | null
          rnk?: number | null
          sim?: number | null
        }
        Relationships: []
      }
      z_inprocess_reconcile_20260728: {
        Row: {
          in_process_after: number | null
          in_process_before: number | null
          item_code: string | null
          item_id: string | null
          phantom: number | null
          reconciled_at: string | null
          stock_free_before: number | null
        }
        Insert: {
          in_process_after?: number | null
          in_process_before?: number | null
          item_code?: string | null
          item_id?: string | null
          phantom?: number | null
          reconciled_at?: string | null
          stock_free_before?: number | null
        }
        Update: {
          in_process_after?: number | null
          in_process_before?: number | null
          item_code?: string | null
          item_id?: string | null
          phantom?: number | null
          reconciled_at?: string | null
          stock_free_before?: number | null
        }
        Relationships: []
      }
      z_inprocess_reconcile_round2_20260728: {
        Row: {
          in_process_after: number | null
          in_process_before: number | null
          item_code: string | null
          item_id: string | null
          phantom: number | null
          reconciled_at: string | null
          stock_free_before: number | null
        }
        Insert: {
          in_process_after?: number | null
          in_process_before?: number | null
          item_code?: string | null
          item_id?: string | null
          phantom?: number | null
          reconciled_at?: string | null
          stock_free_before?: number | null
        }
        Update: {
          in_process_after?: number | null
          in_process_before?: number | null
          item_code?: string | null
          item_id?: string | null
          phantom?: number | null
          reconciled_at?: string | null
          stock_free_before?: number | null
        }
        Relationships: []
      }
      z_items_drawing_stripped: {
        Row: {
          desc_norm: string | null
          description: string | null
          drawing_number: string | null
          drawing_stripped: string | null
          id: string | null
        }
        Insert: {
          desc_norm?: string | null
          description?: string | null
          drawing_number?: string | null
          drawing_stripped?: string | null
          id?: string | null
        }
        Update: {
          desc_norm?: string | null
          description?: string | null
          drawing_number?: string | null
          drawing_stripped?: string | null
          id?: string | null
        }
        Relationships: []
      }
      z_items_normalized: {
        Row: {
          desc_norm: string | null
          description: string | null
          drawing_norm: string | null
          drawing_number: string | null
          id: string | null
        }
        Insert: {
          desc_norm?: string | null
          description?: string | null
          drawing_norm?: string | null
          drawing_number?: string | null
          id?: string | null
        }
        Update: {
          desc_norm?: string | null
          description?: string | null
          drawing_norm?: string | null
          drawing_number?: string | null
          id?: string | null
        }
        Relationships: []
      }
      z_items_pass3: {
        Row: {
          item_code: string | null
          item_id: string | null
          master_desc: string | null
          master_normalized: string | null
          master_tokens: string[] | null
        }
        Insert: {
          item_code?: string | null
          item_id?: string | null
          master_desc?: string | null
          master_normalized?: string | null
          master_tokens?: string[] | null
        }
        Update: {
          item_code?: string | null
          item_id?: string | null
          master_desc?: string | null
          master_normalized?: string | null
          master_tokens?: string[] | null
        }
        Relationships: []
      }
      z_ledger_state_backfill_20260728: {
        Row: {
          backfilled_at: string | null
          ledger_id: string | null
          new_from_state: string | null
          new_to_state: string | null
          notes: string | null
          qty_in: number | null
          qty_out: number | null
        }
        Insert: {
          backfilled_at?: string | null
          ledger_id?: string | null
          new_from_state?: string | null
          new_to_state?: string | null
          notes?: string | null
          qty_in?: number | null
          qty_out?: number | null
        }
        Update: {
          backfilled_at?: string | null
          ledger_id?: string | null
          new_from_state?: string | null
          new_to_state?: string | null
          notes?: string | null
          qty_in?: number | null
          qty_out?: number | null
        }
        Relationships: []
      }
      z_new_items_staging: {
        Row: {
          description: string | null
          drawing_number: string | null
          item_code: string | null
          qty: number | null
          raw_row: number | null
        }
        Insert: {
          description?: string | null
          drawing_number?: string | null
          item_code?: string | null
          qty?: number | null
          raw_row?: number | null
        }
        Update: {
          description?: string | null
          drawing_number?: string | null
          item_code?: string | null
          qty?: number | null
          raw_row?: number | null
        }
        Relationships: []
      }
      z_option_z_candidates: {
        Row: {
          current_in_process: number | null
          description: string | null
          drift: number | null
          insert_qty: number | null
          item_code: string | null
          item_id: string | null
        }
        Insert: {
          current_in_process?: number | null
          description?: string | null
          drift?: number | null
          insert_qty?: number | null
          item_code?: string | null
          item_id?: string | null
        }
        Update: {
          current_in_process?: number | null
          description?: string | null
          drift?: number | null
          insert_qty?: number | null
          item_code?: string | null
          item_id?: string | null
        }
        Relationships: []
      }
      z_option_z_drift: {
        Row: {
          current_in_process: number | null
          description: string | null
          drift: number | null
          item_code: string | null
          item_id: string | null
        }
        Insert: {
          current_in_process?: number | null
          description?: string | null
          drift?: number | null
          item_code?: string | null
          item_id?: string | null
        }
        Update: {
          current_in_process?: number | null
          description?: string | null
          drift?: number | null
          item_code?: string | null
          item_id?: string | null
        }
        Relationships: []
      }
      z_orphan_pass1_best: {
        Row: {
          best_match_code: string | null
          best_match_desc: string | null
          best_match_item_id: string | null
          best_sim: number | null
          damaged_qty: number | null
          effective_qty: number | null
          grn_id: string | null
          grn_line_id: string | null
          orphan_desc: string | null
        }
        Insert: {
          best_match_code?: string | null
          best_match_desc?: string | null
          best_match_item_id?: string | null
          best_sim?: number | null
          damaged_qty?: number | null
          effective_qty?: number | null
          grn_id?: string | null
          grn_line_id?: string | null
          orphan_desc?: string | null
        }
        Update: {
          best_match_code?: string | null
          best_match_desc?: string | null
          best_match_item_id?: string | null
          best_sim?: number | null
          damaged_qty?: number | null
          effective_qty?: number | null
          grn_id?: string | null
          grn_line_id?: string | null
          orphan_desc?: string | null
        }
        Relationships: []
      }
      z_orphan_pass1_candidates: {
        Row: {
          accepted_qty: number | null
          candidate_code: string | null
          candidate_desc: string | null
          candidate_item_id: string | null
          damaged_qty: number | null
          effective_qty: number | null
          grn_id: string | null
          grn_line_id: string | null
          orphan_desc: string | null
          sim: number | null
        }
        Insert: {
          accepted_qty?: number | null
          candidate_code?: string | null
          candidate_desc?: string | null
          candidate_item_id?: string | null
          damaged_qty?: number | null
          effective_qty?: number | null
          grn_id?: string | null
          grn_line_id?: string | null
          orphan_desc?: string | null
          sim?: number | null
        }
        Update: {
          accepted_qty?: number | null
          candidate_code?: string | null
          candidate_desc?: string | null
          candidate_item_id?: string | null
          damaged_qty?: number | null
          effective_qty?: number | null
          grn_id?: string | null
          grn_line_id?: string | null
          orphan_desc?: string | null
          sim?: number | null
        }
        Relationships: []
      }
      z_orphan_pass1_confident: {
        Row: {
          best_match_code: string | null
          best_match_desc: string | null
          best_match_item_id: string | null
          best_sim: number | null
          damaged_qty: number | null
          effective_qty: number | null
          grn_id: string | null
          grn_line_id: string | null
          orphan_desc: string | null
        }
        Insert: {
          best_match_code?: string | null
          best_match_desc?: string | null
          best_match_item_id?: string | null
          best_sim?: number | null
          damaged_qty?: number | null
          effective_qty?: number | null
          grn_id?: string | null
          grn_line_id?: string | null
          orphan_desc?: string | null
        }
        Update: {
          best_match_code?: string | null
          best_match_desc?: string | null
          best_match_item_id?: string | null
          best_sim?: number | null
          damaged_qty?: number | null
          effective_qty?: number | null
          grn_id?: string | null
          grn_line_id?: string | null
          orphan_desc?: string | null
        }
        Relationships: []
      }
      z_orphans_pass3: {
        Row: {
          damaged_qty: number | null
          effective_qty: number | null
          grn_id: string | null
          grn_line_id: string | null
          orphan_desc: string | null
          orphan_normalized: string | null
          orphan_tokens: string[] | null
        }
        Insert: {
          damaged_qty?: number | null
          effective_qty?: number | null
          grn_id?: string | null
          grn_line_id?: string | null
          orphan_desc?: string | null
          orphan_normalized?: string | null
          orphan_tokens?: string[] | null
        }
        Update: {
          damaged_qty?: number | null
          effective_qty?: number | null
          grn_id?: string | null
          grn_line_id?: string | null
          orphan_desc?: string | null
          orphan_normalized?: string | null
          orphan_tokens?: string[] | null
        }
        Relationships: []
      }
      z_pass3_confident: {
        Row: {
          all_master_tokens_in_orphan: number | null
          combined_score: number | null
          damaged_qty: number | null
          effective_qty: number | null
          grn_id: string | null
          grn_line_id: string | null
          item_code: string | null
          item_id: string | null
          master_desc: string | null
          orphan_desc: string | null
          rank: number | null
          sim_containment: number | null
          sim_normalized: number | null
          sim_tokens: number | null
        }
        Insert: {
          all_master_tokens_in_orphan?: number | null
          combined_score?: number | null
          damaged_qty?: number | null
          effective_qty?: number | null
          grn_id?: string | null
          grn_line_id?: string | null
          item_code?: string | null
          item_id?: string | null
          master_desc?: string | null
          orphan_desc?: string | null
          rank?: number | null
          sim_containment?: number | null
          sim_normalized?: number | null
          sim_tokens?: number | null
        }
        Update: {
          all_master_tokens_in_orphan?: number | null
          combined_score?: number | null
          damaged_qty?: number | null
          effective_qty?: number | null
          grn_id?: string | null
          grn_line_id?: string | null
          item_code?: string | null
          item_id?: string | null
          master_desc?: string | null
          orphan_desc?: string | null
          rank?: number | null
          sim_containment?: number | null
          sim_normalized?: number | null
          sim_tokens?: number | null
        }
        Relationships: []
      }
      z_pass3_ranked: {
        Row: {
          all_master_tokens_in_orphan: number | null
          combined_score: number | null
          damaged_qty: number | null
          effective_qty: number | null
          grn_id: string | null
          grn_line_id: string | null
          item_code: string | null
          item_id: string | null
          master_desc: string | null
          orphan_desc: string | null
          rank: number | null
          sim_containment: number | null
          sim_normalized: number | null
          sim_tokens: number | null
        }
        Insert: {
          all_master_tokens_in_orphan?: number | null
          combined_score?: number | null
          damaged_qty?: number | null
          effective_qty?: number | null
          grn_id?: string | null
          grn_line_id?: string | null
          item_code?: string | null
          item_id?: string | null
          master_desc?: string | null
          orphan_desc?: string | null
          rank?: number | null
          sim_containment?: number | null
          sim_normalized?: number | null
          sim_tokens?: number | null
        }
        Update: {
          all_master_tokens_in_orphan?: number | null
          combined_score?: number | null
          damaged_qty?: number | null
          effective_qty?: number | null
          grn_id?: string | null
          grn_line_id?: string | null
          item_code?: string | null
          item_id?: string | null
          master_desc?: string | null
          orphan_desc?: string | null
          rank?: number | null
          sim_containment?: number | null
          sim_normalized?: number | null
          sim_tokens?: number | null
        }
        Relationships: []
      }
      z_pass3_safe: {
        Row: {
          all_master_tokens_in_orphan: number | null
          combined_score: number | null
          damaged_qty: number | null
          effective_qty: number | null
          grn_id: string | null
          grn_line_id: string | null
          item_code: string | null
          item_id: string | null
          master_desc: string | null
          orphan_desc: string | null
          rank: number | null
          sim_containment: number | null
          sim_normalized: number | null
          sim_tokens: number | null
        }
        Insert: {
          all_master_tokens_in_orphan?: number | null
          combined_score?: number | null
          damaged_qty?: number | null
          effective_qty?: number | null
          grn_id?: string | null
          grn_line_id?: string | null
          item_code?: string | null
          item_id?: string | null
          master_desc?: string | null
          orphan_desc?: string | null
          rank?: number | null
          sim_containment?: number | null
          sim_normalized?: number | null
          sim_tokens?: number | null
        }
        Update: {
          all_master_tokens_in_orphan?: number | null
          combined_score?: number | null
          damaged_qty?: number | null
          effective_qty?: number | null
          grn_id?: string | null
          grn_line_id?: string | null
          item_code?: string | null
          item_id?: string | null
          master_desc?: string | null
          orphan_desc?: string | null
          rank?: number | null
          sim_containment?: number | null
          sim_normalized?: number | null
          sim_tokens?: number | null
        }
        Relationships: []
      }
      z_pass3_scores: {
        Row: {
          all_master_tokens_in_orphan: number | null
          damaged_qty: number | null
          effective_qty: number | null
          grn_id: string | null
          grn_line_id: string | null
          item_code: string | null
          item_id: string | null
          master_desc: string | null
          orphan_desc: string | null
          sim_containment: number | null
          sim_normalized: number | null
          sim_tokens: number | null
        }
        Insert: {
          all_master_tokens_in_orphan?: number | null
          damaged_qty?: number | null
          effective_qty?: number | null
          grn_id?: string | null
          grn_line_id?: string | null
          item_code?: string | null
          item_id?: string | null
          master_desc?: string | null
          orphan_desc?: string | null
          sim_containment?: number | null
          sim_normalized?: number | null
          sim_tokens?: number | null
        }
        Update: {
          all_master_tokens_in_orphan?: number | null
          damaged_qty?: number | null
          effective_qty?: number | null
          grn_id?: string | null
          grn_line_id?: string | null
          item_code?: string | null
          item_id?: string | null
          master_desc?: string | null
          orphan_desc?: string | null
          sim_containment?: number | null
          sim_normalized?: number | null
          sim_tokens?: number | null
        }
        Relationships: []
      }
      z_pass5_decisions: {
        Row: {
          action: string | null
          item_code: string | null
          new_item_code: string | null
          new_item_desc: string | null
          orphan_id: string | null
        }
        Insert: {
          action?: string | null
          item_code?: string | null
          new_item_code?: string | null
          new_item_desc?: string | null
          orphan_id?: string | null
        }
        Update: {
          action?: string | null
          item_code?: string | null
          new_item_code?: string | null
          new_item_desc?: string | null
          orphan_id?: string | null
        }
        Relationships: []
      }
      z_pass5_resolved: {
        Row: {
          action: string | null
          damaged: number | null
          grn_id: string | null
          grn_line_id: string | null
          grn_line_id_real: string | null
          qty: number | null
          resolved_item_id: string | null
        }
        Insert: {
          action?: string | null
          damaged?: number | null
          grn_id?: string | null
          grn_line_id?: string | null
          grn_line_id_real?: string | null
          qty?: number | null
          resolved_item_id?: string | null
        }
        Update: {
          action?: string | null
          damaged?: number | null
          grn_id?: string | null
          grn_line_id?: string | null
          grn_line_id_real?: string | null
          qty?: number | null
          resolved_item_id?: string | null
        }
        Relationships: []
      }
      z_path_a_skip_items: {
        Row: {
          item_id: string | null
        }
        Insert: {
          item_id?: string | null
        }
        Update: {
          item_id?: string | null
        }
        Relationships: []
      }
      z_path_a_targets: {
        Row: {
          current_stock_free: number | null
          current_stock_in_process: number | null
          description: string | null
          item_code: string | null
          item_id: string | null
          target_in_process: number | null
          target_total_stock: number | null
        }
        Insert: {
          current_stock_free?: number | null
          current_stock_in_process?: number | null
          description?: string | null
          item_code?: string | null
          item_id?: string | null
          target_in_process?: number | null
          target_total_stock?: number | null
        }
        Update: {
          current_stock_free?: number | null
          current_stock_in_process?: number | null
          description?: string | null
          item_code?: string | null
          item_id?: string | null
          target_in_process?: number | null
          target_total_stock?: number | null
        }
        Relationships: []
      }
      z_raw_drawing_stripped: {
        Row: {
          closing_stock: number | null
          desc_norm: string | null
          drawing_stripped: string | null
          raw_desc: string | null
          raw_drawing: string | null
          raw_row: number | null
        }
        Insert: {
          closing_stock?: number | null
          desc_norm?: string | null
          drawing_stripped?: string | null
          raw_desc?: string | null
          raw_drawing?: string | null
          raw_row?: number | null
        }
        Update: {
          closing_stock?: number | null
          desc_norm?: string | null
          drawing_stripped?: string | null
          raw_desc?: string | null
          raw_drawing?: string | null
          raw_row?: number | null
        }
        Relationships: []
      }
      z_raw_match_results: {
        Row: {
          closing_stock: number | null
          match_by_desc_first: string | null
          match_by_drawing_desc: string | null
          match_by_unique_desc: string | null
          match_by_unique_drawing: string | null
          match_method: string | null
          matched_item_id: string | null
          raw_desc: string | null
          raw_drawing: string | null
          raw_row: number | null
        }
        Insert: {
          closing_stock?: number | null
          match_by_desc_first?: string | null
          match_by_drawing_desc?: string | null
          match_by_unique_desc?: string | null
          match_by_unique_drawing?: string | null
          match_method?: string | null
          matched_item_id?: string | null
          raw_desc?: string | null
          raw_drawing?: string | null
          raw_row?: number | null
        }
        Update: {
          closing_stock?: number | null
          match_by_desc_first?: string | null
          match_by_drawing_desc?: string | null
          match_by_unique_desc?: string | null
          match_by_unique_drawing?: string | null
          match_method?: string | null
          matched_item_id?: string | null
          raw_desc?: string | null
          raw_drawing?: string | null
          raw_row?: number | null
        }
        Relationships: []
      }
      z_raw_normalized: {
        Row: {
          closing_stock: number | null
          desc_norm: string | null
          drawing_norm: string | null
          raw_desc: string | null
          raw_drawing: string | null
          raw_row: number | null
        }
        Insert: {
          closing_stock?: number | null
          desc_norm?: string | null
          drawing_norm?: string | null
          raw_desc?: string | null
          raw_drawing?: string | null
          raw_row?: number | null
        }
        Update: {
          closing_stock?: number | null
          desc_norm?: string | null
          drawing_norm?: string | null
          raw_desc?: string | null
          raw_drawing?: string | null
          raw_row?: number | null
        }
        Relationships: []
      }
      z_raw_opening_stock: {
        Row: {
          closing_stock: number | null
          description: string | null
          drawing_number: string | null
          raw_row: number | null
        }
        Insert: {
          closing_stock?: number | null
          description?: string | null
          drawing_number?: string | null
          raw_row?: number | null
        }
        Update: {
          closing_stock?: number | null
          description?: string | null
          drawing_number?: string | null
          raw_row?: number | null
        }
        Relationships: []
      }
      z_spurious_ledger: {
        Row: {
          created_at: string | null
          item_id: string | null
          ledger_id: string | null
          notes: string | null
          qty_out: number | null
          reference_id: string | null
          row_rank: number | null
          transaction_date: string | null
        }
        Insert: {
          created_at?: string | null
          item_id?: string | null
          ledger_id?: string | null
          notes?: string | null
          qty_out?: number | null
          reference_id?: string | null
          row_rank?: number | null
          transaction_date?: string | null
        }
        Update: {
          created_at?: string | null
          item_id?: string | null
          ledger_id?: string | null
          notes?: string | null
          qty_out?: number | null
          reference_id?: string | null
          row_rank?: number | null
          transaction_date?: string | null
        }
        Relationships: []
      }
      z_tier1_item_credits: {
        Row: {
          item_id: string | null
          total_credit: number | null
        }
        Insert: {
          item_id?: string | null
          total_credit?: number | null
        }
        Update: {
          item_id?: string | null
          total_credit?: number | null
        }
        Relationships: []
      }
      z_tier1_to_delete: {
        Row: {
          item_id: string | null
          kept_notes: string | null
          ledger_id: string | null
          qty_out: number | null
          spurious_notes: string | null
        }
        Insert: {
          item_id?: string | null
          kept_notes?: string | null
          ledger_id?: string | null
          qty_out?: number | null
          spurious_notes?: string | null
        }
        Update: {
          item_id?: string | null
          kept_notes?: string | null
          ledger_id?: string | null
          qty_out?: number | null
          spurious_notes?: string | null
        }
        Relationships: []
      }
      z_tmp_match_results: {
        Row: {
          excel_code: string | null
          excel_desc: string | null
          excel_drawing: string | null
          excel_row: number | null
          match_by_code_and_desc: string | null
          match_by_desc: string | null
          match_by_drawing: string | null
          match_by_unique_code: string | null
          match_method: string | null
          matched_item_id: string | null
          opening_qty: number | null
        }
        Insert: {
          excel_code?: string | null
          excel_desc?: string | null
          excel_drawing?: string | null
          excel_row?: number | null
          match_by_code_and_desc?: string | null
          match_by_desc?: string | null
          match_by_drawing?: string | null
          match_by_unique_code?: string | null
          match_method?: string | null
          matched_item_id?: string | null
          opening_qty?: number | null
        }
        Update: {
          excel_code?: string | null
          excel_desc?: string | null
          excel_drawing?: string | null
          excel_row?: number | null
          match_by_code_and_desc?: string | null
          match_by_desc?: string | null
          match_by_drawing?: string | null
          match_by_unique_code?: string | null
          match_method?: string | null
          matched_item_id?: string | null
          opening_qty?: number | null
        }
        Relationships: []
      }
      z_tmp_opening_stock: {
        Row: {
          description: string | null
          drawing_number: string | null
          excel_row: number | null
          item_code: string | null
          item_type: string | null
          opening_qty: number | null
          unit: string | null
        }
        Insert: {
          description?: string | null
          drawing_number?: string | null
          excel_row?: number | null
          item_code?: string | null
          item_type?: string | null
          opening_qty?: number | null
          unit?: string | null
        }
        Update: {
          description?: string | null
          drawing_number?: string | null
          excel_row?: number | null
          item_code?: string | null
          item_type?: string | null
          opening_qty?: number | null
          unit?: string | null
        }
        Relationships: []
      }
      z_tmp_unique_item_codes: {
        Row: {
          cnt: number | null
          item_code: string | null
        }
        Insert: {
          cnt?: number | null
          item_code?: string | null
        }
        Update: {
          cnt?: number | null
          item_code?: string | null
        }
        Relationships: []
      }
      z_unique_descriptions: {
        Row: {
          cnt: number | null
          desc_lower: string | null
        }
        Insert: {
          cnt?: number | null
          desc_lower?: string | null
        }
        Update: {
          cnt?: number | null
          desc_lower?: string | null
        }
        Relationships: []
      }
      z_unique_descs_norm: {
        Row: {
          desc_norm: string | null
        }
        Insert: {
          desc_norm?: string | null
        }
        Update: {
          desc_norm?: string | null
        }
        Relationships: []
      }
      z_unique_drawings: {
        Row: {
          cnt: number | null
          drawing_lower: string | null
        }
        Insert: {
          cnt?: number | null
          drawing_lower?: string | null
        }
        Update: {
          cnt?: number | null
          drawing_lower?: string | null
        }
        Relationships: []
      }
      z_unique_drawings_norm: {
        Row: {
          drawing_norm: string | null
        }
        Insert: {
          drawing_norm?: string | null
        }
        Update: {
          drawing_norm?: string | null
        }
        Relationships: []
      }
      z_unique_drawings_stripped: {
        Row: {
          drawing_stripped: string | null
        }
        Insert: {
          drawing_stripped?: string | null
        }
        Update: {
          drawing_stripped?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      job_card_summary: {
        Row: {
          batch_ref: string | null
          company_id: string | null
          completed_at: string | null
          completed_steps: number | null
          cost_per_unit: number | null
          created_at: string | null
          current_location: string | null
          current_vendor_name: string | null
          current_vendor_since: string | null
          drawing_number: string | null
          drawing_revision: string | null
          due_date: string | null
          id: string | null
          initial_cost: number | null
          item_code: string | null
          item_description: string | null
          item_id: string | null
          jc_number: string | null
          linked_grn_id: string | null
          notes: string | null
          planned_start_date: string | null
          priority: string | null
          quantity_accepted: number | null
          quantity_original: number | null
          quantity_rejected: number | null
          sales_order_ref: string | null
          standard_cost: number | null
          status: string | null
          step_count: number | null
          total_cost: number | null
          total_step_cost: number | null
          tracking_mode: string | null
          updated_at: string | null
          variance: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "job_cards_linked_grn_id_fkey"
            columns: ["linked_grn_id"]
            isOneToOne: false
            referencedRelation: "grns"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_alerts: {
        Row: {
          aimed_stock: number | null
          alert_type: string | null
          company_id: string | null
          description: string | null
          drawing_number: string | null
          effective_stock: number | null
          hsn_sac_code: string | null
          id: string | null
          item_code: string | null
          item_type: string | null
          min_stock: number | null
          net_shortage: number | null
          on_order_qty: number | null
          severity: string | null
          shortage: number | null
          stock_free: number | null
          stock_in_fg_ready: number | null
          stock_in_fg_wip: number | null
          stock_in_process: number | null
          stock_in_subassembly_wip: number | null
          suggested_reorder_qty: number | null
          unit: string | null
        }
        Relationships: []
      }
      stock_status: {
        Row: {
          company_id: string | null
          current_stock: number | null
          description: string | null
          id: string | null
          item_code: string | null
          item_type: string | null
          min_stock: number | null
          stock_alert_level: string | null
          stock_free: number | null
          stock_in_fg_ready: number | null
          stock_in_fg_wip: number | null
          stock_in_process: number | null
          stock_in_subassembly_wip: number | null
          unit: string | null
        }
        Insert: {
          company_id?: string | null
          current_stock?: number | null
          description?: string | null
          id?: string | null
          item_code?: string | null
          item_type?: string | null
          min_stock?: number | null
          stock_alert_level?: string | null
          stock_free?: number | null
          stock_in_fg_ready?: number | null
          stock_in_fg_wip?: number | null
          stock_in_process?: number | null
          stock_in_subassembly_wip?: number | null
          unit?: string | null
        }
        Update: {
          company_id?: string | null
          current_stock?: number | null
          description?: string | null
          id?: string | null
          item_code?: string | null
          item_type?: string | null
          min_stock?: number | null
          stock_alert_level?: string | null
          stock_free?: number | null
          stock_in_fg_ready?: number | null
          stock_in_fg_wip?: number | null
          stock_in_process?: number | null
          stock_in_subassembly_wip?: number | null
          unit?: string | null
        }
        Relationships: []
      }
      v_grn_lines_available_for_conversion: {
        Row: {
          accepted_quantity: number | null
          available_qty: number | null
          company_id: string | null
          damaged_qty: number | null
          description: string | null
          drawing_number: string | null
          grn_id: string | null
          grn_line_item_id: string | null
          grn_number: string | null
          item_id: string | null
          po_id: string | null
          po_number: string | null
          qty_already_converted: number | null
          store_confirmed_qty: number | null
          unit: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grn_line_items_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "grns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "grn_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "grn_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "grn_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "grns_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      v_item_bucket_events: {
        Row: {
          bucket: string | null
          delta: number | null
          is_reset: boolean | null
          item_id: string | null
          seq: number | null
          transaction_date: string | null
          unit_cost: number | null
        }
        Relationships: []
      }
      v_item_bucket_position: {
        Row: {
          bucket: string | null
          item_id: string | null
          last_seq: number | null
          qty: number | null
        }
        Relationships: []
      }
      v_item_position: {
        Row: {
          consumed: number | null
          damaged: number | null
          dispatched: number | null
          fg_ready: number | null
          fg_wip: number | null
          free: number | null
          in_process: number | null
          incoming: number | null
          item_code: string | null
          item_id: string | null
          item_type: string | null
          scrap: number | null
          subassembly_wip: number | null
          substore: number | null
          total_active_qty: number | null
        }
        Relationships: []
      }
      v_item_position_drift: {
        Row: {
          delta_fg_ready: number | null
          delta_fg_wip: number | null
          delta_free: number | null
          delta_in_process: number | null
          delta_subassembly_wip: number | null
          derived_fg_ready: number | null
          derived_fg_wip: number | null
          derived_free: number | null
          derived_in_process: number | null
          derived_subassembly_wip: number | null
          item_code: string | null
          item_id: string | null
          last_ledger_seq: number | null
          stored_fg_ready: number | null
          stored_fg_wip: number | null
          stored_free: number | null
          stored_in_process: number | null
          stored_subassembly_wip: number | null
        }
        Relationships: []
      }
      v_item_stage_stock: {
        Row: {
          eligible_qty: number | null
          item_code: string | null
          item_id: string | null
          step_number: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
        ]
      }
      v_jcsl_invariant_violations: {
        Row: {
          detail: string | null
          jc_number: string | null
          job_card_id: string | null
          step_number: number | null
          value: number | null
          violation: string | null
        }
        Relationships: []
      }
      v_job_card_stage_ledger_totals: {
        Row: {
          company_id: string | null
          converted_out_qty: number | null
          entry_qty: number | null
          internal_done_qty: number | null
          issued_qty: number | null
          job_card_id: string | null
          released_unprocessed_qty: number | null
          returned_accepted_qty: number | null
          returned_rejected_qty: number | null
          rework_cycle_count: number | null
          rework_in_qty: number | null
          scrapped_qty: number | null
          skipped_qty: number | null
          step_number: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_card_stage_ledger_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_card_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_card_stage_ledger_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_card_stage_ledger_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "v_job_card_status"
            referencedColumns: ["job_card_id"]
          },
          {
            foreignKeyName: "job_card_stage_ledger_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "wip_register"
            referencedColumns: ["id"]
          },
        ]
      }
      v_job_card_stage_position: {
        Row: {
          completed_qty: number | null
          consumed_qty: number | null
          converted_out_qty: number | null
          eligible_qty: number | null
          eligible_qty_raw: number | null
          internal_done_qty: number | null
          is_gate: boolean | null
          issued_qty: number | null
          job_card_id: string | null
          released_unprocessed_qty: number | null
          returned_accepted_qty: number | null
          returned_rejected_qty: number | null
          rework_in_qty: number | null
          scrapped_qty: number | null
          step_number: number | null
          upstream: number | null
        }
        Relationships: []
      }
      v_job_card_status: {
        Row: {
          derived_status: string | null
          final_stage_completed_qty: number | null
          jc_number: string | null
          job_card_id: string | null
          legacy: boolean | null
          quantity_original: number | null
          total_converted_out_qty: number | null
          total_released_unprocessed_qty: number | null
          total_scrapped_qty: number | null
        }
        Relationships: []
      }
      v_sale_reconciliation: {
        Row: {
          backflushed_qty: number | null
          company_id: string | null
          drained_qty: number | null
          i_cancel_ok: boolean | null
          i_consumed_ok: boolean | null
          i_dispatch_ok: boolean | null
          i_money_ok: boolean | null
          i_output_ok: boolean | null
          i_snapshot_math_ok: boolean | null
          i_split_ok: boolean | null
          i_unbuild_ok: boolean | null
          invoice_date: string | null
          invoice_id: string | null
          invoice_number: string | null
          ledger_backflush_output_qty: number | null
          ledger_cancel_return_qty: number | null
          ledger_consumed_qty: number | null
          ledger_dispatch_qty: number | null
          ledger_reversal_qty: number | null
          ledger_unbuild_qty: number | null
          line_qty: number | null
          ok: boolean | null
          open_shortfalls: number | null
          snapshot_consumed_qty: number | null
          snapshot_reversed_qty: number | null
          status: string | null
        }
        Relationships: []
      }
      v_stock_current: {
        Row: {
          company_id: string | null
          current_balance: number | null
          drawing_number: string | null
          item_code: string | null
          item_description: string | null
          item_id: string | null
          item_type: string | null
          last_movement_date: string | null
          unit: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
        ]
      }
      v_stock_drift_latest: {
        Row: {
          company_id: string | null
          id: string | null
          items_checked: number | null
          items_drifting: number | null
          new_drifting: number | null
          pct_ok: number | null
          resolved: number | null
          run_at: string | null
          triggered_by: string | null
          value_at_stake: number | null
        }
        Insert: {
          company_id?: string | null
          id?: string | null
          items_checked?: number | null
          items_drifting?: number | null
          new_drifting?: number | null
          pct_ok?: number | null
          resolved?: number | null
          run_at?: string | null
          triggered_by?: string | null
          value_at_stake?: number | null
        }
        Update: {
          company_id?: string | null
          id?: string | null
          items_checked?: number | null
          items_drifting?: number | null
          new_drifting?: number | null
          pct_ok?: number | null
          resolved?: number | null
          run_at?: string | null
          triggered_by?: string | null
          value_at_stake?: number | null
        }
        Relationships: []
      }
      v_stock_free: {
        Row: {
          company_id: string | null
          free_qty: number | null
          is_counted: boolean | null
          item_id: string | null
        }
        Relationships: []
      }
      v_stock_invariants: {
        Row: {
          bucket: string | null
          detail: string | null
          item_code: string | null
          item_id: string | null
          item_status: string | null
          value: number | null
          violation: string | null
        }
        Relationships: []
      }
      v_stock_ledger: {
        Row: {
          company_id: string | null
          created_at: string | null
          drawing_number: string | null
          drawing_revision: string | null
          from_state: string | null
          id: string | null
          item_code: string | null
          item_description: string | null
          item_id: string | null
          item_type: string | null
          notes: string | null
          qty_in: number | null
          qty_out: number | null
          reference_id: string | null
          reference_number: string | null
          reference_type: string | null
          running_balance: number | null
          seq: number | null
          to_state: string | null
          total_value: number | null
          transaction_date: string | null
          transaction_type: string | null
          unit: string | null
          unit_cost: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
        ]
      }
      v_stock_ledger_net: {
        Row: {
          from_bucket: string | null
          id: string | null
          item_id: string | null
          movement: string | null
          net_qty: number | null
          seq: number | null
          to_bucket: string | null
          transaction_date: string | null
          unit_cost: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
        ]
      }
      v_stock_ledger_reversed_qty: {
        Row: {
          ledger_id: string | null
          reversed_qty: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_ledger_reverses_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "stock_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_reverses_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "v_stock_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_reverses_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "v_stock_ledger_net"
            referencedColumns: ["id"]
          },
        ]
      }
      v_stock_pending_verification: {
        Row: {
          company_id: string | null
          description: string | null
          drawing_number: string | null
          item_code: string | null
          item_id: string | null
          ledger_free: number | null
          needs_verification: boolean | null
          stored_free: number | null
          value_at_stake: number | null
          variance_qty: number | null
        }
        Relationships: []
      }
      vendor_scorecard: {
        Row: {
          avg_turnaround_days: number | null
          city: string | null
          company_id: string | null
          dc_count: number | null
          dc_qty_accepted: number | null
          dc_qty_rejected: number | null
          dc_qty_sent: number | null
          dc_rejection_rate_pct: number | null
          grn_count: number | null
          grn_qty_accepted: number | null
          grn_qty_received: number | null
          grn_qty_rejected: number | null
          grn_rejection_rate_pct: number | null
          gstin: string | null
          last_used_at: string | null
          on_time_rate_pct: number | null
          overdue_steps: number | null
          performance_rating: string | null
          phone1: string | null
          rejection_rate_pct: number | null
          total_charges: number | null
          total_qty_accepted: number | null
          total_qty_rejected: number | null
          total_qty_sent: number | null
          total_steps: number | null
          vendor_id: string | null
          vendor_name: string | null
          vendor_type: string | null
        }
        Relationships: []
      }
      wip_register: {
        Row: {
          batch_ref: string | null
          company_id: string | null
          completed_steps: number | null
          created_at: string | null
          current_location: string | null
          current_step_id: string | null
          current_step_name: string | null
          current_step_number: number | null
          current_step_type: string | null
          current_step_vendor: string | null
          current_vendor_name: string | null
          current_vendor_since: string | null
          days_active: number | null
          days_at_vendor: number | null
          days_overdue: number | null
          due_date: string | null
          expected_return_date: string | null
          id: string | null
          initial_cost: number | null
          is_overdue: boolean | null
          item_code: string | null
          item_description: string | null
          item_id: string | null
          jc_number: string | null
          notes: string | null
          priority: string | null
          quantity_accepted: number | null
          quantity_original: number | null
          quantity_rejected: number | null
          sales_order_ref: string | null
          status: string | null
          step_count: number | null
          total_cost: number | null
          total_step_cost: number | null
          tracking_mode: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_position_drift"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_free"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "job_cards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_stock_pending_verification"
            referencedColumns: ["item_id"]
          },
        ]
      }
    }
    Functions: {
      _doc_slash_prefix: {
        Args: {
          p_company_id: string
          p_default_prefix: string
          p_prefix_key: string
        }
        Returns: string
      }
      _jcsl_credit_if_final_stage: {
        Args: {
          p_job_card_id: string
          p_notes: string
          p_qty: number
          p_reference_id: string
          p_reference_number: string
          p_reference_type: string
          p_step_number: number
          p_transaction_type: string
        }
        Returns: boolean
      }
      _jcsl_next_step: {
        Args: { p_job_card_id: string; p_step_number: number }
        Returns: number
      }
      _jcsl_open_external_step: {
        Args: { p_job_card_id: string }
        Returns: number
      }
      _jcsl_reverse_qty_fifo: {
        Args: {
          p_job_card_id: string
          p_qty: number
          p_reason: string
          p_ref_id?: string
          p_ref_type?: string
          p_reversal_event: string
          p_source_event: string
          p_step_number: number
        }
        Returns: undefined
      }
      _stock_ledger_last_balance: {
        Args: { p_item_id: string }
        Returns: number
      }
      assign_inward_sl_no: { Args: { p_grn_id: string }; Returns: number }
      clear_all_bom_lines: { Args: { p_company_id: string }; Returns: number }
      clear_all_company_data: { Args: { p_company_id: string }; Returns: Json }
      clear_all_items: { Args: { p_company_id: string }; Returns: number }
      clear_all_jig_master: { Args: { p_company_id: string }; Returns: number }
      clear_all_mould_items: { Args: { p_company_id: string }; Returns: number }
      clear_all_parties: { Args: { p_company_id: string }; Returns: number }
      clear_all_process_codes: {
        Args: { p_company_id: string }
        Returns: number
      }
      clear_all_processing_routes: {
        Args: { p_company_id: string }
        Returns: number
      }
      clear_all_reorder_rules: {
        Args: { p_company_id: string }
        Returns: number
      }
      clear_opening_stock: { Args: { p_company_id: string }; Returns: number }
      fy_start_year: { Args: { d: string }; Returns: number }
      generate_doc_number: {
        Args: {
          p_column: string
          p_company_id: string
          p_full_prefix: string
          p_pad_width?: number
          p_separator: string
          p_table: string
        }
        Returns: string
      }
      get_company_id: { Args: never; Returns: string }
      get_user_role: { Args: never; Returns: string }
      is_edit_approver: { Args: never; Returns: boolean }
      is_stock_count_approver: { Args: never; Returns: boolean }
      jcsl_invariant_check: { Args: never; Returns: undefined }
      recompute_consumable_line_qty_returned: {
        Args: { p_line_id: string }
        Returns: undefined
      }
      recompute_po_line_received_quantity: {
        Args: { p_po_line_item_id: string }
        Returns: undefined
      }
      replace_po_line_items: {
        Args: { p_company_id: string; p_line_items: Json; p_po_id: string }
        Returns: number
      }
      rpc_accept_awo_and_produce: {
        Args: {
          p_accepted_by?: string
          p_actual_quantity_produced?: number
          p_awo_id: string
          p_company_id: string
        }
        Returns: {
          output_bucket: string
          produced_item_code: string
          produced_qty: number
        }[]
      }
      rpc_allocate_grn_to_conversion: {
        Args: {
          p_allocated_by?: string
          p_awo_line_item_id: string
          p_company_id: string
          p_grn_line_item_id: string
          p_item_id?: string
          p_notes?: string
          p_qty: number
        }
        Returns: {
          allocation_id: string
          new_available_qty: number
        }[]
      }
      rpc_approve_edit_request: {
        Args: { p_request_id: string; p_review_notes?: string }
        Returns: {
          applied_at: string | null
          company_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          previous_values: Json
          proposed_changes: Json
          reason: string | null
          record_id: string
          requested_at: string
          requested_by: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          table_name: string
        }
        SetofOptions: {
          from: "*"
          to: "edit_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_approve_physical_count: {
        Args: { p_count_id: string; p_review_notes?: string }
        Returns: {
          out_new_free: number
          out_prior_free: number
          out_variance: number
        }[]
      }
      rpc_cancel_dc: {
        Args: { p_dc_id: string; p_reason: string }
        Returns: {
          dc_line_item_id: string
          qty_reversed: number
        }[]
      }
      rpc_cancel_dc_plain_lines: {
        Args: {
          p_dc_id: string
          p_reason: string
          p_step_handling?: string
          p_stock_action?: string
        }
        Returns: {
          out_action: string
          out_item_code: string
          out_item_id: string
          out_new_free: number
          out_new_in_process: number
          out_outstanding: number
        }[]
      }
      rpc_cancel_edit_request: {
        Args: { p_request_id: string }
        Returns: {
          applied_at: string | null
          company_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          previous_values: Json
          proposed_changes: Json
          reason: string | null
          record_id: string
          requested_at: string
          requested_by: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          table_name: string
        }
        SetofOptions: {
          from: "*"
          to: "edit_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_cancel_job_card: {
        Args: { p_job_card_id: string; p_reason: string }
        Returns: undefined
      }
      rpc_cancel_physical_count: {
        Args: { p_count_id: string }
        Returns: undefined
      }
      rpc_cancel_sale: {
        Args: {
          p_cancelled_by?: string
          p_invoice_id: string
          p_reason: string
          p_unbuild?: boolean
        }
        Returns: Json
      }
      rpc_close_job_card_short: {
        Args: { p_job_card_id: string; p_reason: string }
        Returns: {
          released_qty: number
          step_number: number
        }[]
      }
      rpc_complete_sale: {
        Args: { p_completed_by?: string; p_invoice_id: string }
        Returns: Json
      }
      rpc_confirm_grn_store: {
        Args: { p_grn_id: string }
        Returns: {
          accepted_qty: number
          final_stage_credited: boolean
          grn_line_item_id: string
          job_card_id: string
          rejected_qty: number
          step_number: number
        }[]
      }
      rpc_confirm_internal_step: {
        Args: {
          p_idempotency_key?: string
          p_job_card_id: string
          p_qty: number
          p_step_number: number
        }
        Returns: {
          eligible_remaining: number
          final_stage_credited: boolean
          qty_confirmed: number
          step_number: number
        }[]
      }
      rpc_confirm_material_issue: {
        Args: {
          p_awo_id: string
          p_company_id: string
          p_item_id: string
          p_notes?: string
          p_qty: number
          p_reference_type?: string
        }
        Returns: {
          new_stock_free: number
          new_stock_wip: number
          shortfall: number
        }[]
      }
      rpc_confirm_mir: {
        Args: {
          p_company_id: string
          p_issued_by?: string
          p_lines: Json
          p_mir_id: string
        }
        Returns: {
          awo_status: string
          delta: number
          issued_qty: number
          mir_line_id: string
          mir_status: string
          shortage_qty: number
        }[]
      }
      rpc_create_awo: {
        Args: {
          p_awo_type: string
          p_bom_variant_id?: string
          p_company_id: string
          p_dedup_window_secs?: number
          p_item_id: string
          p_notes?: string
          p_planned_date?: string
          p_quantity_to_build: number
          p_raised_by_user_id?: string
          p_serial_number?: string
          p_work_order_ref?: string
        }
        Returns: {
          awo_id: string
          was_existing: boolean
        }[]
      }
      rpc_credit_partial_stock: {
        Args: {
          p_company_id: string
          p_drawing_number: string
          p_grn_id: string
          p_grn_number: string
          p_grn_type: string
          p_item_id: string
          p_line_id: string
          p_linked_dc_id?: string
          p_store_qty: number
        }
        Returns: {
          out_is_dc_return: boolean
          out_item_code: string
          out_new_free: number
          out_new_in_process: number
          out_resolved_item_id: string
        }[]
      }
      rpc_cutover_open_inflight_card: {
        Args: {
          p_entry_stage: number
          p_item_id: string
          p_notes?: string
          p_qty: number
          p_reason: string
        }
        Returns: {
          jc_number: string
          job_card_id: string
        }[]
      }
      rpc_delete_awo: {
        Args: {
          p_awo_id: string
          p_company_id: string
          p_deleted_by?: string
          p_notes?: string
          p_reverse_output?: boolean
          p_wip_disposition?: string
        }
        Returns: {
          deleted: boolean
          disposition: string
        }[]
      }
      rpc_delete_delivery_challan: {
        Args: {
          p_dc_id: string
          p_deletion_reason?: string
          p_stock_action?: string
        }
        Returns: undefined
      }
      rpc_dispose_rejected: {
        Args: {
          p_disposition: string
          p_job_card_id: string
          p_qty: number
          p_reason: string
          p_step_number: number
        }
        Returns: undefined
      }
      rpc_disposition_damage: {
        Args: {
          p_awo_line_id: string
          p_company_id: string
          p_concession_by?: string
          p_disposition: string
          p_notes: string
          p_qty: number
        }
        Returns: undefined
      }
      rpc_get_job_card_link_candidates: {
        Args: { p_dc_line_item_id: string }
        Returns: {
          current_stage_name: string
          entry_stage: number
          jc_number: string
          job_card_id: string
          open_external_step: number
          quantity_original: number
        }[]
      }
      rpc_get_pending_job_card_links: {
        Args: { p_grn_id: string }
        Returns: {
          dc_line_item_id: string
          dc_number: string
          dc_stage_name: string
          dc_stage_number: number
          grn_line_item_id: string
          item_code: string
          item_id: string
          n_candidates: number
        }[]
      }
      rpc_issue_dc: {
        Args: { p_dc_id: string }
        Returns: {
          dc_line_item_id: string
          job_card_id: string
          qty_issued: number
          step_number: number
        }[]
      }
      rpc_issue_dc_plain_lines: {
        Args: { p_dc_id: string }
        Returns: {
          out_already_issued: boolean
          out_item_code: string
          out_item_id: string
          out_new_free: number
          out_new_in_process: number
          out_qty: number
        }[]
      }
      rpc_link_dc_line_to_job_card: {
        Args: {
          p_dc_line_item_id: string
          p_job_card_id: string
          p_step_number?: number
        }
        Returns: undefined
      }
      rpc_open_job_card: {
        Args: {
          p_entry_stage: number
          p_item_id: string
          p_notes?: string
          p_qty: number
          p_reason?: string
        }
        Returns: {
          jc_number: string
          job_card_id: string
        }[]
      }
      rpc_post_rm_conversion: {
        Args: {
          p_company_id: string
          p_idempotency_key?: string
          p_payload: Json
          p_posted_by?: string
        }
        Returns: {
          output_item_code: string
          output_qty_base: number
          output_unit_cost: number
          rm_conversion_id: string
        }[]
      }
      rpc_post_stock_ledger_row: {
        Args: {
          p_from_state?: string
          p_item_code: string
          p_item_description: string
          p_item_id: string
          p_notes?: string
          p_qty_in: number
          p_qty_out: number
          p_reference_id?: string
          p_reference_number?: string
          p_reference_type?: string
          p_to_state?: string
          p_total_value?: number
          p_transaction_date: string
          p_transaction_type: string
          p_unit_cost?: number
        }
        Returns: {
          out_balance_qty: number
          out_id: string
        }[]
      }
      rpc_record_grn: {
        Args: { p_company_id: string; p_grn: Json; p_lines: Json }
        Returns: Json
      }
      rpc_reject_edit_request: {
        Args: { p_request_id: string; p_review_notes?: string }
        Returns: {
          applied_at: string | null
          company_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          previous_values: Json
          proposed_changes: Json
          reason: string | null
          record_id: string
          requested_at: string
          requested_by: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          table_name: string
        }
        SetofOptions: {
          from: "*"
          to: "edit_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_reject_physical_count: {
        Args: { p_count_id: string; p_review_notes: string }
        Returns: undefined
      }
      rpc_report_damage: {
        Args: {
          p_awo_line_id: string
          p_company_id: string
          p_damage_reason: string
          p_qty: number
        }
        Returns: undefined
      }
      rpc_return_or_scrap_wip: {
        Args: {
          p_awo_line_id: string
          p_company_id: string
          p_direction: string
          p_notes?: string
          p_qty: number
        }
        Returns: {
          new_available_to_return: number
          new_stock_free: number
          new_stock_wip: number
        }[]
      }
      rpc_reverse_grn_return: {
        Args: { p_grn_line_item_id: string; p_reason: string }
        Returns: {
          out_event: string
          out_qty: number
          out_stock_clawed_back: boolean
        }[]
      }
      rpc_reverse_rm_conversion: {
        Args: {
          p_company_id: string
          p_reason: string
          p_reversed_by?: string
          p_rm_conversion_id: string
        }
        Returns: {
          reversed: boolean
        }[]
      }
      rpc_run_stock_drift_check: {
        Args: { p_company_id?: string; p_triggered_by?: string }
        Returns: {
          company_id: string
          items_checked: number
          items_drifting: number
          new_drifting: number
          pct_ok: number
          resolved: number
          run_id: string
          value_at_stake: number
        }[]
      }
      rpc_stock_position_as_of: {
        Args: { p_as_of?: string; p_bucket: string; p_item_id: string }
        Returns: number
      }
      rpc_submit_edit_request: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_proposed_changes: Json
          p_reason?: string
          p_record_id: string
          p_table_name: string
        }
        Returns: {
          applied_at: string | null
          company_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          previous_values: Json
          proposed_changes: Json
          reason: string | null
          record_id: string
          requested_at: string
          requested_by: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          table_name: string
        }
        SetofOptions: {
          from: "*"
          to: "edit_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_submit_physical_count: {
        Args: { p_counted_qty: number; p_item_id: string; p_notes?: string }
        Returns: {
          company_id: string
          counted_qty: number
          id: string
          item_code: string | null
          item_id: string
          ledger_id: string | null
          notes: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          submitted_by: string | null
          system_qty_at_submission: number
          variance: number | null
        }
        SetofOptions: {
          from: "*"
          to: "physical_counts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_undo_disposition: {
        Args: {
          p_disposition: string
          p_job_card_id: string
          p_qty: number
          p_reason: string
          p_step_number: number
        }
        Returns: undefined
      }
      rpc_undo_internal_step: {
        Args: {
          p_job_card_id: string
          p_qty: number
          p_reason: string
          p_step_number: number
        }
        Returns: undefined
      }
      rpc_update_dc_line_qty: {
        Args: {
          p_dc_line_item_id: string
          p_new_qty: number
          p_reason?: string
        }
        Returns: undefined
      }
      rpc_update_dc_line_qty_plain: {
        Args: {
          p_dc_line_item_id: string
          p_new_qty: number
          p_reason?: string
        }
        Returns: undefined
      }
      rpc_update_stock_bucket: {
        Args: {
          p_bucket: string
          p_delta: number
          p_item_id: string
          p_skip_alert_update?: boolean
        }
        Returns: {
          out_new_value: number
        }[]
      }
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
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      verify_item_codes_exist: {
        Args: { p_codes: string[]; p_company_id: string }
        Returns: string[]
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
