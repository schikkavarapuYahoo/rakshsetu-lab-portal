'use client';

import { useEffect, useState } from 'react';
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Plus,
  Loader2,
  Calendar,
  TrendingUp,
  History,
  IndianRupee,
} from 'lucide-react';
import { formatRupees } from '@/lib/paise';
import {
  TIERS,
  SubscriptionTier,
  BillingCycle,
  SubscriptionState,
  getTier,
  getTierPrice,
} from '@/lib/subscription_tiers';
import type { SubscriptionStatus } from '@/server/billing/subscription_state';

/**
 * Admin subscription panel — embedded into /admin/labs/[lab_id].
 *
 * Renders three sections:
 *   1. Status header — current plan, state pill, days remaining,
 *      usage progress bar
 *   2. Record payment button + modal (admin records a cash/UPI/cheque
 *      payment, which activates or extends the subscription)
 *   3. History list — chronological subscription_history entries
 *      with payment refs for audit
 *
 * Round 9 Session A.5.
 */

interface HistoryEntry {
  id: string;
  event_type: string;
  from_plan: string | null;
  to_plan: string;
  from_billing_cycle: string | null;
  to_billing_cycle: string;
  amount_received_paise: number;
  expected_price_paise: number;
  amount_matches_expected: boolean;
  payment_method: string;
  payment_reference: string;
  effective_from: string | null;
  effective_until: string | null;
  notes: string;
  actor_role: string;
  actor_name: string;
  created_at: string | null;
}

interface SubscriptionApiResponse {
  status: SubscriptionStatus;
  history: HistoryEntry[];
  tiers: typeof TIERS;
}

