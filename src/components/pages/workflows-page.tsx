import { WorkflowCard } from "@/components/workflow-card";
import { workflowTypes } from "@/lib/workos-data";

export function WorkflowsPage() {
  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-semibold text-[#17613b]">작업 유형 선택</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-normal text-[var(--ink)] sm:text-4xl">
          반복 업무를 결과물 유형별 워크플로로 나눴습니다.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">
          지원서, 보고서, PPT, 리서치, Codex 프롬프트 등 자주 쓰는 흐름을 카드에서 바로 시작합니다.
        </p>
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workflowTypes.map((workflow) => (
          <WorkflowCard key={workflow.id} workflow={workflow} />
        ))}
      </section>
    </div>
  );
}
