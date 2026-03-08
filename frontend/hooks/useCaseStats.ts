"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { get } from "@/lib/api-client";
import type { CaseStats } from "@/types";

export interface UseCaseStatsReturn {
  stats: CaseStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const AUTO_REFRESH_MS = 60_000; // 60 seconds

const EMPTY_STATS: CaseStats = {
  total: 0,
  by_status: { uploaded: 0, processing: 0, flagged: 0, under_review: 0, completed: 0 },
  by_priority: { low: 0, normal: 0, high: 0, critical: 0 },
  flagged_today: 0,
  completed_this_week: 0,
  average_processing_time_hours: 0,
};

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
          // On 401 show empty/zero stats silently — never trigger a logout
          if (axios.isAxiosError(err) && err.response?.status === 401) {
            console.warn("Stats endpoint returned 401 — showing empty stats.");
            setStats(EMPTY_STATS);
          } else {
            setError(err instanceof Error ? err.message : "Failed to fetch stats");
          }
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
