"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CalendarCheck,
  Check,
  ChevronDown,
  IndianRupee,
  Mail,
  MessageCircle,
  MessageSquare,
  Pencil,
  Printer,
  Receipt,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  TestTube2,
  Trash2,
  User,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import * as React from "react";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";

import { ReportProgress } from "@/components/reports/report-progress";
import { StatusPill } from "@/components/reports/status-pill";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  getPatientFullName,
  usePatientsStore,
} from "@/lib/stores/patients";
import {
  FLAG_TONE,
  PAYMENT_METHODS,
  SAMPLE_CONDITION_LABEL,
  SAMPLE_CONDITIONS,
  STATUS_TONE,
  hasCriticalResults,
  reasonCannotPublish,
  useReportsStore,
  type CheckInVitals,
  type FastingStatus,
  type NewPaymentInput,
  type Payment,
  type PaymentMethod,
  type PregnancyStatus,
  type Report,
  type ResultRow,
  type SampleCondition,
} from "@/lib/stores/reports";
import { useBillingStore } from "@/lib/stores/billing";
import { useLabCatalogStore } from "@/lib/stores/lab-catalog";
import { useLabProfileStore } from "@/lib/stores/lab-profile";
import { WhatsAppPreviewDialog } from "@/components/reports/whatsapp-preview-dialog";
import { flagForValue } from "@/lib/utils/auto-flag";
import { deriveAutoValues } from "@/lib/utils/auto-formulas";
import { cn, formatDateOnly } from "@/lib/utils";

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const report = useReportsStore((s) => s.reports.find((r) => r.id === id));
  const patient = usePatientsStore((s) =>
    report ? s.patients.find((p) => p.id === report.patientId) : undefined,
  );
  // Sibling reports from the same visit — when a patient walked in for
  // CBC + Lipid + Thyroid in one go, the technician needs to flip
  // between the three reports without going back to the list.
  //
  // Derive with useMemo from the full reports array rather than via a
  // zustand selector — a selector returning a fresh `.filter(...)`
  // array every render trips React 18's getServerSnapshot caching
  // check and infinite-loops.
  const allReports = useReportsStore((s) => s.reports);
  const siblings = React.useMemo(
    () =>
      report
        ? allReports
            .filter(
              (r) => r.visitId === report.visitId && r.id !== report.id,
            )
            .sort((a, b) => a.reportCode.localeCompare(b.reportCode))
        : [],
    [allReports, report],
  );
  const hasHydrated =
    (useReportsStore.persist?.hasHydrated() ?? true) &&
    (usePatientsStore.persist?.hasHydrated() ?? true);

  const billingDebit = useBillingStore((s) => s.debit);
  const pricePerReportPaise = useBillingStore((s) => s.pricePerReportPaise);
  const billingStatus = useBillingStore((s) => s.getStatus());
  const billingSuspended = billingStatus === "suspended";

  // Catalog lookup for the patient-side invoice amount — prefills the
  // Record Payment dialog with the test's base price so the receptionist
  // doesn't have to retype the quote.
  const labProfile = useLabProfileStore((s) => s.profile);
  const labTest = useLabCatalogStore((s) =>
    report?.testCode
      ? s.tests.find(
          (t) => t.code.toUpperCase() === report.testCode!.toUpperCase(),
        )
      : undefined,
  );
  const suggestedPaymentAmount = labTest?.basePrice;

  const collectSample = useReportsStore((s) => s.collectSample);
  const startTesting = useReportsStore((s) => s.startTesting);
  const sendForReview = useReportsStore((s) => s.sendForReview);
  const publish = useReportsStore((s) => s.publish);
  const cancel = useReportsStore((s) => s.cancel);
  const updateReport = useReportsStore((s) => s.updateReport);
  const acknowledgeCriticals = useReportsStore((s) => s.acknowledgeCriticals);
  const sendToPatient = useReportsStore((s) => s.sendToPatient);
  const recordPayment = useReportsStore((s) => s.recordPayment);
  const refundPayment = useReportsStore((s) => s.refundPayment);
  const clearPayment = useReportsStore((s) => s.clearPayment);

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [collectDialogOpen, setCollectDialogOpen] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);

  if (!hasHydrated) {
    return (
      <div className="mx-auto max-w-400">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (!report) notFound();

  const tone = STATUS_TONE[report.status];
  const patientName = patient ? getPatientFullName(patient) : "Unknown patient";
  const hasCriticals = hasCriticalResults(report);
  const criticalsAcked = Boolean(report.criticalsAcknowledged);
  const publishBlockedReason =
    report.status === "Review" ? reasonCannotPublish(report) : null;

  function safeRun<T>(label: string, fn: () => T): T | undefined {
    try {
      return fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(label, { description: msg });
      return undefined;
    }
  }

  function onCollectSample(opts: {
    sampleId: string;
    sampleCondition: SampleCondition;
    sampleNote?: string;
  }) {
    const updated = safeRun("Could not mark sample collected", () =>
      collectSample(report!.id, opts),
    );
    if (updated) {
      toast.success(`Sample ${updated.sampleId ?? "collected"}`, {
        description: `Condition: ${SAMPLE_CONDITION_LABEL[opts.sampleCondition]}`,
      });
      setCollectDialogOpen(false);
    }
  }

  function onStartTesting() {
    const updated = safeRun("Could not start testing", () =>
      startTesting(report!.id),
    );
    if (updated) toast.success("Sample moved to Waiting for Results");
  }

  function onSendForReview() {
    const updated = safeRun("Could not send for review", () =>
      sendForReview(report!.id),
    );
    if (updated) toast.success("Report ready for review");
  }

  function onPublish() {
    // Subscription billing: each published report debits the lab's
    // credit balance. Debit FIRST so a failure (suspended / insufficient)
    // blocks the publish — never publish then fail to charge. The
    // billing store throws InsufficientBalanceError which safeRun
    // surfaces as a toast.
    if (billingSuspended) {
      toast.error(
        "Lab account is suspended. Reactivate from Billing settings before publishing.",
      );
      return;
    }
    const debited = safeRun("Could not debit credits", () =>
      billingDebit({
        amountPaise: pricePerReportPaise,
        reason: "report_submission",
        metadata: {
          report_id: report!.id,
          report_code: report!.reportCode,
          test_name: report!.testName,
        },
      }),
    );
    if (!debited) return;
    const updated = safeRun("Could not publish", () => publish(report!.id));
    if (updated) toast.success("Report published");
  }

  function onCancel() {
    const updated = safeRun("Could not cancel", () =>
      cancel(report!.id, { note: cancelReason.trim() || undefined }),
    );
    if (updated) {
      toast.success("Report cancelled");
      setCancelDialogOpen(false);
      setCancelReason("");
    }
  }

  function onAcknowledgeCriticals() {
    const updated = safeRun("Could not acknowledge", () =>
      acknowledgeCriticals(report!.id),
    );
    if (updated) toast.success("Critical results acknowledged");
  }

  function onSendToPatient(channel: "whatsapp" | "email" | "sms") {
    // WhatsApp gets a preview-and-confirm step so the lab can sanity
    // check the rendered template (and copy the message manually if
    // they want to send via a personal phone). Other channels still
    // call sendToPatient directly until they get their own previews.
    if (channel === "whatsapp") {
      setWhatsappDialogOpen(true);
      return;
    }
    const updated = safeRun("Could not send", () =>
      sendToPatient(report!.id, { channel }),
    );
    if (updated) {
      toast.success(`Sent to patient via ${channelLabel(channel)}`, {
        description: "Placeholder — no real delivery API wired yet.",
      });
    }
  }

  function onConfirmWhatsApp() {
    const updated = safeRun("Could not send", () =>
      sendToPatient(report!.id, { channel: "whatsapp" }),
    );
    if (updated) {
      toast.success("Marked as sent via WhatsApp (demo)", {
        description: "Audit stamp recorded. Wire a real WhatsApp provider to deliver.",
      });
      setWhatsappDialogOpen(false);
    }
  }

  function onRecordPayment(input: NewPaymentInput) {
    const updated = safeRun("Could not record payment", () =>
      recordPayment(report!.id, input),
    );
    if (updated) {
      toast.success(
        `Payment of ${formatINR(input.amount)} recorded`,
      );
      setPaymentDialogOpen(false);
    }
  }

  function onClearPayment() {
    const updated = safeRun("Could not clear payment", () =>
      clearPayment(report!.id),
    );
    if (updated) toast.success("Payment cleared");
  }

  function onRefundPayment(input: {
    amount?: number;
    method?: PaymentMethod;
    reason?: string;
    refundedAt?: string;
  }) {
    const updated = safeRun("Could not refund payment", () =>
      refundPayment(report!.id, input),
    );
    if (updated) {
      toast.success(
        `Refund of ${formatINR(updated.payment?.refundedAmount ?? 0)} recorded`,
      );
      setRefundDialogOpen(false);
    }
  }

  return (
    <div className="mx-auto max-w-400">
      <div className="mb-6">
        <Link
          href="/reports"
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to reports
        </Link>
      </div>

      {/* Sibling reports — only when this report is part of a multi-test
          visit. Lets the tech flip between sister tests for the same
          patient without going back to the list. */}
      {siblings.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm">
          <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Same visit
          </span>
          <Link
            href={`/reports/visit/${report.visitId}`}
            className="text-brand-700 hover:text-brand-800 inline-flex items-center gap-1 text-xs font-medium hover:underline"
            title="Open the visit-wide editor"
          >
            <TestTube2 className="h-3 w-3" />
            {siblings.length + 1}-test visit
          </Link>
          <span className="text-neutral-300">·</span>
          {siblings.map((s) => (
            <Link
              key={s.id}
              href={`/reports/${s.id}`}
              className="hover:bg-brand-50 inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 py-0.5 text-xs"
              title={s.testName}
            >
              <span className="font-mono text-neutral-500">
                {s.reportCode}
              </span>
              <span className="text-neutral-900">{s.testName}</span>
              <StatusPill status={s.status} className="h-4 px-1 text-[9px]" />
            </Link>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        {/* Header */}
        <div className="from-brand-50 to-background flex items-start justify-between gap-4 border-b border-neutral-100 bg-gradient-to-b p-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
                {report.testName}
              </h1>
              {report.testCode && (
                <span className="bg-white text-neutral-600 ring-neutral-200 inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-medium ring-1 ring-inset">
                  {report.testCode}
                </span>
              )}
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                  tone.bg,
                  tone.text,
                  tone.ring,
                )}
              >
                <span
                  className={cn("h-1.5 w-1.5 rounded-full", tone.dot)}
                  aria-hidden
                />
                {report.status}
              </span>
            </div>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="text-brand-800 bg-brand-50 ring-brand-100 inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-medium ring-1 ring-inset">
                {report.reportCode}
              </span>
              <Link
                href={`/patients/${report.patientId}`}
                className="hover:text-brand-700 flex items-center gap-1.5 font-medium text-neutral-900 transition-colors"
              >
                <User className="h-4 w-4" />
                {patientName}
                {patient && (
                  <span className="text-muted-foreground font-mono text-xs">
                    {patient.patientCode}
                  </span>
                )}
              </Link>
              {(report.requestingDoctor || report.referringHospital) && (
                <span className="flex items-center gap-1.5">
                  <Stethoscope className="h-4 w-4" />
                  {report.requestingDoctor}
                  {report.requestingDoctor &&
                    report.referringHospital &&
                    " · "}
                  {report.referringHospital && (
                    <span className="text-muted-foreground">
                      {report.referringHospital}
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
          {report.status !== "Cancelled" && (
            <Link
              href={`/reports/${report.id}/print`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3.5 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50"
            >
              <Printer className="h-4 w-4" />
              Print / PDF
            </Link>
          )}
          {report.payment && (
            <Link
              href={`/reports/${report.id}/receipt`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3.5 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50"
              title="Print or save the patient payment receipt"
            >
              <Receipt className="h-4 w-4" />
              Receipt
            </Link>
          )}
          {report.status !== "Published" && report.status !== "Cancelled" && (
            <Link
              href={`/reports/${report.id}/edit`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3.5 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
          )}
        </div>

        {/* Progress stepper */}
        <div className="border-b border-neutral-100 px-6 py-6">
          <ReportProgress status={report.status} />
        </div>

        {/* Critical results alert */}
        {hasCriticals && (
          <CriticalAlert
            acknowledged={criticalsAcked}
            report={report}
            onAcknowledge={onAcknowledgeCriticals}
          />
        )}

        {/* Action panel */}
        <ActionPanel
          report={report}
          publishBlockedReason={publishBlockedReason}
          onCollectSampleClick={() => setCollectDialogOpen(true)}
          onStartTesting={onStartTesting}
          onSendForReview={onSendForReview}
          onPublish={onPublish}
          onCancelClick={() => setCancelDialogOpen(true)}
          onSendToPatient={onSendToPatient}
        />

        {/* Payment */}
        <PaymentSection
          payment={report.payment}
          onRecordClick={() => setPaymentDialogOpen(true)}
          onClear={onClearPayment}
          onRefundClick={() => setRefundDialogOpen(true)}
        />

        {/* Meta strip */}
        <div className="grid gap-4 border-t border-neutral-100 px-6 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetaCell
            icon={<Calendar className="h-4 w-4" />}
            label="Sample collected"
            value={formatDateOnly(report.collectedAt)}
          />
          <MetaCell
            icon={<CalendarCheck className="h-4 w-4" />}
            label={report.publishedAt ? "Published" : "Reported"}
            value={
              report.publishedAt
                ? formatStamp(report.publishedAt)
                : formatDateOnly(report.reportedAt)
            }
          />
          <MetaCell
            icon={<User className="h-4 w-4" />}
            label="Prescribing doctor"
            value={
              [report.requestingDoctor, report.referringHospital]
                .filter((s): s is string => Boolean(s))
                .join(" · ") || "—"
            }
          />
          <MetaCell
            icon={<Stethoscope className="h-4 w-4" />}
            label="Result rows"
            value={String(report.results.length)}
          />
        </div>

        {/* Sample tracking — only shown once a sample is on file. The
            tube label, condition, and any collection note live here so
            the technician downstream knows what physically arrived. */}
        {(report.sampleId || report.sampleCondition || report.sampleNote) && (
          <SampleSummary report={report} />
        )}

        {/* Check-in snapshot — what the receptionist captured when the
            patient walked in. Hidden when no check-in fields were
            recorded so the layout stays compact. */}
        {report.checkIn && hasAnyCheckInValue(report.checkIn) && (
          <CheckInSummary checkIn={report.checkIn} />
        )}

        {/* Results */}
        <div className="p-6">
          <h2 className="mb-3 text-sm font-semibold tracking-tight text-neutral-900">
            Results
          </h2>
          {report.status === "Waiting for Results" ? (
            <InlineResultsEditor
              report={report}
              onSave={(rows) => {
                safeRun("Could not save results", () =>
                  updateReport(report.id, { results: rows }),
                );
                toast.success("Results saved");
              }}
              onSaveAndReview={(rows) => {
                const updated = safeRun("Could not save results", () =>
                  updateReport(report.id, { results: rows }),
                );
                if (!updated) return;
                const reviewed = safeRun("Could not send for review", () =>
                  sendForReview(report.id),
                );
                if (reviewed) toast.success("Saved · sent for review");
              }}
            />
          ) : report.results.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50/60 px-4 py-10 text-center text-sm text-neutral-500">
              No result rows yet. Edit the report to add entries.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-neutral-200">
              <Table>
                <TableHeader className="bg-neutral-50/80">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                      Parameter
                    </TableHead>
                    <TableHead className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                      Value
                    </TableHead>
                    <TableHead className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                      Unit
                    </TableHead>
                    <TableHead className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                      Reference Range
                    </TableHead>
                    <TableHead className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                      Flag
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.results.map((row) => {
                    const flagTone = row.flag ? FLAG_TONE[row.flag] : null;
                    const isCritical = row.flag === "Critical";
                    return (
                      <TableRow
                        key={row.id}
                        className={cn(
                          "border-b border-neutral-100 last:border-0 hover:bg-transparent",
                          isCritical && "bg-red-50/40",
                        )}
                      >
                        <TableCell className="text-sm font-medium text-neutral-900">
                          {row.parameter}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-sm tabular-nums",
                            isCritical
                              ? "font-semibold text-red-700"
                              : "text-neutral-900",
                          )}
                        >
                          {row.value || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-neutral-600">
                          {row.unit ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-neutral-600">
                          {row.referenceRange ?? "—"}
                        </TableCell>
                        <TableCell>
                          {flagTone ? (
                            <span
                              className={cn(
                                "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium",
                                flagTone.bg,
                                flagTone.text,
                              )}
                            >
                              {row.flag}
                            </span>
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {report.notes && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                Notes
              </h3>
              <p className="mt-1 text-sm whitespace-pre-line text-neutral-700">
                {report.notes}
              </p>
            </div>
          )}
        </div>

        {/* Audit timeline */}
        <div className="border-t border-neutral-100 bg-neutral-50/60 px-6 py-5">
          <h2 className="mb-4 text-xs font-semibold tracking-wide text-neutral-600 uppercase">
            Audit timeline
          </h2>
          <Timeline report={report} />
        </div>
      </div>

      {/* Record-payment dialog */}
      <PaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        existing={report.payment}
        suggestedAmount={suggestedPaymentAmount}
        onSubmit={onRecordPayment}
      />

      {/* Refund dialog — only meaningful when there's an active payment */}
      {report.payment && !report.payment.refundedAt && (
        <RefundDialog
          open={refundDialogOpen}
          onOpenChange={setRefundDialogOpen}
          payment={report.payment}
          onSubmit={onRefundPayment}
        />
      )}

      {/* WhatsApp send preview — opens when the user picks WhatsApp
          from the Send to Patient menu. Confirm stamps the audit but
          no real message is dispatched until a provider lands. */}
      <WhatsAppPreviewDialog
        open={whatsappDialogOpen}
        onOpenChange={setWhatsappDialogOpen}
        report={report}
        patient={patient}
        labProfile={labProfile}
        onConfirm={onConfirmWhatsApp}
      />

      {/* Sample-collection dialog — fires when the technician clicks
          Collect Sample on an Ordered report. Captures the sample
          tube identifier + condition + optional collection note. */}
      <CollectSampleDialog
        open={collectDialogOpen}
        onOpenChange={setCollectDialogOpen}
        report={report}
        onSubmit={onCollectSample}
      />

      {/* Cancel confirmation dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel this report?</DialogTitle>
            <DialogDescription>
              Cancelled reports are kept for audit but cannot be reopened or
              edited. This action is final.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label
              htmlFor="cancel-reason"
              className="text-xs font-medium tracking-wide text-neutral-600 uppercase"
            >
              Reason (optional)
            </label>
            <Textarea
              id="cancel-reason"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Sample rejected — haemolysed"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setCancelDialogOpen(false)}
              className="inline-flex h-9 items-center rounded-lg border border-neutral-200 bg-white px-3.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Keep report
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3.5 text-sm font-medium text-white hover:bg-red-700"
            >
              <X className="h-4 w-4" />
              Cancel report
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  Sub-components
// ────────────────────────────────────────────────────────────────────────────

function CriticalAlert({
  acknowledged,
  report,
  onAcknowledge,
}: {
  acknowledged: boolean;
  report: Report;
  onAcknowledge: () => void;
}) {
  const count = report.results.filter((r) => r.flag === "Critical").length;
  if (acknowledged) {
    return (
      <div className="flex items-center gap-3 border-b border-amber-100 bg-amber-50/60 px-6 py-3 text-sm">
        <ShieldCheck className="h-4 w-4 shrink-0 text-amber-700" />
        <div className="flex-1 text-amber-900">
          <span className="font-medium">
            {count} critical result{count > 1 ? "s" : ""} acknowledged
          </span>
          {report.criticalsAcknowledgedBy && report.criticalsAcknowledgedAt && (
            <span className="text-amber-800/80">
              {" "}
              by {report.criticalsAcknowledgedBy.userName} on{" "}
              {formatStamp(report.criticalsAcknowledgedAt)}
            </span>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 border-b border-red-200 bg-red-50 px-6 py-4">
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
      <div className="flex-1 space-y-2">
        <div>
          <p className="text-sm font-semibold text-red-800">
            {count} critical result{count > 1 ? "s" : ""} require acknowledgement
          </p>
          <p className="mt-0.5 text-xs text-red-700/90">
            Indian lab regulations require the lab to immediately flag and
            communicate dangerously abnormal results to the referring doctor.
            This report cannot be published until the critical findings are
            acknowledged.
          </p>
        </div>
        <button
          type="button"
          onClick={onAcknowledge}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Acknowledge critical results
        </button>
      </div>
    </div>
  );
}

function ActionPanel({
  report,
  publishBlockedReason,
  onCollectSampleClick,
  onStartTesting,
  onSendForReview,
  onPublish,
  onCancelClick,
  onSendToPatient,
}: {
  report: Report;
  publishBlockedReason: string | null;
  onCollectSampleClick: () => void;
  onStartTesting: () => void;
  onSendForReview: () => void;
  onPublish: () => void;
  onCancelClick: () => void;
  onSendToPatient: (channel: "whatsapp" | "email" | "sms") => void;
}) {
  if (report.status === "Cancelled") {
    const cancelEntry = [...report.statusHistory]
      .reverse()
      .find((h) => h.status === "Cancelled");
    return (
      <div className="flex items-start gap-3 border-b border-neutral-200 bg-neutral-100 px-6 py-4">
        <X className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" />
        <div className="flex-1 text-sm text-neutral-700">
          <p className="font-medium">Report cancelled.</p>
          {cancelEntry?.note && (
            <p className="mt-0.5 text-neutral-600">
              Reason: {cancelEntry.note}
            </p>
          )}
        </div>
      </div>
    );
  }

  const needsResults =
    report.status === "Waiting for Results" && report.results.length === 0;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 bg-neutral-50/40 px-6 py-3">
      {report.status === "Ordered" && (
        <PrimaryAction onClick={onCollectSampleClick}>
          <TestTube2 className="mr-1 h-4 w-4" />
          Collect Sample
          <ArrowRight className="ml-1 h-4 w-4" />
        </PrimaryAction>
      )}

      {report.status === "Sample Collected" && (
        <PrimaryAction onClick={onStartTesting}>
          Start Testing
          <ArrowRight className="ml-1 h-4 w-4" />
        </PrimaryAction>
      )}

      {report.status === "Waiting for Results" && (
        <>
          <PrimaryAction onClick={onSendForReview} disabled={needsResults}>
            Mark Ready for Review
            <ArrowRight className="ml-1 h-4 w-4" />
          </PrimaryAction>
          {needsResults && (
            <Link
              href={`/reports/${report.id}/edit`}
              className="text-sm font-medium text-amber-700 hover:underline"
            >
              Add results first →
            </Link>
          )}
        </>
      )}

      {report.status === "Review" && (
        <>
          <PrimaryAction
            onClick={onPublish}
            disabled={Boolean(publishBlockedReason)}
            tone="success"
          >
            <Check className="mr-1 h-4 w-4" />
            Publish Report
          </PrimaryAction>
          {publishBlockedReason && (
            <span className="text-xs text-neutral-500">
              {publishBlockedReason}
            </span>
          )}
        </>
      )}

      {report.status === "Published" && (
        <SendToPatientControl
          report={report}
          onSendToPatient={onSendToPatient}
        />
      )}

      <div className="ml-auto">
        <button
          type="button"
          onClick={onCancelClick}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-transparent px-3 text-sm font-medium text-neutral-500 hover:bg-red-50 hover:text-red-700"
        >
          <X className="h-4 w-4" />
          Cancel report
        </button>
      </div>
    </div>
  );
}

function PrimaryAction({
  children,
  onClick,
  disabled,
  tone = "brand",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "brand" | "success";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        tone === "brand"
          ? "bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-500/40"
          : "bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500/40",
        "focus-visible:ring-2 focus-visible:outline-none",
      )}
    >
      {children}
    </button>
  );
}

function channelLabel(c: "whatsapp" | "email" | "sms"): string {
  return c === "whatsapp" ? "WhatsApp" : c === "email" ? "Email" : "SMS";
}

function channelIcon(c: "whatsapp" | "email" | "sms") {
  if (c === "whatsapp") return <MessageCircle className="mr-2 h-4 w-4" />;
  if (c === "email") return <Mail className="mr-2 h-4 w-4" />;
  return <MessageSquare className="mr-2 h-4 w-4" />;
}

function SendToPatientControl({
  report,
  onSendToPatient,
}: {
  report: Report;
  onSendToPatient: (channel: "whatsapp" | "email" | "sms") => void;
}) {
  const sent = Boolean(report.sentToPatientAt);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-500/40 inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium text-white shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <Send className="mr-2 h-4 w-4" />
              {sent ? "Resend to patient" : "Send to patient"}
              <ChevronDown className="ml-1.5 h-4 w-4 opacity-80" />
            </button>
          }
        />
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onClick={() => onSendToPatient("whatsapp")}>
            {channelIcon("whatsapp")}
            WhatsApp
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSendToPatient("email")}>
            {channelIcon("email")}
            Email
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSendToPatient("sms")}>
            {channelIcon("sms")}
            SMS
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {sent && report.sentToPatientChannel && report.sentToPatientAt && (
        <span className="text-xs text-neutral-500">
          Sent via {channelLabel(report.sentToPatientChannel)} on{" "}
          {formatStamp(report.sentToPatientAt)}
        </span>
      )}
    </>
  );
}

function Timeline({ report }: { report: Report }) {
  interface Event {
    kind: "status" | "criticals" | "sent";
    at: string;
    title: string;
    by?: string;
    note?: string;
    dotClass: string;
  }

  const events: Event[] = [];

  for (const h of report.statusHistory) {
    const tone = STATUS_TONE[h.status];
    events.push({
      kind: "status",
      at: h.at,
      title: `Moved to ${h.status}`,
      by: h.by.userName,
      note: h.note,
      dotClass: tone.dot,
    });
  }
  if (report.criticalsAcknowledged && report.criticalsAcknowledgedAt) {
    events.push({
      kind: "criticals",
      at: report.criticalsAcknowledgedAt,
      title: "Critical results acknowledged",
      by: report.criticalsAcknowledgedBy?.userName,
      dotClass: "bg-amber-500",
    });
  }
  if (report.sentToPatientAt) {
    events.push({
      kind: "sent",
      at: report.sentToPatientAt,
      title: `Sent to patient via ${channelLabel(
        report.sentToPatientChannel ?? "whatsapp",
      )}`,
      by: report.sentToPatientBy?.userName,
      dotClass: "bg-indigo-500",
    });
  }
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return (
    <ol className="relative space-y-3 border-l border-neutral-200 pl-5">
      {events.map((e, i) => (
        <li key={i} className="relative">
          <span
            className={cn(
              "absolute top-1.5 -left-[26px] h-2.5 w-2.5 rounded-full ring-2 ring-neutral-50",
              e.dotClass,
            )}
            aria-hidden
          />
          <div className="text-sm text-neutral-800">
            <span className="font-medium">{e.title}</span>
            {e.by && (
              <span className="text-neutral-500">
                {" "}
                by <span className="text-neutral-700">{e.by}</span>
              </span>
            )}
          </div>
          <div className="text-xs text-neutral-500">
            {formatStamp(e.at)}
            {e.note && (
              <span className="ml-2 text-neutral-600 italic">— {e.note}</span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function MetaCell({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <div>
        <div className="text-muted-foreground text-xs">{label}</div>
        <div className="text-sm text-neutral-900">{value}</div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  Payment
// ────────────────────────────────────────────────────────────────────────────

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function PaymentSection({
  payment,
  onRecordClick,
  onClear,
  onRefundClick,
}: {
  payment?: Payment;
  onRecordClick: () => void;
  onClear: () => void;
  onRefundClick: () => void;
}) {
  const isRefunded = Boolean(payment?.refundedAt);
  if (!payment) {
    return (
      <div className="flex items-center justify-between gap-3 border-t border-neutral-100 bg-amber-50/40 px-6 py-3">
        <div className="flex items-center gap-2.5">
          <Receipt className="h-4 w-4 text-amber-700" />
          <div className="text-sm">
            <span className="font-medium text-amber-900">Unpaid</span>
            <span className="text-amber-800/80">
              {" "}
              — no payment recorded for this report yet.
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onRecordClick}
          className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-500/40 inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-white shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <IndianRupee className="h-3.5 w-3.5" />
          Record payment
        </button>
      </div>
    );
  }

  // Refunded payments render in a refund-tone strip (red) so the
  // status is obvious at a glance; everything else (active payments)
  // stays in the green strip.
  const strip = isRefunded
    ? "border-t border-neutral-100 bg-red-50/50 px-6 py-3"
    : "border-t border-neutral-100 bg-emerald-50/40 px-6 py-3";
  const iconTone = isRefunded ? "text-red-700" : "text-emerald-700";
  const amountTone = isRefunded
    ? "text-red-900 line-through"
    : "text-emerald-900";
  const methodTone = isRefunded ? "text-red-800" : "text-emerald-800";
  const subTone = isRefunded ? "text-red-800/70" : "text-emerald-800/70";

  return (
    <div className={`flex items-start justify-between gap-3 ${strip}`}>
      <div className="flex items-start gap-2.5">
        <Wallet className={`mt-0.5 h-4 w-4 ${iconTone}`} />
        <div className="space-y-0.5 text-sm">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span
              className={`text-base font-semibold tabular-nums ${amountTone}`}
            >
              {formatINR(payment.amount)}
            </span>
            <span className={methodTone}>via {payment.method}</span>
            {payment.reference && (
              <span className="text-emerald-700/80 font-mono text-xs">
                · {payment.reference}
              </span>
            )}
            {isRefunded && (
              <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-red-800 uppercase">
                Refunded
              </span>
            )}
          </div>
          <div className={`text-xs ${subTone}`}>
            Paid on {formatDateOnly(payment.paidAt)} · Recorded by{" "}
            {payment.recordedBy.userName}
            {payment.discount != null && payment.discount > 0 && (
              <span>
                {" "}
                · Discount {formatINR(payment.discount)}
                {payment.discountReason
                  ? ` (${payment.discountReason})`
                  : ""}
              </span>
            )}
            {payment.note && (
              <span className="italic"> — {payment.note}</span>
            )}
          </div>
          {isRefunded && payment.refundedAmount != null && (
            <div className="mt-0.5 text-xs text-red-800">
              Refunded {formatINR(payment.refundedAmount)} on{" "}
              {formatDateOnly(payment.refundedAt)}
              {payment.refundReason && ` · ${payment.refundReason}`}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {!isRefunded && (
          <button
            type="button"
            onClick={onRefundClick}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-xs font-medium text-red-700 hover:bg-red-50"
            title="Refund this payment"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Refund
          </button>
        )}
        <button
          type="button"
          onClick={onRecordClick}
          disabled={isRefunded}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-2.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear payment"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function PaymentDialog({
  open,
  onOpenChange,
  existing,
  suggestedAmount,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: Payment;
  /** Quote → invoice: prefilled when there's no existing payment yet. */
  suggestedAmount?: number;
  onSubmit: (input: NewPaymentInput) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const initialAmount = existing
    ? String(existing.amount)
    : suggestedAmount != null
      ? String(suggestedAmount)
      : "";
  const [amount, setAmount] = useState<string>(initialAmount);
  const [method, setMethod] = useState<PaymentMethod>(
    existing?.method ?? "Cash",
  );
  const [reference, setReference] = useState<string>(existing?.reference ?? "");
  const [paidAt, setPaidAt] = useState<string>(existing?.paidAt ?? today);
  const [note, setNote] = useState<string>(existing?.note ?? "");
  const [discount, setDiscount] = useState<string>(
    existing?.discount != null ? String(existing.discount) : "",
  );
  const [discountReason, setDiscountReason] = useState<string>(
    existing?.discountReason ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  // Reset form state every time the dialog opens with a (possibly different)
  // existing payment or suggested amount.
  React.useEffect(() => {
    if (!open) return;
    setAmount(
      existing
        ? String(existing.amount)
        : suggestedAmount != null
          ? String(suggestedAmount)
          : "",
    );
    setMethod(existing?.method ?? "Cash");
    setReference(existing?.reference ?? "");
    setPaidAt(existing?.paidAt ?? today);
    setNote(existing?.note ?? "");
    setDiscount(existing?.discount != null ? String(existing.discount) : "");
    setDiscountReason(existing?.discountReason ?? "");
    setError(null);
  }, [open, existing, suggestedAmount, today]);

  const numericAmount = Number(amount);
  const numericDiscount = Number(discount);
  const discountValid =
    discount === "" ||
    (Number.isFinite(numericDiscount) && numericDiscount >= 0);
  const subtotal =
    Number.isFinite(numericAmount) && Number.isFinite(numericDiscount)
      ? numericAmount + (numericDiscount > 0 ? numericDiscount : 0)
      : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Enter a valid amount greater than zero.");
      return;
    }
    if (!discountValid) {
      setError("Discount must be a number ≥ 0.");
      return;
    }
    onSubmit({
      amount: numericAmount,
      method,
      reference: reference.trim() || undefined,
      paidAt: paidAt || undefined,
      note: note.trim() || undefined,
      discount: numericDiscount > 0 ? numericDiscount : undefined,
      discountReason:
        numericDiscount > 0 ? discountReason.trim() || undefined : undefined,
    });
  }

  const referenceHint =
    method === "UPI"
      ? "UPI transaction ID"
      : method === "Card"
        ? "Last 4 digits of card"
        : method === "Bank Transfer"
          ? "Bank reference / NEFT number"
          : method === "Insurance"
            ? "Claim or policy number"
            : "Optional reference";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edit payment" : "Record payment"}
          </DialogTitle>
          <DialogDescription>
            Manual entry — no payment gateway is wired up. Use this to log what
            the patient actually paid.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-neutral-700">
                Amount (₹) <span className="text-brand-500">*</span>
              </span>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-neutral-500">
                  ₹
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setError(null);
                  }}
                  className="focus:border-brand-500 focus:ring-brand-500/20 block h-9 w-full rounded-md border border-neutral-300 bg-white pr-3 pl-7 text-sm tabular-nums outline-none focus:ring-2"
                  required
                  autoFocus
                />
              </div>
              {!existing && suggestedAmount != null && (
                <span className="text-muted-foreground block text-[11px]">
                  Prefilled from catalog price (₹{suggestedAmount}). Overwrite
                  if a discount or surcharge applies.
                </span>
              )}
            </label>
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-neutral-700">
                Method <span className="text-brand-500">*</span>
              </span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className="focus:border-brand-500 focus:ring-brand-500/20 block h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:ring-2"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="block text-xs font-medium text-neutral-700">
              Reference
            </span>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={referenceHint}
              className="focus:border-brand-500 focus:ring-brand-500/20 block h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:ring-2"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="block text-xs font-medium text-neutral-700">
              Paid on
            </span>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              max={today}
              className="focus:border-brand-500 focus:ring-brand-500/20 block h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:ring-2"
            />
          </label>

          {/* Discount (optional) — corporate / senior / staff. Shown on
              the receipt as a separate line. */}
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-neutral-700">
                Discount (₹)
              </span>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-neutral-500">
                  ₹
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={discount}
                  onChange={(e) => {
                    setDiscount(e.target.value);
                    setError(null);
                  }}
                  className="focus:border-brand-500 focus:ring-brand-500/20 block h-9 w-full rounded-md border border-neutral-300 bg-white pr-3 pl-7 text-sm tabular-nums outline-none focus:ring-2"
                  placeholder="0"
                />
              </div>
            </label>
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-neutral-700">
                Discount reason
              </span>
              <input
                type="text"
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                placeholder="e.g. Senior citizen, Corporate, Staff"
                disabled={!numericDiscount || numericDiscount <= 0}
                className="focus:border-brand-500 focus:ring-brand-500/20 block h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400"
              />
            </label>
          </div>

          {subtotal !== null && numericDiscount > 0 && (
            <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
              Subtotal{" "}
              <strong className="tabular-nums">
                ₹{subtotal.toFixed(2)}
              </strong>{" "}
              − Discount{" "}
              <strong className="tabular-nums text-amber-700">
                ₹{numericDiscount.toFixed(2)}
              </strong>{" "}
              = Patient pays{" "}
              <strong className="tabular-nums text-emerald-700">
                ₹{numericAmount.toFixed(2)}
              </strong>
            </div>
          )}

          <label className="block space-y-1.5">
            <span className="block text-xs font-medium text-neutral-700">
              Note
            </span>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional — e.g. balance pending, partial payment, etc."
            />
          </label>

          {error && (
            <p className="text-destructive text-xs">{error}</p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-9 items-center rounded-lg border border-neutral-200 bg-white px-3.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-500/40 inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-white shadow-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              <Receipt className="h-4 w-4" />
              {existing ? "Update payment" : "Save payment"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  Check-in snapshot display
// ────────────────────────────────────────────────────────────────────────────

const FASTING_LABEL: Record<FastingStatus, string> = {
  none: "Not fasting",
  lt4h: "<4 h fasted",
  "4to8h": "4–8 h fasted",
  "8plus": "8+ h fasted",
};

const PREGNANCY_LABEL: Record<PregnancyStatus, string> = {
  yes: "Pregnant",
  no: "Not pregnant",
  unknown: "Unknown / possibly",
};

function hasAnyCheckInValue(c: CheckInVitals): boolean {
  return Object.values(c).some((v) => v !== undefined && v !== "");
}

// ────────────────────────────────────────────────────────────────────────────
//  Inline results editor (Waiting-for-Results status only)
// ────────────────────────────────────────────────────────────────────────────

interface EditableRow {
  id: string;
  parameter: string;
  value: string;
  unit: string;
  referenceRange: string;
  flag: "" | "Low" | "Normal" | "High" | "Critical";
  notes?: string;
  /** True if `flag` was set by auto-detection; a manual pick locks it. */
  autoFlagged?: boolean;
  /** True if `value` was filled in by an auto-formula. A manual edit
   *  clears this so the formula can't clobber the override later. */
  autoDerived?: boolean;
}

function RefundDialog({
  open,
  onOpenChange,
  payment,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: Payment;
  onSubmit: (input: {
    amount?: number;
    method?: PaymentMethod;
    reason?: string;
    refundedAt?: string;
  }) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState<string>(String(payment.amount));
  const [method, setMethod] = useState<PaymentMethod>(payment.method);
  const [reason, setReason] = useState<string>("");
  const [refundedAt, setRefundedAt] = useState<string>(today);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setAmount(String(payment.amount));
    setMethod(payment.method);
    setReason("");
    setRefundedAt(today);
    setError(null);
  }, [open, payment, today]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError("Refund amount must be greater than zero.");
      return;
    }
    if (numeric > payment.amount) {
      setError(
        `Refund cannot exceed paid amount (${formatINR(payment.amount)}).`,
      );
      return;
    }
    onSubmit({
      amount: numeric,
      method,
      reason: reason.trim() || undefined,
      refundedAt: refundedAt || undefined,
    });
  }

  const isPartial = Number(amount) > 0 && Number(amount) < payment.amount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Refund payment</DialogTitle>
          <DialogDescription>
            Reverse the {formatINR(payment.amount)} collected via{" "}
            {payment.method} on {formatDateOnly(payment.paidAt)}. Use this
            when the report was cancelled, a sample needs to be redrawn, or
            the patient disputes the charge.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-neutral-700">
                Refund amount (₹){" "}
                <span className="text-brand-500">*</span>
              </span>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-neutral-500">
                  ₹
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={payment.amount}
                  step="0.01"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setError(null);
                  }}
                  className="focus:border-brand-500 focus:ring-brand-500/20 block h-9 w-full rounded-md border border-neutral-300 bg-white pr-3 pl-7 text-sm tabular-nums outline-none focus:ring-2"
                  required
                  autoFocus
                />
              </div>
              <span className="text-muted-foreground block text-[11px]">
                {isPartial ? "Partial refund" : "Full refund"} · paid amount{" "}
                {formatINR(payment.amount)}
              </span>
            </label>
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-neutral-700">
                Refund method
              </span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className="focus:border-brand-500 focus:ring-brand-500/20 block h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:ring-2"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="block text-xs font-medium text-neutral-700">
              Refunded on
            </span>
            <input
              type="date"
              value={refundedAt}
              onChange={(e) => setRefundedAt(e.target.value)}
              max={today}
              className="focus:border-brand-500 focus:ring-brand-500/20 block h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:ring-2"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="block text-xs font-medium text-neutral-700">
              Reason
            </span>
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Sample rejected — redraw declined; wrong test ordered"
            />
          </label>

          {error && <p className="text-destructive text-xs">{error}</p>}

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-9 items-center rounded-lg border border-neutral-200 bg-white px-3.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-300 bg-red-600 px-3.5 text-sm font-medium text-white shadow-sm hover:bg-red-700"
            >
              <RotateCcw className="h-4 w-4" />
              Confirm refund
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InlineResultsEditor({
  report,
  onSave,
  onSaveAndReview,
}: {
  report: Report;
  onSave: (rows: ResultRow[]) => void;
  onSaveAndReview: (rows: ResultRow[]) => void;
}) {
  const [rows, setRows] = useState<EditableRow[]>(() =>
    report.results.map((r) => ({
      id: r.id,
      parameter: r.parameter,
      value: r.value ?? "",
      unit: r.unit ?? "",
      referenceRange: r.referenceRange ?? "",
      flag: r.flag ?? "",
      notes: r.notes,
      autoFlagged: false,
      autoDerived: false,
    })),
  );

  function updateRow(idx: number, patch: Partial<EditableRow>) {
    setRows((prev) => {
      // Apply the patch + re-flag the directly-edited row. A direct
      // value edit clears autoDerived so a later formula run won't
      // overwrite what the tech just typed.
      const stepOne = prev.map((r, i) => {
        if (i !== idx) return r;
        const next: EditableRow = { ...r, ...patch };
        if ("flag" in patch) next.autoFlagged = false;
        if ("value" in patch) next.autoDerived = false;
        if ("value" in patch || "referenceRange" in patch) {
          if (!next.flag || next.autoFlagged) {
            const auto = flagForValue(next.value, next.referenceRange);
            next.flag = auto ?? "";
            next.autoFlagged = Boolean(auto);
          }
        }
        return next;
      });

      // After a value change, run derived-field formulas (Friedewald LDL,
      // VLDL, eAG, Indirect Bilirubin, etc.) and update any output row
      // that's either empty or was previously auto-derived.
      if (!("value" in patch)) return stepOne;
      const derived = deriveAutoValues(report.testCode, stepOne);
      if (derived.size === 0) return stepOne;

      return stepOne.map((r) => {
        const newValue = derived.get(r.parameter);
        if (newValue === undefined) return r;
        const canOverwrite = r.value === "" || Boolean(r.autoDerived);
        if (!canOverwrite || newValue === r.value) return r;
        const next: EditableRow = {
          ...r,
          value: newValue,
          autoDerived: true,
        };
        if (!next.flag || next.autoFlagged) {
          const auto = flagForValue(next.value, next.referenceRange);
          next.flag = auto ?? "";
          next.autoFlagged = Boolean(auto);
        }
        return next;
      });
    });
  }

  function toResultRows(): ResultRow[] {
    return rows.map((r) => ({
      id: r.id,
      parameter: r.parameter.trim(),
      value: r.value.trim(),
      unit: r.unit.trim() || undefined,
      referenceRange: r.referenceRange.trim() || undefined,
      flag: r.flag || undefined,
      notes: r.notes,
    }));
  }

  const hasAnyValue = rows.some((r) => r.value.trim() !== "");

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50/80">
            <tr className="border-b border-neutral-200 text-xs font-semibold tracking-wide text-neutral-600 uppercase">
              <th className="px-3 py-2 text-left">Parameter</th>
              <th className="px-3 py-2 text-left">Value</th>
              <th className="w-28 px-3 py-2 text-left">Unit</th>
              <th className="w-40 px-3 py-2 text-left">Range</th>
              <th className="w-28 px-3 py-2 text-left">Flag</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const flagTone = row.flag ? FLAG_TONE[row.flag] : null;
              const isCritical = row.flag === "Critical";
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-neutral-100 last:border-0",
                    isCritical && "bg-red-50/40",
                    row.flag === "High" && "bg-amber-50/30",
                    row.flag === "Low" && "bg-sky-50/30",
                  )}
                >
                  <td className="px-3 py-2 text-sm font-medium text-neutral-900">
                    {row.parameter}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={row.value}
                      onChange={(e) =>
                        updateRow(idx, { value: e.target.value })
                      }
                      placeholder="—"
                      className={cn(
                        "focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm tabular-nums outline-none focus:ring-2",
                        isCritical && "font-semibold text-red-700",
                      )}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={row.unit}
                      onChange={(e) =>
                        updateRow(idx, { unit: e.target.value })
                      }
                      placeholder="—"
                      className="focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-neutral-600 outline-none focus:ring-2"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={row.referenceRange}
                      onChange={(e) =>
                        updateRow(idx, { referenceRange: e.target.value })
                      }
                      placeholder="—"
                      className="focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-neutral-600 outline-none focus:ring-2"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    {row.flag ? (
                      <select
                        value={row.flag}
                        onChange={(e) =>
                          updateRow(idx, {
                            flag: e.target.value as EditableRow["flag"],
                          })
                        }
                        className={cn(
                          "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium outline-none",
                          flagTone?.bg,
                          flagTone?.text,
                        )}
                      >
                        <option value="">—</option>
                        <option value="Low">Low</option>
                        <option value="Normal">Normal</option>
                        <option value="High">High</option>
                        <option value="Critical">Critical</option>
                      </select>
                    ) : (
                      <select
                        value={row.flag}
                        onChange={(e) =>
                          updateRow(idx, {
                            flag: e.target.value as EditableRow["flag"],
                          })
                        }
                        className="rounded-md bg-transparent px-1.5 py-0.5 text-xs text-neutral-400 outline-none"
                      >
                        <option value="">—</option>
                        <option value="Low">Low</option>
                        <option value="Normal">Normal</option>
                        <option value="High">High</option>
                        <option value="Critical">Critical</option>
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          Flags auto-set as you type. Pick a flag manually to override.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSave(toResultRows())}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3.5 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => onSaveAndReview(toResultRows())}
            disabled={!hasAnyValue}
            className="bg-brand-600 hover:bg-brand-700 inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-medium text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            Save &amp; send for review
          </button>
        </div>
      </div>
    </div>
  );
}

function SampleSummary({ report }: { report: Report }) {
  // The condition pill picks up the right tone: green for good,
  // amber for marginal (lipemic), red for hard problems (hemolyzed,
  // insufficient, clotted, contaminated).
  const condition = report.sampleCondition;
  const conditionTone =
    condition === "good"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : condition === "lipemic"
        ? "bg-amber-50 text-amber-800 ring-amber-200"
        : condition
          ? "bg-red-50 text-red-700 ring-red-200"
          : null;

  return (
    <div className="border-t border-neutral-100 bg-neutral-50/40 px-6 py-4">
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
        Sample
      </h2>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {report.sampleId && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-muted-foreground text-xs">ID</span>
            <span className="font-mono font-medium text-neutral-900">
              {report.sampleId}
            </span>
          </div>
        )}
        {condition && conditionTone && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-muted-foreground text-xs">Condition</span>
            <span
              className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${conditionTone}`}
            >
              {SAMPLE_CONDITION_LABEL[condition]}
            </span>
          </div>
        )}
      </div>
      {report.sampleNote && (
        <p className="mt-2 text-sm text-neutral-800">
          <span className="text-muted-foreground text-xs">Note · </span>
          {report.sampleNote}
        </p>
      )}
    </div>
  );
}

function CheckInSummary({ checkIn }: { checkIn: CheckInVitals }) {
  const bpText =
    checkIn.bpSystolic && checkIn.bpDiastolic
      ? `${checkIn.bpSystolic}/${checkIn.bpDiastolic} mmHg`
      : checkIn.bpSystolic
        ? `${checkIn.bpSystolic} sys`
        : checkIn.bpDiastolic
          ? `${checkIn.bpDiastolic} dia`
          : null;

  const items: { label: string; value: string }[] = [];
  if (bpText) items.push({ label: "BP", value: bpText });
  if (typeof checkIn.pulseBpm === "number")
    items.push({ label: "Pulse", value: `${checkIn.pulseBpm} bpm` });
  if (typeof checkIn.temperatureF === "number")
    items.push({ label: "Temp", value: `${checkIn.temperatureF} °F` });
  if (checkIn.fastingStatus)
    items.push({ label: "Fasting", value: FASTING_LABEL[checkIn.fastingStatus] });
  if (checkIn.isPregnant)
    items.push({ label: "Pregnancy", value: PREGNANCY_LABEL[checkIn.isPregnant] });
  if (checkIn.lmpDate)
    items.push({ label: "LMP", value: formatDateOnly(checkIn.lmpDate) ?? "" });

  return (
    <div className="border-t border-neutral-100 bg-neutral-50/40 px-6 py-4">
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
        Check-in
      </h2>
      {items.length > 0 && (
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {items.map((it) => (
            <div key={it.label} className="flex items-baseline gap-1.5">
              <dt className="text-muted-foreground text-xs">{it.label}</dt>
              <dd className="font-medium text-neutral-900 tabular-nums">
                {it.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {checkIn.symptoms && (
        <p className="mt-3 text-sm text-neutral-800">
          <span className="text-muted-foreground text-xs">Symptoms · </span>
          {checkIn.symptoms}
        </p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  Collect-sample dialog
// ────────────────────────────────────────────────────────────────────────────

function CollectSampleDialog({
  open,
  onOpenChange,
  report,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  report: Report;
  onSubmit: (opts: {
    sampleId: string;
    sampleCondition: SampleCondition;
    sampleNote?: string;
  }) => void;
}) {
  // Sample ID auto-derives from the report code (R20260028 →
  // S20260028) so the tube label visibly mirrors the report it
  // belongs to. Read-only — the technician copies this onto the tube
  // exactly as shown; allowing edits here was a source of typos and
  // mismatches with the report code, so the input is locked.
  const sampleId = report.reportCode.replace(/^R/, "S");
  const [condition, setCondition] = useState<SampleCondition>("good");
  const [note, setNote] = useState("");

  // Reset when the dialog reopens (e.g. user cancelled and reopened).
  useEffect(() => {
    if (open) {
      setCondition("good");
      setNote("");
    }
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      sampleId,
      sampleCondition: condition,
      sampleNote: note.trim() || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Collect sample</DialogTitle>
          <DialogDescription>
            Write the sample ID on the tube before you draw. Flag any issue
            with the sample so the technician downstream knows.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="sample-id"
              className="text-xs font-medium tracking-wide text-neutral-600 uppercase"
            >
              Sample ID
            </label>
            <input
              id="sample-id"
              value={sampleId}
              readOnly
              aria-readonly
              className="w-full cursor-not-allowed rounded-md border border-neutral-200 bg-neutral-100 px-3 py-2 font-mono text-sm text-neutral-700 shadow-sm select-all focus:outline-none"
            />
            <p className="text-muted-foreground text-xs">
              Auto-generated from the report code. Write{" "}
              <span className="font-mono font-semibold">{sampleId}</span>{" "}
              on the tube so it matches the report.
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="sample-condition"
              className="text-xs font-medium tracking-wide text-neutral-600 uppercase"
            >
              Sample condition
            </label>
            <select
              id="sample-condition"
              value={condition}
              onChange={(e) => setCondition(e.target.value as SampleCondition)}
              className="focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:ring-2"
            >
              {SAMPLE_CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {SAMPLE_CONDITION_LABEL[c]}
                </option>
              ))}
            </select>
            {condition !== "good" && (
              <p className="text-xs text-amber-700">
                Non-ideal sample — results may be affected. Consider a
                redraw if possible.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="sample-note"
              className="text-xs font-medium tracking-wide text-neutral-600 uppercase"
            >
              Note (optional)
            </label>
            <Textarea
              id="sample-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder='e.g. "Difficult draw, butterfly needle"'
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-brand-600 hover:bg-brand-700 inline-flex h-10 items-center justify-center gap-1.5 rounded-md px-5 text-sm font-medium text-white shadow-sm transition-colors"
            >
              <TestTube2 className="h-4 w-4" />
              Mark Collected
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
