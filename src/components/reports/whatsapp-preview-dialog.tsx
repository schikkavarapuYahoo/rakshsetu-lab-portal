"use client";

import { Info, MessageCircle, Send } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DEFAULT_WHATSAPP_TEMPLATE,
  type LabProfile,
} from "@/lib/stores/lab-profile";
import type { Patient } from "@/lib/stores/patients";
import type { Report } from "@/lib/stores/reports";
import { formatPhone } from "@/lib/utils";

/**
 * Preview the WhatsApp message before stamping the report as sent.
 * Until a real provider (Twilio / Gupshup / WhatsApp Cloud API) is
 * wired, the "Send" action just records `sentToPatientAt` on the
 * report and shows the rendered message — handy for audit + manual
 * copy-paste into a phone if needed.
 */

export interface WhatsAppPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: Report;
  patient: Patient | undefined;
  labProfile: LabProfile;
  /** Called when the lab user confirms. Implementation just stamps audit. */
  onConfirm: () => void;
}

/** Replace mustache-style tokens in the WhatsApp template body. */
function renderTemplate(
  template: string,
  ctx: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => ctx[key] ?? "");
}

export function WhatsAppPreviewDialog({
  open,
  onOpenChange,
  report,
  patient,
  labProfile,
  onConfirm,
}: WhatsAppPreviewDialogProps) {
  const template =
    labProfile.whatsappTemplate.trim() || DEFAULT_WHATSAPP_TEMPLATE;
  const patientName = patient
    ? `${patient.firstName} ${patient.lastName}`.trim()
    : "Patient";
  // Where the patient would open the report — pointing at our own
  // print page works as a "branded landing" until the public report
  // share route ships.
  const reportLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/reports/${report.id}/print`
      : `/reports/${report.id}/print`;

  const message = renderTemplate(template, {
    patientName,
    labName: labProfile.labName || "Your Lab",
    reportCode: report.reportCode,
    testName: report.testName,
    reportLink,
    signatoryName: labProfile.signatoryName || "Authorised Signatory",
  });

  const fromNumber = labProfile.whatsappBusinessNumber.trim() || "Not configured";
  const toNumber = patient ? formatPhone(patient.phone) : "—";
  const providerReady = Boolean(labProfile.whatsappBusinessNumber.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-emerald-600" />
            Send via WhatsApp
          </DialogTitle>
          <DialogDescription>
            Preview the message before sending. Demo mode is active —
            the report will be stamped as sent for audit, but no
            WhatsApp message is dispatched until a provider is wired.
          </DialogDescription>
        </DialogHeader>

        {/* Routing metadata */}
        <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50/60 p-3 text-xs">
          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground w-12 shrink-0">From</span>
            <span
              className={
                providerReady
                  ? "font-mono text-neutral-900"
                  : "italic text-amber-700"
              }
            >
              {fromNumber}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground w-12 shrink-0">To</span>
            <span className="font-mono text-neutral-900">{toNumber}</span>
          </div>
        </div>

        {/* Message bubble */}
        <div className="space-y-1">
          <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
            Message
          </span>
          <div className="max-w-[88%] rounded-2xl rounded-br-md bg-emerald-50 px-3.5 py-2.5 text-sm whitespace-pre-wrap text-neutral-900 ring-1 ring-emerald-100">
            {message}
          </div>
        </div>

        {!providerReady && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-700" />
            <span>
              Set your WhatsApp Business number under{" "}
              <strong>Settings → Lab profile</strong> to populate the
              &ldquo;From&rdquo; line. Sending still records the audit stamp either way.
            </span>
          </div>
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
            type="button"
            onClick={() => navigator.clipboard?.writeText(message)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            title="Copy the rendered message to clipboard so you can paste it into WhatsApp manually."
          >
            Copy text
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
          >
            <Send className="h-4 w-4" />
            Mark as sent (demo)
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
