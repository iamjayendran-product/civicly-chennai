export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          value: Json
        }
        Insert: {
          key: string
          value: Json
        }
        Update: {
          key?: string
          value?: Json
        }
        Relationships: []
      }
      cmda_boundary: {
        Row: {
          geom: unknown
          id: number
        }
        Insert: {
          geom: unknown
          id?: number
        }
        Update: {
          geom?: unknown
          id?: number
        }
        Relationships: []
      }
      gcc_boundary: {
        Row: {
          geom: unknown
          id: number
        }
        Insert: {
          geom: unknown
          id?: number
        }
        Update: {
          geom?: unknown
          id?: number
        }
        Relationships: []
      }
      gcc_submissions: {
        Row: {
          attempts: number
          blocked_at: string | null
          blocked_by: string | null
          blocked_reason: string | null
          claimed_at: string | null
          complaint_number: string | null
          created_at: string
          gender: string
          last_error: string | null
          next_attempt_at: string
          report_id: string
          status: Database["public"]["Enums"]["gcc_status"]
          submitted_at: string | null
        }
        Insert: {
          attempts?: number
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          claimed_at?: string | null
          complaint_number?: string | null
          created_at?: string
          gender: string
          last_error?: string | null
          next_attempt_at: string
          report_id: string
          status?: Database["public"]["Enums"]["gcc_status"]
          submitted_at?: string | null
        }
        Update: {
          attempts?: number
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          claimed_at?: string | null
          complaint_number?: string | null
          created_at?: string
          gender?: string
          last_error?: string | null
          next_attempt_at?: string
          report_id?: string
          status?: Database["public"]["Enums"]["gcc_status"]
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gcc_submissions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: true
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_events: {
        Row: {
          action: string
          created_at: string
          id: number
          ip_hash: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: number
          ip_hash?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: number
          ip_hash?: string | null
          user_id?: string
        }
        Relationships: []
      }
      report_contacts: {
        Row: {
          created_at: string
          name: string
          phone: string
          report_id: string
        }
        Insert: {
          created_at?: string
          name: string
          phone: string
          report_id: string
        }
        Update: {
          created_at?: string
          name?: string
          phone?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_contacts_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: true
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_owners: {
        Row: {
          report_id: string
          reporter_id: string
        }
        Insert: {
          report_id: string
          reporter_id: string
        }
        Update: {
          report_id?: string
          reporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_owners_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: true
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_photos: {
        Row: {
          blurred: boolean
          created_at: string
          id: string
          kind: string
          report_id: string
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          blurred?: boolean
          created_at?: string
          id?: string
          kind: string
          report_id: string
          storage_path: string
          uploaded_by: string
        }
        Update: {
          blurred?: boolean
          created_at?: string
          id?: string
          kind?: string
          report_id?: string
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_photos_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          category: Database["public"]["Enums"]["report_category"]
          created_at: string
          fix_confirm_count: number
          fixed_at: string | null
          flag_count: number
          gcc_complaint_number: string | null
          gcc_road_name: string | null
          gcc_status: Database["public"]["Enums"]["gcc_status"] | null
          gcc_street_id: string | null
          gcc_ward: string | null
          gcc_zone: string | null
          id: string
          is_hidden: boolean
          landmark: string | null
          lat: number | null
          lng: number | null
          location: unknown
          note: string | null
          status: Database["public"]["Enums"]["report_status"]
          subtype: Database["public"]["Enums"]["report_subtype"] | null
          updated_at: string
          upvote_count: number
        }
        Insert: {
          category: Database["public"]["Enums"]["report_category"]
          created_at?: string
          fix_confirm_count?: number
          fixed_at?: string | null
          flag_count?: number
          gcc_complaint_number?: string | null
          gcc_road_name?: string | null
          gcc_status?: Database["public"]["Enums"]["gcc_status"] | null
          gcc_street_id?: string | null
          gcc_ward?: string | null
          gcc_zone?: string | null
          id?: string
          is_hidden?: boolean
          landmark?: string | null
          lat?: number | null
          lng?: number | null
          location: unknown
          note?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          subtype?: Database["public"]["Enums"]["report_subtype"] | null
          updated_at?: string
          upvote_count?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["report_category"]
          created_at?: string
          fix_confirm_count?: number
          fixed_at?: string | null
          flag_count?: number
          gcc_complaint_number?: string | null
          gcc_road_name?: string | null
          gcc_status?: Database["public"]["Enums"]["gcc_status"] | null
          gcc_street_id?: string | null
          gcc_ward?: string | null
          gcc_zone?: string | null
          id?: string
          is_hidden?: boolean
          landmark?: string | null
          lat?: number | null
          lng?: number | null
          location?: unknown
          note?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          subtype?: Database["public"]["Enums"]["report_subtype"] | null
          updated_at?: string
          upvote_count?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_gcc_submissions: {
        Args: { p_limit: number }
        Returns: {
          category: Database["public"]["Enums"]["report_category"]
          gcc_road_name: string
          gcc_street_id: string
          gcc_ward: string
          gcc_zone: string
          gender: string
          landmark: string
          lat: number
          lng: number
          note: string
          photo_path: string
          report_id: string
          reporter_name: string
          subtype: Database["public"]["Enums"]["report_subtype"]
        }[]
      }
      confirm_same_issue: { Args: { p_report_id: string }; Returns: undefined }
      create_report: {
        Args: {
          p_category: Database["public"]["Enums"]["report_category"]
          p_gcc_road_name?: string
          p_gcc_street_id?: string
          p_gcc_ward?: string
          p_gcc_zone?: string
          p_gender?: string
          p_landmark?: string
          p_lat: number
          p_lng: number
          p_note: string
          p_photo_blurred?: boolean[]
          p_photo_paths: string[]
          p_reporter_name?: string
          p_reporter_phone?: string
          p_subtype: Database["public"]["Enums"]["report_subtype"]
        }
        Returns: string
      }
      nearby_reports: {
        Args: {
          p_category: Database["public"]["Enums"]["report_category"]
          p_lat: number
          p_lng: number
          p_radius_m?: number
        }
        Returns: {
          created_at: string
          id: string
          subtype: Database["public"]["Enums"]["report_subtype"]
          upvote_count: number
        }[]
      }
      record_gcc_result: {
        Args: {
          p_complaint_number: string
          p_error: string
          p_report_id: string
        }
        Returns: undefined
      }
      reports_in_bbox: {
        Args: {
          p_include_fixed?: boolean
          p_max_lat: number
          p_max_lng: number
          p_min_lat: number
          p_min_lng: number
        }
        Returns: {
          category: Database["public"]["Enums"]["report_category"]
          created_at: string
          gcc_complaint_number: string
          gcc_road_name: string
          gcc_status: Database["public"]["Enums"]["gcc_status"]
          id: string
          landmark: string
          lat: number
          lng: number
          note: string
          status: Database["public"]["Enums"]["report_status"]
          subtype: Database["public"]["Enums"]["report_subtype"]
          upvote_count: number
        }[]
      }
      trigger_gcc_forward: { Args: never; Returns: undefined }
    }
    Enums: {
      gcc_status: "pending" | "in_flight" | "submitted" | "failed" | "blocked"
      report_category: "pothole" | "waterlogging" | "other"
      report_status: "open" | "fixed"
      report_subtype:
        | "open_manhole"
        | "debris"
        | "damaged_footpath"
        | "dug_up_road"
        | "speed_breaker"
        | "signage"
        | "other"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      gcc_status: ["pending", "in_flight", "submitted", "failed", "blocked"],
      report_category: ["pothole", "waterlogging", "other"],
      report_status: ["open", "fixed"],
      report_subtype: [
        "open_manhole",
        "debris",
        "damaged_footpath",
        "dug_up_road",
        "speed_breaker",
        "signage",
        "other",
      ],
    },
  },
} as const

