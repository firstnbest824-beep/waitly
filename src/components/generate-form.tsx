"use client";

import { FormEvent, useMemo, useState } from "react";
import { WandSparkles } from "lucide-react";
import type { GeneratedWork, UserContext, WorkflowType } from "@/lib/types";
import { mockGenerateWork } from "@/lib/mock-generate";
import { workflowTypes } from "@/lib/workos-data";

const sampleRequests: Record<WorkflowType["id"], string> = {
  resume: "AI 생산 자동화 직무 자기소개서 초안을 만들어줘.",
  report: "생성형 AI가 대학생 과제 생산성에 미치는 영향 보고서 구조를 잡아줘.",
  ppt: "NU-EERC 공모전 발표 PPT 구조를 만들어줘.",
  research: "GIST AIML 연구실을 지원 관점에서 리서치해줘.",
  "codex-prompt": "Kaitly 거래처 UI 구현용 Codex 프롬프트를 만들어줘.",
  "code-explain": "Next.js App Router 코드 구조를 초보자도 이해하게 설명해줘.",
  "submission-checklist": "공모전 제출 전 확인 체크리스트를 만들어줘.",
};

export function GenerateForm({
  contexts,
  history,
  onGenerated,
  initialWorkflowTypeId,
  initialRequest,
}: {
  contexts: UserContext[];
  history: GeneratedWork[];
  onGenerated: (history: GeneratedWork[], work: GeneratedWork) => void;
  initialWorkflowTypeId: WorkflowType["id"];
  initialRequest: string;
}) {
  const [workflowTypeId, setWorkflowTypeId] = useState<WorkflowType["id"]>(initialWorkflowTypeId);
  const [request, setRequest] = useState(initialRequest || sampleRequests[initialWorkflowTypeId]);
  const [usedContextIds, setUsedContextIds] = useState<string[]>(contexts.slice(0, 3).map((context) => context.id));
  const [notice, setNotice] = useState("");
  const validUsedContextIds = usedContextIds.filter((id) => contexts.some((context) => context.id === id));
  const selectedWorkflow = useMemo(
    () => workflowTypes.find((workflow) => workflow.id === workflowTypeId) ?? workflowTypes[0],
    [workflowTypeId],
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!request.trim()) {
      return;
    }

    const work = mockGenerateWork({
      workflowTypeId,
      request,
      usedContextIds: validUsedContextIds,
    });

    onGenerated([work, ...history], work);
    setNotice("API 호출 없이 로컬에서 Codex handoff용 초안을 만들었습니다.");
  }

  function changeWorkflow(id: WorkflowType["id"]) {
    setWorkflowTypeId(id);
    setRequest(sampleRequests[id]);
    setNotice("");
  }

  function toggleContext(id: string) {
    setUsedContextIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-[var(--line)] bg-white p-5">
      <div>
        <h2 className="text-xl font-semibold tracking-normal text-[var(--ink)]">작업 요청 입력</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          작업 유형과 개인 맥락을 골라 바로 사용할 수 있는 초안을 생성합니다.
        </p>
      </div>
      <div className="mt-6 space-y-5">
        <label className="block">
          <span className="text-sm font-medium text-[var(--ink)]">작업 유형</span>
          <select
            value={workflowTypeId}
            onChange={(event) => changeWorkflow(event.target.value as WorkflowType["id"])}
            className="mt-2 h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm outline-none transition focus:border-[var(--ink)]"
          >
            {workflowTypes.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.name}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded-lg bg-[var(--panel)] px-4 py-3">
          <p className="text-sm font-medium text-[var(--ink)]">{selectedWorkflow.description}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            기존 {selectedWorkflow.estimatedOriginalMinutes}분 → WorkOS {selectedWorkflow.estimatedWorkOSMinutes}분
          </p>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-[var(--ink)]">요청 내용</span>
          <textarea
            value={request}
            onChange={(event) => setRequest(event.target.value)}
            rows={7}
            className="mt-2 w-full resize-y rounded-lg border border-[var(--line)] bg-white px-3 py-3 text-sm leading-6 outline-none transition focus:border-[var(--ink)]"
          />
        </label>
        <fieldset>
          <legend className="text-sm font-medium text-[var(--ink)]">사용할 개인 맥락</legend>
          <div className="mt-3 grid gap-2">
            {contexts.map((context) => (
              <label
                key={context.id}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-3 text-sm transition hover:bg-white"
              >
                <input
                  type="checkbox"
                  checked={validUsedContextIds.includes(context.id)}
                  onChange={() => toggleContext(context.id)}
                  className="mt-1 h-4 w-4 rounded border-[var(--line)]"
                />
                <span>
                  <span className="block font-medium text-[var(--ink)]">{context.title}</span>
                  <span className="mt-1 block line-clamp-2 leading-5 text-[var(--muted)]">{context.content}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <button
        type="submit"
        className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-5 text-sm font-semibold text-white transition hover:bg-[#2b332d]"
      >
        <WandSparkles size={16} />
        결과물 생성
      </button>
      {notice ? <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{notice}</p> : null}
    </form>
  );
}
