"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createBrowserClient } from "@/lib/supabase";
import type { UserRole } from "@/types";

const registerSchema = z
  .object({
    full_name: z.string().min(2, "Full name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email address"),
    organization: z.string().optional(),
    role: z.enum(["clinic", "specialist", "admin"] as const, {
      required_error: "Please select an account type",
    }),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

const roleDescriptions: Record<UserRole, string> = {
  clinic: "Upload and manage diagnostic cases",
  specialist: "Review flagged cases assigned to you",
  admin: "Full platform access and management",
};

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createBrowserClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: "clinic" },
  });

  const selectedRole = watch("role");

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    setServerError(null);

    try {
      // 1. Create Supabase Auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.full_name,
            organization: data.organization,
            role: data.role,
          },
        },
      });

      if (authError) {
        setServerError(authError.message);
        return;
      }

      if (authData.user) {
        // 2. Insert into public.users table
        const { error: profileError } = await supabase.from("users").insert({
          id: authData.user.id,
          email: data.email,
          role: data.role,
          full_name: data.full_name,
          organization: data.organization ?? null,
        });

        if (profileError) {
          console.error("Profile creation error:", profileError);
        }
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
      <div className="w-full max-w-lg">
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
          <h1 className="mb-1 text-2xl font-bold text-white">Create your account</h1>
          <p className="mb-6 text-sm text-blue-200">
            Get started with AuraNode for free
          </p>

          {serverError && (
            <div className="mb-4 rounded-lg bg-red-500/20 border border-red-400/30 px-4 py-3 text-sm text-red-200">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Account Type */}
            <div>
              <label className="block text-sm font-medium text-blue-100 mb-2">
                Account type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["clinic", "specialist", "admin"] as UserRole[]).map((role) => (
                  <label
                    key={role}
                    className={`relative flex cursor-pointer flex-col rounded-lg border p-3 transition-colors ${
                      selectedRole === role
                        ? "border-cyan-400 bg-cyan-500/20 text-white"
                        : "border-white/20 bg-white/5 text-blue-200 hover:border-white/40"
                    }`}
                  >
                    <input
                      type="radio"
                      value={role}
                      className="sr-only"
                      {...register("role")}
                    />
                    <span className="text-xs font-semibold capitalize">{role}</span>
                    <span className="mt-0.5 text-xs opacity-75">{roleDescriptions[role]}</span>
                  </label>
                ))}
              </div>
              {errors.role && (
                <p className="mt-1 text-xs text-red-300">{errors.role.message}</p>
              )}
            </div>

            {/* Full Name */}
            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-blue-100 mb-1.5">
                Full name
              </label>
              <input
                id="full_name"
                type="text"
                autoComplete="name"
                placeholder="Dr. Jane Smith"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3.5 py-2.5 text-white placeholder:text-blue-300/60 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 text-sm"
                {...register("full_name")}
              />
              {errors.full_name && (
                <p className="mt-1 text-xs text-red-300">{errors.full_name.message}</p>
              )}
            </div>

            {/* Email */}
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

            {/* Organization (optional) */}
            <div>
              <label htmlFor="organization" className="block text-sm font-medium text-blue-100 mb-1.5">
                Organization{" "}
                <span className="text-blue-300/60 text-xs font-normal">(optional)</span>
              </label>
              <input
                id="organization"
                type="text"
                autoComplete="organization"
                placeholder="City General Hospital"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3.5 py-2.5 text-white placeholder:text-blue-300/60 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 text-sm"
                {...register("organization")}
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-blue-100 mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="Min. 8 chars, 1 uppercase, 1 number"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3.5 py-2.5 text-white placeholder:text-blue-300/60 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 text-sm"
                {...register("password")}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-red-300">{errors.password.message}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-blue-100 mb-1.5">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                className="w-full rounded-lg border border-white/20 bg-white/10 px-3.5 py-2.5 text-white placeholder:text-blue-300/60 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 text-sm"
                {...register("confirmPassword")}
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-red-300">{errors.confirmPassword.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-blue-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
            >
              {isLoading ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-blue-200">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-cyan-300 hover:text-cyan-200">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
