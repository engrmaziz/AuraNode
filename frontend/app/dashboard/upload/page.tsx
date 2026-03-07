"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Check, Loader2, AlertCircle } from "lucide-react";
import { DropZone } from "@/components/upload/DropZone";
import { FilePreview } from "@/components/upload/FilePreview";
import { upload } from "@/lib/api-client";
import type { UploadProgress } from "@/types";

// ─── Types ──────────────────────────────────────────────────

interface CaseFormData {
  title: string;
  description: string;
  patient_reference: string;
  priority: "low" | "normal" | "high" | "critical";
}

interface UploadedCase {
  id: string;
}

const STEPS = ["Case Details", "Upload Files", "Review & Submit"] as const;
type Step = 0 | 1 | 2;

const PRIORITY_OPTIONS: { value: CaseFormData["priority"]; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "text-gray-600 bg-gray-100 dark:bg-gray-800" },
  { value: "normal", label: "Normal", color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30" },
  { value: "high", label: "High", color: "text-orange-600 bg-orange-100 dark:bg-orange-900/30" },
  { value: "critical", label: "Critical", color: "text-red-600 bg-red-100 dark:bg-red-900/30" },
];

// ─── Validation ─────────────────────────────────────────────

function validateStep1(data: CaseFormData): string | null {
  if (!data.title.trim()) return "Title is required.";
  if (data.title.trim().length < 3) return "Title must be at least 3 characters.";
  return null;
}

function validateStep2(files: File[]): string | null {
  if (files.length === 0) return "Please add at least one file.";
  if (files.length > 5) return "Maximum 5 files allowed.";
  return null;
}

// ─── StepIndicator ──────────────────────────────────────────

