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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      accounts_payable: {
        Row: {
          amount: number
          card_id: string | null
          category_id: string
          created_at: string
          created_by: string
          current_installment: number | null
          description: string
          due_date: string
          expense_type: Database["public"]["Enums"]["expense_type"]
          id: string
          installments: number | null
          paid: boolean | null
          paid_date: string | null
          payment_type_id: string
          updated_at: string
          is_fixed: boolean | null
          responsible_person_id: string | null
          purchase_date: string | null
          original_fixed_account_id: string | null
        }
        Insert: {
          amount: number
          card_id?: string | null
          category_id: string
          created_at?: string
          created_by: string
          current_installment?: number | null
          description: string
          due_date: string
          expense_type?: Database["public"]["Enums"]["expense_type"]
          id?: string
          installments?: number | null
          paid?: boolean | null
          paid_date?: string | null
          payment_type_id: string
          updated_at?: string
          is_fixed?: boolean | null
          responsible_person_id?: string | null
          purchase_date?: string | null
          original_fixed_account_id?: string | null
        }
        Update: {
          amount?: number
          card_id?: string | null
          category_id?: string
          created_at?: string
          created_by?: string
          current_installment?: number | null
          description?: string
          due_date?: string
          expense_type?: Database["public"]["Enums"]["expense_type"]
          id?: string
          installments?: number | null
          paid?: boolean | null
          paid_date?: string | null
          payment_type_id?: string
          updated_at?: string
          is_fixed?: boolean | null
          responsible_person_id?: string | null
          purchase_date?: string | null
          original_fixed_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_payable_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_original_fixed_account_id_fkey"
            columns: ["original_fixed_account_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_payment_type_id_fkey"
            columns: ["payment_type_id"]
            isOneToOne: false
            referencedRelation: "payment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_responsible_person_id_fkey"
            columns: ["responsible_person_id"]
            isOneToOne: false
            referencedRelation: "responsible_persons"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts_receivable: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          current_installment: number | null
          description: string
          id: string
          income_type_id: string
          installments: number | null
          payer_id: string | null
          receive_date: string
          received: boolean | null
          received_date: string | null
          source_id: string
          updated_at: string
          is_fixed: boolean | null
          responsible_person_id: string | null
          original_fixed_account_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          current_installment?: number | null
          description: string
          id?: string
          income_type_id: string
          installments?: number | null
          payer_id?: string | null
          receive_date: string
          received?: boolean | null
          received_date?: string | null
          source_id: string
          updated_at?: string
          is_fixed?: boolean | null
          responsible_person_id?: string | null
          original_fixed_account_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          current_installment?: number | null
          description?: string
          id?: string
          income_type_id?: string
          installments?: number | null
          payer_id?: string | null
          receive_date?: string
          received?: boolean | null
          received_date?: string | null
          source_id?: string
          updated_at?: string
          is_fixed?: boolean | null
          responsible_person_id?: string | null
          original_fixed_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_receivable_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_income_type_id_fkey"
            columns: ["income_type_id"]
            isOneToOne: false
            referencedRelation: "income_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_original_fixed_account_id_fkey"
            columns: ["original_fixed_account_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "payers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_responsible_person_id_fkey"
            columns: ["responsible_person_id"]
            isOneToOne: false
            referencedRelation: "responsible_persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "income_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      banks: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      credit_card_transactions: {
        Row: {
          amount: number
          card_id: string
          category_id: string
          created_at: string
          created_by: string
          current_installment: number | null
          description: string
          id: string
          installments: number | null
          purchase_date: string
          updated_at: string
          is_fixed: boolean | null // Adicionado
          original_fixed_transaction_id: string | null // Adicionado
        }
        Insert: {
          amount: number
          card_id: string
          category_id: string
          created_at?: string
          created_by: string
          current_installment?: number | null
          description: string
          id?: string
          installments?: number | null
          purchase_date: string
          updated_at?: string
          is_fixed?: boolean | null // Adicionado
          original_fixed_transaction_id?: string | null // Adicionado
        }
        Update: {
          amount?: number
          card_id?: string
          category_id?: string
          created_at?: string
          created_by?: string
          current_installment?: number | null
          description?: string
          id?: string
          installments?: number | null
          purchase_date?: string
          updated_at?: string
          is_fixed?: boolean | null // Adicionado
          original_fixed_transaction_id?: string | null // Adicionado
        }
        Relationships: [
          {
            foreignKeyName: "credit_card_transactions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_transactions_original_fixed_transaction_id_fkey" // Adicionado
            columns: ["original_fixed_transaction_id"]
            isOneToOne: false
            referencedRelation: "credit_card_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_cards: {
        Row: {
          best_purchase_date: number | null
          brand: Database["public"]["Enums"]["card_brand"] | null
          created_at: string
          created_by: string
          credit_limit: number | null
          due_date: number | null
          id: string
          last_digits: string | null
          name: string
          owner_name: string | null
          updated_at: string
        }
        Insert: {
          best_purchase_date?: number | null
          brand?: Database["public"]["Enums"]["card_brand"] | null
          created_at?: string
          created_by: string
          credit_limit?: number | null
          due_date?: number | null
          id?: string
          last_digits?: string | null
          name: string
          owner_name?: string | null
          updated_at?: string
        }
        Update: {
          best_purchase_date?: number | null
          brand?: Database["public"]["Enums"]["card_brand"] | null
          created_at?: string
          created_by?: string
          credit_limit?: number | null
          due_date?: number | null
          id?: string
          last_digits?: string | null
          name?: string
          owner_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      income_sources: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      income_types: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      payers: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      payment_types: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      piggy_bank_entries: {
        Row: {
          amount: number
          created_at: string
          description: string
          entry_date: string
          id: string
          type: Database["public"]["Enums"]["piggy_bank_entry_type"]
          user_id: string
          bank_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          description: string
          entry_date?: string
          id?: string
          type: Database["public"]["Enums"]["piggy_bank_entry_type"]
          user_id: string
          bank_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          entry_date?: string
          id?: string
          type?: Database["public"]["Enums"]["piggy_bank_entry_type"]
          user_id?: string
          bank_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "piggy_bank_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piggy_bank_entries_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string | null
          invited_by_user_id: string | null
          is_family_member: boolean | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string | null
          invited_by_user_id?: string | null
          is_family_member?: boolean | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string | null
          invited_by_user_id?: string | null
          is_family_member?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      responsible_persons: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      card_brand: "visa" | "master"
      expense_type: "fixa" | "variavel"
      piggy_bank_entry_type: "deposit" | "withdrawal"
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
    Enums: {
      app_role: ["admin", "user"],
      card_brand: ["visa", "master"],
      expense_type: ["fixa", "variavel"],
      piggy_bank_entry_type: ["deposit", "withdrawal"],
    },
  },
} as const