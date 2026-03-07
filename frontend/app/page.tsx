import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AuraNode — AI-Powered Diagnostic Intelligence",
  description:
    "Upload diagnostic images, run AI analysis, route flagged cases to specialists, and generate PDF reports — all in one platform.",
};

const features = [
  {
    icon: "📤",
    title: "Upload",
    description:
      "Securely upload ECG scans, X-rays, and other diagnostic images. Supports JPEG, PNG, TIFF, and DICOM formats with automatic encryption at rest.",
  },
  {
    icon: "🔬",
    title: "Analyze",
    description:
      "Our AI pipeline combines OCR extraction (Tesseract) with Hugging Face models to compute risk scores and surface critical findings instantly.",
  },
  {
    icon: "👨‍⚕️",
    title: "Review",
    description:
      "High-risk cases are automatically flagged and routed to assigned specialists for professional review, ensuring no critical finding is missed.",
  },
  {
    icon: "📄",
    title: "Report",
    description:
      "Generate comprehensive, clinic-branded PDF reports with a single click — including AI findings, specialist notes, and actionable recommendations.",
  },
];

const stats = [
  { value: "< 30s", label: "Average analysis time" },
  { value: "99.9%", label: "Uptime SLA" },
  { value: "HIPAA", label: "Compliance ready" },
  { value: "256-bit", label: "AES encryption" },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ─── Navigation ─────────────────────────────────── */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🩺</span>
            <span className="text-xl font-bold aura-gradient-text">AuraNode</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Log in
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* ─── Hero Section ───────────────────────────────── */}
        <section className="relative overflow-hidden aura-gradient py-24 md:py-36">
          <div
            aria-hidden
            className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-10"
          />
          <div className="container relative text-center text-white">
            <div className="mx-auto mb-6 inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm backdrop-blur">
              <span className="mr-2">✨</span>
              Powered by Hugging Face AI + Tesseract OCR
            </div>
            <h1 className="mb-6 text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
              AI-Powered Diagnostic
              <br />
              <span className="text-cyan-300">Intelligence</span>
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-lg text-blue-100 md:text-xl">
              AuraNode streamlines clinical workflows — upload diagnostic images, get instant AI
              analysis, route flagged cases to specialists, and deliver polished PDF reports.
            </p>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-lg bg-white px-8 py-3.5 text-base font-semibold text-blue-900 shadow-lg hover:bg-blue-50 transition-colors"
              >
                Start Free Today
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-lg border border-white/30 bg-white/10 px-8 py-3.5 text-base font-semibold text-white backdrop-blur hover:bg-white/20 transition-colors"
              >
                Sign In
              </Link>
            </div>
          </div>
        </section>

        {/* ─── Stats Bar ──────────────────────────────────── */}
        <section className="border-y border-border bg-muted/30">
          <div className="container py-8">
            <dl className="grid grid-cols-2 gap-6 text-center md:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <dt className="text-3xl font-extrabold text-primary">{stat.value}</dt>
                  <dd className="mt-1 text-sm text-muted-foreground">{stat.label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ─── Features Section ───────────────────────────── */}
        <section className="container py-20">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Everything your clinic needs
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              A complete end-to-end pipeline from image upload to specialist-approved report.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="card-hover flex flex-col rounded-xl border border-border bg-card p-6 shadow-sm"
              >
                <div className="mb-4 text-4xl">{feature.icon}</div>
                <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── How It Works ───────────────────────────────── */}
        <section className="bg-muted/30 py-20">
          <div className="container">
            <h2 className="mb-12 text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
              How AuraNode works
            </h2>
            <ol className="relative mx-auto max-w-3xl">
              {[
                {
                  step: "01",
                  title: "Clinic uploads diagnostic image",
                  desc: "Drag and drop ECG scans, X-rays, or other images. Files are encrypted and stored securely in Supabase Storage.",
                },
                {
                  step: "02",
                  title: "AI pipeline processes the image",
                  desc: "Tesseract OCR extracts text and measurements. Our Hugging Face model computes a risk score and surfaces anomalies.",
                },
                {
                  step: "03",
                  title: "Flagged cases routed to specialists",
                  desc: "Cases with risk score > 0.7 are automatically marked as flagged and assigned to an available specialist for review.",
                },
                {
                  step: "04",
                  title: "Specialist reviews and decides",
                  desc: "Specialists examine findings, add notes, and submit a decision: Approved, Rejected, or Needs More Info.",
                },
                {
                  step: "05",
                  title: "PDF report generated instantly",
                  desc: "A comprehensive, branded PDF report is generated via ReportLab and available for download immediately.",
                },
              ].map((item, index, arr) => (
                <li key={item.step} className="flex gap-6 pb-10 last:pb-0">
                  <div className="flex flex-col items-center">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                      {item.step}
                    </div>
                    {index < arr.length - 1 && (
                      <div className="mt-2 h-full w-px bg-border" />
                    )}
                  </div>
                  <div className="pb-4">
                    <h3 className="font-semibold text-foreground">{item.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ─── CTA Section ────────────────────────────────── */}
        <section className="aura-gradient py-20 text-center text-white">
          <div className="container">
            <h2 className="mb-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Ready to transform your diagnostic workflow?
            </h2>
            <p className="mx-auto mb-8 max-w-xl text-blue-100">
              Join clinics already using AuraNode to deliver faster, more accurate diagnoses.
            </p>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-lg bg-white px-8 py-3.5 text-base font-semibold text-blue-900 shadow-lg hover:bg-blue-50 transition-colors"
              >
                Create Free Account
              </Link>
              <Link
                href="/login"
                className="text-sm font-medium text-blue-100 underline-offset-4 hover:underline"
              >
                Already have an account? Sign in →
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ─── Footer ─────────────────────────────────────── */}
      <footer className="border-t border-border py-8">
        <div className="container flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <span>🩺</span>
            <span className="font-semibold">AuraNode</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} AuraNode. Built for clinical excellence.
          </p>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/login" className="hover:text-foreground transition-colors">
              Log in
            </Link>
            <Link href="/register" className="hover:text-foreground transition-colors">
              Register
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
