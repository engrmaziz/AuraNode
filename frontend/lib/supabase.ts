import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr";
import { createClientComponentClient, createServerComponentClient, createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";

export type UserRole = "clinic" | "specialist" | "admin";

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          role: UserRole;
          full_name: string | null;
          organization: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role: UserRole;
          full_name?: string | null;
          organization?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role?: UserRole;
          full_name?: string | null;
          organization?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      cases: {
        Row: {
          id: string;
          clinic_id: string;
          title: string;
          description: string | null;
          patient_reference: string | null;
          status: "uploaded" | "processing" | "flagged" | "under_review" | "completed";
          priority: "low" | "normal" | "high" | "critical";
          assigned_specialist_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          title: string;
          description?: string | null;
          patient_reference?: string | null;
          status?: "uploaded" | "processing" | "flagged" | "under_review" | "completed";
          priority?: "low" | "normal" | "high" | "critical";
          assigned_specialist_id?: string | null;
        };
        Update: {
          title?: string;
          description?: string | null;
          patient_reference?: string | null;
          status?: "uploaded" | "processing" | "flagged" | "under_review" | "completed";
          priority?: "low" | "normal" | "high" | "critical";
          assigned_specialist_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      case_files: {
        Row: {
          id: string;
          case_id: string;
          file_url: string;
          file_name: string;
          file_size: number;
          file_type: string;
          storage_path: string;
          uploaded_at: string;
        };
        Insert: {
          id?: string;
          case_id: string;
          file_url: string;
          file_name: string;
          file_size: number;
          file_type: string;
          storage_path: string;
        };
        Update: {
          file_url?: string;
        };
        Relationships: [];
      };
      analysis_results: {
        Row: {
          id: string;
          case_id: string;
          file_id: string | null;
          extracted_text: string | null;
          confidence_score: number | null;
          risk_score: number | null;
          flagged_status: boolean;
          ai_findings: Record<string, unknown> | null;
          processing_time_ms: number | null;
          model_version: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          case_id: string;
          file_id?: string | null;
          extracted_text?: string | null;
          confidence_score?: number | null;
          risk_score?: number | null;
          flagged_status?: boolean;
          ai_findings?: Record<string, unknown> | null;
          processing_time_ms?: number | null;
          model_version?: string | null;
        };
        Update: {
          extracted_text?: string | null;
          confidence_score?: number | null;
          risk_score?: number | null;
          flagged_status?: boolean;
          ai_findings?: Record<string, unknown> | null;
        };
        Relationships: [];
      };
      reviews: {
        Row: {
          id: string;
          case_id: string;
          specialist_id: string;
          notes: string | null;
          decision: "approved" | "rejected" | "needs_more_info" | null;
          risk_assessment: string | null;
          recommendations: string | null;
          reviewed_at: string;
        };
        Insert: {
          id?: string;
          case_id: string;
          specialist_id: string;
          notes?: string | null;
          decision?: "approved" | "rejected" | "needs_more_info" | null;
          risk_assessment?: string | null;
          recommendations?: string | null;
        };
        Update: {
          notes?: string | null;
          decision?: "approved" | "rejected" | "needs_more_info" | null;
          risk_assessment?: string | null;
          recommendations?: string | null;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          case_id: string;
          report_url: string;
          storage_path: string;
          generated_by: string | null;
          generated_at: string;
        };
        Insert: {
          id?: string;
          case_id: string;
          report_url: string;
          storage_path: string;
          generated_by?: string | null;
        };
        Update: {
          report_url?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          resource_type: string;
          resource_id: string | null;
          metadata: Record<string, unknown> | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          action: string;
          resource_type: string;
          resource_id?: string | null;
          metadata?: Record<string, unknown> | null;
          ip_address?: string | null;
        };
        Update: {
          metadata?: Record<string, unknown> | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Keep for any files that still import it directly
export { createMiddlewareClient };

/**
 * Client-side Supabase client using @supabase/ssr.
 * This MUST use @supabase/ssr (not auth-helpers) so it reads the same
 * cookie format that middleware writes. Using auth-helpers here causes
 * session mismatch — the token is refreshed by middleware but unreadable
 * by the browser client, producing 401s on all API calls.
 */
export const createBrowserClient = () =>
  createSSRBrowserClient<Database>(supabaseUrl, supabaseAnonKey);

/**
 * Server-side Supabase client.
 * Use in Server Components, Route Handlers, and Server Actions.
 */
export const createServerClient = () => {
  const { cookies } = require("next/headers") as { cookies: typeof import("next/headers").cookies }; // eslint-disable-line
  return createServerComponentClient<Database>({ cookies });
};

/**
 * Admin Supabase client using service role key.
 * SERVER SIDE ONLY — never expose service key to browser.
 */
export const createAdminClient = () => {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_KEY is not defined");
  }
  return createClient<Database>(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};
