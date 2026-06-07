export type UserContext = {
  id: string;
  category: string;
  title: string;
  content: string;
  updatedAt: string;
};

export type WorkflowType = {
  id:
    | "resume"
    | "report"
    | "ppt"
    | "research"
    | "codex-prompt"
    | "code-explain"
    | "submission-checklist";
  name: string;
  description: string;
  estimatedOriginalMinutes: number;
  estimatedWorkOSMinutes: number;
  promptTemplate: string;
};

export type GeneratedWork = {
  id: string;
  workflowType: WorkflowType["id"];
  request: string;
  result: string;
  checklist: string[];
  nextPrompt: string;
  usedContextIds: string[];
  savedMinutes: number;
  createdAt: string;
};

export type DashboardMetrics = {
  contextCount: number;
  totalSavedMinutes: number;
  todaySavedMinutes: number;
  weekSavedMinutes: number;
  mostUsedWorkflowName: string;
};

export type GenerateWorkInput = {
  workflowTypeId: WorkflowType["id"];
  request: string;
  usedContextIds: string[];
};
