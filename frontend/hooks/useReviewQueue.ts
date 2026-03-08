"use client";

import { useCallback, useEffect, useState } from "react";
import { get } from "@/lib/api-client";
import { useInterval } from "@/hooks/useInterval";
import type { ReviewQueueItem } from "@/types";

const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export interface UseReviewQueueReturn {
  queue: ReviewQueueItem[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useReviewQueue(): UseReviewQueueReturn {
  const [queue, setQueue] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    const fetchQueue = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await get<ReviewQueueItem[]>("/api/v1/reviews/my-queue");
        if (!cancelled) setQueue(data ?? []);
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Failed to fetch review queue";
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchQueue();

    return () => {
      cancelled = true;
    };
  }, [tick]);

  // Auto-refresh every 2 minutes
  useInterval(refetch, POLL_INTERVAL_MS);

  return { queue, loading, error, refetch };
}
