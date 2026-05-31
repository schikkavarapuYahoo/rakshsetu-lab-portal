import Link from "next/link";
import { FlaskConical } from "lucide-react";

interface TopLab {
  lab_id: string;
  lab_name: string;
  lab_code: string;
  count: number;
}

interface TopLabsListProps {
  labs: TopLab[];
}

/**
 * Per-lab report counts for the last 30 days, ranked by volume. Each
 * row's bar is sized relative to the leader so zero-activity labs sit
 * with an empty track — exactly the labs that need a follow-up call.
 * Server component — CSS widths, no charts library.
 */
export function TopLabsList({ labs }: TopLabsListProps) {
  if (labs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <FlaskConical className="mb-2 h-8 w-8 text-neutral-300" />
        <p className="text-sm text-neutral-500">
          No labs onboarded yet.
        </p>
      </div>
    );
  }

  const leader = labs[0].count;

  return (
    <ul className="space-y-3">
      {labs.map((l, idx) => {
        const pct = leader > 0 ? Math.max(8, Math.round((l.count / leader) * 100)) : 0;
        return (
          <li key={l.lab_id}>
            <Link
              href={`/admin/labs/${l.lab_id}`}
              className="group block rounded-md p-1 -mx-1 transition-colors hover:bg-neutral-50"
            >
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="text-xs font-semibold text-neutral-400 tabular-nums">
                    #{idx + 1}
                  </span>
                  <span className="truncate font-medium text-neutral-900 group-hover:text-brand-700">
                    {l.lab_name}
                  </span>
                  {l.lab_code && (
                    <span className="font-mono text-[11px] text-neutral-400">
                      {l.lab_code}
                    </span>
                  )}
                </div>
                <span className="shrink-0 font-semibold text-neutral-900 tabular-nums">
                  {l.count}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
