"use client";

import { useLabCatalogStore } from "@/lib/stores/lab-catalog";
import type { LabProfile } from "@/lib/stores/lab-profile";
import {
  getPatientFullName,
  type Patient,
} from "@/lib/stores/patients";
import {
  SAMPLE_CONDITION_LABEL,
  useReportsStore,
  type FastingStatus,
  type Report,
  type ResultRow,
} from "@/lib/stores/reports";
import { deriveBloodGroup } from "@/lib/utils/blood-group";
import { formatPhone } from "@/lib/utils";

/**
 * Print-quality lab report. Designed against NABL-style Indian lab report
 * conventions: clean letterhead, patient-first identity block with vitals
 * subsection, dedicated collection band (sample + timestamps), results
 * table with H / L / N notation, end-of-report marker, signatory block
 * and page number.
 *
 * Wrap in `.print-page-frame` for the on-screen preview and call
 * `window.print()` to send to printer / save as PDF.
 */

export interface PrintableReportProps {
  report: Report;
  patient: Patient | undefined;
  labProfile: LabProfile;
  /**
   * Extra reports from the same visit, rendered as additional test
   * sections under the shared header + patient + sample blocks. When
   * present, the critical banner aggregates flags across all reports,
   * the sample block lists every sample ID, and the footer references
   * all report codes. Order matters — the cover sections are derived
   * from the primary `report`, so put the most representative test
   * first (typically the receptionist's main complaint).
   */
  additionalReports?: Report[];
}

const FASTING_PRINT_LABEL: Record<FastingStatus, string> = {
  none: "Not fasting",
  lt4h: "< 4 hours",
  "4to8h": "4–8 hours",
  "8plus": "8+ hours",
};

function formatStamp(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obese";
}

