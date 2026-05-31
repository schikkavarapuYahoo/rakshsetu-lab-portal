"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Briefcase, AlertCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function StaffLoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <StaffLoginInner />
    </Suspense>
  );
}

function LoginSkeleton() {
  return (
    <div className="bg-app flex min-h-screen items-center justify-center px-4">
      <div className="text-sm text-neutral-400">Loading…</div>
    </div>
  );
}

function StaffLoginInner() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setRetryAfter(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/staff-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Login failed");
        if (json.retry_after_seconds) setRetryAfter(json.retry_after_seconds);
        return;
      }
      window.location.href = next;
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-app flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-900">
            <Briefcase className="h-4.5 w-4.5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-neutral-900">RakshSetu</div>
            <div className="text-xs text-neutral-500">Staff Portal</div>
          </div>
        </div>
        <Card className="p-8">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-neutral-900">
              Staff sign in
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Field reps and admins only.
            </p>
          </div>

          <form onSubmit={handleSubmit} method="post" className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="rep@rakshsetu.com"
                className="h-10"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-10"
                maxLength={128}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <div>{error}</div>
                  {retryAfter && (
                    <div className="mt-0.5 text-xs opacity-80">
                      Retry in {Math.floor(retryAfter / 60)}m{" "}
                      {retryAfter % 60}s.
                    </div>
                  )}
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="h-10 w-full bg-neutral-900 text-white hover:bg-neutral-800"
            >
              {submitting && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              {submitting ? "Signing in…" : "Sign In"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-neutral-400">
            <a href="/login" className="hover:underline">
              Lab login →
            </a>
          </p>
        </Card>
      </div>
    </div>
  );
}
