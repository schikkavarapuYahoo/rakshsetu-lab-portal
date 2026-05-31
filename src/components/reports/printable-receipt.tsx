"use client";

import type { LabProfile } from "@/lib/stores/lab-profile";
import {
  getPatientFullName,
  type Patient,
} from "@/lib/stores/patients";
import type { Report } from "@/lib/stores/reports";
import { formatPhone } from "@/lib/utils";

/**
 * Printable patient receipt. Distinct from the lab report PDF — this
 * is the "money handed over" acknowledgement the lab gives the patient.
 *
 * GST handling: the entered payment amount is treated as the GROSS
 * invoice total (what the patient actually paid). The breakdown is
 * computed backwards from there:
 *
 *   net   = gross / (1 + GST/100)
 *   tax   = gross - net
 *   CGST  = tax / 2   (intra-state — same state as the lab)
 *   SGST  = tax / 2
 *
 * Diagnostic lab services in India fall under HSN 9993 and are
 * exempt from GST in most setups, so the default rate here is 0%.
 * Render only shows the breakdown when GST > 0 — otherwise it's a
 * simple receipt with subtotal == gross.
 */

export interface PrintableReceiptProps {
  report: Report;
  patient: Patient | undefined;
  labProfile: LabProfile;
  /** GST percentage applied to lab service. 0 = exempt (default). */
  gstPercent?: number;
}

interface AmountBreakdown {
  /** Pre-tax line-item amount. */
  net: number;
  cgst: number;
  sgst: number;
  /** Discount amount in rupees (display-only). */
  discount: number;
  /** Final amount the patient paid (after discount + tax). */
  gross: number;
  rateApplied: number;
}

function breakdown(
  paidRupees: number,
  discountRupees: number,
  gstPercent: number,
): AmountBreakdown {
  const taxableGross = paidRupees;
  if (gstPercent <= 0) {
    return {
      net: paidRupees,
      cgst: 0,
      sgst: 0,
      discount: discountRupees,
      gross: paidRupees,
      rateApplied: 0,
    };
  }
  const net = taxableGross / (1 + gstPercent / 100);
  const tax = taxableGross - net;
  return {
    net: Number(net.toFixed(2)),
    cgst: Number((tax / 2).toFixed(2)),
    sgst: Number((tax / 2).toFixed(2)),
    discount: discountRupees,
    gross: paidRupees,
    rateApplied: gstPercent,
  };
}

function formatRupees(rupees: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Convert a non-negative integer rupee amount into Indian-English words
 * ("Five Hundred Forty Two Rupees Only"). Required on Indian receipts /
 * invoices. Caps at 999,99,99,999 — anyone past that has a different
 * problem.
 */
function rupeesInWords(amount: number): string {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);

  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  function below100(n: number): string {
    if (n < 20) return ones[n];
    return (
      tens[Math.floor(n / 10)] + (n % 10 > 0 ? ` ${ones[n % 10]}` : "")
    );
  }

  function below1000(n: number): string {
    if (n < 100) return below100(n);
    return `${ones[Math.floor(n / 100)]} Hundred${
      n % 100 > 0 ? ` ${below100(n % 100)}` : ""
    }`;
  }

  function indianWords(n: number): string {
    if (n === 0) return "Zero";
    const crore = Math.floor(n / 10_000_000);
    n = n % 10_000_000;
    const lakh = Math.floor(n / 100_000);
    n = n % 100_000;
    const thousand = Math.floor(n / 1000);
    n = n % 1000;
    const parts: string[] = [];
    if (crore) parts.push(`${below1000(crore)} Crore`);
    if (lakh) parts.push(`${below1000(lakh)} Lakh`);
    if (thousand) parts.push(`${below1000(thousand)} Thousand`);
    if (n) parts.push(below1000(n));
    return parts.join(" ");
  }

  const rupeesText = `${indianWords(rupees)} Rupees`;
  const paiseText = paise > 0 ? ` and ${indianWords(paise)} Paise` : "";
  return `${rupeesText}${paiseText} Only`;
}