export default function SubscriptionPanel({ labId }: { labId: string }) {
  const [data, setData] = useState<SubscriptionApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/labs/${labId}/subscription`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to load');
        return;
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labId]);

  if (loading) {
    return (
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading subscription...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-2 text-red-600">
          <AlertTriangle className="w-4 h-4" />
          <span>{error || 'Could not load subscription details'}</span>
        </div>
      </div>
    );
  }

  const { status, history } = data;

  return (
    <div className="card p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <CreditCard className="w-4 h-4" />
          Subscription
        </h3>
        <button
          type="button"
          onClick={() => setShowPaymentModal(true)}
          className="btn btn-primary text-sm flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          Record payment
        </button>
      </div>

      <SubscriptionStatusBlock status={status} />

      {history.length > 0 && (
        <SubscriptionHistoryList history={history} />
      )}

      {showPaymentModal && (
        <RecordPaymentModal
          labId={labId}
          currentStatus={status}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={() => {
            setShowPaymentModal(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Status block — shows current state, plan, usage
 * ───────────────────────────────────────────── */

function SubscriptionStatusBlock({ status }: { status: SubscriptionStatus }) {
  const stateConfig: Record<
    SubscriptionState,
    { icon: React.ReactNode; pillClass: string; label: string }
  > = {
    unset: {
      icon: <AlertTriangle className="w-4 h-4" />,
      pillClass: 'bg-gray-100 text-gray-700',
      label: 'No plan assigned',
    },
    active: {
      icon: <CheckCircle2 className="w-4 h-4" />,
      pillClass: 'bg-green-100 text-green-800',
      label: 'Active',
    },
    active_overage: {
      icon: <TrendingUp className="w-4 h-4" />,
      pillClass: 'bg-orange-100 text-orange-800',
      label: 'Active (overage)',
    },
    grace_period: {
      icon: <AlertTriangle className="w-4 h-4" />,
      pillClass: 'bg-yellow-100 text-yellow-800',
      label: 'Grace period',
    },
    suspended_readonly: {
      icon: <Lock className="w-4 h-4" />,
      pillClass: 'bg-red-100 text-red-800',
      label: 'Suspended',
    },
  };
  const currentConfig = stateConfig[status.state];

  const tier = status.tier ? getTier(status.tier) : null;
  const usagePct =
    status.monthly_cap === null
      ? 0
      : Math.min(100, Math.round((status.reports_used / status.monthly_cap) * 100));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`pill ${currentConfig.pillClass} flex items-center gap-1.5`}>
            {currentConfig.icon}
            {currentConfig.label}
          </span>
          {tier && (
            <span className="text-sm text-gray-700 font-medium">
              {tier.display_name}
              {status.billing_cycle && (
                <span className="text-gray-400 ml-1">
                  ({status.billing_cycle})
                </span>
              )}
            </span>
          )}
        </div>
        {status.days_remaining !== null && (
          <div className="text-sm text-gray-600 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {status.days_remaining > 0
              ? `${status.days_remaining} day(s) remaining`
              : `Expired ${-status.days_remaining} day(s) ago`}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500">{status.description}</p>

      {tier && status.monthly_cap !== null && (
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Reports this period</span>
            <span>
              {status.reports_used} / {status.monthly_cap}
              {status.reports_overage > 0 && (
                <span className="text-orange-600 ml-1">
                  (+{status.reports_overage} overage)
                </span>
              )}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                usagePct >= 100
                  ? 'bg-orange-500'
                  : usagePct >= 80
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
              }`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
          {status.reports_overage > 0 && (
            <div className="text-xs text-orange-700 mt-1.5">
              Overage: {status.reports_overage} × ₹5 ={' '}
              {formatRupees(status.reports_overage * 500)} owed at next settlement
            </div>
          )}
        </div>
      )}

      {tier && status.monthly_cap === null && (
        <div className="text-xs text-gray-600">
          Pay-as-you-go: {status.reports_used} reports this period @ ₹5/report ={' '}
          {formatRupees(status.reports_used * 500)}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
 * History list — payment audit
 * ───────────────────────────────────────────── */

function SubscriptionHistoryList({ history }: { history: HistoryEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? history : history.slice(0, 3);

  return (
    <div className="mt-5 pt-4 border-t border-gray-100">
      <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
        <History className="w-3.5 h-3.5" />
        Payment history
      </h4>
      <div className="space-y-2">
        {visible.map((h) => (
          <HistoryRow key={h.id} entry={h} />
        ))}
      </div>
      {history.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-xs text-blue-600 hover:underline mt-2"
        >
          {expanded ? 'Show less' : `Show ${history.length - 3} more`}
        </button>
      )}
    </div>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  return (
    <div className="text-xs p-2.5 bg-gray-50 rounded border border-gray-100">
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1">
          <div className="font-medium text-gray-900">
            {entry.event_type === 'extended' ? 'Extended' : 'Activated'}{' '}
            {entry.to_plan} ({entry.to_billing_cycle})
          </div>
          <div className="text-gray-500 mt-0.5">
            {entry.payment_method.toUpperCase()} · {entry.payment_reference}
            {!entry.amount_matches_expected && (
              <span className="ml-1.5 text-orange-600 font-medium">
                · amount differs from list price
              </span>
            )}
          </div>
          {entry.notes && (
            <div className="text-gray-600 mt-1 italic">{entry.notes}</div>
          )}
          <div className="text-gray-400 mt-0.5">
            By {entry.actor_name || 'admin'} · {fmtDate(entry.created_at)}
          </div>
        </div>
        <div className="text-right">
          <div className="font-semibold text-gray-900 flex items-center justify-end">
            <IndianRupee className="w-3 h-3" />
            {(entry.amount_received_paise / 100).toLocaleString('en-IN')}
          </div>
          {entry.effective_until && (
            <div className="text-gray-500">
              valid till {fmtDate(entry.effective_until, true)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Record payment modal
 * ───────────────────────────────────────────── */

function RecordPaymentModal({
  labId,
  currentStatus,
  onClose,
  onSuccess,
}: {
  labId: string;
  currentStatus: SubscriptionStatus;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [tier, setTier] = useState<SubscriptionTier>(
    currentStatus.tier ?? 'basic',
  );
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    currentStatus.billing_cycle ?? 'monthly',
  );
  const [paymentMethod, setPaymentMethod] = useState<
    'cash' | 'upi' | 'cheque' | 'bank_transfer' | 'other'
  >('upi');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const expectedPricePaise = getTierPrice(tier, billingCycle);
  const [amountPaise, setAmountPaise] = useState<number>(expectedPricePaise);

  // When tier or cycle changes, default the amount to the list price.
  // Admin can override if there's a negotiated discount or partial payment.
  useEffect(() => {
    setAmountPaise(getTierPrice(tier, billingCycle));
  }, [tier, billingCycle]);

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/admin/labs/${labId}/subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier,
          billing_cycle: billingCycle,
          amount_received_paise: amountPaise,
          payment_method: paymentMethod,
          payment_reference: reference.trim(),
          notes: notes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.error || 'Failed to record payment');
        return;
      }
      onSuccess();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    reference.trim().length > 0 &&
    amountPaise >= 0 &&
    !submitting;

  const amountRupees = (amountPaise / 100).toFixed(0);
  const expectedRupees = (expectedPricePaise / 100).toFixed(0);
  const amountMatches = amountPaise === expectedPricePaise;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-100">
          <h3 className="font-semibold text-lg text-gray-900">
            Record payment
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Lab paid offline (cash / UPI / cheque). Activate or extend their
            subscription.
          </p>
        </div>

        <div className="p-5 space-y-4">
          {/* Tier selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Plan
            </label>
            <div className="grid grid-cols-1 gap-2">
              {TIERS.map((t) => {
                const selected = tier === t.id;
                const monthlyRupees = (t.monthly_price_paise / 100).toFixed(0);
                const annualRupees = (t.annual_price_paise / 100).toFixed(0);
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => setTier(t.id)}
                    className={`text-left p-3 rounded border-2 transition-colors ${
                      selected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-gray-900">
                          {t.display_name}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {t.recommended_for_volume} ·{' '}
                          {t.monthly_report_cap === null
                            ? 'unlimited'
                            : `${t.monthly_report_cap} reports/month`}
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        {t.id === 'payg' ? (
                          <span className="text-gray-600">₹5/report</span>
                        ) : (
                          <>
                            <div className="font-semibold text-gray-900">
                              ₹{monthlyRupees}/mo
                            </div>
                            <div className="text-xs text-gray-500">
                              ₹{annualRupees}/yr
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Billing cycle */}
          {tier !== 'payg' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Billing cycle
              </label>
              <div className="flex gap-2">
                {(['monthly', 'annual'] as BillingCycle[]).map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setBillingCycle(c)}
                    className={`flex-1 px-3 py-2 rounded border-2 text-sm font-medium transition-colors capitalize ${
                      billingCycle === c
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    {c}
                    {c === 'annual' && (
                      <span className="block text-xs text-green-600 font-normal">
                        Save 15%
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Amount received (₹)
            </label>
            <input
              type="number"
              min="0"
              max="100000"
              step="1"
              value={amountRupees}
              onChange={(e) =>
                setAmountPaise(Math.round(Number(e.target.value) * 100))
              }
              className="input w-full"
            />
            {!amountMatches && tier !== 'payg' && (
              <p className="text-xs text-orange-600 mt-1">
                Differs from list price (₹{expectedRupees}). This will be flagged in audit.
              </p>
            )}
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment method
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['upi', 'cash', 'cheque', 'bank_transfer', 'other'] as const).map(
                (m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    className={`px-2 py-2 rounded border-2 text-xs font-medium transition-colors capitalize ${
                      paymentMethod === m
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    {m.replace('_', ' ')}
                  </button>
                ),
              )}
            </div>
          </div>

          {/* Reference */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment reference *
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={
                paymentMethod === 'upi'
                  ? 'UPI transaction ID'
                  : paymentMethod === 'cheque'
                  ? 'Cheque number'
                  : paymentMethod === 'bank_transfer'
                  ? 'NEFT/IMPS/RTGS reference'
                  : 'Receipt number or note'
              }
              className="input w-full"
              maxLength={200}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. negotiated 10% discount, paid in cash to Ravi at lab visit"
              rows={2}
              maxLength={500}
              className="input w-full resize-none"
            />
          </div>

          {submitError && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="btn btn-primary flex items-center gap-1.5"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Record &amp; activate
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────── */

function fmtDate(iso: string | null, dateOnly = false): string {
  if (!iso) return '—';
  try {
    const date = new Date(iso);
    if (dateOnly) {
      return date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    }
    return date.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}
