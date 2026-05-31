import { Check, X } from "lucide-react";

import {
  STATUS_TONE,
  WORKFLOW_STEPS,
  type ReportStatus,
} from "@/lib/stores/reports";
import { cn } from "@/lib/utils";

interface ReportProgressProps {
  status: ReportStatus;
  /** When true, renders a compact dot-and-bar version suitable for list rows. */
  compact?: boolean;
  className?: string;
}

const STEP_SHORT_LABEL: Record<ReportStatus, string> = {
  Ordered: "Ordered",
  "Sample Collected": "Sample",
  "Waiting for Results": "Testing",
  Review: "Review",
  Published: "Published",
  Cancelled: "Cancelled",
};

/**
 * 4-step progress indicator for a report.
 *
 *   Sample Collected → Waiting for Results → Review → Published
 *
 * Cancelled is rendered as an off-track terminal state.
 */
export function ReportProgress({
  status,
  compact = false,
  className,
}: ReportProgressProps) {
  const isCancelled = status === "Cancelled";
  const currentIndex = isCancelled ? -1 : WORKFLOW_STEPS.indexOf(status);

  if (compact) {
    return (
      <div
        className={cn("flex items-center gap-1.5", className)}
        aria-label={`Status: ${status}`}
        title={
          isCancelled
            ? "Cancelled"
            : `Step ${currentIndex + 1} of ${WORKFLOW_STEPS.length}: ${status}`
        }
      >
        {WORKFLOW_STEPS.map((step, i) => {
          const reached = !isCancelled && i <= currentIndex;
          const isCurrent = !isCancelled && i === currentIndex;
          const stateLabel = isCancelled
            ? "skipped"
            : i < currentIndex
              ? "done"
              : isCurrent
                ? "current"
                : "upcoming";
          return (
            <span
              key={step}
              title={`${i + 1}. ${step} — ${stateLabel}`}
              className={cn(
                "h-1.5 w-6 rounded-full transition-colors",
                reached ? STATUS_TONE[step].dot : "bg-neutral-200",
                isCurrent && "ring-2 ring-offset-1",
                isCurrent &&
                  step === "Sample Collected" &&
                  "ring-sky-300",
                isCurrent &&
                  step === "Waiting for Results" &&
                  "ring-amber-300",
                isCurrent && step === "Review" && "ring-violet-300",
                isCurrent && step === "Published" && "ring-emerald-300",
              )}
            />
          );
        })}
        {isCancelled && (
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
            <X className="h-3 w-3" />
            Cancelled
          </span>
        )}
      </div>
    );
  }

  return (
    <ol
      className={cn(
        "flex w-full items-start gap-0",
        isCancelled && "opacity-60",
        className,
      )}
      aria-label="Report progress"
    >
      {WORKFLOW_STEPS.map((step, i) => {
        const reached = !isCancelled && i <= currentIndex;
        const completed = !isCancelled && i < currentIndex;
        const isCurrent = !isCancelled && i === currentIndex;
        const tone = STATUS_TONE[step];
        const isLast = i === WORKFLOW_STEPS.length - 1;
        return (
          <li
            key={step}
            className="flex flex-1 flex-col items-center"
            aria-current={isCurrent ? "step" : undefined}
          >
            <div className="flex w-full items-center">
              {/* Left connector (hidden on first item) */}
              {i > 0 && (
                <span
                  className={cn(
                    "h-0.5 flex-1 transition-colors",
                    reached ? tone.dot : "bg-neutral-200",
                  )}
                />
              )}
              {/* Node */}
              <span
                className={cn(
                  "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all",
                  completed && cn(tone.dot, "text-white"),
                  isCurrent &&
                    cn(
                      tone.dot,
                      "text-white shadow-sm ring-4 ring-offset-0",
                      tone.ring,
                    ),
                  !reached &&
                    "bg-neutral-100 text-neutral-400 ring-1 ring-neutral-200",
                )}
              >
                {completed ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              {/* Right connector (hidden on last item) */}
              {!isLast && (
                <span
                  className={cn(
                    "h-0.5 flex-1 transition-colors",
                    i < currentIndex ? tone.dot : "bg-neutral-200",
                  )}
                />
              )}
            </div>
            <span
              className={cn(
                "mt-2 text-center text-xs font-medium",
                reached ? "text-neutral-900" : "text-neutral-400",
                isCurrent && "text-neutral-900",
              )}
            >
              <span className="hidden sm:inline">{step}</span>
              <span className="sm:hidden">{STEP_SHORT_LABEL[step]}</span>
            </span>
          </li>
        );
      })}

      {isCancelled && (
        <li className="ml-3 flex items-center self-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200">
            <X className="h-3.5 w-3.5" />
            Cancelled
          </span>
        </li>
      )}
    </ol>
  );
}
