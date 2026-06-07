"use client";

import Link from "next/link";
import { ArrowRight, Clock3, Database, History, ListChecks } from "lucide-react";
import { DashboardCard } from "@/components/dashboard-card";
import { TimeSavedCard } from "@/components/time-saved-card";
import { useGeneratedHistory, useUserContexts } from "@/lib/use-workos-storage";
import { calculateDashboardMetrics, getWorkflowName, workflowTypes } from "@/lib/workos-data";

export function DashboardPage() {
  const [contexts] = useUserContexts();
  const [history] = useGeneratedHistory();
  const metrics = calculateDashboardMetrics(history, contexts);
  const recentHistory = history.slice(0, 4);

  return (
    <div className="space-y-8">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <p className="text-sm font-semibold text-[#17613b]">개인 AI 작업비서 MVP</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-normal text-[var(--ink)] sm:text-5xl">
            내 프로젝트와 이력을 기억하고 반복 업무 초안을 자동 생성합니다.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">
            지원서, 보고서, PPT, 리서치, Codex 프롬프트처럼 자주 반복되는 작업을 개인 맥락 기반 결과물로 바꿉니다.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/generate"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-5 text-sm font-semibold text-white transition hover:bg-[#2b332d]"
            >
              작업 시작
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/context"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[var(--line)] bg-white px-5 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--panel)]"
            >
              정보 저장
              <Database size={16} />
            </Link>
          </div>
        </div>
        <TimeSavedCard
          title="오늘 줄인 예상 시간"
          minutes={metrics.todaySavedMinutes}
          caption="mock 생성 기록 기준으로 계산한 생산성 지표입니다."
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardCard
          label="저장된 개인 컨텍스트"
          value={`${metrics.contextCount}개`}
          detail="소개, 프로젝트, 기술 스택, 말투를 결과 생성에 반영합니다."
          icon={<Database size={19} />}
          tone="green"
        />
        <DashboardCard
          label="가장 많이 쓰는 작업"
          value={metrics.mostUsedWorkflowName}
          detail="히스토리 기반으로 다음 작업 유형 추천에 사용할 수 있습니다."
          icon={<ListChecks size={19} />}
          tone="amber"
        />
        <DashboardCard
          label="이번 주 절감 시간"
          value={`${toHours(metrics.weekSavedMinutes)}시간`}
          detail="최근 7일 기준 예상 절감 시간을 합산했습니다."
          icon={<Clock3 size={19} />}
          tone="blue"
        />
        <DashboardCard
          label="전체 절감 시간"
          value={`${toHours(metrics.totalSavedMinutes)}시간`}
          detail="생성된 모든 작업 기록의 예상 절감 시간입니다."
          icon={<History size={19} />}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-lg border border-[var(--line)] bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-normal text-[var(--ink)]">최근 작업</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">생성한 결과물을 다시 열고 이어서 수정할 수 있습니다.</p>
            </div>
            <Link href="/history" className="text-sm font-semibold text-[var(--ink)] hover:underline">
              전체 보기
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {recentHistory.map((item) => (
              <Link
                key={item.id}
                href={`/generate?workflow=${item.workflowType}&request=${encodeURIComponent(item.request)}`}
                className="block rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:bg-white"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm font-semibold text-[var(--ink)]">{getWorkflowName(item.workflowType)}</span>
                  <span className="text-xs font-medium text-[#17613b]">{item.savedMinutes}분 절감</span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--muted)]">{item.request}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-[var(--line)] bg-white p-5">
          <h2 className="text-xl font-semibold tracking-normal text-[var(--ink)]">개인 컨텍스트 요약</h2>
          <div className="mt-5 space-y-3">
            {contexts.slice(0, 4).map((context) => (
              <article key={context.id} className="rounded-lg bg-[var(--panel)] p-4">
                <p className="text-xs font-semibold text-[#17613b]">{context.category}</p>
                <h3 className="mt-1 text-sm font-semibold text-[var(--ink)]">{context.title}</h3>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--muted)]">{context.content}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--line)] bg-white p-5">
        <h2 className="text-xl font-semibold tracking-normal text-[var(--ink)]">빠른 작업 시작</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {workflowTypes.slice(0, 4).map((workflow) => (
            <Link
              key={workflow.id}
              href={`/generate?workflow=${workflow.id}`}
              className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:bg-white"
            >
              <span className="text-sm font-semibold text-[var(--ink)]">{workflow.name}</span>
              <span className="mt-2 block text-sm leading-6 text-[var(--muted)]">{workflow.description}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function toHours(minutes: number) {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}
