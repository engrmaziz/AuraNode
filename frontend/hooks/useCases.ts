"use client";

import { useCallback, useState } from "react";
import { useEffect } from "react";
import type { Case, CaseFile, PaginatedResponse } from "@/types";
import { get, del } from "@/lib/api-client";

// ─── Types ──────────────────────────────────────────────────

export interface CasesFilters {
  status?: string;
  priority?: string;
  search?: string;
  page?: number;
  per_page?: number;
}

export interface PaginatedCases {
  cases: Case[];
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
}

export interface UseCasesReturn {
  cases: Case[];
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export interface UseCaseReturn {
  case: (Case & { files?: CaseFile[] }) | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// ─── useCases ───────────────────────────────────────────────

export function useCases(filters: CasesFilters = {}): UseCasesReturn {
  const [cases, setCases] = useState<Case[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [per_page, setPerPage] = useState(20);
  const [has_next, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    const fetchCases = async () => {
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, unknown> = {
          page: filters.page ?? 1,
          per_page: filters.per_page ?? 20,
        };
        if (filters.status) params.status = filters.status;
        if (filters.search) params.search = filters.search;

        const data = await get<PaginatedCases>("/api/v1/cases", params);

        if (!cancelled) {
          setCases(data.cases ?? []);
          setTotal(data.total ?? 0);
          setPage(data.page ?? 1);
          setPerPage(data.per_page ?? 20);
          setHasNext(data.has_next ?? false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Failed to fetch cases";
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchCases();

    return () => {
      cancelled = true;
    };
  }, [filters.status, filters.search, filters.page, filters.per_page, tick]);

  return { cases, total, page, per_page, has_next, loading, error, refetch };
}

// ─── useCase ────────────────────────────────────────────────

export function useCase(id: string | null): UseCaseReturn {
  const [caseData, setCaseData] = useState<(Case & { files?: CaseFile[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchCase = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await get<Case & { files?: CaseFile[] }>(`/api/v1/cases/${id}`);
        if (!cancelled) setCaseData(data);
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Failed to fetch case";
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchCase();

    return () => {
      cancelled = true;
    };
  }, [id, tick]);

  return { case: caseData, loading, error, refetch };
}
