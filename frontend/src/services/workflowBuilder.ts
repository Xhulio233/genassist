import { apiRequest } from "@/config/api";

const BASE = "workflow-builder";

/** One change the builder agent made to the workflow during a turn. */
export interface BuilderChange {
  op:
    | "add_node"
    | "add_tool"
    | "update_node"
    | "remove_node"
    | "connect"
    | "disconnect";
  summary: string;
  node_ids: string[];
}

export interface BuilderIssue {
  code: string;
  severity: "error" | "warning" | "setup";
  message: string;
  node_id: string | null;
  field: string | null;
  /** True when the problem was on the canvas before the agent changed anything. */
  pre_existing: boolean;
}

export interface BuilderDraft {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  status: "draft" | "ready";
  revision: number;
  origin: "new" | "canvas";
  summary: string;
  changes: BuilderChange[];
  issues: BuilderIssue[];
  has_errors: boolean;
}

export interface BuilderCanvasSnapshot {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  selected_node_id?: string | null;
  /** The person's latest test run on the canvas, so the agent can see it without a pasted log. */
  last_test_run?: {
    inputs: Record<string, unknown>;
    response: unknown;
    error: string | null;
  } | null;
}

/**
 * Hand the canvas (including unsaved changes) to the builder agent as the
 * draft it will edit in this conversation.
 */
export const putBuilderDraft = (
  conversationId: string,
  snapshot: BuilderCanvasSnapshot
) =>
  apiRequest<{ revision: number; node_count: number }>(
    "PUT",
    `${BASE}/drafts/${conversationId}`,
    snapshot as unknown as Record<string, unknown>
  );

/** Read the draft back after the agent's turn. */
export const getBuilderDraft = (conversationId: string) =>
  apiRequest<BuilderDraft>("GET", `${BASE}/drafts/${conversationId}`);

/** Validate a workflow graph without saving anything. */
export const validateWorkflowGraph = (snapshot: BuilderCanvasSnapshot) =>
  apiRequest<{ valid: boolean; issues: Omit<BuilderIssue, "pre_existing">[] }>(
    "POST",
    `${BASE}/validate`,
    snapshot as unknown as Record<string, unknown>
  );

export interface BuilderDraftStatus {
  status: "empty" | "draft" | "ready";
  /** Finalized by the agent and free of blocking errors. */
  ready: boolean;
  node_count: number;
  summary: string;
  /** The draft in the simplified specification format, for previewing. */
  spec: {
    workflow: {
      uniqueId: string;
      node_name: string;
      function_of_node: string;
      config?: Record<string, unknown>;
    }[];
    edges: { from: string; to: string; sourceHandle?: string; targetHandle?: string }[];
  } | null;
}

/**
 * Draft status for a chat that runs before login (onboarding), where there is
 * no user session yet: it authenticates with the same API key the chat uses.
 */
export const getBuilderDraftStatus = async (
  conversationId: string,
  credentials: { baseUrl: string; apiKey: string; tenant?: string }
): Promise<BuilderDraftStatus | null> => {
  const headers: Record<string, string> = { "x-api-key": credentials.apiKey };
  if (credentials.tenant) headers["x-tenant-id"] = credentials.tenant;
  const response = await fetch(
    `${credentials.baseUrl.replace(/\/$/, "")}/api/${BASE}/drafts/${conversationId}/status`,
    { headers }
  );
  if (!response.ok) return null;
  return (await response.json()) as BuilderDraftStatus;
};

/**
 * The reason a build was rejected, from the builder API's error body
 * (`detail.message` plus the first issue), or null when there is none.
 */
export const builderErrorMessage = (error: unknown): string | null => {
  const detail = (error as { response?: { data?: { detail?: unknown } } })
    ?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    const { message, issues } = detail as {
      message?: string;
      issues?: { message?: string }[];
    };
    const first = issues?.[0]?.message;
    if (message && first) return `${message}: ${first}`;
    return message || first || null;
  }
  return null;
};
