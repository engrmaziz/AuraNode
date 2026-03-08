#!/usr/bin/env bash
# AuraNode — One-Command Setup Script
# Usage: chmod +x scripts/setup.sh && ./scripts/setup.sh

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

print_step() { echo -e "\n${CYAN}${BOLD}▶ $1${RESET}"; }
print_ok()   { echo -e "  ${GREEN}✔ $1${RESET}"; }
print_warn() { echo -e "  ${YELLOW}⚠ $1${RESET}"; }
print_err()  { echo -e "  ${RED}✖ $1${RESET}"; }

# ── Header ────────────────────────────────────────────────────
echo -e "\n${BOLD}🩺 AuraNode Setup${RESET}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Determine repo root (this script lives in scripts/) ──────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Step 1: Check Node.js 18+ ─────────────────────────────────
print_step "Checking Node.js version"
if ! command -v node &>/dev/null; then
  print_err "Node.js is not installed. Please install Node.js 18+ from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -e "process.stdout.write(process.versions.node)")
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

if [ "$NODE_MAJOR" -lt 18 ]; then
  print_err "Node.js $NODE_VERSION detected. AuraNode requires Node.js 18+."
  print_warn "Please upgrade: https://nodejs.org"
  exit 1
fi

print_ok "Node.js $NODE_VERSION"

# ── Step 2: Check Python 3.11+ ────────────────────────────────
print_step "Checking Python version"

PYTHON_CMD=""
for cmd in python3.11 python3 python; do
  if command -v "$cmd" &>/dev/null; then
    PY_VERSION=$("$cmd" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
    PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)
    if [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -ge 11 ]; then
      PYTHON_CMD="$cmd"
      break
    fi
  fi
done

if [ -z "$PYTHON_CMD" ]; then
  print_err "Python 3.11+ is required but was not found."
  print_warn "Install it from: https://www.python.org/downloads/"
  exit 1
fi

print_ok "$($PYTHON_CMD --version)"

# ── Step 3: Frontend .env.local ───────────────────────────────
print_step "Setting up frontend environment"

FRONTEND_ENV="${ROOT_DIR}/frontend/.env.local"
FRONTEND_ENV_EXAMPLE="${ROOT_DIR}/frontend/.env.local.example"

if [ -f "$FRONTEND_ENV" ]; then
  print_warn "frontend/.env.local already exists — skipping (not overwriting)"
else
  cp "$FRONTEND_ENV_EXAMPLE" "$FRONTEND_ENV"
  print_ok "Created frontend/.env.local from .env.local.example"
  print_warn "⚠  Remember to fill in your values in frontend/.env.local"
fi

# ── Step 4: Backend .env ──────────────────────────────────────
print_step "Setting up backend environment"

BACKEND_ENV="${ROOT_DIR}/backend/.env"
BACKEND_ENV_EXAMPLE="${ROOT_DIR}/backend/.env.example"

if [ -f "$BACKEND_ENV" ]; then
  print_warn "backend/.env already exists — skipping (not overwriting)"
else
  cp "$BACKEND_ENV_EXAMPLE" "$BACKEND_ENV"
  print_ok "Created backend/.env from .env.example"
  print_warn "⚠  Remember to fill in your values in backend/.env"
fi

# ── Step 5: Install frontend dependencies ─────────────────────
print_step "Installing frontend dependencies (npm install)"
cd "${ROOT_DIR}/frontend"
npm install --prefer-offline --no-audit 2>&1 | tail -5
print_ok "Frontend dependencies installed"

# ── Step 6: Install backend dependencies ──────────────────────
print_step "Installing backend dependencies (pip install)"
cd "${ROOT_DIR}/backend"
"$PYTHON_CMD" -m pip install --quiet -r requirements.txt
print_ok "Backend dependencies installed"

# ── Done ──────────────────────────────────────────────────────
cd "${ROOT_DIR}"
echo ""
echo -e "${GREEN}${BOLD}✅ AuraNode setup complete!${RESET}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${BOLD}Next steps:${RESET}"
echo ""
echo -e "  1. ${YELLOW}Fill in your environment variables:${RESET}"
echo -e "     • ${CYAN}frontend/.env.local${RESET}  — Supabase URL, anon key, API URL"
echo -e "     • ${CYAN}backend/.env${RESET}         — Supabase URL, service key, HuggingFace token"
echo ""
echo -e "  2. ${YELLOW}Run the Supabase SQL schema:${RESET}"
echo -e "     Copy ${CYAN}scripts/db-setup.sql${RESET} into the Supabase SQL Editor and execute."
echo ""
echo -e "  3. ${YELLOW}Start the development servers:${RESET}"
echo ""
echo -e "     ${CYAN}# Terminal 1 — Frontend${RESET}"
echo -e "     cd frontend && npm run dev"
echo -e "     → http://localhost:3000"
echo ""
echo -e "     ${CYAN}# Terminal 2 — Backend${RESET}"
echo -e "     cd backend && uvicorn main:app --reload --port 8000"
echo -e "     → http://localhost:8000"
echo -e "     → http://localhost:8000/docs  (Swagger UI)"
echo ""

