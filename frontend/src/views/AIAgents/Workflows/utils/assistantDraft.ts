import { Edge, Node } from "reactflow";
import type {
  BuilderCanvasSnapshot,
  BuilderChange,
  BuilderDraft,
  BuilderIssue,
} from "@/services/workflowBuilder";

/**
 * The canvas assistant works on a server-side draft of the workflow: the canvas
 * is uploaded before each message and the edited draft is read back afterwards.
 * These helpers are the two ends of that round trip.
 */

export interface AssistantMessage {
  id: string;
  speaker: "agent" | "customer";
  text: string;
  /** What the assistant changed on the canvas in this reply. */
  changes?: BuilderChange[];
  /** Problems the assistant's changes left behind (never pre-existing ones). */
  issues?: BuilderIssue[];
}

export type ChangeKind = "add" | "update" | "remove";

export const changeKind = (change: BuilderChange): ChangeKind => {
  if (change.op === "add_node" || change.op === "add_tool") return "add";
  if (change.op === "remove_node" || change.op === "disconnect") return "remove";
  return "update";
};

/**
 * Whether a turn changed the shape of the graph (nodes or connections added or
 * removed), as opposed to only editing settings. Only then is the canvas
 * re-arranged: editing a prompt should never move anything.
 */
export const changesAffectLayout = (changes: BuilderChange[]): boolean =>
  changes.some((change) => change.op !== "update_node");

/** Canvas state as plain JSON: callbacks React Flow nodes carry in `data` are dropped. */
export function serializeCanvasForDraft(
  nodes: Node[],
  edges: Edge[],
  selectedNodeId?: string | null,
  lastTestRun?: BuilderCanvasSnapshot["last_test_run"]
): BuilderCanvasSnapshot {
  return JSON.parse(
    JSON.stringify({
      nodes,
      edges,
      selected_node_id: selectedNodeId ?? null,
      last_test_run: lastTestRun ?? null,
    })
  ) as BuilderCanvasSnapshot;
}

/** What to send when the person asks the assistant to finish what it left broken. */
export const FIX_ISSUES_MESSAGE =
  "The workflow still has the problems listed above. Fix them, test it, and finish.";

/**
 * Apply the draft's nodes to the canvas.
 *
 * The draft decides which nodes exist and what their data is. For nodes that
 * were already on the canvas, everything the user controls on the canvas
 * itself (position, size, selection, grouping) is kept from the live node, so
 * the assistant never moves things the user arranged, even if they dragged a
 * node while the assistant was working.
 */
export function mergeDraftNodes(current: Node[], draftNodes: Node[]): Node[] {
  const live = new Map(current.map((node) => [node.id, node]));
  return draftNodes.map((draftNode) => {
    const existing = live.get(draftNode.id);
    if (!existing) return draftNode;
    return { ...existing, type: draftNode.type, data: draftNode.data };
  });
}

/** Issues worth showing under a reply: what this turn introduced and the user can act on. */
export function reportableIssues(draft: BuilderDraft): BuilderIssue[] {
  return draft.issues.filter(
    (issue) => !issue.pre_existing && issue.severity !== "setup"
  );
}
