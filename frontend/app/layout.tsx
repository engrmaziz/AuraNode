import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import Script from "next/script";
import "./globals.css";

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
  // Fetch the initial session server-side for hydration
  const supabase = createServerComponentClient({ cookies });
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
