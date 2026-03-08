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
    role: z.enum(["clinic", "specialist"] as const, {
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

const roleDescriptions: Record<"clinic" | "specialist", string> = {
  clinic: "Upload and manage diagnostic cases",
  specialist: "Review flagged cases assigned to you",
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
        const { error: profileError } = await (supabase as any) // type-assert: supabase-js v2.98 ↔ auth-helpers v0.10 generics mismatch
          .from("users")
          .insert({
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
    <div className="space-y-6">
      {/* Logo — shown on mobile */}
      <div className="text-center lg:hidden mb-2">
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="text-3xl">🩺</span>
          <span className="text-2xl font-extrabold">AuraNode</span>
        </Link>
        <p className="mt-1 text-muted-foreground text-sm">AI-Powered Diagnostic Intelligence</p>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Create your account</h1>
        <p className="text-muted-foreground text-sm mt-1">Get started with AuraNode for free</p>
      </div>

      {serverError && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Account Type */}
        <div>
          <label className="block text-sm font-medium mb-2">Account type</label>
          <div className="grid grid-cols-2 gap-2">
            {(["clinic", "specialist"] as UserRole[]).map((role) => (
              <label
                key={role}
                className={`relative flex cursor-pointer flex-col rounded-lg border p-3 transition-colors ${
                  selectedRole === role
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-input bg-background text-muted-foreground hover:border-primary/50"
                }`}
              >
                <input type="radio" value={role} className="sr-only" {...register("role")} />
                <span className="text-xs font-semibold capitalize">{role}</span>
                <span className="mt-0.5 text-xs opacity-75">{roleDescriptions[role as "clinic" | "specialist"]}</span>
              </label>
            ))}
          </div>
          {errors.role && (
            <p className="mt-1 text-xs text-destructive">{errors.role.message}</p>
          )}
        </div>

        {/* Full Name */}
        <div>
          <label htmlFor="full_name" className="block text-sm font-medium mb-1.5">
            Full name
          </label>
          <input
            id="full_name"
            type="text"
            autoComplete="name"
            placeholder="Dr. Jane Smith"
            className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            {...register("full_name")}
          />
          {errors.full_name && (
            <p className="mt-1 text-xs text-destructive">{errors.full_name.message}</p>
          )}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1.5">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@clinic.com"
            className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            {...register("email")}
          />
          {errors.email && (
            <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        {/* Organization (optional) */}
        <div>
          <label htmlFor="organization" className="block text-sm font-medium mb-1.5">
            Organization{" "}
            <span className="text-muted-foreground text-xs font-normal">(optional)</span>
          </label>
          <input
            id="organization"
            type="text"
            autoComplete="organization"
            placeholder="City General Hospital"
            className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            {...register("organization")}
          />
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1.5">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="Min. 8 chars, 1 uppercase, 1 number"
            className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            {...register("password")}
          />
          {errors.password && (
            <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium mb-1.5">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="mt-1 text-xs text-destructive">{errors.confirmPassword.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
        >
          {isLoading ? (
            <span className="inline-flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Creating account…
            </span>
          ) : (
            "Create account"
          )}
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
