# AuraNode — Architecture Documentation

## Overview

AuraNode is a cloud-native SaaS platform for AI-powered diagnostic image analysis. This document describes the system architecture, data flow, security model, and deployment topology.

---

## System Architecture Diagram (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │               Next.js 14 App (Vercel Edge Network)                    │  │
│  │                                                                        │  │
│  │   ┌─────────────┐  ┌───────────────┐  ┌────────────┐  ┌──────────┐  │  │
│  │   │  Landing /  │  │  Clinic       │  │ Specialist │  │  Admin   │  │  │
│  │   │  Auth Pages │  │  Dashboard    │  │ Review UI  │  │ Console  │  │  │
│  │   │             │  │  (upload,     │  │ (flagged   │  │ (all     │  │  │
│  │   │  /login     │  │   cases list) │  │  cases)    │  │  users,  │  │  │
│  │   │  /register  │  │               │  │            │  │  cases)  │  │  │
│  │   └──────┬──────┘  └───────┬───────┘  └─────┬──────┘  └────┬─────┘  │  │
│  │          │                 │                 │               │        │  │
│  │          └─────────────────┴─────────────────┴───────────────┘        │  │
│  │                                     │                                  │  │
│  │                    Axios API Client (with JWT auth)                   │  │
│  └─────────────────────────────────────┼────────────────────────────────┘  │
└────────────────────────────────────────┼────────────────────────────────────┘
                                         │  HTTPS
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY LAYER                                  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                  FastAPI Backend (Render)                              │  │
│  │                                                                        │  │
│  │  CORSMiddleware │ Sentry Integration │ HTTPBearer Auth Middleware      │  │
│  │                                                                        │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │  │
│  │  │  /auth   │  │ /cases   │  │ /uploads │  │/analysis │  │/review │  │  │
│  │  │  router  │  │  router  │  │  router  │  │  router  │  │ router │  │  │
│  │  └─────┬────┘  └─────┬────┘  └─────┬────┘  └─────┬────┘  └────┬───┘  │  │
│  │        │             │             │              │             │      │  │
│  │  ┌─────▼─────────────▼─────────────▼──────────────▼─────────────▼──┐  │  │
│  │  │                      Services Layer                              │  │  │
│  │  │                                                                  │  │  │
│  │  │  SupabaseService  │  OCRService  │  AIService  │  ReportService │  │  │
│  │  └──────────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
                    │               │                  │
          ┌─────────▼──────┐  ┌─────▼──────────┐  ┌───▼────────────┐
          │   Supabase     │  │  Hugging Face  │  │    Sentry /    │
          │                │  │  Inference API │  │   Plausible    │
          │  ┌──────────┐  │  │                │  │  (Observab.)   │
          │  │PostgreSQL│  │  │ BART-large-    │  │                │
          │  │   + RLS  │  │  │ mnli (zero-   │  │                │
          │  └──────────┘  │  │  shot classif.)│  │                │
          │  ┌──────────┐  │  │                │  │                │
          │  │  Auth    │  │  └────────────────┘  └────────────────┘
          │  └──────────┘  │
          │  ┌──────────┐  │
          │  │ Storage  │  │
          │  │ (images, │  │
          │  │  PDFs)   │  │
          │  └──────────┘  │
          └────────────────┘
```

---

## Data Flow

### 1. User Registration & Authentication

```
Browser → POST /api/v1/auth/register
       → Supabase Auth: create auth.users record
       → Insert public.users profile (role, full_name, org)
       ← Return UserProfile

Browser → POST /api/v1/auth/login
       → Supabase Auth: sign_in_with_password
       ← Return {access_token, refresh_token, expires_in, user}

All subsequent requests:
  Authorization: Bearer <access_token>
  → Backend verifies via Supabase.auth.get_user(token)
```

### 2. Diagnostic Case Upload

```
Clinic User → POST /api/v1/cases           → Create case record (status: uploaded)
Clinic User → POST /api/v1/uploads/{id}    → Validate MIME + size
                                            → Upload to Supabase Storage bucket
                                            → Insert case_files record
                                            ← Return CaseFileResponse
```

### 3. AI Analysis Pipeline

```
Trigger: POST /api/v1/analysis/{case_id}

  1. Validate case exists + user has access
  2. Set case status → "processing"
  3. Create pending analysis_results record
  4. Return 202 Accepted immediately (async background task)

Background Task:
  ├── Download file from Supabase Storage
  ├── OCR (pytesseract): extract text + confidence score
  ├── HuggingFace API: zero-shot classification on extracted text
  │   Model: facebook/bart-large-mnli
  │   Labels: [high risk cardiac, moderate risk, normal, critical, benign]
  ├── Compute weighted risk_score (0.0 – 1.0)
  ├── If risk_score >= 0.70 → flagged = True
  ├── Update analysis_results record with all data
  └── Update case status → "flagged" | "completed"
