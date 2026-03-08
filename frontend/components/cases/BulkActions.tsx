"use client";

import { useState } from "react";
import { AlertCircle, ChevronDown, Download, Loader2, Users, X } from "lucide-react";
import { put } from "@/lib/api-client";
import type { Case, User } from "@/types";

// ─── Helpers ─────────────────────────────────────────────────

function exportCasesToCSV(cases: Case[]): void {
  const headers = ["ID", "Title", "Patient Ref", "Status", "Priority", "Created At"];
  const rows = cases.map((c) => [
    c.id,
    `"${c.title.replace(/"/g, '""')}"`,
    c.patient_reference ?? "",
    c.status,
    c.priority,
    new Date(c.created_at).toISOString(),
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cases-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Confirmation Dialog ─────────────────────────────────────

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onCancel}
        aria-hidden="true"
      />
      {/* Dialog */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-white dark:bg-gray-900 p-6 shadow-xl">
        <div className="flex items-start gap-3 mb-4">
          <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────

interface BulkActionsProps {
  selectedCases: Case[];
  specialists: User[];
  onClear: () => void;
  onActionComplete: () => void;
}

// ─── Component ───────────────────────────────────────────────

export function BulkActions({
  selectedCases,
  specialists,
  onClear,
  onActionComplete,
}: BulkActionsProps) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedSpecialist, setSelectedSpecialist] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    action: () => Promise<void>;
  }>({ open: false, title: "", description: "", action: async () => {} });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = selectedCases.length;

  if (count === 0) return null;

  // ─── Bulk assign ──────────────────────────────────────────

  const handleBulkAssign = () => {
    if (!selectedSpecialist) return;
    const specialist = specialists.find((s) => s.id === selectedSpecialist);
    setConfirmDialog({
      open: true,
      title: "Bulk Assign Specialist",
      description: `Assign ${specialist?.full_name ?? specialist?.email ?? "specialist"} to ${count} case${count !== 1 ? "s" : ""}?`,
      action: async () => {
        setProcessing(true);
        setError(null);
        const errors: string[] = [];
        for (const c of selectedCases) {
          try {
            await put(`/api/v1/cases/${c.id}/assign`, { specialist_id: selectedSpecialist });
          } catch {
            errors.push(c.id);
          }
        }
        setProcessing(false);
        if (errors.length) {
          setError(`Failed to assign ${errors.length} case(s).`);
        } else {
          setAssignOpen(false);
          setSelectedSpecialist("");
          onActionComplete();
        }
      },
    });
  };

  // ─── Export ───────────────────────────────────────────────

  const handleExport = () => {
    exportCasesToCSV(selectedCases);
  };

  // ─── Confirm / cancel ─────────────────────────────────────

  const handleConfirm = async () => {
    setConfirmDialog((prev) => ({ ...prev, open: false }));
    await confirmDialog.action();
  };

  const handleCancel = () => {
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  return (
    <>
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
        {/* Count label */}
        <span className="text-sm font-medium">
          {count} case{count !== 1 ? "s" : ""} selected
        </span>

        {/* Clear selection */}
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Clear selection"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>

        <div className="h-5 w-px bg-border" aria-hidden="true" />

        {/* Assign specialist */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setAssignOpen((v) => !v)}
            disabled={processing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60 transition-colors"
          >
            {processing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Users className="h-3.5 w-3.5" />
            )}
            Assign Specialist
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>

          {assignOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setAssignOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute left-0 top-full mt-1 z-20 w-56 rounded-lg border border-border bg-white dark:bg-gray-900 shadow-lg p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Select Specialist
                </p>
                {specialists.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No specialists available.</p>
                ) : (
                  <>
                    <select
                      value={selectedSpecialist}
                      onChange={(e) => setSelectedSpecialist(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      aria-label="Select specialist to assign"
                    >
                      <option value="">Choose…</option>
                      {specialists.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name ?? s.email}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!selectedSpecialist}
                      onClick={handleBulkAssign}
                      className="w-full rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      Assign to Selected
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Export */}
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>

        {/* Error */}
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </p>
        )}
      </div>
    </>
  );
}
