'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, Plus, FlaskConical, Loader2 } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface LabRow {
  lab_id: string;
  lab_code: string;
  lab_name: string;
  lab_phone: string;
  lab_address: string;
  status: 'pending' | 'active' | 'suspended';
  per_report_paise: number;
  rev_share_pct: number;
  owned_by_staff_name: string;
  created_at: string | null;
}

export default function LabsListPage() {
  const [labs, setLabs] = useState<LabRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const url = `/api/admin/labs${search ? `?search=${encodeURIComponent(search)}` : ''}`;
        const res = await fetch(url);
        const json = await res.json();
        if (cancel) return;
        if (!res.ok) {
          setError(json.error || 'Failed to load');
          return;
        }
        setLabs(json.labs || []);
      } catch {
        if (!cancel) setError('Network error');
      } finally {
        if (!cancel) setLoading(false);
      }
    }, search ? 250 : 0);
    return () => { cancel = true; clearTimeout(t); };
  }, [search]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Labs</h1>
          <p className="mt-1 text-sm text-neutral-500">
            All labs you can manage. Click any row to view details.
          </p>
        </div>
        <Link
          href="/admin/labs/new"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600"
        >
          <Plus className="h-4 w-4" /> Onboard Lab
        </Link>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <Input
          type="search"
          placeholder="Search by name, code, phone, address..."
          className="h-10 pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && (
        <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </Card>
      )}

      {loading ? (
        <div className="py-12 text-center text-neutral-500">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
        </div>
      ) : labs.length === 0 ? (
        <Card className="p-12 text-center">
          <FlaskConical className="mx-auto mb-2 h-10 w-10 text-neutral-300" />
          <p className="mb-3 text-neutral-500">
            {search ? 'No labs match your search.' : 'No labs yet.'}
          </p>
          <Link
            href="/admin/labs/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            <Plus className="h-4 w-4" /> Onboard your first lab
          </Link>
        </Card>
      ) : (
        <Card className="divide-y divide-neutral-100 overflow-hidden p-0">
          {labs.map((l) => (
            <LabRow key={l.lab_id} lab={l} />
          ))}
        </Card>
      )}
    </div>
  );
}

function LabRow({ lab: l }: { lab: LabRow }) {
  let createdStr = '';
  if (l.created_at) {
    try {
      createdStr = new Date(l.created_at).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
      });
    } catch {}
  }

  return (
    <Link href={`/admin/labs/${l.lab_id}` as never} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-neutral-50">
      <StatusBadge status={l.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-neutral-900">{l.lab_name}</span>
          <span className="font-mono text-xs text-neutral-500">{l.lab_code}</span>
        </div>
        <div className="truncate text-sm text-neutral-600">{l.lab_address}</div>
        <div className="mt-0.5 text-xs text-neutral-500">
          {l.lab_phone}
          {l.owned_by_staff_name && ` • Onboarded by ${l.owned_by_staff_name}`}
        </div>
      </div>
      <div className="text-right whitespace-nowrap">
        <div className="text-sm font-semibold text-neutral-900">
          ₹{(l.per_report_paise / 100).toFixed(0)}/report
        </div>
        <div className="text-xs text-neutral-500">{l.rev_share_pct}% to us</div>
        <div className="mt-0.5 text-xs text-neutral-400">{createdStr}</div>
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = {
    active: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    suspended: 'bg-red-100 text-red-800',
  }[status] || 'bg-neutral-100 text-neutral-800';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}
