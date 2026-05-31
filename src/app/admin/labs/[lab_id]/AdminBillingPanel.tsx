'use client';

import { useEffect, useState } from 'react';
import {
  Wallet,
  Plus,
  Tag,
  Power,
  Loader2,
  RefreshCw,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react';
import { formatRupees, reportsAffordable } from '@/lib/paise';

/**
 * Admin billing panel — embedded into /admin/labs/[lab_id].
 *
 * Three actions exposed:
 *   1. Grant credits — manual top-up by admin (trial_grant /
 *      compensation / manual_adjustment). Calls
 *      /api/admin/billing/grant.
 *   2. Change price — calls /api/admin/billing/set-price.
 *   3. Suspend / reactivate (BILLING-side, distinct from
 *      operational status). Calls /api/admin/billing/suspend.
 *
 * Plus a paginated ledger view below the actions.
 *
 * The component is self-contained: it loads its own data via
 * /api/admin/billing/[lab_id]/ledger on mount and re-fetches after
 * each successful action so the balance and ledger stay in sync
 * with the writes we just made.
 *
 * Why three distinct grant reasons in one form: the brief specifies
 * them. They produce different downstream behavior — trial_grant
 * increments trial_credits_granted_paise (so we can answer "how
 * much have we given away?" without walking the ledger).
 * compensation and manual_adjustment do NOT increment that field
 * but are recorded distinctly in the ledger reason for audit.
 */

interface LedgerEntry {
  id: string;
  lab_id: string;
  direction: 'credit' | 'debit';
  amount_paise: number;
  reason: string;
  balance_after_paise: number;
  linked_doc_path: string | null;
  actor_type: string;
  actor_id: string;
  actor_ip: string;
  metadata: Record<string, unknown>;
  created_at: string | null;
}

interface LabBillingSummary {
  id: string;
  lab_code: string;
  lab_name: string;
  balance_paise: number;
  per_report_paise: number;
  billing_status: string;
}

interface Props {
  labId: string;
  // The parent page passes the freshest balance/price/status it has
  // (from /api/admin/labs/[lab_id]/detail). We use it as the
  // initial render so the panel doesn't show "Loading..." for a
  // beat. Subsequent state comes from /api/admin/billing/.../ledger
  // which returns a `lab` summary alongside the entries.
  initialBalancePaise: number;
  initialPricePaise: number;
  initialBillingStatus: string;
}

export default function AdminBillingPanel({
  labId,
  initialBalancePaise,
  initialPricePaise,
  initialBillingStatus,
}: Props) {
  const [summary, setSummary] = useState<LabBillingSummary>({
    id: labId,
    lab_code: '',
    lab_name: '',
    balance_paise: initialBalancePaise,
    per_report_paise: initialPricePaise,
    billing_status: initialBillingStatus,
  });
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Action UI state
  const [grantOpen, setGrantOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    void loadLedger(/* reset = */ true);
  }, [labId]);

  async function loadLedger(reset: boolean) {
    setLoading(true);
    setLoadError(null);
    const cursor = reset ? null : nextBefore;
    try {
      const url = `/api/admin/billing/${labId}/ledger?limit=25${
        cursor ? `&before=${encodeURIComponent(cursor)}` : ''
      }`;
      const res = await fetch(url);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setLoadError(j.error || `Could not load ledger (HTTP ${res.status})`);
        return;
      }
      const data = await res.json();
      setSummary(data.lab);
      setEntries((prev) => (reset ? data.entries : [...prev, ...data.entries]));
      setHasMore(data.has_more);
      setNextBefore(data.next_before);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : 'Network error loading ledger'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusToggle() {
    const action =
      summary.billing_status === 'suspended' ? 'reactivate' : 'suspend';
    const reason = window.prompt(
      `Reason for ${action === 'suspend' ? 'suspending' : 'reactivating'} this lab? (required, audit log)`
    );
    if (!reason || reason.trim().length < 3) {
      return; // canceled or too short
    }
    setStatusBusy(true);
    setStatusError(null);
    try {
      const res = await fetch('/api/admin/billing/suspend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lab_id: labId,
          action,
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusError(data.error || 'Failed to update status');
        return;
      }
      await loadLedger(true);
    } catch (e) {
      setStatusError(
        e instanceof Error ? e.message : 'Network error'
      );
    } finally {
      setStatusBusy(false);
    }
  }

  const reports = reportsAffordable(
    summary.balance_paise,
    summary.per_report_paise
  );
  const suspended = summary.billing_status === 'suspended';

  return (
    <div className="card p-6 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Wallet className="w-4 h-4" />
            Billing & Credits
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Round 7 credit-based billing. Distinct from operational status.
          </p>
        </div>
        <button
          onClick={() => loadLedger(true)}
          disabled={loading}
          className="text-xs text-gray-400 hover:text-gray-700 inline-flex items-center gap-1"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <SummaryTile
          label="Current balance"
          value={formatRupees(summary.balance_paise)}
          subtitle={
            !suspended
              ? `${reports} ${reports === 1 ? 'report' : 'reports'} affordable`
              : 'Suspended — no submissions allowed'
          }
          tone={
            suspended
              ? 'danger'
              : summary.balance_paise < summary.per_report_paise
              ? 'warning'
              : 'neutral'
          }
        />
        <SummaryTile
          label="Per-report price"
          value={formatRupees(summary.per_report_paise)}
          subtitle="Charged on each submission"
          tone="neutral"
        />
        <SummaryTile
          label="Billing status"
          value={summary.billing_status}
          subtitle={
            suspended ? 'Lab cannot submit' : 'Lab can submit reports'
          }
          tone={suspended ? 'danger' : 'success'}
        />
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 mb-2">
        <button
          onClick={() => setGrantOpen((v) => !v)}
          className="btn-secondary"
        >
          <Plus className="w-4 h-4" />
          Grant credits
        </button>
        <button
          onClick={() => setPriceOpen((v) => !v)}
          className="btn-secondary"
        >
          <Tag className="w-4 h-4" />
          Change price
        </button>
        <button
          onClick={handleStatusToggle}
          disabled={statusBusy}
          className={suspended ? 'btn-primary' : 'btn-danger'}
        >
          {statusBusy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Power className="w-4 h-4" />
          )}
          {suspended ? 'Reactivate billing' : 'Suspend billing'}
        </button>
      </div>
      {statusError && (
        <div className="text-xs text-red-600 mb-2">{statusError}</div>
      )}

      {grantOpen && (
        <GrantForm
          labId={labId}
          onClose={() => setGrantOpen(false)}
          onSuccess={() => {
            setGrantOpen(false);
            void loadLedger(true);
          }}
        />
      )}
      {priceOpen && (
        <PriceForm
          labId={labId}
          currentPricePaise={summary.per_report_paise}
          onClose={() => setPriceOpen(false)}
          onSuccess={() => {
            setPriceOpen(false);
            void loadLedger(true);
          }}
        />
      )}

      {/* Ledger */}
      <div className="mt-6 pt-6 border-t border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">
            Transaction history
          </h3>
          <span className="text-xs text-gray-400">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            {hasMore && ' (more available)'}
          </span>
        </div>

        {loadError && (
          <div className="text-sm text-red-600 mb-3">{loadError}</div>
        )}

        {loading && entries.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin inline-block" />
          </div>
        ) : entries.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            No transactions yet.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto -mx-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="px-6 py-2 font-medium">When</th>
                    <th className="px-6 py-2 font-medium">Description</th>
                    <th className="px-6 py-2 font-medium">Actor</th>
                    <th className="px-6 py-2 font-medium text-right">
                      Amount
                    </th>
                    <th className="px-6 py-2 font-medium text-right">
                      Balance after
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <AdminLedgerRow key={e.id} entry={e} />
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div className="mt-3 text-center">
                <button
                  onClick={() => loadLedger(false)}
                  disabled={loading}
                  className="text-xs text-brand-700 hover:text-brand-800 font-medium"
                >
                  {loading ? 'Loading...' : 'Load older'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  subtitle,
  tone,
}: {
  label: string;
  value: string;
  subtitle: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const toneClass = {
    neutral: 'bg-gray-50 border-gray-200',
    success: 'bg-green-50 border-green-200',
    warning: 'bg-yellow-50 border-yellow-200',
    danger: 'bg-red-50 border-red-200',
  }[tone];
  const valueClass = {
    neutral: 'text-gray-900',
    success: 'text-green-700',
    warning: 'text-yellow-800',
    danger: 'text-red-700',
  }[tone];
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">
        {label}
      </div>
      <div className={`text-xl font-bold mt-1 tabular-nums ${valueClass}`}>
        {value}
      </div>
      <div className="text-xs text-gray-600 mt-0.5">{subtitle}</div>
    </div>
  );
}

function GrantForm({
  labId,
  onClose,
  onSuccess,
}: {
  labId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amountRupees, setAmountRupees] = useState('500');
  const [reason, setReason] = useState<
    'trial_grant' | 'compensation' | 'manual_adjustment'
  >('trial_grant');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const amount = parseFloat(amountRupees);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a positive rupee amount');
      return;
    }
    const amount_paise = Math.round(amount * 100);
    if (amount_paise > 10000000) {
      setError('Maximum single grant is ₹1,00,000');
      return;
    }
    if (note.trim().length < 3) {
      setError('Note required (audit trail)');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/billing/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lab_id: labId,
          amount_paise,
          reason,
          note: note.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Grant failed (HTTP ${res.status})`);
        return;
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 p-4">
      <div className="text-sm font-semibold text-brand-900 mb-3">
        Grant credits
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <label className="block">
          <div className="text-xs text-gray-600 mb-1">Amount (₹)</div>
          <input
            type="number"
            min="1"
            step="0.01"
            className="input"
            value={amountRupees}
            onChange={(e) => setAmountRupees(e.target.value)}
          />
        </label>
        <label className="block">
          <div className="text-xs text-gray-600 mb-1">Reason</div>
          <select
            className="input"
            value={reason}
            onChange={(e) =>
              setReason(
                e.target.value as
                  | 'trial_grant'
                  | 'compensation'
                  | 'manual_adjustment'
              )
            }
          >
            <option value="trial_grant">Trial grant</option>
            <option value="compensation">Compensation</option>
            <option value="manual_adjustment">Manual adjustment</option>
          </select>
        </label>
      </div>
      <label className="block mb-3">
        <div className="text-xs text-gray-600 mb-1">
          Note (visible to lab in their ledger)
        </div>
        <input
          type="text"
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="e.g. Pilot onboarding for TEST01"
        />
      </label>
      {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={busy} className="btn-primary">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Grant
        </button>
        <button onClick={onClose} className="btn-secondary">
          Cancel
        </button>
      </div>
    </div>
  );
}

function PriceForm({
  labId,
  currentPricePaise,
  onClose,
  onSuccess,
}: {
  labId: string;
  currentPricePaise: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [priceRupees, setPriceRupees] = useState(
    (currentPricePaise / 100).toFixed(2)
  );
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const price = parseFloat(priceRupees);
    if (!Number.isFinite(price) || price < 1 || price > 50) {
      setError('Price must be between ₹1 and ₹50');
      return;
    }
    const new_price_paise = Math.round(price * 100);
    if (reason.trim().length < 3) {
      setError('Reason required (audit trail)');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/billing/set-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lab_id: labId,
          new_price_paise,
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Price change failed (HTTP ${res.status})`);
        return;
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 p-4">
      <div className="text-sm font-semibold text-brand-900 mb-3">
        Change per-report price
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <label className="block">
          <div className="text-xs text-gray-600 mb-1">New price (₹)</div>
          <input
            type="number"
            min="1"
            max="50"
            step="0.01"
            className="input"
            value={priceRupees}
            onChange={(e) => setPriceRupees(e.target.value)}
          />
          <div className="text-[11px] text-gray-500 mt-1">
            Current: {formatRupees(currentPricePaise)}
          </div>
        </label>
        <label className="block">
          <div className="text-xs text-gray-600 mb-1">
            Reason (audit only, not shown to lab)
          </div>
          <input
            type="text"
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="e.g. Pilot pricing agreement"
          />
        </label>
      </div>
      {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={busy} className="btn-primary">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Change price
        </button>
        <button onClick={onClose} className="btn-secondary">
          Cancel
        </button>
      </div>
    </div>
  );
}

