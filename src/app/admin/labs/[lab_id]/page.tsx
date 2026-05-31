'use client';

import { useEffect, useState, use as usePromise } from 'react';
import Link from 'next/link';
import { Loader2, AlertCircle, ArrowLeft, KeyRound, Power, AlertTriangle } from 'lucide-react';
import AdminBillingPanel from './AdminBillingPanel';
import SubscriptionPanel from './SubscriptionPanel';

interface LabDetail {
  lab_id: string;
  lab_code: string;
  lab_name: string;
  lab_address: string;
  lab_phone: string;
  lab_email: string;
  owner_name: string;
  owner_phone: string;
  gst_number: string;
  plan: string;
  per_report_paise: number;
  rev_share_pct: number;
  // Round 7 billing
  credit_balance: number;
  billing_status: string;
  owned_by_staff_id: string;
  owned_by_staff_name: string;
  notes: string;
  status: 'pending' | 'active' | 'suspended';
  created_at: string | null;
  last_login_at: string | null;
}

interface LabMetrics {
  reports_last_7d: number;
  reports_last_30d: number;
  reports_lifetime: number;
  critical_count_30d: number;
  warning_count_30d: number;
  revenue_30d_paise: number;
  revenue_lifetime_paise: number;
}

export default function LabDetailPage({ params }: { params: Promise<{ lab_id: string }> }) {
  const { lab_id } = usePromise(params);
  const [lab, setLab] = useState<LabDetail | null>(null);
  const [metrics, setMetrics] = useState<LabMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showResetPin, setShowResetPin] = useState(false);

  useEffect(() => { void load(); }, [lab_id]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/labs/${lab_id}/detail`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to load');
        return;
      }
      setLab(json.lab);
      setMetrics(json.metrics);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  async function setStatus(newStatus: 'active' | 'suspended' | 'pending') {
    if (!lab) return;
    const ok = window.confirm(`Change status to "${newStatus}"?`);
    if (!ok) return;
    const res = await fetch(`/api/admin/labs/${lab_id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    const json = await res.json();
    if (!res.ok) {
      window.alert(json.error || 'Failed');
      return;
    }
    void load();
  }

  if (loading) {
    return (
      <div className="p-8">
        <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
      </div>
    );
  }
  if (error || !lab || !metrics) {
    return (
      <div className="p-8">
        <div className="card border-red-200 bg-red-50 p-4 text-sm text-danger flex gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error || 'Lab not found'}
        </div>
      </div>
    );
  }

  const perReport = lab.per_report_paise / 100;
  const ourCut = perReport * lab.rev_share_pct / 100;
  const labCut = perReport - ourCut;

  return (
    <div className="p-8 max-w-5xl">
      <Link href="/admin/labs" className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 mb-3">
        <ArrowLeft className="w-4 h-4" /> Back to labs
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{lab.lab_name}</h1>
            <StatusBadge status={lab.status} />
          </div>
          <div className="text-sm text-gray-600 mt-1">
            <span className="font-mono font-semibold">{lab.lab_code}</span>
            {lab.owned_by_staff_name && <> · Onboarded by {lab.owned_by_staff_name}</>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowResetPin(true)} className="btn-secondary">
            <KeyRound className="w-4 h-4" /> Reset PIN
          </button>
          {lab.status === 'pending' && (
            <button onClick={() => setStatus('active')} className="btn-primary">
              <Power className="w-4 h-4" /> Activate
            </button>
          )}
          {lab.status === 'active' && (
            <button onClick={() => setStatus('suspended')} className="btn-danger">
              <Power className="w-4 h-4" /> Suspend
            </button>
          )}
          {lab.status === 'suspended' && (
            <button onClick={() => setStatus('active')} className="btn-primary">
              <Power className="w-4 h-4" /> Reactivate
            </button>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label="Reports (7d)" value={metrics.reports_last_7d} />
        <Stat label="Reports (30d)" value={metrics.reports_last_30d} />
        <Stat label="Lifetime" value={metrics.reports_lifetime} />
        <Stat label="Revenue (30d)" value={`₹${(metrics.revenue_30d_paise / 100).toLocaleString('en-IN')}`} />
      </div>

      {(metrics.critical_count_30d > 0 || metrics.warning_count_30d > 0) && (
        <div className="card p-4 mb-6 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-warning" />
          <div className="text-sm text-gray-700">
            <strong>Last 30 days:</strong> {metrics.critical_count_30d} critical, {metrics.warning_count_30d} warning reports
          </div>
        </div>
      )}

      {/* Round 9: subscription tier panel — admin records cash/UPI
          payments to activate or extend lab's plan. Sits ABOVE the
          legacy credit-balance panel because subscription is the
          primary billing model going forward. */}
      <SubscriptionPanel labId={lab.lab_id} />

      {/* Round 7: credit-based billing panel — grant, change price,
          suspend/reactivate billing-side, ledger view.
          Kept for backward compat; will be removed once all labs
          are confirmed on subscription model. */}
      <AdminBillingPanel
        labId={lab.lab_id}
        initialBalancePaise={lab.credit_balance}
        initialPricePaise={lab.per_report_paise}
        initialBillingStatus={lab.billing_status}
      />

      {/* Pricing */}
      <Card title="Pricing">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs text-gray-500">Per Report</div>
            <div className="font-bold text-lg">₹{perReport.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Lab Keeps</div>
            <div className="font-bold text-lg text-gray-700">₹{labCut.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">We Keep</div>
            <div className="font-bold text-lg text-success">₹{ourCut.toFixed(2)}</div>
          </div>
        </div>
        <div className="mt-3 text-xs text-gray-500">
          Plan: <span className="font-medium uppercase">{lab.plan}</span>
        </div>
      </Card>

      {/* Contact */}
      <Card title="Contact & Address">
        <Row label="Address" value={lab.lab_address} />
        <Row label="Phone" value={lab.lab_phone} mono />
        {lab.lab_email && <Row label="Email" value={lab.lab_email} />}
      </Card>

      {/* Owner */}
      {(lab.owner_name || lab.owner_phone || lab.gst_number) && (
        <Card title="Business Details">
          {lab.owner_name && <Row label="Owner" value={lab.owner_name} />}
          {lab.owner_phone && <Row label="Owner Phone" value={lab.owner_phone} mono />}
          {lab.gst_number && <Row label="GST Number" value={lab.gst_number} mono />}
        </Card>
      )}

      {lab.notes && (
        <Card title="Notes">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{lab.notes}</p>
        </Card>
      )}

      {/* Activity */}
      <Card title="Activity">
        <Row label="Created" value={fmtDate(lab.created_at)} />
        <Row label="Last login" value={fmtDate(lab.last_login_at) || 'Never logged in'} />
      </Card>

      {showResetPin && (
        <ResetPinModal
          labId={lab_id}
          labName={lab.lab_name}
          onClose={() => setShowResetPin(false)}
        />
      )}
    </div>
  );
}

function ResetPinModal({ labId, labName, onClose }: { labId: string; labName: string; onClose: () => void }) {
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function generate() {
    let p = '';
    for (let i = 0; i < 6; i++) p += Math.floor(Math.random() * 10);
    setPin(p);
  }

  async function submit() {
    if (pin.length < 6) return setError('PIN min 6 chars');
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/labs/${labId}/reset-pin`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ new_pin: pin }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed');
        return;
      }
      setDone(json.new_pin);
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="card max-w-md w-full p-6">
        <h3 className="font-bold text-lg">Reset PIN for {labName}</h3>
        {done ? (
          <>
            <p className="text-sm text-gray-600 mt-2 mb-4">New PIN. Save now — won&apos;t be shown again.</p>
            <div className="bg-gray-100 rounded-lg p-4 text-center font-mono text-2xl font-bold mb-4">{done}</div>
            <button onClick={onClose} className="btn-primary w-full">Done</button>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600 mt-2 mb-4">
              Old PIN will stop working immediately. Share the new one with lab owner via secure channel.
            </p>
            <div className="flex gap-2 mb-3">
              <input
                className="input flex-1 font-mono"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="New PIN (min 6)"
                maxLength={64}
                autoFocus
              />
              <button onClick={generate} className="btn-secondary">Generate</button>
            </div>
            {error && <div className="text-sm text-danger mb-3">{error}</div>}
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button onClick={submit} disabled={submitting} className="btn-primary flex-1">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Reset PIN
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5 mb-4">
      <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}
function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between py-1.5 text-sm border-b border-gray-100 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className={`text-gray-900 ${mono ? 'font-mono' : ''} text-right`}>{value || '—'}</span>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-gray-500 font-medium">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
    </div>
  );
}
function StatusBadge({ status }: { status: string }) {
  const cls = {
    active: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    suspended: 'bg-red-100 text-red-800',
  }[status] || 'bg-gray-100 text-gray-800';
  return <span className={`pill ${cls} uppercase text-xs`}>{status}</span>;
}
function fmtDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}
