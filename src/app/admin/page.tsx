import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/server/auth/session';
import { adminDb } from '@/server/firebase-admin';
import { FlaskConical, Activity, IndianRupee, Plus, Building2, UserPlus, ArrowRight } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { WelcomeHeader } from '@/components/layout/welcome-header';
import { LabStatusDonut } from '@/components/admin/lab-status-donut';
import { TimeRangeSelector } from '@/components/admin/time-range-selector';
import { normalizeDays, shortRangeLabel } from '@/components/admin/time-range-config';
import { TopLabsList } from '@/components/admin/top-labs-list';

export const dynamic = 'force-dynamic';

interface OverviewStats {
  active_labs: number;
  pending_labs: number;
  suspended_labs: number;
  /** Reports submitted inside the selected window. */
  reports_window: number;
  /** Revenue accrued inside the selected window, in paise. */
  revenue_window_paise: number;
  /** Per-lab report counts inside the selected window, sorted desc. */
  top_labs: { lab_id: string; lab_name: string; lab_code: string; count: number }[];
}

async function loadStats(
  staffId: string,
  role: 'admin' | 'rep',
  windowDays: number,
): Promise<OverviewStats> {
  const db = adminDb();
  const labsBase = db.collection('labs');
  const labsQuery = role === 'rep'
    ? labsBase.where('owned_by_staff_id', '==', staffId)
    : labsBase;

  const labsSnap = await labsQuery.get();
  let active = 0, pending = 0, suspended = 0;
  const labIds: string[] = [];
  const labMeta = new Map<string, { name: string; code: string; pricePaise: number; sharePct: number }>();
  let revenueWindowPaise = 0;
  for (const d of labsSnap.docs) {
    const data = d.data();
    labIds.push(d.id);
    labMeta.set(d.id, {
      name: (data.lab_name as string) || '(unnamed)',
      code: (data.lab_code as string) || '',
      pricePaise: (data.per_report_paise as number) ?? 1000,
      sharePct: (data.rev_share_pct as number) ?? 60,
    });
    if (data.status === 'active') active += 1;
    if (data.status === 'pending') pending += 1;
    if (data.status === 'suspended') suspended += 1;
  }

  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const reportsByLab = new Map<string, number>();
  let reportsWindow = 0;

  // Firestore "in" supports up to 30 elements per query — chunk lab IDs.
  if (labIds.length > 0) {
    for (let i = 0; i < labIds.length; i += 30) {
      const chunk = labIds.slice(i, i + 30);
      const snap = await db.collection('lab_reports')
        .where('lab_id', 'in', chunk)
        .where('created_at', '>=', windowStart)
        .get();
      reportsWindow += snap.size;
      for (const r of snap.docs) {
        const data = r.data();
        const meta = labMeta.get(data.lab_id as string);
        if (meta) {
          revenueWindowPaise += Math.floor(meta.pricePaise * meta.sharePct / 100);
          reportsByLab.set(data.lab_id as string, (reportsByLab.get(data.lab_id as string) ?? 0) + 1);
        }
      }
    }
  }

  // All labs ranked by report volume in the selected window. Labs with
  // zero reports are included so the admin sees the long tail of
  // inactive ones — exactly the labs that need a follow-up call.
  const top_labs = labIds
    .map((lab_id) => {
      const meta = labMeta.get(lab_id);
      return {
        lab_id,
        lab_name: meta?.name ?? '(unknown)',
        lab_code: meta?.code ?? '',
        count: reportsByLab.get(lab_id) ?? 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  return {
    active_labs: active,
    pending_labs: pending,
    suspended_labs: suspended,
    reports_window: reportsWindow,
    revenue_window_paise: revenueWindowPaise,
    top_labs,
  };
}

export default async function AdminOverview({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const session = await getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'rep')) {
    redirect('/staff-login');
  }
  const params = await searchParams;
  const windowDays = normalizeDays(params.range);
  const windowLabel = shortRangeLabel(windowDays);
  const stats = await loadStats(session.staff_id, session.role, windowDays);
  const isAdmin = session.role === 'admin';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <WelcomeHeader name={session.display_name} />
        <TimeRangeSelector selected={windowDays} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {isAdmin ? 'Network at a glance' : 'Your labs'}
            </h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat label="Active Labs" value={stats.active_labs} icon={<FlaskConical className="h-5 w-5" />} tone="brand" />
              <Stat label="Pending Activation" value={stats.pending_labs} icon={<FlaskConical className="h-5 w-5" />} tone="warning" />
              <Stat label={`Reports (${windowLabel})`} value={stats.reports_window} icon={<Activity className="h-5 w-5" />} tone="success" />
              <Stat
                label={`Revenue (${windowLabel})`}
                value={`₹${(stats.revenue_window_paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                icon={<IndianRupee className="h-5 w-5" />}
                tone="brand"
              />
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Lab status
              </h2>
              <Card className="p-5">
                <LabStatusDonut
                  active={stats.active_labs}
                  pending={stats.pending_labs}
                  suspended={stats.suspended_labs}
                />
              </Card>
            </section>

            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Reports by lab ({windowLabel})
              </h2>
              <Card className="p-5">
                <TopLabsList labs={stats.top_labs} />
              </Card>
            </section>
          </div>

        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Quick actions
            </h2>
            <div className="space-y-2">
              <Link
                href="/admin/labs/new"
                className="inline-flex h-10 w-full items-center gap-2 rounded-lg bg-brand-500 px-3 text-sm font-medium text-white transition-colors hover:bg-brand-600"
              >
                <Plus className="h-4 w-4" />
                Onboard a new lab
              </Link>
              <ActionLink href="/admin/labs" icon={<Building2 className="h-4 w-4" />}>
                View all labs
              </ActionLink>
              {isAdmin && (
                <ActionLink href="/admin/staff" icon={<UserPlus className="h-4 w-4" />}>
                  Manage staff
                </ActionLink>
              )}
            </div>
          </Card>

        </aside>
      </div>
    </div>
  );
}

function ActionLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group inline-flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
    >
      {icon}
      <span className="flex-1 text-left">{children}</span>
      <ArrowRight className="h-4 w-4 text-neutral-400 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function Stat({ label, value, icon, tone }: {
  label: string; value: number | string; icon: React.ReactNode;
  tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
}) {
  const cls = {
    neutral: 'bg-neutral-100 text-neutral-700',
    brand: 'bg-brand-100 text-brand-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    danger: 'bg-red-100 text-red-700',
  }[tone];
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-500">{label}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${cls}`}>{icon}</div>
      </div>
      <div className="text-3xl font-bold text-neutral-900">{value}</div>
    </Card>
  );
}
