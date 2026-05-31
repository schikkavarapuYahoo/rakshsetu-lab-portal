"use client";

import { Building2, ChevronRight, FlaskConical, Users, Wallet } from "lucide-react";
import Link from "next/link";

import { useAuthStore } from "@/lib/stores/auth";

type SettingsRole = "OWNER" | "ADMIN" | "TECHNICIAN";

interface SettingsSection {
  href: string;
  title: string;
  description: string;
  icon: typeof FlaskConical;
  /** Roles allowed to see this section. Omitted = all roles. */
  allowedRoles?: SettingsRole[];
}

const sections: SettingsSection[] = [
  {
    href: "/settings/lab-profile",
    title: "Lab profile",
    description:
      "Letterhead shown on printed and PDF reports — lab name, address, signatory.",
    icon: Building2,
  },
  {
    href: "/settings/tests",
    title: "Test catalog",
    description:
      "The tests your lab offers — pricing, reference ranges, and custom panels.",
    icon: FlaskConical,
  },
  {
    href: "/settings/team",
    title: "Team",
    description:
      "Add, edit, and manage the staff who can log into this lab.",
    icon: Users,
    allowedRoles: ["OWNER", "ADMIN"],
  },
  {
    href: "/settings/billing",
    title: "Billing settings",
    description:
      "Per-report price, low-balance warning threshold, and account suspend toggle.",
    icon: Wallet,
    allowedRoles: ["OWNER", "ADMIN"],
  },
];

export default function SettingsPage() {
  const role = useAuthStore((s) => s.currentUser.role);
  const visibleSections = sections.filter(
    (s) => !s.allowedRoles || s.allowedRoles.includes(role),
  );
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-[28px] font-semibold tracking-tight text-neutral-900">
          Settings
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Configure how this lab works.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visibleSections.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              className="group flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition-colors hover:border-neutral-300 hover:bg-neutral-50/60"
            >
              <div className="bg-brand-50 text-brand-700 ring-brand-100 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-neutral-900">
                    {s.title}
                  </h2>
                  <ChevronRight className="h-4 w-4 text-neutral-400 transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {s.description}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
