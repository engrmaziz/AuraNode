"use client";

import { useAuth } from "./useAuth";
import type { UserRole } from "@/types";

export interface RoleState {
  role: UserRole | null;
  isClinic: boolean;
  isSpecialist: boolean;
  isAdmin: boolean;
  loading: boolean;
}

/**
 * Convenience hook that derives role flags from the authenticated user.
 */
export function useRole(): RoleState {
  const { user, loading } = useAuth();

  const role = (user?.role as UserRole) ?? null;

  return {
    role,
    isClinic: role === "clinic",
    isSpecialist: role === "specialist",
    isAdmin: role === "admin",
    loading,
  };
}
