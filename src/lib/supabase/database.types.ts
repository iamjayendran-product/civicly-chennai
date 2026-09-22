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
          id: string
          is_hidden: boolean
          lat: number | null
          lng: number | null
          location: unknown
          note: string | null
          reporter_id: string
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
          id?: string
          is_hidden?: boolean
          lat?: number | null
          lng?: number | null
          location: unknown
          note?: string | null
          reporter_id: string
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
          id?: string
          is_hidden?: boolean
          lat?: number | null
          lng?: number | null
          location?: unknown
          note?: string | null
          reporter_id?: string
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
      create_report: {
        Args: {
          p_category: Database["public"]["Enums"]["report_category"]
          p_lat: number
          p_lng: number
          p_note: string
          p_photo_paths: string[]
          p_subtype: Database["public"]["Enums"]["report_subtype"]
        }
        Returns: string
      }
    }
    Enums: {
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

