// ============================================================
// AuraNode — Core TypeScript Interfaces
// ============================================================

export type UserRole = "clinic" | "specialist" | "admin";

export type CaseStatus = "uploaded" | "processing" | "processing_failed" | "flagged" | "under_review" | "completed" | "deleted";

export type CasePriority = "low" | "normal" | "high" | "critical";

export type ReviewDecision = "approved" | "rejected" | "needs_more_info";

// ─── Domain Models ──────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  role: UserRole;
  full_name: string | null;
  organization: string | null;
  created_at: string;
  updated_at: string;
}

export interface Case {
  id: string;
  clinic_id: string;
  title: string;
  description: string | null;
  patient_reference: string | null;
  status: CaseStatus;
  priority: CasePriority;
  assigned_specialist_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined relations (optional, populated by some endpoints)
  clinic?: Pick<User, "id" | "email" | "full_name" | "organization">;
  specialist?: Pick<User, "id" | "email" | "full_name"> | null;
  files?: CaseFile[];
  analysis?: AnalysisResult | null;
}

export interface CaseFile {
  id: string;
  case_id: string;
  file_url: string;
  file_name: string;
  file_size: number;
  file_type: string;
  storage_path: string;
  uploaded_at: string;
}

export interface AnalysisResult {
  id: string;
  case_id: string;
  file_id: string | null;
  extracted_text: string | null;
  confidence_score: number | null;
  risk_score: number | null;
  flagged_status: boolean;
  ai_findings: AIFindings | null;
  processing_time_ms: number | null;
  model_version: string | null;
  created_at: string;
}

export interface OCRStatus {
  case_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  message: string;
}

export interface AIFindings {
  // New Phase 5 fields
  detected_category?: string;
  category_confidence?: number;
  extracted_entities?: AIEntity[];
  critical_keywords_found?: string[];
  analysis_summary?: string;
  // Legacy fields (kept for backward compatibility)
  summary: string;
  anomalies: string[];
  recommendations: string[];
  confidence_breakdown: Record<string, number>;
  raw_response?: string;
}

export interface AIEntity {
  entity: string;
  label: string;
  confidence: number;
}

export interface Review {
  id: string;
  case_id: string;
  specialist_id: string;
  notes: string | null;
  decision: ReviewDecision | null;
  risk_assessment: string | null;
  recommendations: string | null;
  reviewed_at: string;
  // Joined
  specialist?: Pick<User, "id" | "email" | "full_name">;
}

export interface Report {
  id: string;
  case_id: string;
  report_url: string;
  storage_path: string;
  generated_by: string | null;
  generated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

// ─── API Wrapper ─────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  data: T;
  error: string | null;
}

export interface PaginatedResponse<T = unknown> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
  error: string | null;
}

// ─── Request / Form Types ────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
  organization?: string;
  role: UserRole;
}

export interface CreateCaseRequest {
  title: string;
  description?: string;
  patient_reference?: string;
  priority?: CasePriority;
}

export interface UpdateCaseRequest {
  title?: string;
  description?: string;
  patient_reference?: string;
  priority?: CasePriority;
  assigned_specialist_id?: string | null;
}

export interface SubmitReviewRequest {
  notes: string;
  decision: ReviewDecision;
  risk_assessment?: string;
  recommendations?: string;
}

// ─── UI State Types ──────────────────────────────────────────

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant: "default" | "success" | "warning" | "destructive";
}

export interface UploadProgress {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

export interface FilterOptions {
  status?: CaseStatus;
  priority?: CasePriority;
  search?: string;
  page?: number;
  per_page?: number;
  order_by?: string;
  order_dir?: "asc" | "desc";
}
