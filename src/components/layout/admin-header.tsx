"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Top-of-page chrome for the admin console. Mirrors `AppHeader` so the
 * SaaS-vendor view sits visually inside the same product as the lab
 * portal — same warm palette, same nav pattern, same brand mark — with
 * an "Admin" tag in the logo plate to make the persona obvious.
 *
 * Props come from the server-side session (loaded in admin/layout.tsx),
 * so this client component never needs to fetch user data again.
 */

interface AdminHeaderProps {
  displayName: string;
  email: string;
  role: "admin" | "rep";
}

interface AdminNavItem {
  title: string;
  href: string;
  adminOnly?: boolean;
}

const adminNav: AdminNavItem[] = [
  { title: "Overview", href: "/admin" },
  { title: "Labs", href: "/admin/labs" },
  { title: "Onboard Lab", href: "/admin/labs/new" },
  { title: "Staff", href: "/admin/staff", adminOnly: true },
];

function TopNavLink({
  item,
  pathname,
}: {
  item: AdminNavItem;
  pathname: string;
}) {
  const isActive =
    item.href === "/admin"
      ? pathname === "/admin"
      : pathname.startsWith(item.href);
  return (
    <Link
      href={item.href}
      className={cn(
        "relative inline-flex h-14 items-center px-4 text-[14px] font-medium transition-colors",
        isActive
          ? "text-brand-700"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {item.title}
      {isActive && (
        <span className="bg-brand-600 absolute right-3 bottom-0 left-3 h-[2px] rounded-t-sm" />
      )}
    </Link>
  );
}

export function AdminHeader({ displayName, email, role }: AdminHeaderProps) {
  const pathname = usePathname();
  const visibleNav = adminNav.filter((i) => !i.adminOnly || role === "admin");
  const initials = displayName
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="bg-background sticky top-0 z-30 border-b border-neutral-200 backdrop-blur-md supports-[backdrop-filter]:bg-white/85">
      <div className="flex h-14 items-center gap-3 px-3 sm:gap-6 sm:px-6">
        <Link href="/admin" className="flex shrink-0 items-center gap-2">
          <div className="bg-brand-500 flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-sm">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight text-neutral-900">
              RakshSetu
            </div>
            <div className="hidden text-[11px] text-neutral-500 sm:block">
              {role === "admin" ? "Admin Console" : "Sales Portal"}
            </div>
          </div>
        </Link>

        <nav className="flex h-14 min-w-0 flex-1 items-center overflow-x-auto scrollbar-none sm:flex-none">
          {visibleNav.map((item) => (
            <TopNavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  className="h-9 w-9 rounded-full p-0"
                  aria-label="Account menu"
                >
                  <Avatar className="bg-brand-100 ring-brand-200 h-8 w-8 ring-1">
                    <AvatarFallback className="bg-brand-100 text-brand-800 text-xs font-medium">
                      {initials || "RS"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-64">
              <div className="px-2 py-2">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{displayName}</span>
                  <span className="text-muted-foreground text-xs">
                    {email} · {role}
                  </span>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

async function handleSignOut() {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Fall through — the redirect below clears local state anyway.
  }
  window.location.href = "/staff-login";
}
