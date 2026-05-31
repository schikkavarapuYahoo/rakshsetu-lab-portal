"use client";

import {
  AlarmClock,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FilePlus2,
  FileText,
  Search,
  Send,
  ShieldAlert,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Input } from "@/components/ui/input";

import { DashboardSkeleton } from "@/components/common/loading-states";
import { WelcomeHeader } from "@/components/layout/welcome-header";
import { SectionHeader } from "@/components/common/section-header";
import {
  StatusBadge,
  type StatusBadgeVariant,
} from "@/components/common/status-badge";
import { STATUS_ICON } from "@/components/reports/status-pill";
import { TatChip } from "@/components/reports/tat-chip";
import { TatPermissionBanner } from "@/components/reports/tat-permission-banner";
import { useTickingNow } from "@/hooks/use-ticking-now";
import {
  getPatientFullName,
  usePatientsStore,
} from "@/lib/stores/patients";
import { useAuthStore } from "@/lib/stores/auth";
import { useLabCatalogStore, type LabTest } from "@/lib/stores/lab-catalog";
import {
  STATUS_TONE,
  WORKFLOW_STEPS,
  hasCriticalResults,
  useReportsStore,
  type Report,
  type ReportStatus,
} from "@/lib/stores/reports";
import { cn } from "@/lib/utils";
import { Timestamp } from "@/components/common/timestamp";
import { getTatState, type TatState } from "@/lib/utils/tat";

// ────────────────────────────────────────────────────────────────────────────
//  Time helpers
// ────────────────────────────────────────────────────────────────────────────

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function relativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  if (diff < HOUR) {
    const mins = Math.max(1, Math.floor(diff / 60000));
    return `${mins}m ago`;
  }
  const hours = Math.floor(diff / HOUR);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(diff / DAY);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}


