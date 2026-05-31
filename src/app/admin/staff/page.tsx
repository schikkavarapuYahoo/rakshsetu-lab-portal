'use client';

import { useEffect, useState } from 'react';
import { Plus, Loader2, Copy, CheckCircle2, Users } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface StaffRow {
  staff_id: string;
  email: string;
  display_name: string;
  role: 'admin' | 'rep';
  territory: string;
  phone: string;
  status: string;
  labs_owned: number;
  last_login_at: string | null;
  created_at: string | null;
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/staff');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed');
        return;
      }
      setStaff(json.staff || []);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Staff</h1>
          <p className="mt-1 text-sm text-neutral-500">Field reps and admins.</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600"
        >
          <Plus className="h-4 w-4" /> Add Staff
        </button>
      </div>

      {error && (
        <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>
      )}

      {loading ? (
        <div className="py-12 text-center text-neutral-500">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand-500" />
        </div>
      ) : staff.length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="mx-auto mb-2 h-10 w-10 text-neutral-300" />
          <p className="mb-3 text-neutral-500">No staff yet besides you.</p>
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            <Plus className="h-4 w-4" /> Add your first rep
          </button>
        </Card>
      ) : (
        <Card className="divide-y divide-neutral-100 overflow-hidden p-0">
          {staff.map((s) => (
            <div key={s.staff_id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-neutral-50">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                {s.display_name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{s.display_name}</span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${s.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                    {s.role}
                  </span>
                </div>
                <div className="truncate text-sm text-neutral-600">{s.email}</div>
                {(s.territory || s.phone) && (
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {s.territory && <span>{s.territory}</span>}
                    {s.territory && s.phone && ' · '}
                    {s.phone && <span className="font-mono">{s.phone}</span>}
                  </div>
                )}
              </div>
              <div className="text-right whitespace-nowrap">
                <div className="text-sm font-semibold text-neutral-900">{s.labs_owned} labs</div>
                <div className="text-xs text-neutral-500">
                  {s.last_login_at ? `Active ${fmtAgo(s.last_login_at)}` : 'Never logged in'}
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}

      {showNew && <NewStaffModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); void load(); }} />}
    </div>
  );
}

function NewStaffModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'rep' | 'admin'>('rep');
  const [territory, setTerritory] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function generatePassword() {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let p = '';
    for (let i = 0; i < 12; i++) p += chars[Math.floor(Math.random() * chars.length)];
    setPassword(p);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (password.length < 10) return setError('Password min 10 chars');
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          display_name: displayName.trim(),
          role,
          territory: territory.trim() || undefined,
          phone: phone.trim() || undefined,
          password,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed');
        return;
      }
      setCreated({ email: email.trim().toLowerCase(), password });
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  const primaryBtn = "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-60";
  const secondaryBtn = "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="max-h-[90vh] w-full max-w-md overflow-y-auto p-6">
        {created ? (
          <>
            <CheckCircle2 className="mb-3 h-12 w-12 text-green-600" />
            <h3 className="mb-1 text-lg font-bold">Staff Created</h3>
            <p className="mb-4 text-sm text-neutral-600">
              Share these credentials with the new hire. Password won&apos;t be shown again.
            </p>
            <div className="mb-4 space-y-2 rounded-lg bg-neutral-100 p-4 text-sm">
              <div><strong>Email:</strong> {created.email}</div>
              <div className="flex items-center gap-2">
                <strong>Password:</strong>
                <code className="rounded bg-white px-2 py-0.5">{created.password}</code>
                <button
                  type="button"
                  className={`${secondaryBtn} h-7 px-2 text-xs`}
                  onClick={() => {
                    navigator.clipboard.writeText(created.password);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  <Copy className="h-3 w-3" /> {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="mt-2 text-xs text-neutral-500">
                URL: <strong>https://labs.rakshsetu.com/staff-login</strong>
              </div>
            </div>
            <button onClick={() => { setCreated(null); onCreated(); }} className={`${primaryBtn} w-full`}>Done</button>
          </>
        ) : (
          <form onSubmit={submit}>
            <h3 className="mb-4 text-lg font-bold">Add Staff Member</h3>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="staff-email">Email *</Label>
                <Input id="staff-email" className="h-10" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rep@rakshsetu.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staff-name">Display Name *</Label>
                <Input id="staff-name" className="h-10" required minLength={2} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ramesh Kumar" />
              </div>
              <div className="space-y-1.5">
                <Label>Role *</Label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setRole('rep')} className={`inline-flex h-9 flex-1 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors ${role === 'rep' ? 'border-brand-500 bg-brand-500 text-white' : 'border-border bg-background text-neutral-700 hover:bg-muted'}`}>Sales Rep</button>
                  <button type="button" onClick={() => setRole('admin')} className={`inline-flex h-9 flex-1 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors ${role === 'admin' ? 'border-brand-500 bg-brand-500 text-white' : 'border-border bg-background text-neutral-700 hover:bg-muted'}`}>Admin</button>
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  {role === 'rep' ? 'Sees only labs they onboard. Cannot change pricing.' : 'Full access to all labs and staff.'}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staff-territory">Territory (optional)</Label>
                <Input id="staff-territory" className="h-10" value={territory} onChange={(e) => setTerritory(e.target.value)} placeholder="Mumbai West" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staff-phone">Phone (optional)</Label>
                <Input id="staff-phone" className="h-10 font-mono" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staff-password">Initial Password *</Label>
                <div className="flex gap-2">
                  <Input id="staff-password" className="h-10 flex-1 font-mono" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} placeholder="Min 10 chars" />
                  <button type="button" onClick={generatePassword} className={secondaryBtn}>Generate</button>
                </div>
                <p className="mt-1 text-xs text-neutral-500">Tell them to change it after first login.</p>
              </div>
            </div>
            {error && <div className="mt-3 text-sm text-red-700">{error}</div>}
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={onClose} className={`${secondaryBtn} flex-1`}>Cancel</button>
              <button type="submit" disabled={submitting} className={`${primaryBtn} flex-1`}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Create
              </button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

function fmtAgo(iso: string): string {
  try {
    const t = new Date(iso);
    const diffMs = Date.now() - t.getTime();
    const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return `${Math.floor(days / 30)}mo ago`;
  } catch { return ''; }
}
