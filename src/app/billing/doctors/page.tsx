"use client";

import { ArrowLeft, Stethoscope } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useRoleGuard } from "@/hooks/use-role-guard";
import { useReportsStore } from "@/lib/stores/reports";

/**
 * /billing/doctors — referring-doctor revenue summary.
 *
 * Groups paid + unpaid reports by (doctor, clinic) and shows revenue
 * collected, average per report, and current commission owed at a
 * configurable rate. Indian labs pay referring doctors a 10–20% kickback
 * and need this number every month to settle accounts.
 */

interface DoctorRow {
  key: string;
  doctorName: string;
  hospital: string;
  paidReports: number;
  unpaidReports: number;
  /** Pre-published reports — Ordered, Sample Collected, Waiting, Review.
   *  Haven't generated revenue yet but show the doctor's active pipeline. */
  inProgressReports: number;
  collectedRupees: number;
  outstandingRupees: number;
  refundedRupees: number;
  /** Net revenue this doctor brought in (collected - refunded). */
  netRupees: number;
  /** Distinct patient count (referring-doctor reach metric). */
  uniquePatients: number;
  /** Top test types this doctor refers, sorted desc by count. */
  topTests: { testName: string; count: number }[];
  /** Earliest + latest publishedAt — gives "first referral / last referral". */
  firstReferral: string | null;
  lastReferral: string | null;
}

const COMMISSION_PRESETS = [0, 10, 15, 20, 25];

function fmtRupees(rupees: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);
}

