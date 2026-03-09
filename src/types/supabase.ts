export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      chart_of_accounts: {
        Row: {
          id: string
          account_code: string
          account_name: string
          account_type: 'HEADER' | 'DETAIL'
          parent_id: string | null
          category: 'AKTIVA' | 'PASSIVA'
          sub_category: 'AKTIVA_LANCAR' | 'AKTIVA_TETAP' | 'HUTANG' | 'MODAL' | null
          balance_type: 'DEBIT' | 'CREDIT'
          created_at: string
        }
        Insert: {
          id?: string
          account_code: string
          account_name: string
          account_type: 'HEADER' | 'DETAIL'
          parent_id?: string | null
          category: 'AKTIVA' | 'PASSIVA'
          sub_category?: 'AKTIVA_LANCAR' | 'AKTIVA_TETAP' | 'HUTANG' | 'MODAL' | null
          balance_type: 'DEBIT' | 'CREDIT'
          created_at?: string
        }
        Update: {
          id?: string
          account_code?: string
          account_name?: string
          account_type?: 'HEADER' | 'DETAIL'
          parent_id?: string | null
          category?: 'AKTIVA' | 'PASSIVA'
          sub_category?: 'AKTIVA_LANCAR' | 'AKTIVA_TETAP' | 'HUTANG' | 'MODAL' | null
          balance_type?: 'DEBIT' | 'CREDIT'
          created_at?: string
        }
      }
      vehicles: {
        Row: {
          id: string
          vehicle_type: 'R4' | 'R2' | 'R2_KECIL'
          license_plate: string
          chassis_number: string | null
          engine_number: string | null
          body_number: string | null
          brand_type: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          vehicle_type: 'R4' | 'R2' | 'R2_KECIL'
          license_plate: string
          chassis_number?: string | null
          engine_number?: string | null
          body_number?: string | null
          brand_type?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          vehicle_type?: 'R4' | 'R2' | 'R2_KECIL'
          license_plate?: string
          chassis_number?: string | null
          engine_number?: string | null
          body_number?: string | null
          brand_type?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      goods: {
        Row: {
          id: string
          item_code: string
          name: string
          unit: string
          item_type: 'PERSEDIAAN' | 'NON_PERSEDIAAN' | 'ASET_AKTIVA_TETAP' | 'PERALATAN_WORKSHOP' | 'INVENTARIS_KANTOR' | 'FURNITURE' | 'PERLENGKAPAN'
          current_stock: number
          created_at: string
          selling_price: number
        }
        Insert: {
          id?: string
          item_code?: string
          name: string
          unit: string
          item_type: 'PERSEDIAAN' | 'NON_PERSEDIAAN' | 'ASET_AKTIVA_TETAP' | 'PERALATAN_WORKSHOP' | 'INVENTARIS_KANTOR' | 'FURNITURE' | 'PERLENGKAPAN'
          current_stock?: number
          created_at?: string
          selling_price?: number
        }
        Update: {
          id?: string
          item_code?: string
          name?: string
          unit?: string
          item_type?: 'PERSEDIAAN' | 'NON_PERSEDIAAN' | 'ASET_AKTIVA_TETAP' | 'PERALATAN_WORKSHOP' | 'INVENTARIS_KANTOR' | 'FURNITURE' | 'PERLENGKAPAN'
          current_stock?: number
          created_at?: string
          selling_price?: number
        }
      }
      suppliers: {
        Row: {
          id: string
          name: string
          pic_name: string | null
          phone_number: string | null
          address: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          pic_name?: string | null
          phone_number?: string | null
          address?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          pic_name?: string | null
          phone_number?: string | null
          address?: string | null
          created_at?: string
        }
      }
      mechanics: {
        Row: {
          id: string
          name: string
          specialization: 'R4' | 'R2' | 'R2_KECIL' | 'R4_R2' | 'ALL'
          phone_number: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          specialization: 'R4' | 'R2' | 'R2_KECIL' | 'R4_R2' | 'ALL'
          phone_number?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          specialization?: 'R4' | 'R2' | 'R2_KECIL' | 'R4_R2' | 'ALL'
          phone_number?: string | null
          created_at?: string
        }
      }
      job_types: {
        Row: {
          id: string
          job_name: string
          job_group: 'PERBAIKAN' | 'SERVICE_RINGAN'
          created_at: string
          selling_price: number
          hpp: number
        }
        Insert: {
          id?: string
          job_name: string
          job_group: 'PERBAIKAN' | 'SERVICE_RINGAN'
          created_at?: string
          selling_price?: number
          hpp?: number
        }
        Update: {
          id?: string
          job_name?: string
          job_group?: 'PERBAIKAN' | 'SERVICE_RINGAN'
          created_at?: string
          selling_price?: number
          hpp?: number
        }
      }
      budget_periods: {
        Row: {
          id: string
          month: string
          year: number
          created_at: string
        }
        Insert: {
          id?: string
          month: string
          year: number
          created_at?: string
        }
        Update: {
          id?: string
          month?: string
          year?: number
          created_at?: string
        }
      }
      budget_allocations: {
        Row: {
          id: string
          period_id: string
          vehicle_type: 'R4' | 'R2' | 'R2_KECIL' | 'R4/R2' | null
          service_group: 'PERBAIKAN' | 'SERVICE_RINGAN' | null
          amount: number
          created_at: string
        }
        Insert: {
          id?: string
          period_id: string
          vehicle_type?: 'R4' | 'R2' | 'R2_KECIL' | 'R4/R2' | null
          service_group?: 'PERBAIKAN' | 'SERVICE_RINGAN' | null
          amount?: number
          created_at?: string
        }
        Update: {
          id?: string
          period_id?: string
          vehicle_type?: 'R4' | 'R2' | 'R2_KECIL' | 'R4/R2' | null
          service_group?: 'PERBAIKAN' | 'SERVICE_RINGAN' | null
          amount?: number
          created_at?: string
        }
      }
      vehicle_entries: {
        Row: {
          id: string
          entry_number: string
          vehicle_id: string | null
          entry_date: string
          reference_number: string | null
          nota_dinas_number: string | null
          service_group: 'PERBAIKAN' | 'SERVICE_RINGAN'
          notes: string | null
          status: 'OPEN' | 'PROCESSED' | 'CLOSED' | null
          created_at: string
        }
        Update: {
          id?: string
          entry_number?: string
          vehicle_id?: string | null
          entry_date?: string
          reference_number?: string | null
          nota_dinas_number?: string | null
          service_group?: 'PERBAIKAN' | 'SERVICE_RINGAN'
          notes?: string | null
          status?: 'OPEN' | 'PROCESSED' | 'CLOSED' | null
          created_at?: string
        }
      }
      vehicle_entry_jobs: {
        Row: {
          id: string
          vehicle_entry_id: string
          job_type_id: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          vehicle_entry_id: string
          job_type_id?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          vehicle_entry_id?: string
          job_type_id?: string | null
          notes?: string | null
          created_at?: string
        }
      }
      vehicle_entry_spareparts: {
        Row: {
          id: string
          vehicle_entry_id: string
          job_type_id: string | null
          item_name: string
          qty: number
          estimated_price: number
          created_at: string
        }
        Insert: {
          id?: string
          vehicle_entry_id: string
          job_type_id?: string | null
          item_name: string
          qty: number
          estimated_price: number
          created_at?: string
        }
        Update: {
          id?: string
          vehicle_entry_id?: string
          job_type_id?: string | null
          item_name?: string
          qty?: number
          estimated_price?: number
          created_at?: string
        }
      }
      purchase_orders: {
        Row: {
          id: string
          po_number: string
          supplier_id: string | null
          work_order_id: string | null
          status: 'DRAFT' | 'ISSUED' | 'RECEIVED_PART' | 'RECEIVED_FULL'
          total_amount: number
          created_at: string
          po_date: string | null
        }
        Insert: {
          id?: string
          po_number?: string
          supplier_id?: string | null
          work_order_id?: string | null
          status?: 'DRAFT' | 'ISSUED' | 'RECEIVED_PART' | 'RECEIVED_FULL'
          total_amount?: number
          created_at?: string
          po_date?: string | null
        }
        Update: {
          id?: string
          po_number?: string
          supplier_id?: string | null
          work_order_id?: string | null
          status?: 'DRAFT' | 'ISSUED' | 'RECEIVED_PART' | 'RECEIVED_FULL'
          total_amount?: number
          created_at?: string
          po_date?: string | null
        }
      }
      purchase_order_items: {
        Row: {
          id: string
          po_id: string
          goods_id: string | null
          quantity: number
          unit_price: number | null
          total_price: number | null
          created_at: string
          brand: string | null
        }
        Insert: {
          id?: string
          po_id: string
          goods_id?: string | null
          quantity: number
          unit_price?: number | null
          total_price?: number | null
          created_at?: string
          brand?: string | null
        }
        Update: {
          id?: string
          po_id?: string
          goods_id?: string | null
          quantity?: number
          unit_price?: number | null
          total_price?: number | null
          created_at?: string
          brand?: string | null
        }
      }
      goods_receipts: {
        Row: {
          id: string
          receipt_number: string
          po_id: string | null
          receipt_date: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          receipt_number?: string
          po_id?: string | null
          receipt_date: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          receipt_number?: string
          po_id?: string | null
          receipt_date?: string
          notes?: string | null
          created_at?: string
        }
      }
      goods_receipt_items: {
        Row: {
          id: string
          receipt_id: string
          goods_id: string | null
          quantity_received: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          receipt_id: string
          goods_id?: string | null
          quantity_received: number
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          receipt_id?: string
          goods_id?: string | null
          quantity_received?: number
          notes?: string | null
          created_at?: string
        }
      }
      work_orders: {
        Row: {
          id: string
          wo_number: string
          vehicle_entry_id: string | null
          mechanic_id: string | null
          work_date: string
          status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED'
          created_at: string
        }
        Insert: {
          id?: string
          wo_number?: string
          vehicle_entry_id?: string | null
          mechanic_id?: string | null
          work_date: string
          status?: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED'
          created_at?: string
        }
        Update: {
          id?: string
          wo_number?: string
          vehicle_entry_id?: string | null
          mechanic_id?: string | null
          work_date?: string
          status?: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED'
          created_at?: string
        }
      }
      goods_issues: {
        Row: {
          id: string
          issue_number: string
          work_order_id: string | null
          issue_date: string
          created_at: string
        }
        Insert: {
          id?: string
          issue_number?: string
          work_order_id?: string | null
          issue_date: string
          created_at?: string
        }
        Update: {
          id?: string
          issue_number?: string
          work_order_id?: string | null
          issue_date?: string
          created_at?: string
        }
      }
      goods_issue_items: {
        Row: {
          id: string
          issue_id: string
          goods_id: string | null
          quantity: number
          created_at: string
        }
        Insert: {
          id?: string
          issue_id: string
          goods_id?: string | null
          quantity: number
          created_at?: string
        }
        Update: {
          id?: string
          issue_id?: string
          goods_id?: string | null
          quantity?: number
          created_at?: string
        }
      }
      work_order_billings: {
        Row: {
          id: string
          work_order_id: string
          item_type: 'JOB' | 'PART'
          job_type_id: string | null
          goods_id: string | null
          item_name: string
          qty: number
          unit_price: number
          total_price: number
          job_group: string | null
          created_at: string
        }
        Insert: {
          id?: string
          work_order_id: string
          item_type: 'JOB' | 'PART'
          job_type_id?: string | null
          goods_id?: string | null
          item_name: string
          qty?: number
          unit_price?: number
          total_price?: number
          job_group?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          work_order_id?: string
          item_type?: 'JOB' | 'PART'
          job_type_id?: string | null
          goods_id?: string | null
          item_name?: string
          qty?: number
          unit_price?: number
          total_price?: number
          job_group?: string | null
          created_at?: string
        }
      }
    }
  }
}