function AdminLedgerRow({ entry }: { entry: LedgerEntry }) {
  const isCredit = entry.direction === 'credit';
  const sign = isCredit ? '+' : '−';
  const amountClass = isCredit ? 'text-green-700' : 'text-gray-900';
  const Icon = isCredit ? ArrowDownToLine : ArrowUpFromLine;
  const iconBg = isCredit
    ? 'bg-green-100 text-green-700'
    : 'bg-gray-100 text-gray-600';

  let primary: string;
  let secondary: string | null = null;
  switch (entry.reason) {
    case 'report_submission':
      primary = 'Report submitted';
      secondary = entry.metadata.form_name
        ? String(entry.metadata.form_name)
        : null;
      break;
    case 'trial_grant':
      primary = 'Trial credits granted';
      secondary = entry.metadata.note ? String(entry.metadata.note) : null;
      break;
    case 'compensation':
      primary = 'Compensation';
      secondary = entry.metadata.note ? String(entry.metadata.note) : null;
      break;
    case 'manual_adjustment':
      primary = 'Manual adjustment';
      secondary = entry.metadata.note ? String(entry.metadata.note) : null;
      break;
    case 'topup':
      primary = 'Top-up';
      secondary = entry.metadata.razorpay_order_id
        ? `Order ${String(entry.metadata.razorpay_order_id)}`
        : null;
      break;
    default:
      primary = entry.reason || 'Transaction';
  }

  // Actor display: "Lab" or "Admin (email)" — admins see admin email
  // here, unlike the lab self-view which strips it
  const actorDisplay =
    entry.actor_type === 'admin'
      ? entry.metadata.admin_email
        ? `Admin (${String(entry.metadata.admin_email)})`
        : 'Admin'
      : entry.actor_type === 'lab'
      ? 'Lab'
      : entry.actor_type;

  return (
    <tr className="border-b border-gray-50 last:border-b-0">
      <td className="px-6 py-2 text-gray-600 align-top whitespace-nowrap text-xs">
        {entry.created_at
          ? new Date(entry.created_at).toLocaleString('en-IN', {
              dateStyle: 'short',
              timeStyle: 'short',
            })
          : '—'}
      </td>
      <td className="px-6 py-2 align-top">
        <div className="flex items-start gap-2">
          <div
            className={`w-6 h-6 rounded flex items-center justify-center ${iconBg} flex-shrink-0`}
          >
            <Icon className="w-3 h-3" />
          </div>
          <div className="min-w-0">
            <div className="text-sm text-gray-900">{primary}</div>
            {secondary && (
              <div className="text-xs text-gray-500 truncate">{secondary}</div>
            )}
          </div>
        </div>
      </td>
      <td className="px-6 py-2 text-xs text-gray-500 align-top">
        {actorDisplay}
        {entry.actor_ip && entry.actor_ip !== 'unknown' && (
          <div className="font-mono text-[10px] text-gray-400">
            {entry.actor_ip}
          </div>
        )}
      </td>
      <td
        className={`px-6 py-2 text-right tabular-nums font-semibold align-top ${amountClass}`}
      >
        {sign}
        {formatRupees(entry.amount_paise)}
      </td>
      <td className="px-6 py-2 text-right tabular-nums text-gray-600 align-top text-sm">
        {formatRupees(entry.balance_after_paise)}
      </td>
    </tr>
  );
}
