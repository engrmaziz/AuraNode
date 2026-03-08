"use client";

import { useEffect, useState } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase";
import type { User } from "@/types";

export interface AuthState {
  user: User | null;
  supabaseUser: SupabaseUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

/**
 * Custom hook that subscribes to the Supabase auth state and keeps a
 * `User` profile (fetched directly from the Supabase `users` table) in sync.
 */
export function useAuth(): AuthState {
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createBrowserClient();

  const buildFallbackUser = (sbUser: SupabaseUser): User => {
    const meta = sbUser.user_metadata ?? {};
    return {
      id: sbUser.id,
      email: sbUser.email ?? "",
      role: (meta.role as User["role"]) ?? "clinic",
      full_name: (meta.full_name as string | null) ?? null,
      organization: (meta.organization as string | null) ?? null,
      created_at: sbUser.created_at ?? new Date().toISOString(),
      updated_at: (sbUser.updated_at as string | undefined) ?? new Date().toISOString(),
    };
  };

  const fetchProfile = async (sbUser: SupabaseUser): Promise<User> => {
    try {
      const { data: profile, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", sbUser.id)
        .single();
      if (error) {
        console.error("Failed to fetch user profile from Supabase:", error.message);
      } else if (profile) {
        // `users` table Row type is structurally identical to the User interface;
        // the `as unknown as User` cast is required because Supabase's generic
        // inference resolves to `never` for the row type in this context.
        return profile as unknown as User;
      }
    } catch (err) {
      console.error("Unexpected error fetching user profile:", err);
    }
    console.warn("Falling back to Supabase auth metadata for user profile:", sbUser.id);
    return buildFallbackUser(sbUser);
  };

  useEffect(() => {
    let mounted = true;

    // Load the initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        setSupabaseUser(session.user);
        const profile = await fetchProfile(session.user);
        if (mounted) setUser(profile);
      }
      if (mounted) setLoading(false);
    });

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (session?.user) {
        setSupabaseUser(session.user);
        const profile = await fetchProfile(session.user);
        if (mounted) setUser(profile);
      } else {
        setSupabaseUser(null);
        setUser(null);
      }

      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async (): Promise<void> => {
    await supabase.auth.signOut();
    setSupabaseUser(null);
    setUser(null);
  };

  return { user, supabaseUser, loading, signOut };
}
