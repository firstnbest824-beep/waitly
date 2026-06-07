import { CheckCircle2 } from "lucide-react";

export function ChecklistPanel({ items }: { items: string[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--line)] bg-white p-5 text-sm text-[var(--muted)]">
        결과를 생성하면 체크리스트가 여기에 표시됩니다.
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-[var(--line)] bg-white p-5">
      <h3 className="text-base font-semibold text-[var(--ink)]">체크리스트</h3>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-6 text-[var(--muted)]">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[#208a52]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