function fmtRupeesPaise(rupees: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type RangeFilter = "all" | "month" | "year";

export default function BillingDoctorsPage() {
  const guard = useRoleGuard(["OWNER", "ADMIN"]);
  const reports = useReportsStore((s) => s.reports);
  const hasHydrated = useReportsStore.persist?.hasHydrated() ?? true;
  const [commissionPercent, setCommissionPercent] = useState(15);
  const [range, setRange] = useState<RangeFilter>("month");

  const cutoffMs = useMemo(() => {
    if (range === "all") return -Infinity;
    const now = new Date();
    if (range === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return start.getTime();
    }
    // year
    const start = new Date(now.getFullYear(), 0, 1);
    return start.getTime();
  }, [range]);

  const rows = useMemo<DoctorRow[]>(() => {
    const byKey = new Map<string, DoctorRow>();
    const patientsByKey = new Map<string, Set<string>>();
    const testCountsByKey = new Map<string, Map<string, number>>();

    for (const r of reports) {
      if (r.status === "Cancelled") continue;
      const doctorName = (r.requestingDoctor ?? "").trim();
      const hospital = (r.referringHospital ?? "").trim();
      if (!doctorName && !hospital) continue;

      const cutoffField = r.publishedAt ?? r.collectedAt ?? r.createdAt;
      const t = Date.parse(cutoffField);
      if (!Number.isFinite(t) || t < cutoffMs) continue;

      const key = `${doctorName.toLowerCase()}|${hospital.toLowerCase()}`;
      const existing = byKey.get(key) ?? {
        key,
        doctorName: doctorName || "—",
        hospital: hospital || "",
        paidReports: 0,
        unpaidReports: 0,
        inProgressReports: 0,
        collectedRupees: 0,
        outstandingRupees: 0,
        refundedRupees: 0,
        netRupees: 0,
        uniquePatients: 0,
        topTests: [],
        firstReferral: null,
        lastReferral: null,
      };

      // First / last referral timestamps
      const refMs = Date.parse(r.publishedAt ?? r.collectedAt ?? r.createdAt);
      if (Number.isFinite(refMs)) {
        if (
          existing.firstReferral === null ||
          refMs < Date.parse(existing.firstReferral)
        ) {
          existing.firstReferral = new Date(refMs).toISOString();
        }
        if (
          existing.lastReferral === null ||
          refMs > Date.parse(existing.lastReferral)
        ) {
          existing.lastReferral = new Date(refMs).toISOString();
        }
      }

      // A refunded payment is functionally unpaid again from the lab's
      // perspective: the money is back with the patient, the report is
      // still published, and someone may need to collect again (or
      // not — depends on why the refund happened).
      const isRefunded = Boolean(r.payment?.refundedAt);
      if (r.payment && !isRefunded) {
        existing.paidReports += 1;
        existing.collectedRupees += r.payment.amount;
      } else if (r.status === "Published") {
        existing.unpaidReports += 1;
      } else {
        // In-flight reports — Ordered / Sample Collected / Waiting / Review
        existing.inProgressReports += 1;
      }
      if (r.payment?.refundedAmount) {
        existing.refundedRupees += r.payment.refundedAmount;
      }

      // Patients + tests by key
      let patients = patientsByKey.get(key);
      if (!patients) {
        patients = new Set();
        patientsByKey.set(key, patients);
      }
      patients.add(r.patientId);

      let tests = testCountsByKey.get(key);
      if (!tests) {
        tests = new Map();
        testCountsByKey.set(key, tests);
      }
      tests.set(r.testName, (tests.get(r.testName) ?? 0) + 1);

      byKey.set(key, existing);
    }

    const out: DoctorRow[] = [];
    for (const [key, row] of byKey) {
      row.netRupees = row.collectedRupees - row.refundedRupees;
      row.uniquePatients = patientsByKey.get(key)?.size ?? 0;
      const testMap = testCountsByKey.get(key);
      if (testMap) {
        row.topTests = Array.from(testMap.entries())
          .map(([testName, count]) => ({ testName, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);
      }
      out.push(row);
    }
    return out.sort((a, b) => b.netRupees - a.netRupees);
  }, [reports, cutoffMs]);

  const totalNet = rows.reduce((s, r) => s + r.netRupees, 0);
  const totalCommission = (totalNet * commissionPercent) / 100;
  const totalUnpaid = rows.reduce((s, r) => s + r.unpaidReports, 0);

  if (!hasHydrated || guard === "loading") {
    return (
      <main className="mx-auto w-full max-w-400 px-6 py-10">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </main>
    );
  }

  if (guard === "denied") {
    return (
      <main className="mx-auto w-full max-w-400 px-6 py-10">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Referring-doctor revenue is for the lab owner or admin.
          Redirecting…
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-400 px-6 py-8">
      <Link
        href="/billing"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to billing
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Referring doctors
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Revenue, patient reach, and commission owed per referring doctor.
            Cancelled reports are excluded. Refunded amounts are netted out
            of collected revenue.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-neutral-600">
            Range
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as RangeFilter)}
              className="focus:border-brand-500 h-9 rounded-md border border-neutral-200 bg-white px-2 text-sm outline-none"
            >
              <option value="month">This month</option>
              <option value="year">This year</option>
              <option value="all">All time</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-neutral-600">
            Commission
            <select
              value={commissionPercent}
              onChange={(e) => setCommissionPercent(Number(e.target.value))}
              className="focus:border-brand-500 h-9 rounded-md border border-neutral-200 bg-white px-2 text-sm outline-none"
            >
              {COMMISSION_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p}%
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {/* Totals strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCell
          label="Doctors"
          value={String(rows.length)}
          sub="Distinct referrers"
        />
        <SummaryCell
          label="Net revenue"
          value={fmtRupees(totalNet)}
          sub="Collected minus refunds"
          tone="brand"
        />
        <SummaryCell
          label={`Commission @ ${commissionPercent}%`}
          value={fmtRupees(totalCommission)}
          sub={
            commissionPercent === 0
              ? "Set a rate above to compute"
              : "Estimated payout"
          }
          tone="accent"
        />
        <SummaryCell
          label="Unpaid reports"
          value={String(totalUnpaid)}
          sub="Published, awaiting collection"
          tone={totalUnpaid > 0 ? "warning" : undefined}
        />
      </div>

      {/* Top-doctors revenue chart — only render when there's revenue
          to plot. Limits to 6 names so the labels stay readable. */}
      {rows.some((r) => r.netRupees > 0) && (
        <div className="mb-6 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">
              Top referring doctors by net revenue
            </h2>
            <span className="text-muted-foreground text-xs">
              {range === "month"
                ? "This month"
                : range === "year"
                  ? "This year"
                  : "All time"}
            </span>
          </div>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rows
                  .filter((r) => r.netRupees > 0)
                  .slice(0, 6)
                  .map((r) => ({
                    name:
                      r.doctorName.length > 18
                        ? r.doctorName.slice(0, 17) + "…"
                        : r.doctorName,
                    rupees: r.netRupees,
                  }))}
                margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="#f1f5f9"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="name"
                  fontSize={10}
                  stroke="#94a3b8"
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                />
                <YAxis
                  fontSize={10}
                  stroke="#94a3b8"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => fmtRupees(Number(v))}
                  width={70}
                />
                <Tooltip
                  cursor={{ fill: "rgba(184, 70, 47, 0.05)" }}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    fontSize: 12,
                  }}
                  formatter={(value) => [
                    fmtRupeesPaise(Number(value ?? 0)),
                    "Net revenue",
                  ]}
                />
                <Bar dataKey="rupees" radius={[4, 4, 0, 0]} maxBarSize={56}>
                  {rows
                    .filter((r) => r.netRupees > 0)
                    .slice(0, 6)
                    .map((_, i) => (
                      <Cell
                        key={i}
                        fill={i === 0 ? "#b8462f" : "#c8553d"}
                        fillOpacity={1 - i * 0.1}
                      />
                    ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-6 py-12 text-center">
          <Stethoscope className="mx-auto h-8 w-8 text-neutral-300" />
          <h2 className="mt-3 text-sm font-semibold text-neutral-900">
            No referring-doctor activity yet
          </h2>
          <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
            Reports created with a prescribing doctor or referring hospital
            in the chosen range will roll up here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50/80">
              <tr className="border-b border-neutral-100 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
                <th className="px-5 py-3 text-left">Doctor / Clinic</th>
                <th className="px-5 py-3 text-right">Reports</th>
                <th className="px-5 py-3 text-right">Patients</th>
                <th className="px-5 py-3 text-right">Net revenue</th>
                <th className="px-5 py-3 text-right">Commission</th>
                <th className="px-5 py-3 text-left">Most ordered</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const commission = (row.netRupees * commissionPercent) / 100;
                return (
                  <tr
                    key={row.key}
                    className="border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50/50"
                  >
                    <td className="px-5 py-3 align-top">
                      <div className="font-medium text-neutral-900">
                        {row.doctorName}
                      </div>
                      {row.hospital && (
                        <div className="text-muted-foreground text-xs">
                          {row.hospital}
                        </div>
                      )}
                      {row.lastReferral && (
                        <div className="text-muted-foreground mt-1 text-[11px]">
                          {row.firstReferral &&
                          row.firstReferral !== row.lastReferral
                            ? `${formatDate(row.firstReferral)} → ${formatDate(row.lastReferral)}`
                            : `Last ${formatDate(row.lastReferral)}`}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right align-top tabular-nums">
                      <div className="font-medium text-neutral-900">
                        {row.paidReports +
                          row.unpaidReports +
                          row.inProgressReports}
                      </div>
                      <div className="mt-0.5 space-y-0.5 text-[11px]">
                        {row.paidReports > 0 && (
                          <div className="text-emerald-700">
                            {row.paidReports} paid
                          </div>
                        )}
                        {row.unpaidReports > 0 && (
                          <div className="text-amber-700">
                            {row.unpaidReports} unpaid
                          </div>
                        )}
                        {row.inProgressReports > 0 && (
                          <div className="text-sky-700">
                            {row.inProgressReports} in&nbsp;progress
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right align-top tabular-nums text-neutral-700">
                      {row.uniquePatients}
                    </td>
                    <td className="px-5 py-3 text-right align-top">
                      <div className="font-medium tabular-nums text-neutral-900">
                        {fmtRupeesPaise(row.netRupees)}
                      </div>
                      {row.refundedRupees > 0 && (
                        <div className="text-[11px] text-red-600 tabular-nums">
                          incl. {fmtRupeesPaise(row.refundedRupees)} refunded
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right align-top">
                      <div
                        className={
                          commissionPercent > 0
                            ? "text-brand-700 font-semibold tabular-nums"
                            : "text-muted-foreground tabular-nums"
                        }
                      >
                        {commissionPercent > 0
                          ? fmtRupeesPaise(commission)
                          : "—"}
                      </div>
                    </td>
                    <td className="px-5 py-3 align-top">
                      <div className="flex flex-wrap gap-1">
                        {row.topTests.map((t) => (
                          <span
                            key={t.testName}
                            className="bg-brand-50 text-brand-700 ring-brand-100 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset"
                          >
                            {t.testName}
                            <span className="text-brand-600 font-mono text-[9px]">
                              ×{t.count}
                            </span>
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function SummaryCell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "brand" | "accent" | "warning";
}) {
  const valueClass =
    tone === "brand"
      ? "text-brand-700"
      : tone === "accent"
        ? "text-violet-700"
        : tone === "warning"
          ? "text-amber-800"
          : "text-neutral-900";
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
        {label}
      </div>
      <div
        className={`mt-1 text-xl font-semibold tabular-nums ${valueClass}`}
      >
        {value}
      </div>
      {sub && (
        <div className="text-muted-foreground mt-0.5 text-[11px]">{sub}</div>
      )}
    </div>
  );
}
