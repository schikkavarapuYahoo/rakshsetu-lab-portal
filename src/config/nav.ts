import {
  LayoutDashboard,
  Users,
  FileText,
  Receipt,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavRole = "OWNER" | "ADMIN" | "TECHNICIAN";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Roles allowed to see this item. Omitted = all roles. */
  allowedRoles?: NavRole[];
}

export const primaryNav: NavItem[] = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Patients", href: "/patients", icon: Users },
  { title: "Reports", href: "/reports", icon: FileText },
  // Billing surfaces revenue, credit balance, commissions — owner /
  // admin only. Technicians don't need it and shouldn't see lab takings.
  {
    title: "Billing",
    href: "/billing",
    icon: Receipt,
    allowedRoles: ["OWNER", "ADMIN"],
  },
];

export const secondaryNav: NavItem[] = [{ title: "Settings", href: "/settings", icon: Settings }];

/** True if `item` should render for the given role. */
export function isNavAllowed(item: NavItem, role: NavRole): boolean {
  if (!item.allowedRoles) return true;
  return item.allowedRoles.includes(role);
}
