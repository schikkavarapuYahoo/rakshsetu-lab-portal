"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

interface LabStatusDonutProps {
  active: number;
  pending: number;
  suspended: number;
}

const COLORS = {
  Active: "#16a34a", // green-600 — matches Published status pill
  Pending: "#ca8a04", // yellow-600 — matches Warning tone
  Suspended: "#dc2626", // red-600 — matches Danger tone
} as const;

/**
 * Donut showing the lab-population health split. Total in the centre,
 * legend rows below with counts so the visual works even at small sizes
 * where pie slices alone are hard to read.
 */
export function LabStatusDonut({
  active,
  pending,
  suspended,
}: LabStatusDonutProps) {
  const total = active + pending + suspended;
  const data = [
    { name: "Active" as const, value: active },
    { name: "Pending" as const, value: pending },
    { name: "Suspended" as const, value: suspended },
  ].filter((d) => d.value > 0);

  if (total === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-neutral-400">
        No labs provisioned yet.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-32 w-32 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={36}
              outerRadius={60}
              paddingAngle={data.length > 1 ? 2 : 0}
              stroke="none"
            >
              {data.map((d) => (
                <Cell key={d.name} fill={COLORS[d.name]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                fontSize: 12,
              }}
              formatter={(value, name) => [Number(value ?? 0), String(name)]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-neutral-900 leading-none">
            {total}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-neutral-500 mt-0.5">
            Total
          </span>
        </div>
      </div>
      <ul className="flex-1 space-y-1.5 text-sm">
        {(
          [
            { name: "Active", value: active },
            { name: "Pending", value: pending },
            { name: "Suspended", value: suspended },
          ] as const
        ).map(({ name, value }) => (
          <li key={name} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: COLORS[name] }}
            />
            <span className="flex-1 text-neutral-700">{name}</span>
            <span className="font-semibold text-neutral-900 tabular-nums">
              {value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
