"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldCheck, AlertCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginInner />
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

function LoginInner() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
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
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          pin,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Login failed");
        if (json.retry_after_seconds)
          setRetryAfter(json.retry_after_seconds);
        return;
      }

      // Hard navigate so the server picks up the new session cookie.
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
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500">
            <ShieldCheck className="h-4.5 w-4.5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-neutral-900">RakshSetu</div>
            <div className="text-xs text-neutral-500">Lab Portal</div>
          </div>
        </div>
        <Card className="p-8">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-neutral-900">
              Sign in to your lab
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Use the email and PIN your lab owner gave you.
            </p>
          </div>

          <form onSubmit={handleSubmit} method="post" className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourlab.com"
                className="h-10"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pin">PIN</Label>
              <Input
                id="pin"
                name="pin"
                type="password"
                autoComplete="current-password"
                required
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••••"
                className="h-10 font-mono tracking-widest"
                maxLength={64}
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
              className="h-10 w-full bg-brand-500 text-white hover:bg-brand-600"
            >
              {submitting && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              {submitting ? "Signing in…" : "Sign In"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-neutral-500">
            Don&apos;t have a lab code?{" "}
            <a
              href="mailto:partners@rakshsetu.com"
              className="text-brand-500 hover:underline"
            >
              Contact us
            </a>
          </p>
          <p className="mt-2 text-center text-xs text-neutral-400">
            <a href="/staff-login" className="hover:underline">
              Staff login →
            </a>
          </p>
        </Card>

        <p className="mt-6 text-center text-xs text-neutral-400">
          By signing in you agree that all reports submitted are accurate
          to the best of your knowledge. RakshSetu logs every report for
          compliance.
        </p>
      </div>
    </div>
  );
}
