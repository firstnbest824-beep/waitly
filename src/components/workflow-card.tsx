import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import type { WorkflowType } from "@/lib/types";

export function WorkflowCard({ workflow }: { workflow: WorkflowType }) {
  const savedMinutes = workflow.estimatedOriginalMinutes - workflow.estimatedWorkOSMinutes;

  return (
    <article className="flex h-full flex-col rounded-lg border border-[var(--line)] bg-white p-5 shadow-[0_1px_0_rgba(20,20,20,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold tracking-normal text-[var(--ink)]">{workflow.name}</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{workflow.description}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--panel)] text-[var(--muted)]">
          <Clock3 size={18} />
        </span>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-[var(--panel)] px-3 py-2">
          <dt className="text-[var(--muted)]">기존</dt>
          <dd className="mt-1 font-semibold">{workflow.estimatedOriginalMinutes}분</dd>
        </div>
        <div className="rounded-lg bg-[#e8f6ee] px-3 py-2 text-[#17613b]">
          <dt>절감</dt>
          <dd className="mt-1 font-semibold">{savedMinutes}분</dd>
        </div>
      </dl>
      <Link
        href={`/generate?workflow=${workflow.id}`}
        className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 text-sm font-semibold text-white transition hover:bg-[#2b332d]"
      >
        이 작업 시작
        <ArrowRight size={16} />
      </Link>
    </article>
  );
}
