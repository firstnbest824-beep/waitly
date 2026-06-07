import type { DashboardMetrics, GeneratedWork, UserContext, WorkflowType } from "./types";

export const workflowTypes: WorkflowType[] = [
  {
    id: "resume",
    name: "지원서 작성",
    description: "자기소개서, 직무 연결 문장, 지원 동기를 개인 맥락에 맞게 초안화합니다.",
    estimatedOriginalMinutes: 180,
    estimatedWorkOSMinutes: 60,
    promptTemplate: "개인 프로필과 프로젝트 경험을 바탕으로 지원서 초안을 구조화하고 직무 연결성을 점검합니다.",
  },
  {
    id: "report",
    name: "과제/보고서 작성",
    description: "보고서 목차, 주장-근거 구조, 제출 전 확인 항목을 빠르게 만듭니다.",
    estimatedOriginalMinutes: 180,
    estimatedWorkOSMinutes: 70,
    promptTemplate: "과제 조건과 선호 문체를 반영해 보고서 초안과 수정 체크리스트를 작성합니다.",
  },
  {
    id: "ppt",
    name: "PPT 기획",
    description: "발표 목적에 맞는 슬라이드 목차와 각 장의 핵심 문장을 설계합니다.",
    estimatedOriginalMinutes: 240,
    estimatedWorkOSMinutes: 90,
    promptTemplate: "발표 대상과 프로젝트 내용을 기반으로 PPT 흐름, 슬라이드 메시지, 발표 체크리스트를 만듭니다.",
  },
  {
    id: "research",
    name: "연구실/기업 리서치",
    description: "조사 항목, 판단 기준, 확인해야 할 출처 목록을 정리합니다.",
    estimatedOriginalMinutes: 180,
    estimatedWorkOSMinutes: 60,
    promptTemplate: "관심 분야와 목표를 바탕으로 연구실 또는 기업 리서치 프레임과 컨택 초안을 작성합니다.",
  },
  {
    id: "codex-prompt",
    name: "Codex 프롬프트 생성",
    description: "개발 목표, 수정 파일, UI/API/테스트 조건을 Codex용 작업 지시로 변환합니다.",
    estimatedOriginalMinutes: 210,
    estimatedWorkOSMinutes: 60,
    promptTemplate: "현재 코드베이스 상황과 목표를 Codex가 실행 가능한 구현 프롬프트로 정리합니다.",
  },
  {
    id: "code-explain",
    name: "코드 설명",
    description: "코드의 목적, 실행 흐름, 위험 지점, 개선 방향을 읽기 쉬운 설명으로 바꿉니다.",
    estimatedOriginalMinutes: 90,
    estimatedWorkOSMinutes: 25,
    promptTemplate: "제공된 코드나 에러 내용을 요약하고, 구조와 수정 후보를 단계별로 설명합니다.",
  },
  {
    id: "submission-checklist",
    name: "제출물 체크리스트",
    description: "마감 전 빠뜨리기 쉬운 파일, 형식, 내용 검토 항목을 생성합니다.",
    estimatedOriginalMinutes: 120,
    estimatedWorkOSMinutes: 35,
    promptTemplate: "제출 조건과 산출물 종류를 기준으로 실수 방지 체크리스트를 만듭니다.",
  },
];

export const defaultUserContexts: UserContext[] = [
  {
    id: "ctx-profile",
    category: "기본 소개",
    title: "기본 자기소개",
    content:
      "대학생, 개발자, 창업가 지향. 문제를 작게 쪼개고 실제 사용 가능한 결과물로 빠르게 검증하는 방식을 선호한다.",
    updatedAt: "2026-06-05T09:00:00.000Z",
  },
  {
    id: "ctx-projects",
    category: "주요 프로젝트",
    title: "프로젝트 경험",
    content:
      "Firbe, Kaitly, NU-EERC, GIST AIML 관련 프로젝트 경험이 있으며 제품 기획, 프론트엔드 구현, AI 도구 활용에 관심이 많다.",
    updatedAt: "2026-06-05T09:10:00.000Z",
  },
  {
    id: "ctx-stack",
    category: "기술 스택",
    title: "기술 스택",
    content: "Next.js, TypeScript, Tailwind CSS, React, Supabase, Codex 기반 개발 워크플로를 자주 사용한다.",
    updatedAt: "2026-06-05T09:20:00.000Z",
  },
  {
    id: "ctx-tone",
    category: "선호 말투",
    title: "문체와 작업 방식",
    content: "명확하고 실용적인 문체를 선호한다. 과장된 표현보다 근거, 구조, 바로 실행 가능한 다음 행동을 중시한다.",
    updatedAt: "2026-06-05T09:30:00.000Z",
  },
];