# ── Step 5: Supabase setup instructions ───────────────────────
print_step "Supabase Setup Instructions"
echo ""
echo -e "  ${BOLD}1. Create a Supabase project${RESET}"
echo -e "     → https://supabase.com/dashboard/new"
echo ""
echo -e "  ${BOLD}2. Run the database schema${RESET}"
echo -e "     Open the SQL editor in your Supabase project and run:"
echo -e "     ${CYAN}scripts/db-setup.sql${RESET}"
echo ""
echo -e "  ${BOLD}3. Create Storage buckets${RESET}"
echo -e "     In Supabase → Storage → New Bucket:"
echo -e "     • ${CYAN}case-files${RESET}         (public: false)"
echo -e "     • ${CYAN}generated-reports${RESET}  (public: false)"
echo ""
echo -e "  ${BOLD}4. Get your credentials${RESET}"
echo -e "     Supabase → Project Settings → API:"
echo -e "     • SUPABASE_URL            → Project URL"
echo -e "     • SUPABASE_ANON_KEY       → anon / public key"
echo -e "     • SUPABASE_SERVICE_KEY    → service_role key (keep secret!)"
echo ""

# ── Step 6: Vercel deployment instructions ────────────────────
print_step "Vercel Deployment Instructions (Frontend)"
echo ""
echo -e "  ${BOLD}1. Install Vercel CLI${RESET}"
echo -e "     npm install -g vercel"
echo ""
echo -e "  ${BOLD}2. Link your project${RESET}"
echo -e "     cd frontend && vercel link"
echo ""
echo -e "  ${BOLD}3. Set environment variables in Vercel${RESET}"
echo -e "     vercel env add NEXT_PUBLIC_SUPABASE_URL"
echo -e "     vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY"
echo -e "     vercel env add NEXT_PUBLIC_API_URL"
echo -e "     vercel env add NEXT_PUBLIC_SENTRY_DSN"
echo ""
echo -e "  ${BOLD}4. Deploy${RESET}"
echo -e "     vercel --prod"
echo ""
echo -e "  ${BOLD}Or use GitHub Actions (automatic):${RESET}"
echo -e "     Add these secrets to GitHub repository settings:"
echo -e "     VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID"
echo -e "     Then push to main — the workflow deploys automatically."
echo ""

# ── Step 7: Render deployment instructions ────────────────────
print_step "Render Deployment Instructions (Backend)"
echo ""
echo -e "  ${BOLD}1. Go to render.com and connect your GitHub repo${RESET}"
echo -e "     → https://render.com"
echo ""
echo -e "  ${BOLD}2. Create a new Web Service${RESET}"
echo -e "     Set root directory to: ${CYAN}backend${RESET}"
echo -e "     Set runtime to: ${CYAN}Docker${RESET}"
echo ""
echo -e "  ${BOLD}3. Add environment variables in Render${RESET}"
echo -e "     Add all variables from ${CYAN}backend/.env.example${RESET}"
echo ""
echo -e "  ${BOLD}4. Enable auto-deploy from main branch${RESET}"
echo -e "     Toggle ${CYAN}Auto-Deploy${RESET} on in the Render service settings."
echo ""
echo -e "  ${BOLD}Or use GitHub Actions (automatic):${RESET}"
echo -e "     Add RENDER_DEPLOY_HOOK_URL to GitHub repository secrets."
echo -e "     Push to main — the workflow deploys automatically."
echo ""

# ── Step 8: Environment variables checklist ───────────────────
print_step "Environment Variables Checklist"
echo ""
echo -e "  ${BOLD}Frontend (frontend/.env.local):${RESET}"
echo -e "  ${YELLOW}[ ]${RESET} NEXT_PUBLIC_SUPABASE_URL       — Supabase Project URL"
echo -e "  ${YELLOW}[ ]${RESET} NEXT_PUBLIC_SUPABASE_ANON_KEY  — Supabase anon/public key"
echo -e "  ${YELLOW}[ ]${RESET} NEXT_PUBLIC_API_URL            — Backend URL (e.g. https://api.onrender.com)"
echo -e "  ${YELLOW}[ ]${RESET} NEXT_PUBLIC_SENTRY_DSN         — Sentry DSN (optional)"
echo -e "  ${YELLOW}[ ]${RESET} NEXT_PUBLIC_PLAUSIBLE_DOMAIN   — Plausible domain (optional)"
echo ""
echo -e "  ${BOLD}Backend (backend/.env):${RESET}"
echo -e "  ${YELLOW}[ ]${RESET} SUPABASE_URL                   — Supabase Project URL"
echo -e "  ${YELLOW}[ ]${RESET} SUPABASE_SERVICE_KEY           — Supabase service_role key"
echo -e "  ${YELLOW}[ ]${RESET} HUGGINGFACE_API_TOKEN          — HuggingFace Inference API token"
echo -e "  ${YELLOW}[ ]${RESET} SENTRY_DSN                     — Sentry DSN (optional)"
echo -e "  ${YELLOW}[ ]${RESET} ALLOWED_ORIGINS                — Comma-separated frontend URLs"
echo -e "  ${YELLOW}[ ]${RESET} SECRET_KEY                     — Random secret for JWT signing"
echo -e "  ${YELLOW}[ ]${RESET} ENVIRONMENT                    — development | production"
echo ""
