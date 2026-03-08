// This file is loaded by Next.js on the server side (Node.js runtime) and
// initialises Sentry for server-side error and performance monitoring.
import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

Sentry.init({
  dsn: SENTRY_DSN,

  // Server-side tracing — 10 % sample rate in production
  tracesSampleRate: IS_PRODUCTION ? 0.1 : 1.0,

  // Only send events in production
  enabled: IS_PRODUCTION,

  // Supabase integration: capture slow DB queries as Sentry spans
  integrations: [
    // Node HTTP / fetch tracing so that outbound calls to Supabase appear in
    // traces automatically — available in @sentry/nextjs >= 8
    Sentry.httpIntegration({ tracing: true }),
  ],

  // Filter server-side noise
  ignoreErrors: [
    "NEXT_NOT_FOUND",
    "NEXT_REDIRECT",
    /ECONNRESET/,
    /ETIMEDOUT/,
  ],
});
