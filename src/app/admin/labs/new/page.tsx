'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, AlertCircle, CheckCircle2, Copy, Eye, EyeOff } from 'lucide-react';

/**
 * The rep's main onboarding workflow. Designed to be filled out in
 * front of the lab owner during a sales visit.
 *
 * After submission, shows the credentials screen ONCE — rep must
 * write them down or share with lab owner immediately. Page can't
 * be re-loaded to recover the PIN.
 */
export default function NewLabPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    lab_id: string;
    lab_code: string;
    pin: string;
  } | null>(null);

  // Form fields
  const [labName, setLabName] = useState('');
  const [labCode, setLabCode] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [labAddress, setLabAddress] = useState('');
  const [labPhone, setLabPhone] = useState('');
  const [labEmail, setLabEmail] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [perReportRupees, setPerReportRupees] = useState('10');
  const [revSharePct, setRevSharePct] = useState('60');
  const [notes, setNotes] = useState('');

  // Round 9 Session D2 (Blocker A1): subscription plan picker
  const [subPlan, setSubPlan] = useState<
    '' | 'basic' | 'standard' | 'growth' | 'premium' | 'payg'
  >('');
  const [subCycle, setSubCycle] = useState<'monthly' | 'annual'>('monthly');
  const [paymentMethod, setPaymentMethod] = useState<
    'cash' | 'upi' | 'cheque' | 'bank_transfer'
  >('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [amountCollectedRupees, setAmountCollectedRupees] = useState('');

  function generateLabCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // skip ambiguous 0/O/1/I
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    setLabCode(result);
  }

  function generatePin() {
    // 6-digit numeric PIN — easier for lab owner to remember and type
    let p = '';
    for (let i = 0; i < 6; i++) p += Math.floor(Math.random() * 10);
    setPin(p);
    setShowPin(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    // Quick client validation
    if (!labName.trim() || labName.trim().length < 2) return setError('Lab name required');
    if (!/^[A-Z0-9-]{4,16}$/.test(labCode)) return setError('Lab code: 4-16 chars, A-Z, 0-9, hyphen only');
    if (pin.length < 6) return setError('PIN: minimum 6 characters');
    if (!labAddress.trim() || labAddress.trim().length < 5) return setError('Lab address required');
    if (!/^(\+?91)?[6-9]\d{9}$/.test(labPhone.replace(/\s/g, ''))) return setError('Invalid lab phone (10-digit Indian)');

    const perPaise = Math.round(parseFloat(perReportRupees) * 100);
    if (Number.isNaN(perPaise) || perPaise < 100 || perPaise > 10000) {
      return setError('Per-report price must be ₹1 - ₹100');
    }
    const sharePct = parseInt(revSharePct, 10);
    if (Number.isNaN(sharePct) || sharePct < 0 || sharePct > 100) {
      return setError('Revenue share must be 0-100%');
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/labs/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lab_name: labName.trim(),
          lab_code: labCode.toUpperCase(),
          pin,
          lab_address: labAddress.trim(),
          lab_phone: labPhone.replace(/\s/g, ''),
          lab_email: labEmail.trim() || undefined,
          owner_name: ownerName.trim() || undefined,
          owner_phone: ownerPhone.trim() || undefined,
          gst_number: gstNumber.trim() || undefined,
          per_report_paise: perPaise,
          rev_share_pct: sharePct,
          notes: notes.trim() || undefined,
          // Round 9 Session D2: subscription fields (optional)
          ...(subPlan
            ? {
                subscription_plan: subPlan,
                billing_cycle: subCycle,
                payment_method: paymentMethod,
                payment_reference: paymentReference.trim() || undefined,
                amount_collected_paise: amountCollectedRupees
                  ? Math.round(parseFloat(amountCollectedRupees) * 100)
                  : undefined,
              }
            : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to create lab');
        return;
      }
      setCreated({ lab_id: json.lab_id, lab_code: json.lab_code, pin: json.pin });
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return <CredentialsScreen
      labCode={created.lab_code}
      pin={created.pin}
      labName={labName}
      onContinue={() => router.push(`/admin/labs/${created.lab_id}` as never)}
    />;
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Onboard New Lab</h1>
      <p className="text-sm text-gray-500 mb-6">
        Fill these details with the lab owner. Credentials are shown only once after submitting — write them down or share securely.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Section title="Lab Identity">
          <Field label="Lab Name *">
            <input className="input" value={labName} onChange={(e) => setLabName(e.target.value)} placeholder="ABC Diagnostics" maxLength={120} />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Lab Code (printed on QR posters) *" hint="4-16 chars, uppercase letters/numbers only">
              <div className="flex gap-2">
                <input
                  className="input font-mono uppercase tracking-wider flex-1"
                  value={labCode}
                  onChange={(e) => setLabCode(e.target.value.toUpperCase())}
                  placeholder="MUM7K2"
                  maxLength={16}
                />
                <button type="button" onClick={generateLabCode} className="btn-secondary whitespace-nowrap">Generate</button>
              </div>
            </Field>
            <Field label="PIN (lab uses to log in) *" hint="Minimum 6 characters. Lab can rotate later.">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    className="input font-mono"
                    type={showPin ? 'text' : 'password'}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="••••••"
                    maxLength={64}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((s) => !s)}
                    className="absolute right-2 top-2 text-gray-400 hover:text-gray-700"
                  >
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button type="button" onClick={generatePin} className="btn-secondary whitespace-nowrap">Generate</button>
              </div>
            </Field>
          </div>
        </Section>

        <Section title="Contact Details">
          <Field label="Lab Address *">
            <textarea className="input min-h-[60px]" value={labAddress} onChange={(e) => setLabAddress(e.target.value)} placeholder="Shop 12, Andheri East, Mumbai 400069" maxLength={300} />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Lab Phone *">
              <input className="input font-mono" type="tel" value={labPhone} onChange={(e) => setLabPhone(e.target.value)} placeholder="9876543210" maxLength={13} />
            </Field>
            <Field label="Lab Email (optional)">
              <input className="input" type="email" value={labEmail} onChange={(e) => setLabEmail(e.target.value)} placeholder="contact@labname.com" maxLength={120} />
            </Field>
          </div>
        </Section>

        <Section title="Owner & Business Details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Owner Name">
              <input className="input" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} maxLength={80} />
            </Field>
            <Field label="Owner Phone">
              <input className="input font-mono" type="tel" value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} placeholder="9876543210" maxLength={13} />
            </Field>
            <Field label="GST Number" hint="Optional. For invoicing.">
              <input className="input font-mono uppercase" value={gstNumber} onChange={(e) => setGstNumber(e.target.value.toUpperCase())} maxLength={20} />
            </Field>
          </div>
        </Section>

        <Section title="Pricing Terms">
          <p className="text-xs text-gray-500 mb-3">
            Lab adds this surcharge to each report bill. Revenue share decides how much we keep.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Per-report price (₹)" hint="Default ₹10. Cap ₹100.">
              <input className="input" type="number" value={perReportRupees} onChange={(e) => setPerReportRupees(e.target.value)} min={1} max={100} />
            </Field>
            <Field label="Our share (%)" hint="Default 60% (we keep ₹6 of each ₹10).">
              <input className="input" type="number" value={revSharePct} onChange={(e) => setRevSharePct(e.target.value)} min={0} max={100} />
            </Field>
          </div>
          <div className="text-sm text-gray-700 bg-gray-100 rounded-lg p-3 mt-3">
            <strong>Lab keeps:</strong> ₹{((parseFloat(perReportRupees) || 0) * (1 - (parseInt(revSharePct, 10) || 0) / 100)).toFixed(2)} per report.{' '}
            <strong>We keep:</strong> ₹{((parseFloat(perReportRupees) || 0) * ((parseInt(revSharePct, 10) || 0) / 100)).toFixed(2)} per report.
          </div>
        </Section>

        <Section title="Subscription Plan (optional)">
          <p className="text-xs text-gray-500 mb-3">
            If the lab paid the first month/year during this visit, pick
            their plan now. Otherwise leave as <em>None</em> and admin
            can record payment later via the lab&apos;s detail page.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Plan" hint="Skip if lab hasn't paid yet.">
              <select
                className="input"
                value={subPlan}
                onChange={(e) => setSubPlan(e.target.value as typeof subPlan)}
              >
                <option value="">— None (record payment later) —</option>
                <option value="basic">Basic — ₹1,000/mo · 300 reports</option>
                <option value="standard">Standard — ₹1,500/mo · 500 reports</option>
                <option value="growth">Growth — ₹4,000/mo · 1,000 reports</option>
                <option value="premium">Premium — ₹8,000/mo · 2,500 reports</option>
                <option value="payg">Pay-as-you-go — ₹5/report</option>
              </select>
            </Field>
            {subPlan && (
              <Field label="Billing cycle">
                <select
                  className="input"
                  value={subCycle}
                  onChange={(e) => setSubCycle(e.target.value as 'monthly' | 'annual')}
                >
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual (15% off)</option>
                </select>
              </Field>
            )}
          </div>
          {subPlan && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
              <Field label="Payment method">
                <select
                  className="input"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="cheque">Cheque</option>
                  <option value="bank_transfer">Bank transfer</option>
                </select>
              </Field>
              <Field label="Reference (optional)" hint="Cheque #, UPI txn ID, etc.">
                <input
                  className="input"
                  type="text"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  maxLength={100}
                />
              </Field>
              <Field label="Amount collected (₹)" hint="Defaults to plan price.">
                <input
                  className="input"
                  type="number"
                  value={amountCollectedRupees}
                  onChange={(e) => setAmountCollectedRupees(e.target.value)}
                  min={0}
                  placeholder="auto"
                />
              </Field>
            </div>
          )}
        </Section>

        <Section title="Notes (optional)">
          <textarea
            className="input min-h-[60px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything to remember — referral source, follow-up date, special terms..."
            maxLength={500}
          />
        </Section>

        {error && (
          <div className="card border-red-200 bg-red-50 p-3 text-sm text-danger flex gap-2 items-start">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => router.back()} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={submitting} className="btn-primary flex-1">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? 'Creating lab...' : 'Create Lab'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

function CredentialsScreen({ labCode, pin, labName, onContinue }: {
  labCode: string; pin: string; labName: string; onContinue: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="card p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <CheckCircle2 className="w-14 h-14 text-success mb-3" />
          <h1 className="text-2xl font-bold text-gray-900">Lab Created</h1>
          <p className="text-sm text-gray-500 mt-1">{labName}</p>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-5 text-sm">
          <strong className="text-yellow-900">⚠ Save these now.</strong>
          <p className="text-yellow-800 mt-1">
            The PIN cannot be shown again. Write it down or share with the lab owner via secure channel
            before leaving this page.
          </p>
        </div>

        <div className="space-y-3 mb-6">
          <CredField label="Lab Code" value={labCode} mono onCopy={() => copy(labCode, 'code')} copied={copied === 'code'} />
          <CredField label="PIN" value={pin} mono onCopy={() => copy(pin, 'pin')} copied={copied === 'pin'} />
          <CredField label="Login URL" value="https://labs.rakshsetu.com" onCopy={() => copy('https://labs.rakshsetu.com', 'url')} copied={copied === 'url'} />
        </div>

        <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-4 mb-5">
          <p className="font-semibold mb-1">Tell the lab owner:</p>
          <p>1. Open <strong>labs.rakshsetu.com</strong> on their phone or computer.</p>
          <p>2. Sign in with the lab code and PIN above.</p>
          <p>3. Click <strong>New Report</strong> to start sending reports.</p>
        </div>

        <button onClick={onContinue} className="btn-primary w-full">
          Continue to Lab Details
        </button>
      </div>
    </div>
  );
}

function CredField({ label, value, mono, onCopy, copied }: {
  label: string; value: string; mono?: boolean; onCopy: () => void; copied: boolean;
}) {
  return (
    <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-500 font-medium mb-0.5">{label}</div>
        <div className={`text-base font-semibold ${mono ? 'font-mono' : ''} truncate`}>{value}</div>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className={`btn-secondary ${copied ? 'text-success' : ''}`}
        title="Copy"
      >
        <Copy className="w-4 h-4" /> {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}