function StepIndicator({ current, steps }: { current: Step; steps: readonly string[] }) {
  return (
    <nav aria-label="Upload progress" className="mb-8">
      <ol className="flex items-center gap-0">
        {steps.map((label, i) => {
          const isDone = i < current;
          const isActive = i === current;

          return (
            <li key={label} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <span
                  className={`
                    flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold border-2 transition-colors
                    ${isDone ? "border-primary bg-primary text-primary-foreground" : ""}
                    ${isActive ? "border-primary bg-background text-primary" : ""}
                    ${!isDone && !isActive ? "border-border bg-background text-muted-foreground" : ""}
                  `}
                  aria-current={isActive ? "step" : undefined}
                >
                  {isDone ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span
                  className={`hidden sm:block text-xs font-medium ${
                    isActive ? "text-primary" : isDone ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`h-0.5 flex-1 mx-2 mt-[-12px] transition-colors ${
                    i < current ? "bg-primary" : "bg-border"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ─── Main Page ──────────────────────────────────────────────

export default function UploadPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [formData, setFormData] = useState<CaseFormData>({
    title: "",
    description: "",
    patient_reference: "",
    priority: "normal",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [fileProgresses, setFileProgresses] = useState<UploadProgress[]>([]);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);

  // ── File handlers ────────────────────────────────────────

  const handleFilesAccepted = useCallback((incoming: File[]) => {
    setFiles((prev) => {
      const combined = [...prev, ...incoming].slice(0, 5);
      return combined;
    });
    setFileProgresses((prev) => {
      const additions = incoming.map((f): UploadProgress => ({
        file: f,
        progress: 0,
        status: "pending",
      }));
      return [...prev, ...additions].slice(0, 5);
    });
    setStepError(null);
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFileProgresses((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Navigation ───────────────────────────────────────────

  const goNext = () => {
    if (step === 0) {
      const err = validateStep1(formData);
      if (err) { setStepError(err); return; }
    }
    if (step === 1) {
      const err = validateStep2(files);
      if (err) { setStepError(err); return; }
    }
    setStepError(null);
    setStep((s) => (s + 1) as Step);
  };

  const goBack = () => {
    setStepError(null);
    setStep((s) => (s - 1) as Step);
  };

  // ── Submit ───────────────────────────────────────────────

  const handleSubmit = async () => {
    const err1 = validateStep1(formData);
    const err2 = validateStep2(files);
    if (err1 || err2) { setStepError(err1 ?? err2); return; }

    setSubmitting(true);
    setStepError(null);

    // Build FormData
    const fd = new FormData();
    fd.append("title", formData.title.trim());
    if (formData.description.trim()) fd.append("description", formData.description.trim());
    if (formData.patient_reference.trim()) fd.append("patient_reference", formData.patient_reference.trim());
    fd.append("priority", formData.priority);
    files.forEach((f) => fd.append("files", f));

    // Mark all files as uploading
    setFileProgresses(files.map((f) => ({ file: f, progress: 0, status: "uploading" })));

    try {
      const result = await upload<UploadedCase>("/api/v1/uploads/case", fd, (percent) => {
        setOverallProgress(percent);
        setFileProgresses(files.map((f) => ({ file: f, progress: percent, status: "uploading" })));
      });

      // Mark complete
      setFileProgresses(files.map((f) => ({ file: f, progress: 100, status: "success" })));

      router.push(`/dashboard/cases/${result.id}?uploaded=1`);
    } catch (err: unknown) {
      const apiErr = (err as { response?: { data?: { detail?: string } } });
      const detail = apiErr?.response?.data?.detail ?? "Upload failed. Please try again.";
      setStepError(detail);
      setFileProgresses(files.map((f) => ({ file: f, progress: 0, status: "error", error: detail })));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render steps ─────────────────────────────────────────

  const renderStep0 = () => (
    <div className="space-y-5">
      <div>
        <label htmlFor="title" className="block text-sm font-medium mb-1.5">
          Case Title <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          type="text"
          value={formData.title}
          onChange={(e) => setFormData((d) => ({ ...d, title: e.target.value }))}
          placeholder="e.g. Chest X-ray Review — Patient 102"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          minLength={3}
          maxLength={300}
          required
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium mb-1.5">
          Description <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData((d) => ({ ...d, description: e.target.value }))}
          placeholder="Additional context about this case…"
          rows={4}
          maxLength={2000}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div>
        <label htmlFor="patient_reference" className="block text-sm font-medium mb-1.5">
          Patient Reference <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <input
          id="patient_reference"
          type="text"
          value={formData.patient_reference}
          onChange={(e) => setFormData((d) => ({ ...d, patient_reference: e.target.value }))}
          placeholder="e.g. PT-00123 (no PII)"
          maxLength={100}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div>
        <p className="block text-sm font-medium mb-2">Priority</p>
        <div className="flex flex-wrap gap-2">
          {PRIORITY_OPTIONS.map(({ value, label, color }) => (
            <button
              key={value}
              type="button"
              onClick={() => setFormData((d) => ({ ...d, priority: value }))}
              className={`
                rounded-full px-4 py-1.5 text-sm font-medium border-2 transition-all
                ${formData.priority === value
                  ? `${color} border-current`
                  : "border-transparent bg-muted text-muted-foreground hover:bg-accent"}
              `}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-4">
      <DropZone
        onFilesAccepted={handleFilesAccepted}
        maxFiles={5}
        maxSize={10 * 1024 * 1024}
        currentFiles={files}
        disabled={files.length >= 5}
      />

      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Selected files ({files.length}/5)
          </p>
          {files.map((file, i) => (
            <FilePreview
              key={`${file.name}-${i}`}
              file={file}
              progress={fileProgresses[i] ?? { file, progress: 0, status: "pending" }}
              onRemove={() => handleRemoveFile(i)}
            />
          ))}
        </div>
      )}
    </div>
  );

  const renderStep2 = () => {
    const priorityLabel = PRIORITY_OPTIONS.find((p) => p.value === formData.priority)?.label ?? formData.priority;
    const priorityColor = PRIORITY_OPTIONS.find((p) => p.value === formData.priority)?.color ?? "";

    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-border p-5 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Case Details</h3>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Title</span>
              <span className="font-medium text-right max-w-[60%] truncate">{formData.title}</span>
            </div>
            {formData.description && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground flex-shrink-0">Description</span>
                <span className="text-right text-xs text-foreground/80 line-clamp-2">{formData.description}</span>
              </div>
            )}
            {formData.patient_reference && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Patient Ref</span>
                <span className="font-mono text-xs">{formData.patient_reference}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Priority</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityColor}`}>
                {priorityLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border p-5 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Files ({files.length})
          </h3>
          <div className="space-y-2">
            {files.map((file, i) => (
              <FilePreview
                key={`${file.name}-${i}`}
                file={file}
                progress={fileProgresses[i] ?? { file, progress: 0, status: "pending" }}
                disabled={submitting}
              />
            ))}
          </div>
        </div>

        {submitting && overallProgress > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Uploading…</span>
              <span>{overallProgress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-200"
                style={{ width: `${overallProgress}%` }}
                role="progressbar"
                aria-valuenow={overallProgress}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Layout ───────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Upload New Case</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Fill in case details and attach diagnostic files.
        </p>
      </div>

      <StepIndicator current={step} steps={STEPS} />

      <div className="rounded-2xl border border-border bg-white dark:bg-gray-900 p-6">
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}

        {/* Error */}
        {stepError && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span>{stepError}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={goBack}
          disabled={step === 0 || submitting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        {step < 2 ? (
          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Submit Case
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
