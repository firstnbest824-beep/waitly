"use client";

import { ContextEditor } from "@/components/context-editor";
import { useUserContexts } from "@/lib/use-workos-storage";

export function ContextPage() {
  const [contexts, setContexts] = useUserContexts();

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="개인 컨텍스트 저장"
        title="매번 다시 설명하던 내 배경 정보를 한 번에 관리합니다."
        description="기본 소개, 프로젝트, 수상 이력, 기술 스택, 작성 규칙, 말투를 저장하고 생성 화면에서 필요한 맥락만 선택합니다."
      />
      <ContextEditor contexts={contexts} onChange={setContexts} />
    </div>
  );
}

function PageIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <section>
      <p className="text-sm font-semibold text-[#17613b]">{eyebrow}</p>
      <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-normal text-[var(--ink)] sm:text-4xl">
        {title}
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">{description}</p>
    </section>
  );
}
