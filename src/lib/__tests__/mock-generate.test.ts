import { describe, expect, it } from "vitest";
import { calculateDashboardMetrics, workflowTypes } from "../workos-data";
import { mockGenerateWork } from "../mock-generate";

describe("workflowTypes", () => {
  it("defines the seven MVP workflow types with time saving metadata", () => {
    expect(workflowTypes).toHaveLength(7);
    expect(workflowTypes.map((workflow) => workflow.id)).toEqual([
      "resume",
      "report",
      "ppt",
      "research",
      "codex-prompt",
      "code-explain",
      "submission-checklist",
    ]);

    for (const workflow of workflowTypes) {
      expect(workflow.estimatedOriginalMinutes).toBeGreaterThan(
        workflow.estimatedWorkOSMinutes,
      );
      expect(workflow.promptTemplate.length).toBeGreaterThan(20);
    }
  });
});

describe("mockGenerateWork", () => {
  it("returns a detailed Codex prompt artifact with required sections", () => {
    const output = mockGenerateWork({
      workflowTypeId: "codex-prompt",
      request: "Build a production-ready planner for Kaitly onboarding.",
      usedContextIds: ["ctx-projects", "ctx-tone"],
    });

    expect(output.workflowType).toBe("codex-prompt");
    expect(output.savedMinutes).toBe(150);
    expect(output.usedContextIds).toEqual(["ctx-projects", "ctx-tone"]);

    for (const heading of [
      "1. 작업 목표",
      "2. 현재 상황",
      "3. 수정해야 할 파일",
      "4. 새로 만들 파일",
      "5. UI 요구사항",
      "6. API 요구사항",
      "7. 테스트 요구사항",
      "8. 보안/개인정보 주의사항",
      "9. 완료 기준",
      "10. 커밋 전 체크리스트",
    ]) {
      expect(output.result).toContain(heading);
    }

    expect(output.checklist).toContain("개인정보나 비밀키를 prompt에 넣지 않았는지 확인");
    expect(output.nextPrompt).toContain("생성한 Codex 프롬프트를 실제 코드베이스 구조에 맞게");
  });

  it("returns workflow-specific result structures for presentation planning", () => {
    const output = mockGenerateWork({
      workflowTypeId: "ppt",
      request: "NU-EERC 공모전 발표 PPT 구조를 만들어줘.",
      usedContextIds: ["ctx-projects"],
    });

    expect(output.savedMinutes).toBe(150);
    expect(output.result).toContain("슬라이드 목차");
    expect(output.result).toContain("발표 흐름 체크리스트");
    expect(output.checklist).toContain("각 슬라이드가 한 문장 메시지를 갖는지 확인");
  });
});

describe("calculateDashboardMetrics", () => {
  it("summarizes saved time and the most used workflow", () => {
    const metrics = calculateDashboardMetrics(
      [
        {
          id: "a",
          workflowType: "ppt",
          request: "first",
          result: "",
          checklist: [],
          nextPrompt: "",
          usedContextIds: [],
          savedMinutes: 150,
          createdAt: "2026-06-05T09:00:00.000Z",
        },
        {
          id: "b",
          workflowType: "ppt",
          request: "second",
          result: "",
          checklist: [],
          nextPrompt: "",
          usedContextIds: [],
          savedMinutes: 150,
          createdAt: "2026-06-05T10:00:00.000Z",
        },
        {
          id: "c",
          workflowType: "research",
          request: "third",
          result: "",
          checklist: [],
          nextPrompt: "",
          usedContextIds: [],
          savedMinutes: 120,
          createdAt: "2026-06-01T10:00:00.000Z",
        },
      ],
      [],
      new Date("2026-06-05T12:00:00.000Z"),
    );

    expect(metrics.totalSavedMinutes).toBe(420);
    expect(metrics.todaySavedMinutes).toBe(300);
    expect(metrics.weekSavedMinutes).toBe(420);
    expect(metrics.mostUsedWorkflowName).toBe("PPT 기획");
  });
});
