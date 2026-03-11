# Organic Harvest

> **Premium Farm-to-Table E-Commerce** — A highly automated, enterprise-grade platform featuring AI-powered upselling, automated abandoned-cart revenue recovery, hands-free post-purchase drip campaigns, and cryptographic coupon enforcement.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Core Engines](#core-engines)
   - [AI Smart-Bundling (AOV Booster)](#1-ai-smart-bundling-aov-booster)
   - [Ghost Revenue Retriever (Abandoned Cart)](#2-ghost-revenue-retriever-abandoned-cart)
   - [Automated Post-Purchase Drip Campaigns](#3-automated-post-purchase-drip-campaigns)
   - [Cryptographic Coupon Engine](#4-cryptographic-coupon-engine)
4. [Project Structure](#project-structure)
5. [Local Development](#local-development)
6. [Environment Variables](#environment-variables)
7. [Vercel Cron Jobs](#vercel-cron-jobs)
8. [Deployment](#deployment)
9. [Contributing](#contributing)
10. [License](#license)

---

## Project Overview

**Organic Harvest** is a premium, farm-to-table e-commerce platform engineered for maximum revenue retention and customer lifetime value. Beyond a standard storefront, it ships four battle-tested automation engines that run continuously in the background:

- **Recover lost revenue** from abandoned carts automatically, without manual intervention.
- **Increase average order value (AOV)** with mathematically precise, in-cart upsell offers.
- **Retain customers long-term** through timed post-purchase review and discount sequences.
- **Prevent coupon abuse** with a cryptographically enforced, single-use code system.

Every engine is serverless-native — hosted on Vercel with zero infrastructure to manage.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | [Next.js](https://nextjs.org/) (App Router) | Full-stack React framework, API routes, server components |
| **Database** | [Supabase](https://supabase.com/) (PostgreSQL) | Relational data store with Row Level Security |
| **Hosting & Cron** | [Vercel](https://vercel.com/) | Serverless hosting and scheduled Cron Jobs |
| **Transactional Email** | [Resend](https://resend.com/) | Abandoned-cart recovery and drip campaign delivery |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) | Utility-first CSS framework |

---

## Core Engines

### 1. AI Smart-Bundling (AOV Booster)

**Purpose:** Increase average order value by surfacing a perfectly timed, mathematically discounted upsell offer at the moment a customer is most likely to add more items.

**How it works:**

1. When a customer views their cart, the engine queries the active cart state from Supabase in real time.
2. It cross-references the cart contents against the full product catalog to identify products the customer has **not** yet added.
3. A curated bundle recommendation is computed and surfaced inline — no page reload required (powered by Next.js Server Actions / React state).
4. The offer applies a **precise 15% discount** to the recommended items, calculated server-side to prevent client-side tampering.
5. The customer can add the bundle to their cart with a single click — completing the upsell without ever leaving the checkout flow.

**Key files:**
```
app/
└── api/
    └── upsell/
        └── route.ts          # Computes bundle recommendations & discount
components/
└── cart/
    └── SmartBundleOffer.tsx  # 1-click upsell UI component
```

---

### 2. Ghost Revenue Retriever (Abandoned Cart)

**Purpose:** Automatically recover revenue from customers who added items to their cart but never completed checkout.

**How it works:**

1. All in-progress carts are stored as **draft orders** in Supabase with a `status = 'draft'` and a `created_at` timestamp.
2. A **Vercel Cron Job** runs every day at midnight UTC (`0 0 * * *`).
3. The cron handler queries all draft orders older than a configurable threshold (default: 24 hours).
4. For each abandoned cart, the engine generates a **one-time-use promo code** (see [Cryptographic Coupon Engine](#4-cryptographic-coupon-engine)) unique to that customer.
5. A personalized recovery email is sent via **Resend**, containing the customer's cart summary and their unique discount code.
6. Once the customer completes checkout using the code, it is immediately burned (marked `used = true`) in the database.

**Key files:**
```
app/
└── api/
    └── cron/
        └── abandoned-cart/
            └── route.ts      # Cron handler: queries drafts, generates codes, sends emails
emails/
└── AbandonedCartEmail.tsx    # Resend React email template
vercel.json                   # Cron schedule definition
```

**Cron schedule (`vercel.json`):**
```json
{
  "crons": [
    {
      "path": "/api/cron/abandoned-cart",
      "schedule": "0 0 * * *"
    }
  ]
}
```

---

### 3. Automated Post-Purchase Drip Campaigns

**Purpose:** Maximize long-term customer retention and generate organic social proof with zero manual effort.

**How it works:**

The engine dispatches two timed emails after every completed order:

| Trigger | Delay | Email Content |
|---------|-------|---------------|
| Order confirmed | **+7 days** | Review request — links directly to the product page for a one-click star rating |
| Order confirmed | **+14 days** | Returning customer discount — a unique 10% off code to incentivize the next purchase |

Both emails are scheduled by inserting a job record into a Supabase `email_queue` table at order completion. A **Vercel Cron Job** polls the queue on a defined schedule and dispatches due emails via **Resend**.

**Key files:**
```
app/
└── api/
    └── cron/
        └── drip-campaigns/
            └── route.ts      # Cron handler: polls email_queue, sends due emails
emails/
├── ReviewRequestEmail.tsx    # 7-day review request template
└── ReturningCustomerEmail.tsx# 14-day discount offer template
lib/
└── email-queue.ts            # Helpers for enqueuing and dequeuing drip jobs
```

**Cron schedule (`vercel.json`):**
```json
{
  "crons": [
    {
      "path": "/api/cron/drip-campaigns",
      "schedule": "0 * * * *"
    }
  ]
}
```

---

### 4. Cryptographic Coupon Engine

**Purpose:** Issue single-use promo codes that are mathematically impossible to reuse or brute-force, protecting margin from coupon abuse at scale.

**How it works:**

1. **Code Generation** — Each code is derived from a cryptographically random token (`crypto.randomUUID()` + HMAC-SHA256), guaranteeing uniqueness and unpredictability.
2. **Database Record** — Every code is stored in the `promo_codes` table with:
   - `code` — the hashed token (never stored in plain text in logs)
   - `discount_percent` — the applied discount
   - `max_uses` — hard limit (typically `1` for abandoned-cart codes)
   - `use_count` — incremented atomically on redemption
   - `expires_at` — TTL for time-bound offers
3. **Validation at Checkout** — Before applying a discount, the API:
   - Confirms the code exists and is not expired
   - Confirms `use_count < max_uses`
   - Applies the discount to the order total
4. **Instant Burn** — Immediately after a successful charge, the `use_count` is incremented in the same database transaction, making concurrent reuse impossible.

**Key files:**
```
app/
└── api/
    ├── checkout/
    │   └── route.ts          # Validates & burns code at checkout
    └── coupons/
        └── route.ts          # Admin endpoint to generate & list codes
lib/
└── coupons.ts                # Cryptographic generation & validation logic
```

**Promo codes table schema:**
```sql
CREATE TABLE promo_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  discount_percent INT NOT NULL,
  max_uses      INT NOT NULL DEFAULT 1,
  use_count     INT NOT NULL DEFAULT 0,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Project Structure

```
organic-harvest/
├── app/                          # Next.js App Router
│   ├── (store)/                  # Public storefront routes
│   │   ├── page.tsx              # Homepage
│   │   ├── products/[slug]/      # Product detail pages
│   │   └── cart/                 # Cart & checkout flow
│   ├── (dashboard)/              # Admin dashboard routes
│   │   ├── orders/               # Order management
│   │   └── coupons/              # Coupon management
│   └── api/                      # API route handlers
│       ├── checkout/route.ts     # Order processing + coupon burn
│       ├── coupons/route.ts      # Coupon generation
│       ├── upsell/route.ts       # Smart bundle recommendations
│       └── cron/
│           ├── abandoned-cart/route.ts   # Ghost Revenue Retriever
│           └── drip-campaigns/route.ts  # Post-purchase drip
├── components/                   # Reusable UI components
│   ├── cart/
│   │   └── SmartBundleOffer.tsx  # 1-click upsell widget
│   ├── product/
│   └── layout/
├── emails/                       # Resend React email templates
│   ├── AbandonedCartEmail.tsx
│   ├── ReviewRequestEmail.tsx
│   └── ReturningCustomerEmail.tsx
├── lib/                          # Shared utilities
│   ├── supabase.ts               # Supabase browser client
│   ├── supabase-server.ts        # Supabase server client (Server Components)
│   ├── coupons.ts                # Cryptographic coupon logic
│   └── email-queue.ts            # Drip campaign queue helpers
├── types/                        # TypeScript interfaces
│   └── index.ts
├── public/                       # Static assets
├── vercel.json                   # Cron job schedules
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── .env.example
└── package.json
```

---

## Local Development

### Prerequisites

- **Node.js** 18+
- A [Supabase](https://supabase.com) project (free tier is sufficient)
- A [Resend](https://resend.com) account and API key

### 1. Clone the repository

```bash
git clone https://github.com/engrmaziz/AuraNode.git
cd organic-harvest
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example file and fill in your credentials:

```bash
cp .env.example .env.local
```

See [Environment Variables](#environment-variables) for the full reference.

### 4. Start the development server

```bash
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

> **Note:** Vercel Cron Jobs do not run in local development. To test cron endpoints manually, call them directly:
> ```bash
> curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/abandoned-cart
> ```

---

## Environment Variables

Copy `.env.example` to `.env.local` and populate every value before running the app.

```env
# ── Supabase ─────────────────────────────────────────────────────────────────
# Your Supabase project URL (found in: Project Settings → API → Project URL)
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co

# Supabase anonymous/public key (safe to expose to the browser)
# Found in: Project Settings → API → anon/public
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Supabase service role key — NEVER expose client-side; server-only
# Found in: Project Settings → API → service_role
SUPABASE_SERVICE_ROLE_KEY=

# ── Resend (Transactional Email) ──────────────────────────────────────────────
# API key for sending abandoned-cart and drip campaign emails
# Found in: Resend dashboard → API Keys
RESEND_API_KEY=

# The "From" address used for all outgoing emails (must be a verified sender)
RESEND_FROM_EMAIL=hello@organic-harvest.com

# ── Cron Security ─────────────────────────────────────────────────────────────
# A long random secret used to authenticate Vercel Cron Job requests
# Generate with: openssl rand -hex 32
CRON_SECRET=

# ── App ───────────────────────────────────────────────────────────────────────
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase public/anon key (browser-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key — **server-only** |
| `RESEND_API_KEY` | ✅ | Resend API key for transactional emails |
| `RESEND_FROM_EMAIL` | ✅ | Verified sender address for outgoing emails |
| `CRON_SECRET` | ✅ | Secret to authenticate incoming cron requests |
| `NEXT_PUBLIC_SITE_URL` | ✅ | Public base URL of the site |

---

## Vercel Cron Jobs

The **Ghost Revenue Retriever** and **Post-Purchase Drip Campaigns** engines rely on Vercel Cron Jobs to operate automatically. These are defined in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/abandoned-cart",
      "schedule": "0 0 * * *"
    },
    {
      "path": "/api/cron/drip-campaigns",
      "schedule": "0 * * * *"
    }
  ]
}
```

> **Important:** Vercel Cron Jobs are only active in Vercel-hosted deployments (Preview and Production). They do **not** run in local development. Ensure `CRON_SECRET` is set in your Vercel environment variables and that each cron route validates the `Authorization: Bearer <CRON_SECRET>` header.

Refer to the [Vercel Cron Jobs documentation](https://vercel.com/docs/cron-jobs) for scheduling syntax and monitoring.

---

## Deployment

This project is designed to deploy on **Vercel** with zero additional infrastructure.

### Deploy to Vercel

1. Push the repository to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. Add all [environment variables](#environment-variables) in the Vercel project settings.
4. Click **Deploy**.

Vercel automatically detects the Next.js framework, builds the project, and activates the Cron Jobs defined in `vercel.json`.

---

## Contributing

1. Fork the repository and create a feature branch: `git checkout -b feature/your-feature`
2. Commit your changes with a descriptive message
3. Open a Pull Request against `main`

---

## License

MIT © Organic Harvest
