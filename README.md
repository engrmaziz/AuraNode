# AuraNode

> **AI-Powered Diagnostic Intelligence** — A production SaaS platform enabling clinics to upload diagnostic images (ECG scans, X-rays, etc.), process them through OCR + AI analysis, route flagged cases to specialists, and generate PDF reports.

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Architecture](#architecture)
4. [Project Structure](#project-structure)
5. [Setup Instructions](#setup-instructions)
6. [Environment Variables](#environment-variables)
7. [Running Locally](#running-locally)
8. [Deployment Guide](#deployment-guide)
9. [API Reference](#api-reference)
10. [Database Schema](#database-schema)

---

## Overview

AuraNode is a HIPAA-conscious medical imaging SaaS platform that:

- Accepts uploads of diagnostic images from clinic accounts
- Runs OCR (Tesseract) to extract text from scans
- Sends extracted data to a Hugging Face AI model for risk analysis
- Flags high-risk cases and routes them to assigned specialist accounts
- Allows specialists to review cases and submit decisions
- Auto-generates PDF reports via ReportLab
- Tracks all activity in audit logs with Row-Level Security via Supabase

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Backend | FastAPI, Python 3.11 |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| OCR (Frontend) | Tesseract.js |
| OCR (Backend) | pytesseract + Pillow |
| AI Analysis | Hugging Face Inference API |
| PDF Generation | ReportLab |
| Error Tracking | Sentry |
| Analytics | Plausible |
| Frontend Hosting | Vercel |
| Backend Hosting | Railway |
| CI/CD | GitHub Actions |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT BROWSER                          │
│  Next.js 14 App (Vercel)                                        │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐               │
│  │  Upload UI  │  │ Dashboard  │  │  Review UI  │               │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘               │
└────────┼───────────────┼───────────────┼────────────────────────┘
         │               │               │
         ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FastAPI Backend (Railway)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │   Auth   │  │  Cases   │  │ Analysis │  │ Reports  │       │
│  │  Router  │  │  Router  │  │  Router  │  │  Router  │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │             │             │              │              │
│  ┌────▼─────────────▼─────────────▼──────────────▼─────────┐   │
│  │                     Services Layer                       │   │
│  │  supabase_service │ ocr_service │ ai_service │ reports  │   │
│  └────────────────────────────────────────────────────────-─┘   │
└────────────────────────────────┬────────────────────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
     ┌─────────────┐   ┌─────────────────┐   ┌──────────────┐
     │  Supabase   │   │  Hugging Face   │   │   Sentry /   │
     │  (DB+Auth   │   │  Inference API  │   │  Plausible   │
     │  +Storage)  │   │   (AI Models)   │   │  (Observ.)   │
     └─────────────┘   └─────────────────┘   └──────────────┘
```

### Data Flow

1. **Upload**: Clinic uploads image → stored in Supabase Storage → `case_files` record created
2. **OCR**: Backend extracts text using pytesseract → stored in `analysis_results`
3. **AI Analysis**: Extracted text sent to Hugging Face → risk score computed
4. **Flagging**: High-risk cases (score > 0.7) marked `flagged` → specialist notified
5. **Review**: Specialist reviews case → submits decision → case marked `completed`
6. **Report**: PDF report generated via ReportLab → stored in Supabase Storage

### Security Model

- **Row Level Security (RLS)**: All Supabase tables enforce per-user access policies
- **JWT Auth**: All backend API calls require valid Supabase JWT in `Authorization: Bearer` header
- **Role-Based Access**:
  - `clinic` — can upload/view own cases
  - `specialist` — can view/review assigned cases
  - `admin` — full access to all resources
- **Audit Logs**: Every state change recorded in `audit_logs` table

---

## Project Structure

```
auranode/
├── frontend/                 # Next.js 14 application
│   ├── app/                  # App Router pages
│   │   ├── layout.tsx        # Root layout
│   │   ├── page.tsx          # Landing page
│   │   ├── globals.css       # Global styles
│   │   └── (auth)/           # Auth route group
│   │       ├── login/page.tsx
│   │       └── register/page.tsx
│   ├── components/ui/        # shadcn/ui components
│   ├── lib/                  # Shared utilities
│   │   ├── supabase.ts       # Supabase client
│   │   ├── api-client.ts     # Axios API client
│   │   └── utils.ts          # Helper functions
│   ├── types/index.ts        # TypeScript interfaces
│   ├── middleware.ts          # Auth + RBAC middleware
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── package.json
│   └── .env.local.example
│
├── backend/                  # FastAPI application
│   ├── main.py               # App entry point
│   ├── config/settings.py    # Pydantic settings
│   ├── routers/              # API route handlers
│   ├── services/             # Business logic
│   ├── models/               # Pydantic models
│   ├── middleware/           # Auth middleware
│   ├── utils/                # Helpers & validators
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
│
├── shared/api-contracts.ts   # Shared TypeScript API types
├── docs/architecture.md      # Detailed architecture docs
├── scripts/
│   ├── setup.sh              # One-command setup script
│   └── db-setup.sql          # Supabase SQL schema
├── .github/workflows/        # CI/CD pipelines
└── README.md
```

---

## Setup Instructions

### Prerequisites

- Node.js 18+
- Python 3.11+
- A Supabase account (free tier works)
- A Hugging Face account (free tier works)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/engrmaziz/AuraNode.git
cd AuraNode

# Run the automated setup script
chmod +x scripts/setup.sh
./scripts/setup.sh
```

The setup script will:
1. Verify Node.js 18+ and Python 3.11+ are installed
2. Copy `.env.local.example` → `frontend/.env.local`
3. Copy `.env.example` → `backend/.env`
4. Install all Node.js dependencies
5. Install all Python dependencies

### Manual Setup

```bash
# Frontend
cd frontend
cp .env.local.example .env.local
# Edit .env.local with your values
npm install

# Backend
cd ../backend
cp .env.example .env
# Edit .env with your values
pip install -r requirements.txt
```

### Database Setup

1. Create a new Supabase project at https://supabase.com
2. Go to **SQL Editor** in your Supabase dashboard
3. Run the contents of `scripts/db-setup.sql`
4. Create two storage buckets in **Storage**:
   - `diagnostic-uploads` (private)
   - `generated-reports` (private)

---

## Environment Variables

### Frontend (`frontend/.env.local`)

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key | ✅ |
| `NEXT_PUBLIC_API_URL` | Backend API URL (default: `http://localhost:8000`) | ✅ |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN for error tracking | ⬜ |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Domain for Plausible analytics | ⬜ |

### Backend (`backend/.env`)

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Your Supabase project URL | ✅ |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (keep secret!) | ✅ |
| `SUPABASE_JWT_SECRET` | JWT secret from Supabase project settings | ✅ |
| `HUGGINGFACE_API_KEY` | Hugging Face API token | ✅ |
| `SENTRY_DSN` | Sentry DSN for error tracking | ⬜ |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | ✅ |
| `MAX_FILE_SIZE_MB` | Max upload size in MB (default: 10) | ⬜ |
| `ENVIRONMENT` | `development` or `production` | ✅ |

---

## Running Locally

```bash
# Start the frontend (from frontend/)
npm run dev
# → http://localhost:3000

# Start the backend (from backend/)
uvicorn main:app --reload --port 8000
# → http://localhost:8000
# → API docs: http://localhost:8000/docs
```

---

## Deployment Guide

### Frontend → Vercel

1. Push code to GitHub
2. Import repository in [Vercel Dashboard](https://vercel.com)
3. Set **Root Directory** to `frontend`
4. Add all environment variables from `frontend/.env.local`
5. Deploy — CI/CD via `.github/workflows/frontend-deploy.yml`

### Backend → Railway

1. Create a new project in [Railway Dashboard](https://railway.app)
2. Connect your GitHub repository
3. Set **Root Directory** to `backend`
4. Add all environment variables from `backend/.env`
5. Railway will auto-detect the `Dockerfile` and deploy
6. CI/CD via `.github/workflows/backend-deploy.yml`

---

## API Reference

Full API documentation available at `http://localhost:8000/docs` (Swagger UI) when backend is running.

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/auth/register` | Register new user |
| `POST` | `/api/v1/auth/login` | Login user |
| `GET` | `/api/v1/cases` | List cases |
| `POST` | `/api/v1/cases` | Create new case |
| `POST` | `/api/v1/uploads/{case_id}` | Upload file to case |
| `POST` | `/api/v1/analysis/{case_id}` | Trigger AI analysis |
| `GET` | `/api/v1/analysis/{case_id}` | Get analysis results |
| `POST` | `/api/v1/reviews/{case_id}` | Submit specialist review |
| `POST` | `/api/v1/reports/{case_id}` | Generate PDF report |
| `GET` | `/health` | Health check |

---

## Database Schema

See `scripts/db-setup.sql` for the complete SQL schema including:
- Tables: `users`, `cases`, `case_files`, `analysis_results`, `reviews`, `reports`, `audit_logs`
- Row Level Security policies
- Performance indexes
- Trigger functions for `updated_at`
