"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  UserCog,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

export default function TeamPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lab-staff", { cache: "no-store" });
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
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visibleStaff = staff.filter((s) => s.status !== "removed");

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back to settings
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-neutral-900">
            Team
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Every staff member who logs into this lab has their own email + PIN.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600"
        >
          <Plus className="h-4 w-4" /> Add staff
        </button>
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
      ) : visibleStaff.length === 0 ? (
        <Card className="p-12 text-center">
          <UserPlus className="mx-auto mb-2 h-10 w-10 text-neutral-300" />
          <p className="mb-3 text-neutral-500">
            No staff yet besides you.
          </p>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            <Plus className="h-4 w-4" /> Add your first staff member
          </button>
        </Card>
      ) : (
        <Card className="divide-y divide-neutral-100 overflow-hidden p-0">
          {visibleStaff.map((s) => (
            <StaffRow
              key={s.staff_id}
              staff={s}
              onEdit={() => setEditing(s)}
              onChanged={reload}
            />
          ))}
        </Card>
      )}

      {addOpen && (
        <AddStaffDialog
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            void reload();
          }}
        />
      )}
      {editing && (
        <EditStaffDialog
          staff={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}

// ── Staff row ────────────────────────────────────────────────────

function StaffRow({
  staff,
  onEdit,
  onChanged,
}: {
  staff: Staff;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function removeStaff() {
    if (
      !confirm(
        `Remove ${staff.display_name}? They won't be able to log in. The audit trail of their actions stays.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/lab-staff/${staff.staff_id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error || "Could not remove staff");
      } else {
        toast.success("Staff removed");
        onChanged();
      }
    } catch {
      toast.error("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
        {staff.display_name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold text-neutral-900">
            {staff.display_name}
          </span>
          <RoleBadge role={staff.role} />
          {staff.status === "suspended" && (
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-yellow-800">
              Suspended
            </span>
          )}
        </div>
        <div className="truncate text-sm text-neutral-600">{staff.email}</div>
        {staff.username && (
          <div className="truncate text-xs text-neutral-500">
            <span className="font-mono">@{staff.username}</span>
          </div>
        )}
        <div className="mt-0.5 text-xs text-neutral-500">
          {staff.last_login_at
            ? `Last login ${formatRelative(staff.last_login_at)}`
            : "Never logged in"}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          aria-label={`Edit ${staff.display_name}`}
        >
          <UserCog className="h-4 w-4" />
          <span className="hidden sm:inline">Edit</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={removeStaff}
          disabled={busy}
          className="text-red-600 hover:bg-red-50 hover:text-red-700"
          aria-label={`Remove ${staff.display_name}`}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>
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

// ── Add / Edit dialogs ───────────────────────────────────────────

function AddStaffDialog({
  onClose,
  onCreated,
}: {
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
      const res = await fetch("/api/lab-staff", {
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
      toast.success(`Added ${name} (${role})`, {
        description: `They can sign in with ${email} and the PIN you set.`,
      });
      onCreated();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="max-h-[90vh] w-full max-w-md overflow-y-auto p-6">
        <h3 className="mb-1 text-lg font-bold">Add a staff member</h3>
        <p className="mb-4 text-sm text-neutral-500">
          They&apos;ll log in with this email + PIN.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="staff-email">Email *</Label>
            <Input
              id="staff-email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alice@yourlab.com"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-username">Username (optional)</Label>
            <Input
              id="staff-username"
              type="text"
              pattern="[a-z0-9._-]{3,32}"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="alice.sharma"
              className="h-10 font-mono"
              maxLength={32}
            />
            <p className="text-xs text-neutral-500">
              3-32 chars. Lowercase letters, digits, dot, underscore, hyphen. They can log in with either email OR username.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-name">Full name *</Label>
            <Input
              id="staff-name"
              type="text"
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alice Sharma"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role *</Label>
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
            <p className="mt-1 text-xs text-neutral-500">
              {role === "owner"
                ? "Full access. Can add/remove other staff."
                : role === "admin"
                  ? "All of technician + billing + reports oversight."
                  : "Workflow only — register patients, run tests, no money."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-pin">Initial PIN *</Label>
            <Input
              id="staff-pin"
              type="text"
              required
              minLength={6}
              maxLength={64}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Min 6 chars"
              className="h-10 font-mono tracking-widest"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Tell them to change it on first login.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-brand-500 text-white hover:bg-brand-600"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Adding…" : "Add staff"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function EditStaffDialog({
  staff,
  onClose,
  onSaved,
}: {
  staff: Staff;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(staff.display_name);
  const [username, setUsername] = useState(staff.username ?? "");
  const [role, setRole] = useState<StaffRole>(staff.role);
  const [status, setStatus] = useState<"active" | "suspended">(
    staff.status === "suspended" ? "suspended" : "active",
  );
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, string> = {
        display_name: name.trim(),
        role,
        status,
        // Empty string is a valid "clear the username" signal.
        username: username.trim().toLowerCase(),
      };
      if (pin) body.pin = pin;

      const res = await fetch(`/api/lab-staff/${staff.staff_id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const respBody = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setError(respBody.error || "Could not save");
        return;
      }
      toast.success("Staff updated", {
        description: pin ? "PIN was reset too." : undefined,
        icon: <CheckCircle2 className="h-4 w-4 text-green-600" />,
      });
      onSaved();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="max-h-[90vh] w-full max-w-md overflow-y-auto p-6">
        <h3 className="mb-1 text-lg font-bold">Edit staff</h3>
        <p className="mb-4 text-sm text-neutral-500">{staff.email}</p>

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Full name</Label>
            <Input
              id="edit-name"
              type="text"
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-username">Username (optional)</Label>
            <Input
              id="edit-username"
              type="text"
              pattern="[a-z0-9._-]{3,32}"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="leave blank to remove"
              className="h-10 font-mono"
              maxLength={32}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Role</Label>
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

          <div className="space-y-1.5">
            <Label>Status</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["active", "suspended"] as const).map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`inline-flex h-9 items-center justify-center rounded-lg border px-2 text-xs font-medium transition-colors ${
                    status === s
                      ? s === "active"
                        ? "border-green-500 bg-green-500 text-white"
                        : "border-yellow-500 bg-yellow-500 text-white"
                      : "border-border bg-background text-neutral-700 hover:bg-muted"
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Suspended staff cannot log in. Audit trail preserved.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-pin">Reset PIN (optional)</Label>
            <Input
              id="edit-pin"
              type="text"
              minLength={6}
              maxLength={64}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Leave blank to keep current PIN"
              className="h-10 font-mono tracking-widest"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-brand-500 text-white hover:bg-brand-600"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Card>
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
