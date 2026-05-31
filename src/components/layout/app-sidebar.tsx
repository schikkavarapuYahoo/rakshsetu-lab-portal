"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { primaryNav, secondaryNav, type NavItem } from "@/config/nav";

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        tooltip={item.title}
        render={
          <Link href={item.href}>
            <Icon />
            <span>{item.title}</span>
          </Link>
        }
      />
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-white">
            <FlaskConical className="h-4 w-4" />
          </div>
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold">RakshSetu</span>
            <span className="truncate text-xs text-muted-foreground">Lab Portal</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryNav.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {secondaryNav.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
