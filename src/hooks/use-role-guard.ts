"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuthStore } from "@/lib/stores/auth";

type Role = "OWNER" | "ADMIN" | "TECHNICIAN";

/**
 * Client-side role guard for pages technicians shouldn't see. Returns
 * a `state` you can render:
 *
 *   - "loading"    — auth store hasn't hydrated yet; render a skeleton.
 *   - "denied"     — current role isn't in `allowedRoles`; effect has
 *                    already redirected to `/`. Render a friendly stub
 *                    that briefly explains the denial.
 *   - "allowed"    — proceed with the page.
 *
 * When real Firebase auth ships, the canonical role check moves to
 * the JWT session payload (server-side) but this hook stays for
 * defense in depth.
 */
export function useRoleGuard(allowedRoles: Role[]): "loading" | "denied" | "allowed" {
  const role = useAuthStore((s) => s.currentUser.role);
  const router = useRouter();
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(useAuthStore.persist?.hasHydrated() ?? true);
    const unsub = useAuthStore.persist?.onFinishHydration(() => {
      setHasHydrated(true);
    });
    return () => unsub?.();
  }, []);

  const allowed = allowedRoles.includes(role);

  useEffect(() => {
    if (hasHydrated && !allowed) {
      router.replace("/");
    }
  }, [hasHydrated, allowed, router]);

  if (!hasHydrated) return "loading";
  return allowed ? "allowed" : "denied";
}
