import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { Card } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
          <FileQuestion className="h-7 w-7 text-brand-500" />
        </div>
        <h1 className="text-2xl font-bold text-neutral-900">Page not found</h1>
        <p className="mt-2 text-sm text-neutral-500">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            Back to dashboard
          </Link>
          <Link
            href="/reports"
            className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            View reports
          </Link>
        </div>
      </Card>
    </div>
  );
}
