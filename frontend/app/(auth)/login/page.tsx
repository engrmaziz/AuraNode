"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createBrowserClient } from "@/lib/supabase";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const supabase = createBrowserClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setServerError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        setServerError(error.message);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setServerError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center aura-gradient p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="text-3xl">🩺</span>
            <span className="text-2xl font-extrabold text-white">AuraNode</span>
          </Link>
          <p className="mt-2 text-blue-200 text-sm">AI-Powered Diagnostic Intelligence</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white/10 backdrop-blur border border-white/20 p-8 shadow-2xl">
          <h1 className="mb-1 text-2xl font-bold text-white">Welcome back</h1>
          <p className="mb-6 text-sm text-blue-200">
            Sign in to your AuraNode account
          </p>

          {serverError && (
            <div className="mb-4 rounded-lg bg-red-500/20 border border-red-400/30 px-4 py-3 text-sm text-red-200">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-blue-100 mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@clinic.com"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3.5 py-2.5 text-white placeholder:text-blue-300/60 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 text-sm"
                {...register("email")}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-300">{errors.email.message}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-blue-100">
                  Password
                </label>
                <Link href="/forgot-password" className="text-xs text-cyan-300 hover:text-cyan-200">
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3.5 py-2.5 text-white placeholder:text-blue-300/60 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 text-sm"
                {...register("password")}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-red-300">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-blue-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
            >
              {isLoading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-blue-200">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-semibold text-cyan-300 hover:text-cyan-200">
              Create one free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
