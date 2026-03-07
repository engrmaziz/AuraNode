-- ============================================================
-- AuraNode — Supabase Database Setup
-- Run this SQL in: Supabase Dashboard > SQL Editor
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id          UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email       TEXT        NOT NULL UNIQUE,
  role        TEXT        NOT NULL CHECK (role IN ('clinic', 'specialist', 'admin')),
  full_name   TEXT,
  organization TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Cases table
CREATE TABLE IF NOT EXISTS public.cases (
  id                      UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  clinic_id               UUID        REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  title                   TEXT        NOT NULL,
  description             TEXT,
  patient_reference       TEXT,
  status                  TEXT        NOT NULL DEFAULT 'uploaded'
                          CHECK (status IN ('uploaded', 'processing', 'flagged', 'under_review', 'completed')),
  priority                TEXT        NOT NULL DEFAULT 'normal'
                          CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  assigned_specialist_id  UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at              TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Case files table
CREATE TABLE IF NOT EXISTS public.case_files (
  id            UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  case_id       UUID        REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  file_url      TEXT        NOT NULL,
  file_name     TEXT        NOT NULL,
  file_size     INTEGER     NOT NULL,
  file_type     TEXT        NOT NULL,
  storage_path  TEXT        NOT NULL,
  uploaded_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Analysis results table
CREATE TABLE IF NOT EXISTS public.analysis_results (
  id                  UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  case_id             UUID        REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  file_id             UUID        REFERENCES public.case_files(id) ON DELETE SET NULL,
  extracted_text      TEXT,
  confidence_score    FLOAT,
  risk_score          FLOAT,
  flagged_status      BOOLEAN     DEFAULT FALSE NOT NULL,
  ai_findings         JSONB,
  processing_time_ms  INTEGER,
  model_version       TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Reviews table
CREATE TABLE IF NOT EXISTS public.reviews (
  id                UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  case_id           UUID        REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  specialist_id     UUID        REFERENCES public.users(id) ON DELETE RESTRICT NOT NULL,
  notes             TEXT,
  decision          TEXT        CHECK (decision IN ('approved', 'rejected', 'needs_more_info')),
  risk_assessment   TEXT,
  recommendations   TEXT,
  reviewed_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Reports table
CREATE TABLE IF NOT EXISTS public.reports (
  id            UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  case_id       UUID        REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  report_url    TEXT        NOT NULL,
  storage_path  TEXT        NOT NULL,
  generated_by  UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  generated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id            UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id       UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  action        TEXT        NOT NULL,
  resource_type TEXT        NOT NULL,
  resource_id   UUID,
  metadata      JSONB,
  ip_address    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_files      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs      ENABLE ROW LEVEL SECURITY;

-- ── Users policies ──────────────────────────────────────────
-- Each user can read/update their own profile
CREATE POLICY "users_own_profile"
  ON public.users FOR ALL
  USING (auth.uid() = id);

-- Admins can see all users
CREATE POLICY "admin_all_users"
  ON public.users FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── Cases policies ──────────────────────────────────────────
-- Clinics can manage their own cases
CREATE POLICY "clinic_own_cases"
  ON public.cases FOR ALL
  USING (clinic_id = auth.uid());

-- Specialists can see cases assigned to them
CREATE POLICY "specialist_assigned_cases"
  ON public.cases FOR SELECT
  USING (assigned_specialist_id = auth.uid());

-- Specialists can update cases assigned to them (for status changes)
CREATE POLICY "specialist_update_assigned_cases"
  ON public.cases FOR UPDATE
  USING (assigned_specialist_id = auth.uid());

-- Admins can do everything with cases
CREATE POLICY "admin_all_cases"
  ON public.cases FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── Case files policies ─────────────────────────────────────
CREATE POLICY "clinic_own_case_files"
  ON public.case_files FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.cases WHERE id = case_files.case_id AND clinic_id = auth.uid()
    )
  );

CREATE POLICY "specialist_assigned_case_files"
  ON public.case_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.cases WHERE id = case_files.case_id AND assigned_specialist_id = auth.uid()
    )
  );

CREATE POLICY "admin_all_case_files"
  ON public.case_files FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── Analysis results policies ───────────────────────────────
CREATE POLICY "clinic_own_analysis"
  ON public.analysis_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.cases WHERE id = analysis_results.case_id AND clinic_id = auth.uid()
    )
  );

CREATE POLICY "specialist_assigned_analysis"
  ON public.analysis_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.cases WHERE id = analysis_results.case_id AND assigned_specialist_id = auth.uid()
    )
  );

CREATE POLICY "service_role_analysis"
  ON public.analysis_results FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "admin_all_analysis"
  ON public.analysis_results FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── Reviews policies ────────────────────────────────────────
CREATE POLICY "specialist_own_reviews"
  ON public.reviews FOR ALL
  USING (specialist_id = auth.uid());

CREATE POLICY "clinic_case_reviews"
  ON public.reviews FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.cases WHERE id = reviews.case_id AND clinic_id = auth.uid()
    )
  );

CREATE POLICY "admin_all_reviews"
  ON public.reviews FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── Reports policies ────────────────────────────────────────
CREATE POLICY "clinic_own_reports"
  ON public.reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.cases WHERE id = reports.case_id AND clinic_id = auth.uid()
    )
  );

CREATE POLICY "service_role_reports"
  ON public.reports FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "admin_all_reports"
  ON public.reports FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── Audit log policies ──────────────────────────────────────
CREATE POLICY "service_role_audit_logs"
  ON public.audit_logs FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "admin_read_audit_logs"
  ON public.audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- INDEXES (performance)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_cases_clinic_id         ON public.cases(clinic_id);
CREATE INDEX IF NOT EXISTS idx_cases_status            ON public.cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_priority          ON public.cases(priority);
CREATE INDEX IF NOT EXISTS idx_cases_assigned          ON public.cases(assigned_specialist_id);
CREATE INDEX IF NOT EXISTS idx_case_files_case_id      ON public.case_files(case_id);
CREATE INDEX IF NOT EXISTS idx_analysis_case_id        ON public.analysis_results(case_id);
CREATE INDEX IF NOT EXISTS idx_analysis_flagged        ON public.analysis_results(flagged_status);
CREATE INDEX IF NOT EXISTS idx_reviews_case_id         ON public.reviews(case_id);
CREATE INDEX IF NOT EXISTS idx_reviews_specialist_id   ON public.reviews(specialist_id);
CREATE INDEX IF NOT EXISTS idx_reports_case_id         ON public.reports(case_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id      ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at   ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource     ON public.audit_logs(resource_type, resource_id);

-- ============================================================
-- TRIGGERS — auto-update updated_at columns
-- This function is invoked by triggers on the `cases` and `users`
-- tables. It automatically sets `updated_at` to the current
-- timestamp whenever a row is modified, ensuring audit accuracy.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_cases_updated_at
  BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- STORAGE BUCKETS
-- NOTE: Run these commands in the Supabase Storage UI, or via
--       the Supabase CLI / Management API. They cannot be run
--       in the SQL Editor directly.
--
-- supabase storage create diagnostic-uploads --private
-- supabase storage create generated-reports  --private
-- ============================================================

-- ============================================================
-- DONE
-- ============================================================
-- After running this script:
-- 1. Create storage buckets (see note above)
-- 2. Copy backend/.env.example to backend/.env and fill values
-- 3. Copy frontend/.env.local.example to frontend/.env.local and fill values
-- ============================================================
