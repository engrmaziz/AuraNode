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
 * `User` profile (fetched from GET /api/v1/auth/me) in sync.
 */
export function useAuth(): AuthState {
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createBrowserClient();

  const fetchProfile = async (accessToken: string): Promise<User | null> => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      return (await res.json()) as User;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;

    // Load the initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        setSupabaseUser(session.user);
        const profile = await fetchProfile(session.access_token);
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
        const profile = await fetchProfile(session.access_token);
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
