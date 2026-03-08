// This file is loaded on the client side by Next.js and initialises Sentry
// for browser-side error and performance monitoring.
import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

Sentry.init({
  dsn: SENTRY_DSN,

  // Performance monitoring — 10% sample rate in production, 100% in dev
  tracesSampleRate: IS_PRODUCTION ? 0.1 : 1.0,

  // Session Replay — 10% of sessions, 100% on errors
  replaysSessionSampleRate: IS_PRODUCTION ? 0.1 : 0,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      // Mask all text and block all media in replays for HIPAA compliance
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Filter out noise that is not actionable
  ignoreErrors: [
    // Network / browser cancellation
    "Network request failed",
    "NetworkError",
    "Failed to fetch",
    "Load failed",
    "AbortError",
    "The operation was aborted",
    // Chrome extensions
    "Non-Error exception captured",
    /extensions\//i,
    /^chrome:\/\//,
    // ResizeObserver loop limit (benign browser warning)
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
  ],

  // Only send events in production
  enabled: IS_PRODUCTION,
});
