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