```

### 4. Specialist Review

```
Specialist → GET /api/v1/cases?status=flagged    → List flagged cases
Specialist → GET /api/v1/analysis/{case_id}       → View AI findings
Specialist → POST /api/v1/reviews/{case_id}       → Submit review
                                                   → Set case status → "under_review"
                                                   → If decision is final → "completed"
```

### 5. Report Generation

```
Clinic/Admin → POST /api/v1/reports/{case_id}  (only for completed cases)
             → Fetch case + analysis + reviews from Supabase
             → Build PDF via ReportLab:
                 - AuraNode branded header
                 - Case information table
                 - Risk score + AI findings
                 - OCR extracted text
                 - Specialist review notes + decision
                 - Compliance footer
             → Upload PDF to generated-reports storage bucket
             → Insert reports record
             ← Return ReportResponse (with download URL)

Download: GET /api/v1/reports/{case_id}/download/{report_id}
        → Stream PDF bytes as application/pdf attachment
```

---

## Security Model

### Authentication
- **Supabase Auth** handles registration, login, password hashing (bcrypt), and JWT issuance
- JWT access tokens expire in 1 hour; refresh tokens used for silent renewal
- Backend verifies every JWT via `supabase.auth.get_user(token)` — no manual JWT decoding needed

### Authorisation (RBAC)

| Role | Permissions |
|------|------------|
| `clinic` | Create cases, upload files, trigger analysis, view own cases, download own reports |
| `specialist` | View assigned cases, submit reviews, view analysis results |
| `admin` | Full access: all cases, users, reviews, reports, delete operations |

### Database Row Level Security (RLS)

All Supabase tables have RLS enabled. Key policies:

```sql
-- Clinics see only their own cases
CREATE POLICY "clinic_own_cases" ON public.cases
  FOR ALL USING (clinic_id = auth.uid());

-- Specialists see only assigned cases
CREATE POLICY "specialist_assigned_cases" ON public.cases
  FOR SELECT USING (assigned_specialist_id = auth.uid());

-- Admins see everything
CREATE POLICY "admin_all_cases" ON public.cases
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
```

### Storage Security
- Both `diagnostic-uploads` and `generated-reports` buckets are **private**
- Files accessed via signed URLs (short-lived) or service role on the backend
- File size limited to 10 MB by default (configurable via `MAX_FILE_SIZE_MB`)
- MIME type validation rejects non-image/non-PDF uploads

### Frontend Middleware (Next.js)
- All `/dashboard`, `/cases`, `/review`, `/reports`, `/admin` routes require an active Supabase session
- Role-based redirect: `/admin/*` → admin only; `/review/*` → specialist only; etc.
- Unauthenticated users redirected to `/login?redirectTo=<original_path>`

---

## Deployment Topology

```
┌─────────────────────────────────────────────────────────┐
│                    Production Environment               │
│                                                         │
│  GitHub                                                 │
│  (main branch push)                                     │
│       │                                                 │
│       ├──── GitHub Actions ────► Vercel (Frontend)      │
│       │     frontend-deploy.yml   Next.js 14            │
│       │                           Edge Network          │
│       │                           *.vercel.app          │
│       │                                                 │
│       └──── GitHub Actions ────► Render (Backend)        │
│             backend-deploy.yml    FastAPI + Uvicorn      │
│                                   Docker container       │
│                                   *.onrender.com         │
│                                         │               │
│                                         │               │
│                               ┌─────────▼──────────┐    │
│                               │  Supabase (cloud)  │    │
│                               │  - PostgreSQL      │    │
│                               │  - Auth            │    │
│                               │  - Storage         │    │
│                               └────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Environment Variables Summary

| Service | Variable | Where to get it |
|---------|----------|----------------|
| Frontend | `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Settings > API |
| Frontend | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase > Settings > API |
| Frontend | `NEXT_PUBLIC_API_URL` | Your Render deployment URL |
| Backend | `SUPABASE_URL` | Supabase > Settings > API |
| Backend | `SUPABASE_SERVICE_KEY` | Supabase > Settings > API (service_role) |
| Backend | `SUPABASE_JWT_SECRET` | Supabase > Settings > API > JWT Settings |
| Backend | `HUGGINGFACE_API_KEY` | huggingface.co > Settings > Tokens |

---

## Technology Decision Log

| Decision | Alternative Considered | Reason |
|----------|----------------------|--------|
| Supabase (BaaS) | Firebase, custom Postgres | Built-in RLS, Auth, Storage — reduces infra complexity |
| HuggingFace free tier | OpenAI GPT, custom model | Zero cost, zero-shot classification sufficient for Phase 1 |
| ReportLab (PDF) | WeasyPrint, Puppeteer | Pure Python, no browser dependency, production-battle-tested |
| Render (backend) | AWS ECS, Fly.io | Dockerfile auto-detect, free tier, simple secret management |
| Vercel (frontend) | Netlify, Cloudflare Pages | Best Next.js support, Edge network, instant preview deploys |
| Tesseract OCR | AWS Textract, Google Vision | Free, offline-capable, no vendor lock-in |
