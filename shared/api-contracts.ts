/**
 * AuraNode — Shared API Contracts
 *
 * These TypeScript types describe the exact request/response shapes
 * used between the Next.js frontend and the FastAPI backend.
 * Imported by both frontend services and (optionally) backend type stubs.
 */

// ============================================================
// Common
// ============================================================

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

export interface ValidationError {
  error: string;
  details: { field: string; message: string }[];
}

// ============================================================
// Auth
// ============================================================

/** POST /api/v1/auth/register */
export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
  organization?: string;
  role: "clinic" | "specialist" | "admin";
}

/** POST /api/v1/auth/register — 201 Created */
export interface RegisterResponse {
  id: string;
  email: string;
  role: "clinic" | "specialist" | "admin";
  full_name: string | null;
  organization: string | null;
  created_at: string;
  updated_at: string;
}

/** POST /api/v1/auth/login */
export interface LoginRequest {
  email: string;
  password: string;
}

/** POST /api/v1/auth/login — 200 OK */
export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  user: UserProfileResponse;
}

/** User profile shape returned by all API endpoints */
export interface UserProfileResponse {
  id: string;
  email: string;
  role: "clinic" | "specialist" | "admin";
  full_name: string | null;
  organization: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Cases
// ============================================================

/** POST /api/v1/cases */
export interface CreateCaseRequest {
  title: string;
  description?: string;
  patient_reference?: string;
  priority?: "low" | "normal" | "high" | "critical";
}

/** PATCH /api/v1/cases/{case_id} */
export interface UpdateCaseRequest {
  title?: string;
  description?: string;
  patient_reference?: string;
  priority?: "low" | "normal" | "high" | "critical";
  assigned_specialist_id?: string | null;
}

/** Case resource — GET /api/v1/cases, GET /api/v1/cases/{case_id} */
export interface CaseResponse {
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
}

/** Query parameters for GET /api/v1/cases */
export interface ListCasesQuery {
  page?: number;
  per_page?: number;
  status?: "uploaded" | "processing" | "flagged" | "under_review" | "completed";
}

// ============================================================
// Uploads
// ============================================================

/** POST /api/v1/uploads/{case_id} — multipart/form-data */
export interface UploadFileRequest {
  file: File;
}

/** Case file resource — response from upload endpoint */
export interface CaseFileResponse {
  id: string;
  case_id: string;
  file_url: string;
  file_name: string;
  file_size: number;
  file_type: string;
  storage_path: string;
  uploaded_at: string;
}

// ============================================================
// Analysis
// ============================================================

/** POST /api/v1/analysis/{case_id} — trigger analysis */
export interface TriggerAnalysisRequest {
  // No request body required — case_id in URL is sufficient
}

/** AI findings nested structure */
export interface AIFindings {
  summary: string;
  anomalies: string[];
  recommendations: string[];
  confidence_breakdown: Record<string, number>;
  raw_response?: string | null;
}

/** Analysis result resource */
export interface AnalysisResultResponse {
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

// ============================================================
// Reviews
// ============================================================

/** POST /api/v1/reviews/{case_id} */
export interface SubmitReviewRequest {
  notes: string;
  decision: "approved" | "rejected" | "needs_more_info";
  risk_assessment?: string;
  recommendations?: string;
}

/** Review resource */
export interface ReviewResponse {
  id: string;
  case_id: string;
  specialist_id: string;
  notes: string | null;
  decision: "approved" | "rejected" | "needs_more_info" | null;
  risk_assessment: string | null;
  recommendations: string | null;
  reviewed_at: string;
}

// ============================================================
// Reports
// ============================================================

/** POST /api/v1/reports/{case_id} — generate PDF report */
export interface GenerateReportRequest {
  // No request body — case_id in URL is sufficient
}

/** Report resource */
export interface ReportResponse {
  id: string;
  case_id: string;
  report_url: string;
  storage_path: string;
  generated_by: string | null;
  generated_at: string;
}

// ============================================================
// Health
// ============================================================

/** GET /health */
export interface HealthCheckResponse {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
}

// ============================================================
// Error Shapes
// ============================================================

export interface APIError {
  error: string;
  path?: string;
}

export interface ValidationAPIError {
  error: string;
  details: Array<{
    field: string;
    message: string;
  }>;
}
