"use client";

import { Bell, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type NotificationState = "unsupported" | "default" | "granted" | "denied";

function readPermission(): NotificationState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

const DISMISS_KEY = "rakshsetu:tat-banner-dismissed";

/**
 * Soft prompt asking the technician to allow browser notifications for
 * "results due" reminders. Hidden once permission is granted/denied or the
 * user dismisses it for this session.
 */
export function TatPermissionBanner() {
  const [state, setState] = useState<NotificationState>("default");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setState(readPermission());
    if (typeof window !== "undefined") {
      setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === "1");
    }
  }, []);

  if (state !== "default" || dismissed) return null;

  async function handleEnable() {
    if (!("Notification" in window)) return;
    try {
      const result = await Notification.requestPermission();
      setState(result);
      if (result === "granted") {
        toast.success("Reminders enabled — we'll ping you when results are due.");
      } else if (result === "denied") {
        toast.info(
          "Reminders blocked. You can re-enable them from your browser's site settings.",
        );
      }
    } catch {
      toast.error("Could not enable reminders.");
    }
  }

  function handleDismiss() {
    setDismissed(true);
    window.sessionStorage.setItem(DISMISS_KEY, "1");
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-2.5 shadow-sm">
      <Bell className="h-4 w-4 shrink-0 text-sky-700" />
      <p className="flex-1 text-sm text-sky-900">
        <span className="font-medium">Turn on result reminders</span> — get a
        ping when a test&apos;s turnaround time elapses so you don&apos;t forget
        to enter results.
      </p>
      <button
        type="button"
        onClick={handleEnable}
        className="inline-flex h-8 items-center gap-1 rounded-md bg-sky-600 px-3 text-xs font-medium text-white shadow-sm transition-colors hover:bg-sky-700"
      >
        Enable
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="rounded-md p-1 text-sky-700 hover:bg-sky-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
