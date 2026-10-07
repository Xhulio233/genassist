import { describe, it, expect } from "vitest";
import { Edge, Node } from "reactflow";
import {
  changeKind,
  changesAffectLayout,
  mergeDraftNodes,
  reportableIssues,
  serializeCanvasForDraft,
} from "@/views/AIAgents/Workflows/utils/assistantDraft";
import type { BuilderDraft, BuilderIssue } from "@/services/workflowBuilder";

const node = (id: string, data: Record<string, unknown> = {}, extra: Partial<Node> = {}): Node => ({
  id,
  type: "agentNode",
  position: { x: 10, y: 20 },
  data: { name: id, ...data },
  ...extra,
});

describe("serializeCanvasForDraft", () => {
  it("drops callbacks and keeps everything else", () => {
    const nodes = [node("a", { updateNodeData: () => undefined, systemPrompt: "hi" })];
    const edges: Edge[] = [{ id: "e", source: "a", target: "b", sourceHandle: "output" }];

    const snapshot = serializeCanvasForDraft(nodes, edges, "a");

    expect(snapshot.nodes[0]).toEqual({
      id: "a",
      type: "agentNode",
      position: { x: 10, y: 20 },
      data: { name: "a", systemPrompt: "hi" },
    });
    expect(snapshot.edges).toEqual(edges);
    expect(snapshot.selected_node_id).toBe("a");
  });

  it("sends null when nothing is selected", () => {
    expect(serializeCanvasForDraft([], []).selected_node_id).toBeNull();
  });
});

describe("mergeDraftNodes", () => {
  it("takes data from the draft but keeps where the user put the node", () => {
    const current = [
      node("a", { systemPrompt: "old" }, { position: { x: 500, y: 600 }, selected: true, parentId: "g" }),
    ];
    const draft = [node("a", { systemPrompt: "new" }, { position: { x: 0, y: 0 } })];

    const [merged] = mergeDraftNodes(current, draft);

    expect(merged.data.systemPrompt).toBe("new");
    expect(merged.position).toEqual({ x: 500, y: 600 });
    expect(merged.selected).toBe(true);
    expect(merged.parentId).toBe("g");
  });

  it("adds new nodes as the draft placed them and drops removed ones", () => {
    const current = [node("a"), node("gone")];
    const draft = [node("a"), node("new", {}, { position: { x: 360, y: 20 } })];

    const merged = mergeDraftNodes(current, draft);

    expect(merged.map((n) => n.id)).toEqual(["a", "new"]);
    expect(merged[1].position).toEqual({ x: 360, y: 20 });
  });
});

describe("reportableIssues", () => {
  const issue = (overrides: Partial<BuilderIssue>): BuilderIssue => ({
    code: "dead_end",
    severity: "error",
    message: "m",
    node_id: "a",
    field: null,
    pre_existing: false,
    ...overrides,
  });

  it("shows only what this turn introduced and the user can act on in chat", () => {
    const draft = {
      issues: [
        issue({ code: "new_error" }),
        issue({ code: "old_error", pre_existing: true }),
        issue({ code: "needs_setup", severity: "setup" }),
        issue({ code: "new_warning", severity: "warning" }),
      ],
    } as BuilderDraft;

    expect(reportableIssues(draft).map((i) => i.code)).toEqual(["new_error", "new_warning"]);
  });
});

describe("changeKind", () => {
  it("groups operations for the badges", () => {
    const kind = (op: string) => changeKind({ op, summary: "", node_ids: [] } as never);
    expect(kind("add_node")).toBe("add");
    expect(kind("add_tool")).toBe("add");
    expect(kind("update_node")).toBe("update");
    expect(kind("connect")).toBe("update");
    expect(kind("remove_node")).toBe("remove");
    expect(kind("disconnect")).toBe("remove");
  });
});

describe("changesAffectLayout", () => {
  const change = (op: string) => ({ op, summary: "", node_ids: [] }) as never;

  it("is true when nodes or connections were added or removed", () => {
    for (const op of ["add_node", "add_tool", "remove_node", "connect", "disconnect"]) {
      expect(changesAffectLayout([change("update_node"), change(op)])).toBe(true);
    }
  });

  it("is false when only settings changed, so nothing the user arranged moves", () => {
    expect(changesAffectLayout([change("update_node"), change("update_node")])).toBe(false);
    expect(changesAffectLayout([])).toBe(false);
  });
});
