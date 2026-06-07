"use client";

import { HistoryList } from "@/components/history-list";
import { useGeneratedHistory } from "@/lib/use-workos-storage";

export function HistoryPage() {
  const [history] = useGeneratedHistory();

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-semibold text-[#17613b]">작업 기록</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-normal text-[var(--ink)] sm:text-4xl">
          이전에 만든 초안과 절감 시간을 한곳에서 확인합니다.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">
          작업 유형, 요청 내용, 생성 날짜, 예상 절감 시간을 기록하고 같은 요청을 다시 열 수 있습니다.
        </p>
      </section>
      <HistoryList history={history} />
    </div>
  );
}
