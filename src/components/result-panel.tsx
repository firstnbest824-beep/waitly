"use client";

import { Clipboard, RefreshCw } from "lucide-react";
import type { GeneratedWork, UserContext } from "@/lib/types";
import { ChecklistPanel } from "./checklist-panel";

export function ResultPanel({
  work,
  contexts,
  onRegenerate,
}: {
  work: GeneratedWork | null;
  contexts: UserContext[];
  onRegenerate: () => void;
}) {
  if (!work) {
    return (
      <section className="rounded-lg border border-dashed border-[var(--line)] bg-white p-8">
        <p className="text-sm font-medium text-[var(--muted)]">생성 대기</p>
        <p className="mt-3 max-w-xl text-2xl font-semibold tracking-normal text-[var(--ink)]">
          작업 유형, 요청, 사용할 개인 맥락을 선택하면 초안이 표시됩니다.
        </p>
      </section>
    );
  }

  const currentWork = work;
  const usedContexts = contexts.filter((context) => currentWork.usedContextIds.includes(context.id));

  async function copyResult() {
    await navigator.clipboard.writeText(
      [
        currentWork.result,
        "",
        "체크리스트",
        ...currentWork.checklist.map((item) => `- ${item}`),
        "",
        `다음 프롬프트: ${currentWork.nextPrompt}`,
      ].join("\n"),
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-[var(--line)] bg-white">
        <div className="flex flex-col gap-4 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--muted)]">생성된 초안</p>
            <p className="mt-1 text-sm text-[var(--muted)]">예상 절감 시간 {currentWork.savedMinutes}분</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyResult}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--panel)]"
            >
              <Clipboard size={16} />
              복사하기
            </button>
            <button
              type="button"
              onClick={onRegenerate}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 text-sm font-semibold text-white transition hover:bg-[#2b332d]"
            >
              <RefreshCw size={16} />
              다시 생성
            </button>
          </div>
        </div>
        <pre className="whitespace-pre-wrap px-5 py-5 font-[family-name:var(--font-mono)] text-sm leading-7 text-[var(--ink)]">
          {currentWork.result}
        </pre>
      </section>
      <section className="rounded-lg border border-[var(--line)] bg-white p-5">
        <h3 className="text-base font-semibold text-[var(--ink)]">사용한 개인 맥락</h3>
        {usedContexts.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {usedContexts.map((context) => (
              <span key={context.id} className="rounded-lg bg-[var(--panel)] px-3 py-2 text-sm text-[var(--muted)]">
                {context.category} · {context.title}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted)]">선택된 개인 맥락이 없습니다.</p>
        )}
      </section>
      <ChecklistPanel items={currentWork.checklist} />
      <section className="rounded-lg border border-[var(--line)] bg-[#fff9eb] p-5">
        <h3 className="text-base font-semibold text-[#6b4a00]">다음 수정 프롬프트</h3>
        <p className="mt-3 text-sm leading-7 text-[#6b4a00]">{currentWork.nextPrompt}</p>
      </section>
    </div>
  );
}