export const defaultGeneratedWorks: GeneratedWork[] = [
  {
    id: "seed-ppt",
    workflowType: "ppt",
    request: "NU-EERC 공모전 발표 PPT 구조를 만들어줘.",
    result:
      "슬라이드 목차\n1. 문제 정의\n2. 기존 방식의 한계\n3. 제안 솔루션\n4. 구현 구조\n5. 기대 효과\n6. 다음 실험 계획",
    checklist: ["첫 장에서 문제를 한 문장으로 고정", "데이터나 사례가 들어갈 슬라이드 표시", "마지막 장에 요청 사항 포함"],
    nextPrompt: "이 PPT 목차를 바탕으로 각 슬라이드의 핵심 문장과 발표 스크립트를 만들어줘.",
    usedContextIds: ["ctx-projects", "ctx-tone"],
    savedMinutes: 150,
    createdAt: "2026-06-05T10:00:00.000Z",
  },
  {
    id: "seed-codex",
    workflowType: "codex-prompt",
    request: "Kaitly 온보딩 화면 구현용 Codex 프롬프트를 만들어줘.",
    result:
      "1. 작업 목표\nKaitly 온보딩 화면을 구현한다.\n\n2. 현재 상황\n초기 화면 요구사항만 정리된 상태다.",
    checklist: ["수정 파일 범위 확인", "빌드 명령 실행", "개인정보 제거"],
    nextPrompt: "이 프롬프트를 실제 저장소 구조에 맞춰 더 구체화해줘.",
    usedContextIds: ["ctx-projects", "ctx-stack"],
    savedMinutes: 150,
    createdAt: "2026-06-04T15:00:00.000Z",
  },
];

export function getWorkflowType(id: WorkflowType["id"]) {
  return workflowTypes.find((workflow) => workflow.id === id) ?? workflowTypes[0];
}

export function getWorkflowName(id: WorkflowType["id"]) {
  return getWorkflowType(id).name;
}

export function getSavedMinutesForWorkflow(id: WorkflowType["id"]) {
  const workflow = getWorkflowType(id);
  return workflow.estimatedOriginalMinutes - workflow.estimatedWorkOSMinutes;
}

export function calculateDashboardMetrics(
  history: GeneratedWork[],
  contexts: UserContext[] = [],
  now = new Date(),
): DashboardMetrics {
  const todayKey = toDateKey(now);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(now);
  weekEnd.setHours(23, 59, 59, 999);

  const counts = new Map<WorkflowType["id"], number>();
  let totalSavedMinutes = 0;
  let todaySavedMinutes = 0;
  let weekSavedMinutes = 0;

  for (const item of history) {
    const created = new Date(item.createdAt);
    totalSavedMinutes += item.savedMinutes;
    counts.set(item.workflowType, (counts.get(item.workflowType) ?? 0) + 1);

    if (toDateKey(created) === todayKey) {
      todaySavedMinutes += item.savedMinutes;
    }

    if (created >= weekStart && created <= weekEnd) {
      weekSavedMinutes += item.savedMinutes;
    }
  }

  const mostUsedWorkflowId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    contextCount: contexts.length,
    totalSavedMinutes,
    todaySavedMinutes,
    weekSavedMinutes,
    mostUsedWorkflowName: mostUsedWorkflowId ? getWorkflowName(mostUsedWorkflowId) : "아직 없음",
  };
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
