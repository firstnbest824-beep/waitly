"use client";

import { useState } from "react";
import { GenerateForm } from "@/components/generate-form";
import { ResultPanel } from "@/components/result-panel";
import type { GeneratedWork, WorkflowType } from "@/lib/types";
import { useGeneratedHistory, useUserContexts } from "@/lib/use-workos-storage";

export function GeneratePage({
  initialWorkflowTypeId,
  initialRequest,
}: {
  initialWorkflowTypeId: WorkflowType["id"];
  initialRequest: string;
}) {
  const [contexts] = useUserContexts();
  const [history, setHistory] = useGeneratedHistory();
  const [latestWork, setLatestWork] = useState<GeneratedWork | null>(null);

  function handleGenerated(nextHistory: GeneratedWork[], work: GeneratedWork) {
    setHistory(nextHistory);
    setLatestWork(work);
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-semibold text-[#17613b]">AI 결과물 생성</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-normal text-[var(--ink)] sm:text-4xl">
          개인 맥락을 선택하고 바로 쓸 수 있는 초안을 만듭니다.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">
          API 호출 없이 로컬에서 Codex에 붙여넣을 프롬프트와 작업 초안을 만듭니다. Codex 로그인은 Codex 앱이나 웹에서 처리합니다.
        </p>
      </section>
      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <GenerateForm
          contexts={contexts}
          history={history}
          initialWorkflowTypeId={initialWorkflowTypeId}
          initialRequest={initialRequest}
          onGenerated={handleGenerated}
        />
        <ResultPanel
          work={latestWork}
          contexts={contexts}
          onRegenerate={() => {
            const previous = latestWork;
            if (!previous) {
              return;
            }

            const regenerated = {
              ...previous,
              id: `work-${Date.now()}`,
              createdAt: new Date().toISOString(),
            };
            setHistory([regenerated, ...history]);
            setLatestWork(regenerated);
          }}
        />
      </section>
    </div>
  );
}