// ────────────────────────────────────────────────────────────────────────────
//  Dashboard page
// ────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const reports = useReportsStore((s) => s.reports);
  const patients = usePatientsStore((s) => s.patients);
  const labTests = useLabCatalogStore((s) => s.tests);
  const currentUser = useAuthStore((s) => s.currentUser);
  const currentUserId = currentUser.id;
  const role = currentUser.role;
  const now = useTickingNow(60_000);
  const hasHydrated =
    (useReportsStore.persist?.hasHydrated() ?? true) &&
    (usePatientsStore.persist?.hasHydrated() ?? true);

  const firstName = currentUser.name.split(" ")[0] ?? "there";

  const labTestByCode = useMemo(() => {
    const m = new Map<string, LabTest>();
    for (const t of labTests) m.set(t.code.toUpperCase(), t);
    return m;
  }, [labTests]);

  const tatStateFor = useCallback(
    (report: Report): TatState => {
      const labTest = report.testCode
        ? labTestByCode.get(report.testCode.toUpperCase())
        : undefined;
      return getTatState(report, labTest, now);
    },
    [labTestByCode, now],
  );

  const data = useMemo(() => {
    // `now` is 0 on the very first render (before useTickingNow's effect
    // runs). For SSR-safety we don't want to call Date.now() during
    // render; treat the first frame as if everything is current and let
    // the next tick (~immediately after mount) produce the real numbers.
    const referenceNow = now || 0;
    const sevenDaysAgo = referenceNow - 7 * DAY;
    const twentyFourHoursAgo = referenceNow - 24 * HOUR;

    // Pipeline counts. MUST cover every value of ReportStatus or the
    // sum below produces NaN ("X + undefined") and the sidebar prints
    // "NaN active reports" — which is exactly what we shipped for a
    // week before noticing.
    const pipelineCounts: Record<ReportStatus, number> = {
      Ordered: 0,
      "Sample Collected": 0,
      "Waiting for Results": 0,
      Review: 0,
      Published: 0,
      Cancelled: 0,
    };
    for (const r of reports) pipelineCounts[r.status]++;

    // Critical reports awaiting acknowledgement
    const unacknowledgedCriticals = reports.filter(
      (r) =>
        r.status !== "Cancelled" &&
        hasCriticalResults(r) &&
        !r.criticalsAcknowledged,
    );

    // Recent activity (last 7 days)
    const recentReports = reports.filter(
      (r) => Date.parse(r.createdAt) >= sevenDaysAgo,
    );
    const recentPublished = reports.filter(
      (r) => r.publishedAt && Date.parse(r.publishedAt) >= sevenDaysAgo,
    );
    const recentSent = reports.filter(
      (r) => r.sentToPatientAt && Date.parse(r.sentToPatientAt) >= sevenDaysAgo,
    );
    const recentPatients = patients.filter(
      (p) => Date.parse(p.createdAt) >= sevenDaysAgo,
    );

    // Daily / weekly / monthly collections from recorded payments.
    // Uses `payment.paidAt` (the actual cash-in-hand moment) rather
    // than `recordedAt` so back-dated entries land in the right bucket.
    const startOfToday = new Date(now || Date.now());
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayMs = startOfToday.getTime();
    const startOfWeekMs = startOfTodayMs - 6 * DAY;
    const startOfMonth = new Date(now || Date.now());
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfMonthMs = startOfMonth.getTime();

    // Date-only strings like "2026-05-23" parse to UTC midnight, which
    // in any timezone west of GMT lands on the previous local day. Labs
    // care about their LOCAL day, so we interpret yyyy-mm-dd as local
    // midnight here.
    const parseLocalDay = (iso: string): number => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
      if (!m) return Date.parse(iso);
      const [, y, mo, d] = m;
      return new Date(Number(y), Number(mo) - 1, Number(d)).getTime();
    };

    const collectionsToday: Record<string, number> = {};
    let collectedTodayRupees = 0;
    let collectedWeekRupees = 0;
    let collectedMonthRupees = 0;
    let collectionCountToday = 0;
    let refundedTodayRupees = 0;

    // 7-day series for the bar chart. Index 0 = 6 days ago, index 6 = today.
    // Net rupees per local day (collections − refunds).
    const dailySeries: { dayMs: number; label: string; rupees: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(startOfTodayMs - i * DAY);
      dailySeries.push({
        dayMs: d.getTime(),
        label: d.toLocaleDateString("en-IN", {
          weekday: "short",
          day: "2-digit",
        }),
        rupees: 0,
      });
    }
    const bucketFor = (ms: number) => {
      const idx = dailySeries.findIndex(
        (b, i) =>
          ms >= b.dayMs &&
          (i === dailySeries.length - 1 || ms < dailySeries[i + 1].dayMs),
      );
      return idx >= 0 ? dailySeries[idx] : null;
    };
    for (const r of reports) {
      if (!r.payment) continue;
      const paidMs = parseLocalDay(r.payment.paidAt);
      if (Number.isFinite(paidMs)) {
        if (paidMs >= startOfTodayMs) {
          collectedTodayRupees += r.payment.amount;
          collectionCountToday += 1;
          collectionsToday[r.payment.method] =
            (collectionsToday[r.payment.method] ?? 0) + r.payment.amount;
        }
        if (paidMs >= startOfWeekMs) collectedWeekRupees += r.payment.amount;
        if (paidMs >= startOfMonthMs)
          collectedMonthRupees += r.payment.amount;
        const bucket = bucketFor(paidMs);
        if (bucket) bucket.rupees += r.payment.amount;
      }
      // Subtract refunds against the day they were actually refunded —
      // keeps each day's cash position honest. A payment from last
      // week refunded today reduces today's net, not last week's.
      if (r.payment.refundedAt && r.payment.refundedAmount != null) {
        const refundMs = parseLocalDay(r.payment.refundedAt);
        if (!Number.isFinite(refundMs)) continue;
        const amt = r.payment.refundedAmount;
        if (refundMs >= startOfTodayMs) {
          collectedTodayRupees -= amt;
          refundedTodayRupees += amt;
          const m = r.payment.refundMethod ?? r.payment.method;
          collectionsToday[m] = (collectionsToday[m] ?? 0) - amt;
        }
        if (refundMs >= startOfWeekMs) collectedWeekRupees -= amt;
        if (refundMs >= startOfMonthMs) collectedMonthRupees -= amt;
        const bucket = bucketFor(refundMs);
        if (bucket) bucket.rupees -= amt;
      }
    }

    // TAT-overdue reports — sample is in or before "Waiting for Results" and
    // the test's expected turnaround has elapsed. Picked up first so it
    // takes precedence over the coarser "stuck >24h" rule.
    const overdueByTat: Array<{ kind: "overdue"; report: Report }> = reports
      .map((r) => ({ r, tat: tatStateFor(r) }))
      .filter(({ tat }) => tat.status === "overdue")
      .sort((a, b) => (a.tat.minutesUntilDue ?? 0) - (b.tat.minutesUntilDue ?? 0))
      .map(({ r }) => ({ kind: "overdue" as const, report: r }));

    const overdueIds = new Set(overdueByTat.map((x) => x.report.id));

    // Needs-attention queue
    const inReview: Array<{ kind: "review"; report: Report }> = reports
      .filter((r) => r.status === "Review")
      .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
      .map((r) => ({ kind: "review" as const, report: r }));

    const stuckWaiting: Array<{ kind: "stuck"; report: Report }> = reports
      .filter(
        (r) =>
          r.status === "Waiting for Results" &&
          Date.parse(r.updatedAt) < twentyFourHoursAgo &&
          !overdueIds.has(r.id),
      )
      .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
      .map((r) => ({ kind: "stuck" as const, report: r }));

    const unsent: Array<{ kind: "unsent"; report: Report }> = reports
      .filter((r) => r.status === "Published" && !r.sentToPatientAt)
      .sort(
        (a, b) =>
          Date.parse(a.publishedAt ?? a.createdAt) -
          Date.parse(b.publishedAt ?? b.createdAt),
      )
      .map((r) => ({ kind: "unsent" as const, report: r }));

    const attentionFull = [
      ...overdueByTat,
      ...inReview,
      ...stuckWaiting,
      ...unsent,
    ];

    // Per-user throughput for the technician dashboard widget. Walks
    // each report's statusHistory and credits the user who recorded the
    // transition. "Patients touched" is unique by patientId.
    let mySamplesCollectedWeek = 0;
    let myReportsPublishedWeek = 0;
    let myReportsReviewedWeek = 0;
    const myPatientsWeek = new Set<string>();
    if (currentUserId) {
      for (const r of reports) {
        let touchedByMe = false;
        for (const h of r.statusHistory) {
          if (h.by?.userId !== currentUserId) continue;
          const ms = Date.parse(h.at);
          if (!Number.isFinite(ms) || ms < startOfWeekMs) continue;
          touchedByMe = true;
          if (h.status === "Sample Collected") mySamplesCollectedWeek += 1;
          else if (h.status === "Published") myReportsPublishedWeek += 1;
          else if (h.status === "Review") myReportsReviewedWeek += 1;
        }
        if (touchedByMe) myPatientsWeek.add(r.patientId);
      }
    }

    return {
      pipelineCounts,
      overdueCount: overdueByTat.length,
      unacknowledgedCriticals,
      recentReports,
      recentPublished,
      recentSent,
      recentPatients,
      attentionFull,
      attentionVisible: attentionFull.slice(0, 6),
      collectedTodayRupees,
      collectedWeekRupees,
      collectedMonthRupees,
      collectionCountToday,
      collectionsToday,
      refundedTodayRupees,
      dailySeries,
      mySamplesCollectedWeek,
      myReportsPublishedWeek,
      myReportsReviewedWeek,
      myPatientsWeekCount: myPatientsWeek.size,
    };
  }, [reports, patients, now, tatStateFor, currentUserId]);

  const patientById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of patients) m.set(p.id, getPatientFullName(p));
    return m;
  }, [patients]);

  if (!hasHydrated) return <DashboardSkeleton />;

  return (
    <div className="mx-auto max-w-400 space-y-6">
      <TatPermissionBanner />

      <WelcomeHeader name={currentUser.name} />

      {data.unacknowledgedCriticals.length > 0 && (
        <CriticalBanner reports={data.unacknowledgedCriticals} />
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main column — work queue first, stats second. */}
        <div className="min-w-0 space-y-6">
          <NeedsAttention
            visible={data.attentionVisible}
            total={data.attentionFull.length}
            patientById={patientById}
            tatStateFor={tatStateFor}
          />

          <RecentStats
            patientsCount={data.recentPatients.length}
            reportsCount={data.recentReports.length}
            publishedCount={data.recentPublished.length}
            sentCount={data.recentSent.length}
          />

          {/* Role-gated panel: technicians don't see lab revenue (they
              may negotiate with patients; cultural/medico-legal risk).
              They get their own throughput card instead. Owners and
              admins see both — own work + lab takings. */}
          {(role === "OWNER" || role === "ADMIN") && (
            <CollectionsToday
              todayRupees={data.collectedTodayRupees}
              weekRupees={data.collectedWeekRupees}
              monthRupees={data.collectedMonthRupees}
              countToday={data.collectionCountToday}
              byMethod={data.collectionsToday}
              refundedTodayRupees={data.refundedTodayRupees}
              dailySeries={data.dailySeries}
            />
          )}

          <MyWeek
            firstName={firstName}
            samples={data.mySamplesCollectedWeek}
            published={data.myReportsPublishedWeek}
            reviewed={data.myReportsReviewedWeek}
            patientsTouched={data.myPatientsWeekCount}
          />
        </div>

        {/* Right rail — search first (workflow starts there), then primary
            CTAs, then reference counts. Critical alerts live in the banner
            up top, so no sidebar duplicate. */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <PipelineList
            counts={data.pipelineCounts}
            overdueCount={data.overdueCount}
          />
          <QuickActions patients={patients} />
        </aside>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  Sections
// ────────────────────────────────────────────────────────────────────────────

function CriticalBanner({ reports }: { reports: Report[] }) {
  const n = reports.length;
  return (
    <Link
      href={`/reports/${reports[0]!.id}`}
      className="block rounded-xl border border-red-200 bg-red-50 px-5 py-3 transition-colors hover:bg-red-100"
    >
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-5 w-5 shrink-0 text-red-600" />
        <div className="flex-1 text-sm">
          <span className="font-semibold text-red-800">
            {n} report{n > 1 ? "s have" : " has"} critical results awaiting
            acknowledgement
          </span>
          <span className="ml-1 text-red-700/90">
            — these cannot be published until acknowledged.
          </span>
        </div>
        <span className="flex items-center gap-1 text-sm font-medium text-red-700">
          Review
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}

/**
 * Pipeline — compact vertical list shown in the right rail above Quick
 * Actions. Each row links to the filtered reports list for that stage.
 * Overdue (TAT elapsed) leads the list when there's anything overdue so
 * the receptionist sees it before the calmer stage counts.
 */
function PipelineList({
  counts,
  overdueCount,
}: {
  counts: Record<ReportStatus, number>;
  overdueCount: number;
}) {
  const total = WORKFLOW_STEPS.reduce((sum, s) => sum + counts[s], 0);
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="border-b border-neutral-100 px-4 py-3">
        <div className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
          Pipeline
        </div>
        <div className="text-muted-foreground text-xs">
          {total} active {total === 1 ? "report" : "reports"}
        </div>
      </div>
      <ul className="divide-y divide-neutral-100">
        {overdueCount > 0 && (
          <li>
            <Link
              href="/reports?status=Overdue"
              className="flex items-center justify-between gap-3 bg-red-50/40 px-4 py-2.5 transition-colors hover:bg-red-50"
            >
              <span className="flex items-center gap-2">
                <AlarmClock className="h-3.5 w-3.5 text-red-600" />
                <span className="text-sm font-medium text-red-700">
                  Overdue
                </span>
              </span>
              <span className="font-semibold tabular-nums text-red-700">
                {overdueCount}
              </span>
            </Link>
          </li>
        )}
        {WORKFLOW_STEPS.map((step) => {
          const tone = STATUS_TONE[step];
          const Icon = STATUS_ICON[step];
          return (
            <li key={step}>
              <Link
                href={`/reports?status=${encodeURIComponent(step)}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-neutral-50"
              >
                <span className="flex items-center gap-2">
                  <Icon className={cn("h-3.5 w-3.5", tone.text)} />
                  <span className={cn("text-sm font-medium", tone.text)}>
                    {step}
                  </span>
                </span>
                <span
                  className={cn("font-semibold tabular-nums", tone.text)}
                >
                  {counts[step]}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RecentStats({
  patientsCount,
  reportsCount,
  publishedCount,
  sentCount,
}: {
  patientsCount: number;
  reportsCount: number;
  publishedCount: number;
  sentCount: number;
}) {
  return (
    <section>
      <SectionHeader title="Last 7 days" uppercase />
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={<UserPlus />}
          tone="info"
          label="Patients added"
          value={patientsCount}
        />
        <StatTile
          icon={<FilePlus2 />}
          tone="accent"
          label="Reports created"
          value={reportsCount}
        />
        <StatTile
          icon={<CheckCircle2 />}
          tone="success"
          label="Published"
          value={publishedCount}
        />
        <StatTile
          icon={<Send />}
          tone="brand"
          label="Sent to patient"
          value={sentCount}
        />
      </div>
    </section>
  );
}

/**
 * Personal-throughput widget for the lab technician. Counts the
 * current user's status-history contributions over the rolling 7-day
 * window: samples collected, results reviewed, reports published, and
 * the unique patient set they touched. Shown to everyone (owners
 * benefit from seeing their own work too).
 */
function MyWeek({
  firstName,
  samples,
  published,
  reviewed,
  patientsTouched,
}: {
  firstName: string;
  samples: number;
  published: number;
  reviewed: number;
  patientsTouched: number;
}) {
  const empty =
    samples === 0 &&
    published === 0 &&
    reviewed === 0 &&
    patientsTouched === 0;
  return (
    <section>
      <SectionHeader title="Your week" uppercase />
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="grid grid-cols-2 divide-x divide-neutral-100 sm:grid-cols-4">
          <MyWeekCell
            label="Patients seen"
            value={patientsTouched}
            sub="Unique this week"
            tone="brand"
          />
          <MyWeekCell
            label="Samples collected"
            value={samples}
            sub="By you"
          />
          <MyWeekCell
            label="Results reviewed"
            value={reviewed}
            sub="Sent for review"
          />
          <MyWeekCell
            label="Reports published"
            value={published}
            sub="Closed out"
          />
        </div>
        {empty && (
          <div className="border-t border-neutral-100 px-5 py-3 text-xs text-neutral-500">
            {firstName}, nothing logged under your account this week yet —
            collect a sample or publish a report and it will show up here.
          </div>
        )}
      </div>
    </section>
  );
}

function MyWeekCell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "brand";
}) {
  return (
    <div className="px-4 py-3">
      <div className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "brand" ? "text-brand-700" : "text-neutral-900",
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="text-muted-foreground mt-0.5 text-[11px]">{sub}</div>
      )}
    </div>
  );
}

function CollectionsToday({
  todayRupees,
  weekRupees,
  monthRupees,
  countToday,
  byMethod,
  refundedTodayRupees,
  dailySeries,
}: {
  todayRupees: number;
  weekRupees: number;
  monthRupees: number;
  countToday: number;
  byMethod: Record<string, number>;
  refundedTodayRupees: number;
  dailySeries: { dayMs: number; label: string; rupees: number }[];
}) {
  const methods = Object.entries(byMethod)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1]);
  const fmt = (rupees: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(rupees);

  return (
    <section>
      <SectionHeader title="Collections" uppercase />
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="grid grid-cols-3 divide-x divide-neutral-100">
          <CollectionCell
            label="Today"
            value={fmt(todayRupees)}
            sub={
              refundedTodayRupees > 0
                ? `${countToday} payment${countToday === 1 ? "" : "s"} · less ${fmt(refundedTodayRupees)} refunded`
                : countToday > 0
                  ? `${countToday} payment${countToday === 1 ? "" : "s"}`
                  : "No payments yet"
            }
            tone="brand"
          />
          <CollectionCell
            label="Last 7 days"
            value={fmt(weekRupees)}
            sub="Rolling week"
          />
          <CollectionCell
            label="This month"
            value={fmt(monthRupees)}
            sub="From the 1st"
          />
        </div>

        {/* 7-day net collections sparkline-style bar chart.
            Net = collections − refunds bucketed by local day. */}
        {dailySeries.some((d) => d.rupees !== 0) && (
          <div className="border-t border-neutral-100 px-5 pt-3 pb-2">
            <div className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
              Last 7 days
            </div>
            <div className="h-32 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dailySeries}
                  margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="#f1f5f9"
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="label"
                    fontSize={10}
                    stroke="#94a3b8"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    fontSize={10}
                    stroke="#94a3b8"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => fmt(Number(v))}
                    width={56}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(184, 70, 47, 0.05)" }}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      fontSize: 12,
                    }}
                    // recharts types `value` as ValueType (string | number |
                    // undefined); coerce to a number for our formatter.
                    formatter={(value) => [fmt(Number(value ?? 0)), "Net"]}
                  />
                  <Bar
                    dataKey="rupees"
                    fill="#b8462f"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {methods.length > 0 ? (
          <div className="border-t border-neutral-100 px-5 py-3">
            <div className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wide uppercase">
              Today by method
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
              {methods.map(([method, amount]) => (
                <div key={method} className="inline-flex items-baseline gap-1.5">
                  <span className="text-muted-foreground text-xs">
                    {method}
                  </span>
                  <span className="font-medium tabular-nums text-neutral-900">
                    {fmt(amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="border-t border-neutral-100 px-5 py-3 text-xs text-neutral-500">
            Record a payment on any published report and it appears here.
          </div>
        )}
      </div>
    </section>
  );
}

function CollectionCell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "brand";
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-1.5">
        {tone === "brand" && (
          <Wallet className="text-brand-600 h-3.5 w-3.5" />
        )}
        <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
          {label}
        </span>
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "brand" ? "text-brand-700" : "text-neutral-900",
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="text-muted-foreground mt-0.5 text-[11px]">{sub}</div>
      )}
    </div>
  );
}

type StatTone = "brand" | "info" | "success" | "accent";

const STAT_TONE_CLASSES: Record<StatTone, string> = {
  brand: "bg-brand-50 text-brand-700 ring-brand-100",
  info: "bg-sky-50 text-sky-700 ring-sky-100",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  accent: "bg-violet-50 text-violet-700 ring-violet-100",
};

function StatTile({
  icon,
  label,
  value,
  tone = "brand",
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone?: StatTone;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs font-medium">
          {label}
        </span>
        <span
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-lg ring-1 [&>svg]:h-4 [&>svg]:w-4",
            STAT_TONE_CLASSES[tone],
          )}
        >
          {icon}
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-neutral-900">
        {value}
      </div>
    </div>
  );
}

interface AttentionItem {
  kind: "review" | "stuck" | "unsent" | "overdue";
  report: Report;
}

function NeedsAttention({
  visible,
  total,
  patientById,
  tatStateFor,
}: {
  visible: AttentionItem[];
  total: number;
  patientById: Map<string, string>;
  tatStateFor: (report: Report) => TatState;
}) {
  // Tone the count badge based on workload so the eye lands on red when the
  // backlog is heavy. Thresholds chosen for a 1–5 staff lab: under 5 reads
  // as "normal", 5–9 as "watch this", 10+ as "drop everything".
  const countVariant: StatusBadgeVariant =
    total === 0 ? "success" : total < 5 ? "info" : total < 10 ? "warning" : "danger";
  const countIcon =
    total >= 5 ? <AlertTriangle /> : undefined;

  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-neutral-900">
          Needs your attention
        </h2>
        <StatusBadge
          variant={countVariant}
          icon={countIcon}
          pill
        >
          {total} {total === 1 ? "item" : "items"}
        </StatusBadge>
      </header>

      {visible.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-2 text-sm font-medium text-neutral-700">
            You&apos;re all caught up.
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            No overdue results, reports in Review, stuck samples, or unsent
            published reports.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {visible.map(({ kind, report }) => (
            <AttentionRow
              key={`${kind}-${report.id}`}
              kind={kind}
              report={report}
              patientName={patientById.get(report.patientId) ?? "Unknown patient"}
              tatState={kind === "overdue" ? tatStateFor(report) : undefined}
            />
          ))}
        </ul>
      )}

      {total > visible.length && (
        <footer className="border-t border-neutral-100 px-5 py-3 text-center">
          <Link
            href="/reports"
            className="text-brand-700 hover:text-brand-800 inline-flex items-center gap-1 text-sm font-medium"
          >
            View all reports
            <ArrowRight className="h-4 w-4" />
          </Link>
        </footer>
      )}
    </section>
  );
}

function AttentionRow({
  kind,
  report,
  patientName,
  tatState,
}: {
  kind: AttentionItem["kind"];
  report: Report;
  patientName: string;
  tatState?: TatState;
}) {
  const config: {
    label: string;
    tag: string;
    variant: StatusBadgeVariant;
    icon: ReactNode;
    ageBasis: string;
  } = {
    overdue: {
      label: "Enter results",
      tag: "Results due",
      variant: "danger" as StatusBadgeVariant,
      icon: <AlarmClock />,
      ageBasis: report.statusHistory[0]?.at ?? report.createdAt,
    },
    review: {
      label: "Publish",
      tag: "Review",
      variant: "accent" as StatusBadgeVariant,
      icon: <CheckCircle2 />,
      ageBasis: report.updatedAt,
    },
    stuck: {
      label: "Stuck",
      tag: "Waiting >24h",
      variant: "warning" as StatusBadgeVariant,
      icon: <Clock />,
      ageBasis: report.updatedAt,
    },
    unsent: {
      label: "Send",
      tag: "Not sent",
      variant: "success" as StatusBadgeVariant,
      icon: <Send />,
      ageBasis: report.publishedAt ?? report.createdAt,
    },
  }[kind];

  // For overdue rows the TAT chip already conveys urgency + specifics, so we
  // skip the redundant "Results due" pill and let the chip carry the signal.
  const showStatusBadge = !(kind === "overdue" && tatState);

  return (
    <li>
      <Link
        href={`/reports/${report.id}`}
        className="hover:bg-brand-50/40 grid items-center gap-4 px-5 py-3 transition-colors grid-cols-[7rem_7rem_1fr_5rem_8rem]"
      >
        {/* 1. Tag / TAT chip (fixed width so the rest aligns) */}
        <div className="flex items-center">
          {showStatusBadge && (
            <StatusBadge
              variant={config.variant}
              icon={config.icon}
              pill
            >
              {config.tag}
            </StatusBadge>
          )}
          {tatState && <TatChip state={tatState} stacked />}
        </div>

        {/* 2. Timestamp */}
        <Timestamp
          at={config.ageBasis}
          title={relativeTime(config.ageBasis)}
        />

        {/* 3. Patient name + report code (takes remaining space) */}
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-neutral-900">
            {patientName}
          </span>
          <span className="text-muted-foreground mt-0.5 block truncate font-mono text-[10px] tracking-wide">
            {report.reportCode}
          </span>
        </span>

        {/* 4. Test code */}
        <span className="text-muted-foreground truncate text-right font-mono text-xs">
          {report.testCode ?? report.testName}
        </span>

        {/* 5. Action */}
        <span className="text-brand-700 inline-flex items-center justify-end gap-1 text-sm font-medium">
          {config.label}
          <ArrowRight className="h-4 w-4" />
        </span>
      </Link>
    </li>
  );
}

function QuickActions({
  patients,
}: {
  patients: ReturnType<typeof usePatientsStore.getState>["patients"];
}) {
  // Patient finder lives at the top of Quick Actions because finding
  // an existing patient and starting a new visit are the two most
  // common things to do from the dashboard — one card keeps both the
  // search and the registration CTA in the same line of sight.
  const [query, setQuery] = useState("");
  const trimmed = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!trimmed) return [];
    return patients
      .filter((p) => {
        const name = getPatientFullName(p).toLowerCase();
        return (
          name.includes(trimmed) ||
          p.patientCode.toLowerCase().includes(trimmed) ||
          p.phone.toLowerCase().includes(trimmed)
        );
      })
      .slice(0, 5);
  }, [trimmed, patients]);

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="border-b border-neutral-100 px-4 py-3">
        <h2 className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">
          Quick Actions
        </h2>
      </div>

      {/* Find a patient */}
      <div className="border-b border-neutral-100 p-3">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a patient by name, ID, or phone"
            className="focus-visible:ring-brand-500/30 h-9 rounded-lg border-neutral-200 bg-white pl-9 text-sm"
          />
        </div>
        {trimmed && (
          <div className="mt-2">
            {results.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-neutral-500">
                No matches
              </p>
            ) : (
              <ul className="space-y-0.5">
                {results.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/patients/${p.id}`}
                      className="hover:bg-brand-50/60 flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors"
                    >
                      <span className="text-muted-foreground font-mono">
                        {p.patientCode}
                      </span>
                      <span className="truncate font-medium text-neutral-900">
                        {getPatientFullName(p)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Primary actions */}
      <div className="space-y-2 p-3">
        <Link
          href="/patients/new"
          className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-500/40 flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <UserPlus className="h-4 w-4" />
          Register Patient
        </Link>
        <Link
          href="/reports/new"
          className="hover:bg-neutral-50 flex w-full items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm font-medium text-neutral-800 shadow-sm transition-colors"
        >
          <FilePlus2 className="h-4 w-4" />
          New Report
        </Link>
        <Link
          href="/patients"
          className="hover:bg-neutral-50 flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm font-medium text-neutral-700 transition-colors"
        >
          <Users className="h-4 w-4 text-neutral-400" />
          All patients
        </Link>
        <Link
          href="/reports"
          className="hover:bg-neutral-50 flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm font-medium text-neutral-700 transition-colors"
        >
          <FileText className="h-4 w-4 text-neutral-400" />
          All reports
        </Link>
      </div>
    </div>
  );
}

