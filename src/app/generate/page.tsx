import { GeneratePage } from "@/components/pages/generate-page";
import type { WorkflowType } from "@/lib/types";
import { workflowTypes } from "@/lib/workos-data";

type PageProps = {
  searchParams: Promise<{
    request?: string;
    workflow?: string;
  }>;
};

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;

  return <GeneratePage initialWorkflowTypeId={normalizeWorkflow(params.workflow)} initialRequest={params.request ?? ""} />;
}

function normalizeWorkflow(id: string | undefined): WorkflowType["id"] {
  return workflowTypes.some((workflow) => workflow.id === id) ? (id as WorkflowType["id"]) : "resume";
}
