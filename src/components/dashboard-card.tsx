import type { ReactNode } from "react";

export function DashboardCard({
  label,
  value,
  detail,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone?: "neutral" | "green" | "amber" | "blue";
}) {
  const toneClass = {
    neutral: "bg-[var(--panel)] text-[var(--ink)]",
    green: "bg-[#e8f6ee] text-[#17613b]",
    amber: "bg-[#fff2d1] text-[#6b4a00]",
    blue: "bg-[#e8f1ff] text-[#174a86]",
  }[tone];

  return (
    <article className="rounded-lg border border-[var(--line)] bg-white p-5 shadow-[0_1px_0_rgba(20,20,20,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--muted)]">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-normal text-[var(--ink)]">{value}</p>
        </div>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${toneClass}`}>{icon}</span>
      </div>
      <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{detail}</p>
    </article>
  );
}