export function PrintableReceipt({
  report,
  patient,
  labProfile,
  gstPercent = 0,
}: PrintableReceiptProps) {
  const payment = report.payment;
  const labName = labProfile.labName.trim() || "Your Lab Name";
  const labInitial = labName.charAt(0).toUpperCase();

  if (!payment) {
    return (
      <div className="print-page">
        <div
          style={{
            padding: 40,
            textAlign: "center",
            color: "var(--report-ink-muted)",
            fontSize: "11pt",
          }}
        >
          No payment has been recorded for this report yet. Record a payment
          first, then return here to print the receipt.
        </div>
      </div>
    );
  }

  const totals = breakdown(payment.amount, payment.discount ?? 0, gstPercent);
  const isRefunded = Boolean(payment.refundedAt);
  const receiptNo = `RCP-${report.reportCode.replace(/^R-/, "")}`;
  const patientName = patient ? getPatientFullName(patient) : "Unknown patient";
  const patientPhone = patient ? formatPhone(patient.phone) : null;

  return (
    <div
      className="print-page"
      data-watermark={isRefunded ? "Refunded" : ""}
    >
      {/* HEADER */}
      <header className="report-header">
        <div className="header-left">
          {labProfile.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={labProfile.logoUrl}
              alt={`${labName} logo`}
              className="lab-logo"
              crossOrigin="anonymous"
            />
          ) : (
            <div className="lab-logo-placeholder">{labInitial}</div>
          )}
        </div>
        <div className="header-right">
          <h1 className="lab-name">{labName}</h1>
          {labProfile.address && (
            <div className="lab-address">{labProfile.address}</div>
          )}
          {(labProfile.phone || labProfile.email) && (
            <div className="lab-contact">
              {labProfile.phone && <span>{labProfile.phone}</span>}
              {labProfile.phone && labProfile.email && (
                <span className="sep">·</span>
              )}
              {labProfile.email && <span>{labProfile.email}</span>}
            </div>
          )}
          {(labProfile.gstin || labProfile.licenseNumber) && (
            <div className="lab-accreditation">
              {labProfile.gstin && (
                <span className="item">
                  <span className="item-label">GSTIN</span>
                  <span className="item-value">{labProfile.gstin}</span>
                </span>
              )}
              {labProfile.licenseNumber && (
                <span className="item">
                  <span className="item-label">License</span>
                  <span className="item-value">
                    {labProfile.licenseNumber}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="header-divider" />

      {/* RECEIPT TITLE */}
      <div
        className="test-title-bar"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2 className="test-title">PAYMENT RECEIPT</h2>
        <span style={{ fontSize: "10pt", fontWeight: 600 }}>
          {receiptNo}
        </span>
      </div>

      {/* META */}
      <section className="patient-block" style={{ marginTop: 0 }}>
        <div className="patient-grid">
          <div className="field half-row">
            <span className="label">Patient Name</span>
            <span className="value">{patientName}</span>
          </div>
          {patient?.patientCode && (
            <div className="field">
              <span className="label">Patient ID</span>
              <span className="value report-id">{patient.patientCode}</span>
            </div>
          )}
          <div className="field">
            <span className="label">Report No.</span>
            <span className="value report-id">{report.reportCode}</span>
          </div>
          {patientPhone && (
            <div className="field">
              <span className="label">Phone</span>
              <span className="value">{patientPhone}</span>
            </div>
          )}
          <div className="field">
            <span className="label">Paid On</span>
            <span className="value">
              {new Date(payment.paidAt).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
          <div className="field">
            <span className="label">Method</span>
            <span className="value">
              {payment.method}
              {payment.reference && (
                <span className="value-hint">Ref {payment.reference}</span>
              )}
            </span>
          </div>
          <div className="field">
            <span className="label">Recorded</span>
            <span className="value">{formatStamp(payment.recordedAt)}</span>
          </div>
        </div>
      </section>

      {/* LINE ITEMS */}
      <section className="results-section" style={{ marginTop: 14 }}>
        <table className="results-table">
          <thead>
            <tr>
              <th className="col-test">Description</th>
              <th className="col-units">HSN</th>
              <th className="col-result" style={{ textAlign: "right" }}>
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="col-test">
                {report.testName}
                {report.testCode && (
                  <span
                    style={{
                      color: "var(--report-ink-muted)",
                      fontWeight: 500,
                      marginLeft: 6,
                      fontSize: "8.5pt",
                    }}
                  >
                    {report.testCode}
                  </span>
                )}
              </td>
              <td className="col-units">9993</td>
              <td
                className="col-result result-value"
                style={{ textAlign: "right" }}
              >
                {formatRupees(totals.net)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* TOTALS */}
      <section
        style={{
          marginTop: 12,
          marginLeft: "auto",
          width: "60%",
          fontSize: "10pt",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {totals.discount > 0 && (
          <>
            <TotalsRow
              label="Catalog price"
              value={formatRupees(totals.net + totals.discount)}
            />
            <TotalsRow
              label={
                payment.discountReason
                  ? `Discount (${payment.discountReason})`
                  : "Discount"
              }
              value={`− ${formatRupees(totals.discount)}`}
            />
          </>
        )}
        <TotalsRow label="Subtotal" value={formatRupees(totals.net)} />
        {totals.rateApplied > 0 && (
          <>
            <TotalsRow
              label={`CGST (${totals.rateApplied / 2}%)`}
              value={formatRupees(totals.cgst)}
            />
            <TotalsRow
              label={`SGST (${totals.rateApplied / 2}%)`}
              value={formatRupees(totals.sgst)}
            />
          </>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "8px 0 4px",
            borderTop: "2px solid var(--report-ink)",
            marginTop: 6,
            fontSize: "11pt",
            fontWeight: 700,
          }}
        >
          <span>Total Paid</span>
          <span>{formatRupees(totals.gross)}</span>
        </div>
        {isRefunded && payment.refundedAmount != null && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "6px 10px",
              marginTop: 8,
              borderRadius: 4,
              background: "#fef2f2",
              border: "1px solid #fca5a5",
              color: "#7f1d1d",
              fontSize: "9.5pt",
              fontWeight: 600,
            }}
          >
            <span>
              Refunded
              {payment.refundedAt
                ? ` · ${new Date(payment.refundedAt).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}`
                : ""}
              {payment.refundReason ? ` · ${payment.refundReason}` : ""}
            </span>
            <span>− {formatRupees(payment.refundedAmount)}</span>
          </div>
        )}
      </section>

      {/* AMOUNT IN WORDS */}
      <section
        style={{
          marginTop: 16,
          padding: "10px 12px",
          background: "var(--report-bg-soft)",
          borderRadius: 4,
          fontSize: "10pt",
        }}
      >
        <span
          style={{
            fontSize: "8pt",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            color: "var(--report-ink-muted)",
            marginRight: 6,
          }}
        >
          Amount in words
        </span>
        <strong style={{ color: "var(--report-ink)" }}>
          {rupeesInWords(totals.gross)}
        </strong>
      </section>

      {/* NOTE */}
      {payment.note && (
        <section className="notes-section">
          <strong>Note:</strong>
          <p>{payment.note}</p>
        </section>
      )}

      {/* SIGNATURE */}
      <footer
        className="report-footer"
        style={{ marginTop: 28 }}
      >
        <div className="footer-meta">
          <div>Receipt generated {formatStamp(new Date().toISOString())}</div>
          <div style={{ marginTop: 4 }}>
            This is a computer-generated receipt and does not require a
            physical signature.
          </div>
        </div>
        <div className="signature-block">
          <div className="signature-line" />
          <div className="signature-name">For {labName}</div>
          {labProfile.signatoryRole && (
            <div className="signature-role">Authorised Signatory</div>
          )}
        </div>
      </footer>

      <div className="disclaimer">
        <span className="page-number">Page 1 of 1</span>
        Please retain this receipt for your records. For any billing query
        contact the issuing lab quoting receipt number{" "}
        <strong>{receiptNo}</strong>.
      </div>
    </div>
  );
}

function TotalsRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "3px 0",
        color: "var(--report-ink-soft)",
      }}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
