"use client";

import { useTatNotifications } from "@/hooks/use-tat-notifications";

/**
 * Mount-once driver that polls for TAT-overdue reports and fires browser
 * notifications. Placed in the root layout so it runs no matter which page
 * the user is on.
 */
export function TatNotificationDriver() {
  useTatNotifications();
  return null;
}
