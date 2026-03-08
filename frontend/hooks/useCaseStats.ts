"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { get } from "@/lib/api-client";
import type { CaseStats } from "@/types";

export interface UseCaseStatsReturn {
  stats: CaseStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const AUTO_REFRESH_MS = 60_000; // 60 seconds

export function useCaseStats(): UseCaseStatsReturn {
  const [stats, setStats] = useState<CaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await get<CaseStats>("/api/v1/cases/stats");
        if (!cancelled) setStats(data);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to fetch stats");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchStats();

    // Auto-refresh every 60 seconds
    intervalRef.current = setInterval(fetchStats, AUTO_REFRESH_MS);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [tick]);

  return { stats, loading, error, refetch };
}
