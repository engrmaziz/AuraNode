import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    template: "%s | AuraNode",
    default: "AuraNode — Authentication",
  },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Left decorative panel — hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 aura-gradient flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-blue-400/10 blur-3xl" />

        <div className="relative z-10 text-center max-w-md">
          {/* Logo */}
          <div className="inline-flex items-center justify-center gap-3 mb-8">
            <span className="text-5xl">🩺</span>
            <span className="text-4xl font-extrabold text-white">AuraNode</span>
          </div>

          <h2 className="text-2xl font-bold text-white mb-4">
            AI-Powered Diagnostic Intelligence
          </h2>
          <p className="text-blue-200 text-base leading-relaxed">
            Upload diagnostic images, run instant AI analysis, route flagged
            cases to specialists, and generate comprehensive PDF reports — all
            in one secure platform.
          </p>

          {/* Feature list */}
          <ul className="mt-8 space-y-3 text-left">
            {[
              "🔬 Automated ECG & X-ray analysis",
              "👨‍⚕️ Specialist review workflows",
              "📄 One-click PDF report generation",
              "🔒 HIPAA-compliant & encrypted",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2 text-blue-100 text-sm">
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right form area */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-white dark:bg-gray-950">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
