import { Clock3 } from "lucide-react";

export function TimeSavedCard({
  title,
  minutes,
  caption,
}: {
  title: string;
  minutes: number;
  caption: string;
}) {
  const hours = minutes / 60;

  return (
    <article className="rounded-lg border border-[var(--line)] bg-[var(--ink)] p-5 text-white">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-white/72">{title}</p>
        <Clock3 size={18} className="text-[#9ee6b6]" />
      </div>
      <p className="mt-4 text-4xl font-semibold tracking-normal">{formatHours(hours)}</p>
      <p className="mt-2 text-sm leading-6 text-white/70">{caption}</p>
    </article>
  );
}

function formatHours(hours: number) {
  if (hours === 0) {
    return "0시간";
  }

  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}시간`;
}
