"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  HelpCircle,
  ListChecks,
  LogOut,
  ShieldCheck,
  TestTube2,
  User,
  UserCog,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuthStore } from "@/lib/stores/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  isNavAllowed,
  primaryNav,
  secondaryNav,
  type NavItem,
} from "@/config/nav";
import { cn } from "@/lib/utils";

const topNav: NavItem[] = [...primaryNav, ...secondaryNav];

function TopNavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
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

// Routes that render their own chrome (login pages, admin console).
// Auth pages don't have a navbar; the admin console gets its own.
const NO_HEADER_PREFIXES = ["/login", "/staff-login", "/admin"];

export function AppHeader() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.currentUser.role);
  const visibleNav = topNav.filter((item) => isNavAllowed(item, role));

  if (NO_HEADER_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return null;
  }

  return (
    <header className="bg-background sticky top-0 z-30 border-b border-neutral-200 backdrop-blur-md supports-[backdrop-filter]:bg-white/85">
      <div className="flex h-14 items-center gap-3 px-3 sm:gap-6 sm:px-6">
        {/* Brand */}
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <div className="bg-brand-500 flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-sm">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight text-neutral-900">
              RakshSetu
            </div>
            <div className="hidden text-[11px] text-neutral-500 sm:block">
              Lab Portal
            </div>
          </div>
        </Link>

        {/* Primary nav — horizontally scrollable on narrow screens so
            no item gets clipped. On desktop everything fits inline. */}
        <nav className="flex h-14 min-w-0 flex-1 items-center overflow-x-auto scrollbar-none sm:flex-none">
          {visibleNav.map((item) => (
            <TopNavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>

        {/* Right side utilities */}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Tasks">
            <ListChecks className="h-[18px] w-[18px]" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Help"
            className="relative"
          >
            <HelpCircle className="h-[18px] w-[18px]" />
            <span className="bg-brand-500 absolute top-1.5 right-1.5 h-2 w-2 rounded-full ring-2 ring-white" />
          </Button>

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
                      SC
                    </AvatarFallback>
                  </Avatar>
                </Button>
              }
            />
            <UserMenuContent />
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

/**
 * Account dropdown. Includes a "Switch role" demo affordance until
 * Firebase auth lands and roles come from the JWT session payload.
 * Saves to localStorage via the persisted auth store so a refresh
 * keeps the chosen role.
 */
function UserMenuContent() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const setUser = useAuthStore((s) => s.setUser);

  const ROLE_OPTIONS: {
    role: "OWNER" | "ADMIN" | "TECHNICIAN";
    label: string;
    icon: typeof User;
    hint: string;
  }[] = [
    {
      role: "OWNER",
      label: "Owner",
      icon: ShieldCheck,
      hint: "Sees money + admin",
    },
    {
      role: "ADMIN",
      label: "Admin",
      icon: UserCog,
      hint: "Admin console + billing",
    },
    {
      role: "TECHNICIAN",
      label: "Technician",
      icon: TestTube2,
      hint: "Workflow only, no money",
    },
  ];

  return (
    <DropdownMenuContent align="end" className="w-64">
      <div className="px-2 py-2">
        <div className="flex flex-col">
          <span className="text-sm font-medium">{currentUser.name}</span>
          <span className="text-muted-foreground text-xs">
            {currentUser.email} · {currentUser.role.toLowerCase()}
          </span>
        </div>
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem>
        <User className="mr-2 h-4 w-4" />
        Profile
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <div className="text-muted-foreground px-2 py-1.5 text-[10px] font-semibold tracking-wide uppercase">
        Switch role (demo)
      </div>
      {ROLE_OPTIONS.map(({ role, label, icon: Icon, hint }) => {
        const active = currentUser.role === role;
        return (
          <DropdownMenuItem
            key={role}
            onClick={() => setUser({ ...currentUser, role })}
            className={cn(active && "bg-brand-50 text-brand-800")}
          >
            <Icon className="mr-2 h-4 w-4" />
            <div className="flex flex-col">
              <span className="text-sm">{label}</span>
              <span className="text-muted-foreground text-[11px]">
                {hint}
              </span>
            </div>
            {active && (
              <span className="ml-auto text-[10px] font-medium">Active</span>
            )}
          </DropdownMenuItem>
        );
      })}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={handleSignOut}>
        <LogOut className="mr-2 h-4 w-4" />
        Sign out
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

async function handleSignOut() {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Even if the request fails, push the user to /login so the local
    // session state visibly clears. The proxy will redirect them back
    // on the next protected nav anyway.
  }
  window.location.href = "/login";
}
