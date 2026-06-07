"use client";

import Link from "next/link";
import { ArrowUpRight, Clock3 } from "lucide-react";
import type { GeneratedWork } from "@/lib/types";
import { getWorkflowName } from "@/lib/workos-data";

export function HistoryList({ history }: { history: GeneratedWork[] }) {
  if (history.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-[var(--line)] bg-white p-8">
        <p className="text-sm font-medium text-[var(--muted)]">작업 기록 없음</p>
        <p className="mt-3 text-2xl font-semibold tracking-normal text-[var(--ink)]">첫 작업을 생성하면 이곳에 기록됩니다.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {history.map((item) => (
        <article key={item.id} className="rounded-lg border border-[var(--line)] bg-white p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-[var(--panel)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
                  {getWorkflowName(item.workflowType)}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-[#17613b]">
                  <Clock3 size={14} />
                  {item.savedMinutes}분 절감
                </span>
              </div>
              <h3 className="mt-3 text-lg font-semibold tracking-normal text-[var(--ink)]">{item.request}</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">{formatDate(item.createdAt)}</p>
            </div>
            <Link
              href={`/generate?workflow=${item.workflowType}&request=${encodeURIComponent(item.request)}`}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--panel)]"
            >
              다시 열기
              <ArrowUpRight size={16} />
            </Link>
          </div>
          <p className="mt-4 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{item.result}</p>
        </article>
      ))}
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
