import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Script from "next/script";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: "%s | AuraNode",
    default: "AuraNode — AI-Powered Diagnostic Intelligence",
  },
  description:
    "AuraNode enables clinics to upload diagnostic images, run AI-powered analysis, route flagged cases to specialists, and generate PDF reports.",
  keywords: ["medical imaging", "AI diagnostics", "ECG analysis", "X-ray analysis", "telemedicine"],
  authors: [{ name: "AuraNode Team" }],
  openGraph: {
    type: "website",
    siteName: "AuraNode",
    title: "AuraNode — AI-Powered Diagnostic Intelligence",
    description: "Upload. Analyze. Review. Report.",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Refresh the Supabase session server-side so the auth cookie is up-to-date
  // before any Server Components on this page try to read it.
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // No-op: cookies cannot be set from a Server Component.
          // Session cookie refresh is handled by middleware.ts.
        },
      },
    }
  );
  await supabase.auth.getSession();

  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {plausibleDomain && (
          <Script
            defer
            data-domain={plausibleDomain}
            src="https://plausible.io/js/script.js"
            strategy="afterInteractive"
          />
        )}
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
