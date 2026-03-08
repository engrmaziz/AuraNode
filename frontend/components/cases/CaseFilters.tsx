"use client";

import { useEffect, useState } from "react";
import { Search, X, ChevronDown } from "lucide-react";
import type { FilterState } from "@/types";

// ─── Helpers ─────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const STATUS_OPTIONS = [
  { value: "uploaded",     label: "Uploaded" },
  { value: "processing",   label: "Processing" },
  { value: "flagged",      label: "Flagged" },
  { value: "under_review", label: "Under Review" },
  { value: "completed",    label: "Completed" },
];

const PRIORITY_OPTIONS = [
  { value: "",         label: "All Priorities" },
  { value: "critical", label: "Critical" },
  { value: "high",     label: "High" },
  { value: "normal",   label: "Normal" },
  { value: "low",      label: "Low" },
];

// ─── Props ───────────────────────────────────────────────────

interface CaseFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

// ─── Status multi-select dropdown ────────────────────────────

function StatusDropdown({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label =
    selected.length === 0
      ? "All Statuses"
      : selected.length === 1
      ? STATUS_OPTIONS.find((o) => o.value === selected[0])?.label ?? selected[0]
      : `${selected.length} statuses`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary hover:bg-accent transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        {selected.length > 0 && (
          <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs h-4 w-4">
            {selected.length}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-0 top-full mt-1 z-20 w-44 rounded-lg border border-border bg-white dark:bg-gray-900 shadow-lg py-1">
            {STATUS_OPTIONS.map(({ value, label: optLabel }) => {
              const checked = selected.includes(value);
              return (
                <label
                  key={value}
                  className="flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(value)}
                    className="rounded border-border accent-primary"
                    aria-label={optLabel}
                  />
                  {optLabel}
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Active filter chips ──────────────────────────────────────

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 hover:text-primary/70 transition-colors"
        aria-label={`Remove filter: ${label}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

// ─── Component ───────────────────────────────────────────────

export function CaseFilters({ filters, onChange }: CaseFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebounce(searchInput, 300);

  // Sync debounced search to parent
  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      onChange({ ...filters, search: debouncedSearch });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Sync external filter changes back to local search input
  useEffect(() => {
    if (filters.search !== searchInput) {
      setSearchInput(filters.search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search]);

  const handleStatusToggle = (value: string) => {
    const newStatus = filters.status.includes(value)
      ? filters.status.filter((s) => s !== value)
      : [...filters.status, value];
    onChange({ ...filters, status: newStatus });
  };

  const handleClearAll = () => {
    setSearchInput("");
    onChange({ status: [], priority: "", search: "", dateFrom: "", dateTo: "" });
  };

  const activeFilterCount =
    filters.status.length +
    (filters.priority ? 1 : 0) +
    (filters.search ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0);

  return (
    <div className="space-y-3">
      {/* Filter controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search cases…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Search cases"
          />
        </div>

        {/* Status multi-select */}
        <StatusDropdown selected={filters.status} onToggle={handleStatusToggle} />

        {/* Priority select */}
        <select
          value={filters.priority}
          onChange={(e) => onChange({ ...filters, priority: e.target.value })}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Filter by priority"
        >
          {PRIORITY_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        {/* Date range */}
        <div className="flex items-center gap-1.5 text-sm">
          <label className="text-muted-foreground text-xs whitespace-nowrap">From</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Date from"
          />
          <label className="text-muted-foreground text-xs whitespace-nowrap">To</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Date to"
          />
        </div>

        {/* Clear all */}
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Clear all filters"
          >
            <X className="h-3.5 w-3.5" />
            Clear all
            <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-muted text-foreground text-xs h-4 w-4 font-medium">
              {activeFilterCount}
            </span>
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.status.map((s) => (
            <FilterChip
              key={s}
              label={`Status: ${s.replaceAll("_", " ")}`}
              onRemove={() => handleStatusToggle(s)}
            />
          ))}
          {filters.priority && (
            <FilterChip
              label={`Priority: ${filters.priority}`}
              onRemove={() => onChange({ ...filters, priority: "" })}
            />
          )}
          {filters.search && (
            <FilterChip
              label={`Search: "${filters.search}"`}
              onRemove={() => {
                setSearchInput("");
                onChange({ ...filters, search: "" });
              }}
            />
          )}
          {filters.dateFrom && (
            <FilterChip
              label={`From: ${filters.dateFrom}`}
              onRemove={() => onChange({ ...filters, dateFrom: "" })}
            />
          )}
          {filters.dateTo && (
            <FilterChip
              label={`To: ${filters.dateTo}`}
              onRemove={() => onChange({ ...filters, dateTo: "" })}
            />
          )}
        </div>
      )}
    </div>
  );
}
