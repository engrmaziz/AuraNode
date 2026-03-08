# AuraNode

> **AI-Powered Diagnostic Intelligence** — A production SaaS platform enabling clinics to upload diagnostic images (ECG scans, X-rays, etc.), process them through OCR + AI analysis, route flagged cases to specialists, and generate PDF reports.

[![Deploy Frontend](https://github.com/engrmaziz/AuraNode/actions/workflows/frontend-deploy.yml/badge.svg)](https://github.com/engrmaziz/AuraNode/actions/workflows/frontend-deploy.yml)
[![Deploy Backend](https://github.com/engrmaziz/AuraNode/actions/workflows/backend-deploy.yml/badge.svg)](https://github.com/engrmaziz/AuraNode/actions/workflows/backend-deploy.yml)

---

## Table of Contents

1. [Overview & Features](#overview--features)
2. [Tech Stack](#tech-stack)
3. [Architecture](#architecture)
4. [Project Structure](#project-structure)
5. [Setup Instructions](#setup-instructions)
6. [Environment Variables](#environment-variables)
7. [Running Locally](#running-locally)
8. [Deployment Guide](#deployment-guide)
9. [API Reference](#api-reference)
10. [Database Schema](#database-schema)
11. [Troubleshooting](#troubleshooting)
12. [Contributing](#contributing)
13. [License](#license)

---

## Overview & Features

AuraNode is a HIPAA-conscious medical imaging SaaS platform that:

- **Upload & Store** — Clinics upload diagnostic images (ECG, X-ray, MRI) securely to Supabase Storage
- **OCR Processing** — pytesseract extracts text from scans automatically
- **AI Risk Analysis** — Extracted text sent to Hugging Face Inference API for risk scoring
- **Automated Flagging** — High-risk cases (score ≥ 0.7) flagged for mandatory specialist review
- **Specialist Review** — Assigned specialists review cases, submit decisions with clinical notes
- **PDF Report Generation** — Full diagnostic reports generated via ReportLab with multi-page layouts
- **Role-Based Access** — Clinic, Specialist, and Admin roles with row-level security
- **Audit Trail** — Every action recorded in `audit_logs` with user ID and timestamp
- **Error Tracking** — Sentry integration on both frontend and backend
- **CI/CD Pipelines** — Automated deploy to Vercel (frontend) and Railway (backend)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| Backend | FastAPI, Python 3.11 |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth (JWT) |
| Storage | Supabase Storage |
| OCR (Backend) | pytesseract + Pillow |
| AI Analysis | Hugging Face Inference API |
| PDF Generation | ReportLab |
| Error Tracking | Sentry |
| Frontend Hosting | Vercel |
| Backend Hosting | Railway (Docker) |
| CI/CD | GitHub Actions |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          CLIENT BROWSER                          │
│  Next.js 15 App (Vercel)                                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────┐  │
│  │  Upload UI  │  │ Dashboard  │  │  Review UI  │  │ Reports  │  │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └────┬─────┘  │
└────────┼───────────────┼───────────────┼───────────────┼────────┘
         │               │               │               │
         ▼               ▼               ▼               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    FastAPI Backend (Railway)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │   Auth   │  │  Cases   │  │ Analysis │  │   Reports    │    │
│  │  Router  │  │  Router  │  │  Router  │  │    Router    │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘    │
│       │             │             │                │             │
│  ┌────▼─────────────▼─────────────▼────────────────▼──────┐     │
│  │                      Services Layer                     │     │
│  │  supabase_service │ ocr_service │ ai_service │ reports  │     │
│  └─────────────────────────────────────────────────────────┘     │
└───────────────────────────────┬──────────────────────────────────┘
                                │
             ┌──────────────────┼──────────────────┐
             ▼                  ▼                  ▼
    ┌─────────────┐   ┌──────────────────┐   ┌──────────────┐
    │  Supabase   │   │  Hugging Face    │   │    Sentry    │
    │  (DB+Auth   │   │  Inference API   │   │  (Observ.)   │
    │  +Storage)  │   │   (AI Models)    │   │              │
    └─────────────┘   └──────────────────┘   └──────────────┘
```

### Data Flow

1. **Upload**: Clinic uploads image → stored in Supabase Storage → `case_files` record created
2. **OCR**: Backend extracts text using pytesseract → stored in `analysis_results`
3. **AI Analysis**: Extracted text sent to Hugging Face → risk score computed
4. **Flagging**: High-risk cases (score ≥ 0.7) marked `flagged` → specialist notified
5. **Review**: Specialist reviews case → submits decision → case marked `completed`
6. **Report**: PDF report generated via ReportLab → stored in Supabase Storage → signed URL returned

### Security Model

- **Row Level Security (RLS)**: All Supabase tables enforce per-user access policies
- **JWT Auth**: All backend API calls require valid Supabase JWT in `Authorization: Bearer` header
- **Role-Based Access**:
  - `clinic` — can upload/view own cases and download own reports
  - `specialist` — can view/review assigned cases
  - `admin` — full access to all resources
- **Audit Logs**: Every state change recorded in `audit_logs` table
- **Non-root Docker**: Production container runs as unprivileged user

---

## Project Structure

```
auranode/
├── frontend/                     # Next.js 15 application
│   ├── app/
│   │   ├── layout.tsx            # Root layout
│   │   ├── page.tsx              # Landing page
│   │   ├── globals.css           # Global styles
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   └── dashboard/
│   │       ├── layout.tsx        # Dashboard shell + nav
│   │       ├── page.tsx          # Stats dashboard
│   │       ├── cases/
│   │       │   ├── page.tsx      # Cases list
│   │       │   └── [id]/page.tsx # Case detail + tabs
│   │       ├── reports/page.tsx  # Reports list (clinic)
│   │       └── upload/page.tsx   # Upload new case
│   ├── components/
│   │   ├── analysis/             # OCR / AI findings panels
│   │   ├── cases/                # Case UI components
│   │   ├── reports/
│   │   │   └── ReportCard.tsx    # Report card component
│   │   ├── review/               # Review form & viewer
│   │   └── upload/               # Drag-and-drop uploader
│   ├── hooks/                    # React custom hooks
│   ├── lib/
│   │   ├── api-client.ts         # Typed fetch wrapper
│   │   ├── supabase.ts           # Supabase browser client
│   │   └── utils.ts              # Helpers
│   ├── types/index.ts            # TypeScript interfaces
│   ├── middleware.ts             # Auth + RBAC middleware
│   ├── sentry.client.config.ts   # Sentry browser init
│   ├── sentry.server.config.ts   # Sentry server init
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── backend/                      # FastAPI application
│   ├── main.py                   # App entry point + Sentry
│   ├── config/settings.py        # Pydantic settings
│   ├── routers/                  # API route handlers
│   │   ├── auth.py
│   │   ├── cases.py
│   │   ├── uploads.py
│   │   ├── analysis.py
│   │   ├── reviews.py
│   │   └── reports.py
│   ├── services/
│   │   ├── supabase_service.py   # All DB/storage ops
│   │   ├── ocr_service.py        # Tesseract OCR
│   │   ├── ai_analysis_service.py# HuggingFace AI
│   │   ├── report_service.py     # ReportLab PDF gen
│   │   ├── case_service.py       # Case business logic
│   │   ├── notification_service.py
│   │   └── processing_queue.py   # Async worker queue
│   ├── models/                   # Pydantic models
│   ├── middleware/               # JWT auth middleware
│   ├── utils/                    # Helpers & validators
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
│
├── shared/api-contracts.ts       # Shared TypeScript API types
├── docs/architecture.md          # Detailed architecture docs
├── scripts/
│   ├── setup.sh                  # One-command setup script
│   └── db-setup.sql              # Supabase SQL schema
├── .github/workflows/
│   ├── frontend-deploy.yml       # Vercel deploy on push
│   └── backend-deploy.yml        # Railway deploy on push
└── README.md
```

---

## Setup Instructions

### Prerequisites

- Node.js 18+
- Python 3.11+
- Tesseract OCR (`sudo apt-get install tesseract-ocr` or `brew install tesseract`)
- A [Supabase](https://supabase.com) account (free tier works)
- A [Hugging Face](https://huggingface.co) account (free tier works)

### 1. Clone the Repository

```bash
git clone https://github.com/engrmaziz/AuraNode.git
cd AuraNode
```

### 2. Supabase Setup

1. Create a new project at https://supabase.com/dashboard/new
2. Open **SQL Editor** and run the contents of `scripts/db-setup.sql`
3. Go to **Storage** and create two private buckets:
   - `case-files`
   - `generated-reports`
4. Copy your credentials from **Project Settings → API**:
   - **Project URL** → `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_KEY` (never expose client-side)

### 3. Hugging Face API Key

1. Create a free account at https://huggingface.co
2. Go to **Settings → Access Tokens → New token** (read access is enough)
3. Copy the token as `HUGGINGFACE_API_TOKEN` in `backend/.env`

### 4. Run setup.sh

```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

This will:
1. Check Node.js 18+ and Python 3.11+
2. Create `frontend/.env.local` from the example
3. Create `backend/.env` from the example
4. Install all frontend npm dependencies
5. Install all backend Python dependencies
6. Print Supabase, Vercel, and Railway deployment instructions
7. Print the full environment variables checklist

### 5. Fill Environment Variables

Edit the generated files with your real credentials:
```
frontend/.env.local   — Supabase URL, anon key, backend API URL
backend/.env          — Supabase URL, service key, HuggingFace token
```

### 6. Start Dev Servers

```bash
# Terminal 1 — Frontend
cd frontend && npm run dev
# → http://localhost:3000

# Terminal 2 — Backend
cd backend && uvicorn main:app --reload
# → http://localhost:8000
# → http://localhost:8000/docs  (Swagger UI)
```

---

## Environment Variables

### Frontend (`frontend/.env.local`)

| Variable | Description | Where to Find | Required |
|----------|-------------|---------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase → Settings → API → Project URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Supabase → Settings → API → anon/public | ✅ |
| `NEXT_PUBLIC_API_URL` | Backend URL (e.g. `https://api.up.railway.app`) | Railway dashboard after deploy | ✅ |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN for browser error tracking | Sentry → Project → Settings → Client Keys | ⬜ |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Domain for Plausible analytics | Your Plausible dashboard | ⬜ |

### Backend (`backend/.env`)

| Variable | Description | Where to Find | Required |
|----------|-------------|---------------|----------|
| `SUPABASE_URL` | Supabase project URL | Supabase → Settings → API → Project URL | ✅ |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (never expose!) | Supabase → Settings → API → service_role | ✅ |
| `SUPABASE_JWT_SECRET` | JWT secret for token verification | Supabase → Settings → API → JWT Secret | ✅ |
| `HUGGINGFACE_API_TOKEN` | Hugging Face Inference API token | huggingface.co → Settings → Access Tokens | ✅ |
| `SENTRY_DSN` | Sentry DSN for backend error tracking | Sentry → Project → Settings → Client Keys | ⬜ |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | Your frontend URL(s) | ✅ |
| `SECRET_KEY` | Random secret for signing (min 32 chars) | Generate: `openssl rand -hex 32` | ✅ |
| `ENVIRONMENT` | `development` or `production` | Set manually | ✅ |
| `MAX_FILE_SIZE_MB` | Maximum upload size in MB (default: `10`) | Set manually | ⬜ |
| `APP_VERSION` | Application version string (default: `1.0.0`) | Set manually | ⬜ |
| `LOG_LEVEL` | Logging level: `DEBUG`/`INFO`/`WARNING` | Set manually | ⬜ |
| `WORKERS` | Uvicorn worker count (default: `2`) | Set manually | ⬜ |

---

## Running Locally

```bash
# Frontend
cd frontend && npm run dev          # → http://localhost:3000

# Backend
cd backend && uvicorn main:app --reload   # → http://localhost:8000
```

API documentation (Swagger UI) is available at http://localhost:8000/docs in development mode.

---

## Deployment Guide

### Frontend → Vercel

**Option A: Vercel Dashboard**

1. Push code to GitHub
2. Go to https://vercel.com/new and import the repository
3. Set **Root Directory** to `frontend`
4. Add all environment variables from `frontend/.env.local`
5. Click **Deploy**

**Option B: Vercel CLI**

```bash
npm install -g vercel
cd frontend
vercel link        # link to project
vercel --prod      # deploy to production
```

**Option C: GitHub Actions (automatic)**

Add these secrets to your GitHub repository (**Settings → Secrets → Actions**):

| Secret | Description |
|--------|-------------|
| `VERCEL_TOKEN` | Vercel personal access token |
| `VERCEL_ORG_ID` | Vercel team/org ID |
| `VERCEL_PROJECT_ID` | Vercel project ID |
| `NEXT_PUBLIC_SUPABASE_URL` | (see above) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (see above) |
| `NEXT_PUBLIC_API_URL` | (see above) |
| `NEXT_PUBLIC_SENTRY_DSN` | (see above, optional) |

Every push to `main` that touches `frontend/**` triggers an automatic deploy.

---

### Backend → Railway

**Option A: Railway Dashboard**

1. Go to https://railway.app/new and connect your GitHub repository
2. Select the `backend` folder as root (or set `RAILWAY_DOCKERFILE_PATH=backend/Dockerfile`)
3. Add all environment variables from `backend/.env`
4. Railway auto-detects the `Dockerfile` and builds/deploys

**Option B: Railway CLI**

```bash
npm install -g @railway/cli
cd backend
railway login
railway link     # select or create project
railway up       # deploy
```

**Option C: GitHub Actions (automatic)**

Add this secret to your GitHub repository:

| Secret | Description |
|--------|-------------|
| `RAILWAY_TOKEN` | Railway project token (found in Railway project settings) |
| `DOCKER_USERNAME` | Docker Hub username (for image registry) |
| `DOCKER_PASSWORD` | Docker Hub password / access token |

Every push to `main` that touches `backend/**` triggers an automatic build, push, and deploy.

---

## API Reference

Full interactive Swagger UI available at `http://localhost:8000/docs` when running locally.

### Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/v1/auth/register` | Public | Register new user |
| `POST` | `/api/v1/auth/login` | Public | Login and receive JWT |
| `POST` | `/api/v1/auth/logout` | JWT | Sign out |
| `GET` | `/api/v1/auth/me` | JWT | Get current user profile |
| `GET` | `/api/v1/cases` | JWT | List cases (filtered by role) |
| `POST` | `/api/v1/cases` | clinic | Create new case |
| `GET` | `/api/v1/cases/{id}` | JWT | Get case details |
| `PUT` | `/api/v1/cases/{id}/status` | admin/specialist | Update case status |
| `POST` | `/api/v1/uploads/{case_id}` | clinic | Upload file to case |
| `GET` | `/api/v1/uploads/{case_id}/files` | JWT | List case files |
| `POST` | `/api/v1/analysis/case/{case_id}` | admin | Trigger AI analysis |
| `GET` | `/api/v1/analysis/case/{case_id}` | JWT | Get analysis results |
| `POST` | `/api/v1/reviews/{case_id}` | specialist | Submit review |
| `GET` | `/api/v1/reviews/{case_id}` | JWT | List reviews for case |
| `POST` | `/api/v1/reports/{case_id}` | admin/specialist | Generate PDF report |
| `GET` | `/api/v1/reports/{case_id}` | JWT | List reports for case |
| `GET` | `/api/v1/reports/{case_id}/download/{report_id}` | JWT | Stream PDF download |
| `GET` | `/health` | Public | Health check |

---

## Database Schema

See `scripts/db-setup.sql` for the complete SQL schema including:

- **Tables**: `users`, `cases`, `case_files`, `analysis_results`, `reviews`, `reports`, `audit_logs`
- **Row Level Security**: Per-role policies on every table
- **Indexes**: Performance indexes on foreign keys and status columns
- **Triggers**: Automatic `updated_at` timestamps

---

## Troubleshooting

### 1. `NEXT_PUBLIC_API_URL` not set — API calls fail with 404

**Symptom**: Frontend shows "Failed to load cases" or 404 errors in the network tab.

**Fix**: Ensure `NEXT_PUBLIC_API_URL` is set in `frontend/.env.local` (dev) or Vercel environment variables (production). It should point to your backend URL, e.g. `http://localhost:8000` for local dev.

---

### 2. OCR returns empty text

**Symptom**: `extracted_text` is empty after processing.

**Fix**: Check that `tesseract-ocr` is installed on the server:
```bash
tesseract --version
```
Install if missing: `sudo apt-get install tesseract-ocr tesseract-ocr-eng`

Also verify the uploaded image has sufficient resolution (min 150 DPI recommended).

---

### 3. Supabase RLS blocking queries — `406 Not Acceptable` or empty results

**Symptom**: API returns 200 but data is empty; Supabase logs show RLS policy denials.

**Fix**: Make sure the backend is using the `SUPABASE_SERVICE_KEY` (service role), **not** the anon key. The service role key bypasses RLS — keep it secret and only use it server-side.

---

### 4. PDF report generation fails

**Symptom**: `POST /api/v1/reports/{case_id}` returns 500.

**Fix**: Check that `reportlab` is installed:
```bash
pip install reportlab==4.1.0
```
Also confirm the case status is `completed` — reports can only be generated for completed cases.

---

### 5. Railway deploy fails with `no matching manifest for linux/amd64`

**Symptom**: Docker build fails on Railway with a manifest error.

**Fix**: Add `--platform linux/amd64` to the `FROM` line in `backend/Dockerfile`, or set the Railway build platform to `linux/amd64` in the Railway project settings.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes with tests
4. Run lints: `cd frontend && npm run lint` and `cd backend && python -m py_compile main.py`
5. Commit using conventional commits: `feat: add X`, `fix: correct Y`
6. Open a pull request against `main`

---

## License

MIT License — see [LICENSE](LICENSE) for details.

© 2024 AuraNode. All rights reserved.