export function PrintableReport({
  report,
  patient,
  labProfile,
  additionalReports = [],
}: PrintableReportProps) {
  // Every report rendered on this page — primary first, then the
  // additional ones from the same visit. Banners and the sample block
  // aggregate across all of them so the doctor sees one consolidated
  // safety call-out, not N separate red boxes.
  const allRenderedReports = [report, ...additionalReports];
  // The lab catalog is the source of truth for sample type + tube colour;
  // we look it up by the test's code so the print stays in sync with
  // whatever the catalog currently says.
  const labTest = useLabCatalogStore((s) =>
    report.testCode
      ? s.tests.find(
          (t) => t.code.toUpperCase() === report.testCode!.toUpperCase(),
        )
      : undefined,
  );

  // Verified blood group from the patient's most recent BG-RH test at
  // this lab. Returns null when no usable result exists yet — we never
  // print a self-reported / guessed group on a signed report.
  const allReports = useReportsStore((s) => s.reports);
  const bloodGroup = patient
    ? deriveBloodGroup(allReports, patient.id, report.id)
    : null;

  const generatedAt = formatStamp(new Date().toISOString());
  const labName = labProfile.labName.trim() || "Your Lab Name";
  const labInitial = labName.charAt(0).toUpperCase();

  const patientName = patient ? getPatientFullName(patient) : "Unknown patient";
  const patientPhone = patient ? formatPhone(patient.phone) : null;
  const patientDob = formatDate(patient?.dateOfBirth);

  const collectedAt =
    formatStamp(report.collectedAt) ??
    formatStamp(
      report.statusHistory.find((h) => h.status === "Sample Collected")?.at,
    );
  const reportedAt =
    formatStamp(report.publishedAt) ??
    formatStamp(report.reportedAt) ??
    formatStamp(
      report.statusHistory.find((h) => h.status === "Review")?.at,
    );
  const receivedAt = collectedAt; // Small lab — sample drawn on-site.

  const sampleConditionLabel = report.sampleCondition
    ? SAMPLE_CONDITION_LABEL[report.sampleCondition]
    : null;

  // Vitals: prefer the per-visit snapshot on the report; fall back to the
  // patient's last-known anthropometric values for height/weight since
  // those rarely change between visits.
  const checkIn = report.checkIn ?? {};
  const heightCm = patient?.heightCm;
  const weightKg = patient?.weightKg;
  const bmi =
    typeof heightCm === "number" && typeof weightKg === "number" && heightCm > 0
      ? weightKg / (heightCm / 100) ** 2
      : null;
  const bp =
    typeof checkIn.bpSystolic === "number" &&
    typeof checkIn.bpDiastolic === "number"
      ? `${checkIn.bpSystolic} / ${checkIn.bpDiastolic} mmHg`
      : typeof checkIn.bpSystolic === "number"
        ? `${checkIn.bpSystolic} mmHg (sys)`
        : null;
  const hasAnyVital =
    typeof heightCm === "number" ||
    typeof weightKg === "number" ||
    bp !== null ||
    typeof checkIn.pulseBpm === "number" ||
    typeof checkIn.temperatureF === "number" ||
    Boolean(checkIn.fastingStatus) ||
    Boolean(checkIn.isPregnant) ||
    Boolean(checkIn.lmpDate);

  // Aggregate criticals across every report on this page so the safety
  // banner stays a single doctor-facing alert (not N stacked boxes).
  const criticals = allRenderedReports.flatMap((rep) =>
    rep.results
      .filter((r) => r.flag === "Critical")
      .map((r) => ({ parameter: r.parameter, testName: rep.testName })),
  );

  // Amendment detection — a published report that's been re-published has
  // gone through Published → reopen → Published at least once. We count
  // the number of "Published" entries in the status history; anything
  // above 1 means the report was amended. The most recent
  // "Amendment: <reason>" entry holds the most recent reason.
  const publishEntries = report.statusHistory.filter(
    (h) => h.status === "Published",
  );
  const amendmentCount = Math.max(0, publishEntries.length - 1);
  const isAmended = amendmentCount > 0;
  const lastAmendment = [...report.statusHistory]
    .reverse()
    .find((h) => h.note?.startsWith("Amendment:"));
  const lastAmendmentReason = lastAmendment?.note?.replace(
    /^Amendment:\s*/,
    "",
  );
  const originalPublishedAt = publishEntries[0]?.at;
  const latestPublishedAt =
    publishEntries[publishEntries.length - 1]?.at ?? report.publishedAt;

  const doctorLine = [report.requestingDoctor, report.referringHospital]
    .filter((s): s is string => Boolean(s))
    .join(" · ");

  const hasCollectionInfo =
    Boolean(report.sampleId) ||
    Boolean(labTest?.sampleType) ||
    Boolean(sampleConditionLabel) ||
    Boolean(collectedAt) ||
    Boolean(receivedAt) ||
    Boolean(reportedAt);

  // Status-based watermark: prevents an unfinished report screenshot
  // from being mistaken for a delivered one. Published reports get no
  // watermark; everything else gets a clear "this is not final" stamp.
  const watermark =
    report.status === "Published"
      ? ""
      : report.status === "Review"
        ? "Review Copy"
        : report.status === "Cancelled"
          ? "Cancelled"
          : "Draft";

  const hasAccreditation =
    Boolean(labProfile.nablNumber.trim()) ||
    Boolean(labProfile.licenseNumber.trim()) ||
    Boolean(labProfile.gstin.trim());

  return (
    <div className="print-page" data-watermark={watermark}>
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
          {hasAccreditation && (
            <div className="lab-accreditation">
              {labProfile.nablNumber && (
                <span className="item">
                  <span className="item-label">NABL</span>
                  <span className="item-value">{labProfile.nablNumber}</span>
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
              {labProfile.gstin && (
                <span className="item">
                  <span className="item-label">GSTIN</span>
                  <span className="item-value">{labProfile.gstin}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="header-divider" />

      {/* CRITICAL ALERT — patient-safety priority, top of the page */}
      {criticals.length > 0 && (
        <div className="critical-banner" role="alert">
          <span className="icon" aria-hidden>
            ⚠
          </span>
          <div>
            <div className="title">
              Critical value{criticals.length > 1 ? "s" : ""} — immediate
              attention required
            </div>
            <div className="body">
              {criticals.length} parameter
              {criticals.length > 1 ? "s are" : " is"} flagged Critical:{" "}
              {criticals.map((c) => c.parameter).join(", ")}. The prescribing
              physician should be contacted without delay.
            </div>
          </div>
        </div>
      )}

      {/* AMENDED BANNER — every NABL-compliant amended report needs a
          prominent indicator so the recipient knows the values they
          previously received have been corrected. We render this above
          the patient block but below the critical banner. */}
      {isAmended && (
        <div className="amended-banner" role="alert">
          <span className="icon" aria-hidden>
            ✎
          </span>
          <div>
            <div className="title">
              AMENDED REPORT (amendment #{amendmentCount})
            </div>
            <div className="body">
              {originalPublishedAt && (
                <>
                  Originally published {formatStamp(originalPublishedAt) ?? "—"}.
                  {" "}
                </>
              )}
              {latestPublishedAt && (
                <>Reissued {formatStamp(latestPublishedAt) ?? "—"}. </>
              )}
              {lastAmendmentReason && (
                <>
                  <strong>Reason:</strong> {lastAmendmentReason}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PATIENT BLOCK — top of the page, includes identity + vitals */}
      <section className="patient-block">
        <h2 className="block-title">Patient Information</h2>
        <div className="patient-grid">
          {/* Identity row */}
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

          {/* Demographics row */}
          {patient?.gender && (
            <div className="field">
              <span className="label">Gender</span>
              <span className="value">{patient.gender}</span>
            </div>
          )}
          {typeof patient?.age === "number" && (
            <div className="field">
              <span className="label">Age</span>
              <span className="value">{patient.age} years</span>
            </div>
          )}
          {patientDob && (
            <div className="field">
              <span className="label">Date of Birth</span>
              <span className="value">{patientDob}</span>
            </div>
          )}
          {patientPhone && (
            <div className="field">
              <span className="label">Phone</span>
              <span className="value">{patientPhone}</span>
            </div>
          )}
          {bloodGroup && (
            <div className="field">
              <span className="label">Blood Group</span>
              <span className="value">
                {bloodGroup.display}
                {!bloodGroup.isCurrentReport && (
                  <span className="value-hint">
                    per {bloodGroup.sourceReportCode}
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Vitals subsection — only when there's something to print. */}
          {hasAnyVital && (
            <>
              <div className="patient-subhead">Vitals at Check-in</div>
              {typeof heightCm === "number" && (
                <div className="field">
                  <span className="label">Height</span>
                  <span className="value">{heightCm} cm</span>
                </div>
              )}
              {typeof weightKg === "number" && (
                <div className="field">
                  <span className="label">Weight</span>
                  <span className="value">{weightKg} kg</span>
                </div>
              )}
              {bmi !== null && (
                <div className="field">
                  <span className="label">BMI</span>
                  <span className="value">
                    {bmi.toFixed(1)}
                    <span className="value-hint">{bmiCategory(bmi)}</span>
                  </span>
                </div>
              )}
              {bp && (
                <div className="field">
                  <span className="label">Blood Pressure</span>
                  <span className="value">{bp}</span>
                </div>
              )}
              {typeof checkIn.pulseBpm === "number" && (
                <div className="field">
                  <span className="label">Pulse</span>
                  <span className="value">{checkIn.pulseBpm} bpm</span>
                </div>
              )}
              {typeof checkIn.temperatureF === "number" && (
                <div className="field">
                  <span className="label">Temperature</span>
                  <span className="value">{checkIn.temperatureF} °F</span>
                </div>
              )}
              {checkIn.fastingStatus && (
                <div className="field">
                  <span className="label">Fasting</span>
                  <span className="value">
                    {FASTING_PRINT_LABEL[checkIn.fastingStatus]}
                  </span>
                </div>
              )}
              {checkIn.isPregnant && checkIn.isPregnant !== "unknown" && (
                <div className="field">
                  <span className="label">Pregnancy</span>
                  <span className="value">
                    {checkIn.isPregnant === "yes" ? "Yes" : "No"}
                  </span>
                </div>
              )}
              {checkIn.lmpDate && formatDate(checkIn.lmpDate) && (
                <div className="field">
                  <span className="label">LMP</span>
                  <span className="value">{formatDate(checkIn.lmpDate)}</span>
                </div>
              )}
            </>
          )}

          {/* Prescribing doctor — full row at the bottom */}
          {doctorLine && (
            <div className="field full-row">
              <span className="label">Prescribing Doctor</span>
              <span className="value">{doctorLine}</span>
            </div>
          )}
        </div>
      </section>

      {/* COLLECTION BLOCK — sample + timestamps in one band */}
      {hasCollectionInfo && (
        <section className="collection-block" aria-label="Sample and collection">
          {/* Row 1 — sample identity */}
          <div className="cell">
            <div className="cell-label">
              Sample ID{additionalReports.length > 0 ? "s" : ""}
            </div>
            <div className="cell-value sample-id">
              {[report, ...additionalReports]
                .map((r) => r.sampleId)
                .filter((s): s is string => Boolean(s))
                .join(", ") || "—"}
            </div>
          </div>
          <div className="cell">
            <div className="cell-label">Sample Type</div>
            <div className="cell-value">{labTest?.sampleType ?? "—"}</div>
            {/* Tube colour is intentionally NOT printed — it's internal
                phlebotomy information (which colour-top tube to draw into)
                that confuses patients and adds no clinical value to the
                reading doctor. Internal sample tracking lives on the
                requisition slip and the in-app sample block. */}
          </div>
          <div className="cell">
            <div className="cell-label">Condition</div>
            <div className="cell-value">{sampleConditionLabel ?? "—"}</div>
          </div>
          {/* Row 2 — timestamps */}
          <div className="cell">
            <div className="cell-label">Sample Collected</div>
            <div className="cell-value">{collectedAt ?? "—"}</div>
          </div>
          <div className="cell">
            <div className="cell-label">Sample Received</div>
            <div className="cell-value">{receivedAt ?? "—"}</div>
          </div>
          <div className="cell">
            <div className="cell-label">Reported On</div>
            <div className="cell-value">{reportedAt ?? "—"}</div>
          </div>
        </section>
      )}

      <ReportTestSection report={report} />
      {/* Additional same-visit tests stack under the primary one with a
          page-break hint so each starts cleanly. The doctor reads one
          patient + sample + N tests + one footer instead of N PDFs. */}
      {additionalReports.map((extra) => (
        <div key={extra.id} className="visit-test-break">
          <ReportTestSection report={extra} />
        </div>
      ))}

      {/* END OF REPORT */}
      <div className="end-of-report">End of Report</div>

      {/* SIGNATURE FOOTER */}
      <footer className="report-footer">
        <div className="footer-meta">
          <div>
            Report generated:{" "}
            <strong style={{ color: "var(--report-ink-soft)" }}>
              {generatedAt}
            </strong>
          </div>
        </div>
        <div className="signature-block">
          <div className="signature-line" />
          <div className="signature-name">
            {labProfile.signatoryName || "Authorized Signatory"}
          </div>
          {labProfile.signatoryRole && (
            <div className="signature-role">{labProfile.signatoryRole}</div>
          )}
        </div>
      </footer>

      {/* DISCLAIMER */}
      <div className="disclaimer">
        <span className="page-number">Page 1 of 1</span>
        This report relates only to the sample identified above and should be
        interpreted in conjunction with clinical findings by a qualified
        medical practitioner. Values may vary between laboratories based on
        method and instrument calibration. For queries, contact the issuing
        lab.
      </div>
    </div>
  );
}

/**
 * One test's worth of the printed report — title bar, results table,
 * interpretation paragraph (only when something is abnormal), and the
 * per-test lab notes. Extracted so the multi-test visit print can render
 * N of these in sequence under one shared header + patient block.
 */
export function ReportTestSection({ report }: { report: Report }) {
  const criticals = report.results.filter((r) => r.flag === "Critical");
  const abnormal = report.results.filter(
    (r) => r.flag === "High" || r.flag === "Low",
  );

  return (
    <>
      <div className="test-title-bar">
        <h2 className="test-title">
          {report.testName.toUpperCase()}
          {report.testCode && (
            <span className="test-title-sub">
              {report.testCode.toUpperCase()}
            </span>
          )}
        </h2>
      </div>

      <section className="results-section">
        <table className="results-table">
          <thead>
            <tr>
              <th className="col-test">Investigation</th>
              <th className="col-result">Result</th>
              <th className="col-units">Units</th>
              <th className="col-range">Biological Reference Interval</th>
              <th className="col-flag">Status</th>
            </tr>
          </thead>
          <tbody>
            {report.results.map((row) => (
              <PrintableResultRow key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </section>

      {(criticals.length > 0 || abnormal.length > 0) && (
        <section className="interpretation">
          <strong>Interpretation:</strong>
          {criticals.length > 0 && (
            <p className="interp-critical">
              {criticals.length} parameter
              {criticals.length > 1 ? "s are" : " is"} at a CRITICAL level —
              patient should consult their physician without delay.
            </p>
          )}
          {abnormal.length > 0 && (
            <p className="interp-warning">
              {abnormal.length} parameter
              {abnormal.length > 1 ? "s are" : " is"} outside the reference
              interval. Please correlate clinically.
            </p>
          )}
        </section>
      )}

      {report.notes && (
        <section className="notes-section">
          <strong>Lab Notes:</strong>
          <p>{report.notes}</p>
        </section>
      )}
    </>
  );
}

function PrintableResultRow({ row }: { row: ResultRow }) {
  const hasValue = row.value != null && row.value !== "";
  const flag = row.flag;
  const isCritical = flag === "Critical";
  const isHigh = flag === "High";
  const isLow = flag === "Low";

  const rowClass = isCritical
    ? "row-critical"
    : isHigh
      ? "row-flagged"
      : isLow
        ? "row-low"
        : "";

  let statusNode: React.ReactNode;
  if (!hasValue) {
    statusNode = <span className="status-empty">Pending</span>;
  } else if (isCritical) {
    statusNode = (
      <span className="status-cell status-critical">
        <span className="status-symbol">HH</span>Critical
      </span>
    );
  } else if (isHigh) {
    statusNode = (
      <span className="status-cell status-high">
        <span className="status-symbol">H</span>High
      </span>
    );
  } else if (isLow) {
    statusNode = (
      <span className="status-cell status-low">
        <span className="status-symbol">L</span>Low
      </span>
    );
  } else {
    statusNode = (
      <span className="status-cell status-normal">
        <span className="status-symbol">N</span>Normal
      </span>
    );
  }

  return (
    <tr className={rowClass}>
      <td className="col-test">{row.parameter}</td>
      <td className="col-result result-value">{hasValue ? row.value : "—"}</td>
      <td className="col-units">{row.unit || "—"}</td>
      <td className="col-range">{row.referenceRange || "—"}</td>
      <td className="col-flag">{statusNode}</td>
    </tr>
  );
}
