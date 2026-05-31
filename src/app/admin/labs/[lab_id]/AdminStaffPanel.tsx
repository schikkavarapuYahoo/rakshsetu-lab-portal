"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  UserCog,
  UserMinus,
} from "lucide-react";

type StaffRole = "owner" | "admin" | "technician";
type StaffStatus = "active" | "suspended" | "removed";

interface Staff {
  staff_id: string;
  email: string;
  username: string | null;
  display_name: string;
  role: StaffRole;
  status: StaffStatus;
  created_at: string | null;
  last_login_at: string | null;
}

interface Props {
  labId: string;
}

/**
 * Admin-on-behalf-of staff management for a single lab. Lives on the
 * `/admin/labs/[lab_id]` page. The lab owner has their own version of
 * this in `Settings → Team` — this surface is for the SaaS-vendor team
 * to handle support cases (forgot PIN, only-owner-locked-out, etc.).
 */
export default function AdminStaffPanel({ labId }: Props) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/labs/${labId}/staff`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { staff: Staff[] };
      setStaff(body.staff);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load staff");
    } finally {
      setLoading(false);
    }
  }, [labId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <section className="card mb-6 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">
            Team
          </h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Every user who can log into this lab. Showing all (active +
            suspended + removed) for the audit trail.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white transition-colors hover:bg-brand-600"
        >
          <Plus className="h-3.5 w-3.5" /> Add staff
        </button>
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-neutral-500">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </div>
      ) : staff.length === 0 ? (
        <div className="py-8 text-center text-sm text-neutral-500">
          No staff yet.
        </div>
      ) : (
        <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-100">
          {staff.map((s) => (
            <StaffRow key={s.staff_id} labId={labId} staff={s} onChanged={reload} />
          ))}
        </div>
      )}

      {showAdd && (
        <AddStaffDialog
          labId={labId}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            void reload();
          }}
        />
      )}
    </section>
  );
}

// ── Row ──────────────────────────────────────────────────────────

function StaffRow({
  labId,
  staff,
  onChanged,
}: {
  labId: string;
  staff: Staff;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function removeStaff() {
    if (
      !confirm(
        `Remove ${staff.display_name} from this lab? They won't be able to log in. The audit trail stays.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/labs/${labId}/staff/${staff.staff_id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        alert(body.error || "Could not remove staff");
      } else {
        onChanged();
      }
    } catch {
      alert("Network error");
    } finally {
      setBusy(false);
    }
  }

  const isRemoved = staff.status === "removed";
  const isSuspended = staff.status === "suspended";

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 ${
        isRemoved ? "opacity-60" : ""
      }`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
        {staff.display_name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-neutral-900">
            {staff.display_name}
          </span>
          <RoleBadge role={staff.role} />
          {isSuspended && (
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-yellow-800">
              Suspended
            </span>
          )}
          {isRemoved && (
            <span className="inline-flex items-center rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-700">
              Removed
            </span>
          )}
        </div>
        <div className="truncate text-xs text-neutral-600">{staff.email}</div>
        {staff.username && (
          <div className="truncate text-[11px] text-neutral-500 font-mono">
            @{staff.username}
          </div>
        )}
        <div className="mt-0.5 text-[11px] text-neutral-500">
          {staff.last_login_at
            ? `Last login ${formatRelative(staff.last_login_at)}`
            : "Never logged in"}
        </div>
      </div>
      {!isRemoved && (
        <button
          type="button"
          onClick={removeStaff}
          disabled={busy}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700"
          aria-label={`Remove ${staff.display_name}`}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">Remove</span>
        </button>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: StaffRole }) {
  const styles: Record<StaffRole, string> = {
    owner: "bg-purple-100 text-purple-800",
    admin: "bg-blue-100 text-blue-800",
    technician: "bg-emerald-100 text-emerald-800",
  };
  const icon: Record<StaffRole, typeof ShieldCheck> = {
    owner: ShieldCheck,
    admin: UserCog,
    technician: UserMinus,
  };
  const Icon = icon[role];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles[role]}`}
    >
      <Icon className="h-3 w-3" />
      {role}
    </span>
  );
}

// ── Add dialog ───────────────────────────────────────────────────

function AddStaffDialog({
  labId,
  onClose,
  onCreated,
}: {
  labId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>("technician");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/labs/${labId}/staff`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          username: username.trim().toLowerCase() || undefined,
          display_name: name.trim(),
          role,
          pin,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error || "Could not add staff");
        return;
      }
      onCreated();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card max-h-[90vh] w-full max-w-md overflow-y-auto p-6">
        <h3 className="mb-1 text-lg font-bold">Add a staff member</h3>
        <p className="mb-4 text-sm text-neutral-500">
          They&apos;ll log into the lab portal with this email + PIN.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">Email *</label>
            <input
              className="input"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alice@yourlab.com"
            />
          </div>
          <div>
            <label className="label">Username (optional)</label>
            <input
              className="input font-mono"
              type="text"
              pattern="[a-z0-9._-]{3,32}"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="alice.sharma"
              maxLength={32}
            />
            <p className="mt-1 text-xs text-neutral-500">
              3-32 chars. lowercase letters / digits / . / _ / -. Can be used at login instead of email.
            </p>
          </div>
          <div>
            <label className="label">Full name *</label>
            <input
              className="input"
              type="text"
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alice Sharma"
            />
          </div>
          <div>
            <label className="label">Role *</label>
            <div className="grid grid-cols-3 gap-2">
              {(["owner", "admin", "technician"] as StaffRole[]).map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setRole(r)}
                  className={`inline-flex h-9 items-center justify-center rounded-lg border px-2 text-xs font-medium transition-colors ${
                    role === r
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-border bg-background text-neutral-700 hover:bg-muted"
                  }`}
                >
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Initial PIN *</label>
            <input
              className="input font-mono tracking-widest"
              type="text"
              required
              minLength={6}
              maxLength={64}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Min 6 chars"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary flex-1"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Adding…" : "Add staff"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
