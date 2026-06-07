"use client";

import { FormEvent, useMemo, useState } from "react";
import { Pencil, Save, Trash2 } from "lucide-react";
import type { UserContext } from "@/lib/types";

const contextCategories = [
  "기본 소개",
  "주요 프로젝트",
  "수상 이력",
  "기술 스택",
  "지원서 소재",
  "과제 작성 규칙",
  "선호 말투",
  "작업 방식",
];

const emptyDraft = {
  id: "",
  category: "기본 소개",
  title: "",
  content: "",
};

export function ContextEditor({
  contexts,
  onChange,
}: {
  contexts: UserContext[];
  onChange: (contexts: UserContext[]) => void;
}) {
  const [draft, setDraft] = useState(emptyDraft);
  const [notice, setNotice] = useState("");

  const previewText = useMemo(() => {
    if (contexts.length === 0) {
      return "저장된 개인 맥락이 없습니다.";
    }

    return contexts
      .slice(0, 4)
      .map((context) => `${context.category}: ${context.title}`)
      .join(" / ");
  }, [contexts]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft.title.trim() || !draft.content.trim()) {
      setNotice("제목과 내용을 모두 입력해 주세요.");
      return;
    }

    const nextContext: UserContext = {
      id: draft.id || `ctx-${Date.now()}`,
      category: draft.category,
      title: draft.title.trim(),
      content: draft.content.trim(),
      updatedAt: new Date().toISOString(),
    };

    const nextContexts = draft.id
      ? contexts.map((context) => (context.id === draft.id ? nextContext : context))
      : [nextContext, ...contexts];

    onChange(nextContexts);
    setDraft(emptyDraft);
    setNotice("개인 맥락이 저장되었습니다.");
  }

  function editContext(context: UserContext) {
    setDraft({
      id: context.id,
      category: context.category,
      title: context.title,
      content: context.content,
    });
    setNotice("선택한 맥락을 편집 중입니다.");
  }

  function deleteContext(id: string) {
    onChange(contexts.filter((context) => context.id !== id));
    if (draft.id === id) {
      setDraft(emptyDraft);
    }
    setNotice("개인 맥락을 삭제했습니다.");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <form onSubmit={submit} className="rounded-lg border border-[var(--line)] bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-normal text-[var(--ink)]">개인 정보 저장</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              프로젝트, 이력, 말투, 과제 규칙을 저장해 생성 결과에 반영합니다.
            </p>
          </div>
          <span className="rounded-lg bg-[var(--panel)] px-3 py-2 text-sm font-medium text-[var(--muted)]">
            {contexts.length}개 저장
          </span>
        </div>
        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-[var(--ink)]">카테고리</span>
            <select
              value={draft.category}
              onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
              className="mt-2 h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm outline-none transition focus:border-[var(--ink)]"
            >
              {contextCategories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[var(--ink)]">제목</span>
            <input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder="예: GIST AIML 리서치 경험"
              className="mt-2 h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--ink)]"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[var(--ink)]">내용</span>
            <textarea
              value={draft.content}
              onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
              placeholder="작업 결과에 반복해서 반영하고 싶은 정보를 적어 주세요."
              rows={9}
              className="mt-2 w-full resize-y rounded-lg border border-[var(--line)] bg-white px-3 py-3 text-sm leading-6 outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--ink)]"
            />
          </label>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-h-5 text-sm text-[var(--muted)]">{notice}</p>
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-5 text-sm font-semibold text-white transition hover:bg-[#2b332d]"
          >
            <Save size={16} />
            정보 저장
          </button>
        </div>
      </form>
      <section className="rounded-lg border border-[var(--line)] bg-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-normal text-[var(--ink)]">저장된 컨텍스트 미리보기</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{previewText}</p>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {contexts.map((context) => (
            <article key={context.id} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#17613b]">{context.category}</p>
                  <h3 className="mt-1 text-base font-semibold text-[var(--ink)]">{context.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--muted)]">{context.content}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => editContext(context)}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--line)] bg-white text-[var(--muted)] transition hover:text-[var(--ink)]"
                    aria-label={`${context.title} 수정`}
                    title="수정"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteContext(context.id)}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--line)] bg-white text-[var(--muted)] transition hover:text-[#a33a2a]"
                    aria-label={`${context.title} 삭제`}
                    title="삭제"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
