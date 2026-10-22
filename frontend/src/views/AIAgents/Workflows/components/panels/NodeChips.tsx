import React from "react";
import { X } from "lucide-react";
import nodeRegistry from "@/views/AIAgents/Workflows/registry/nodeRegistry";
import { renderIcon } from "@/views/AIAgents/Workflows/utils/iconUtils";
import { splitNodeMentions, type MentionableNode } from "@/views/AIAgents/Workflows/utils/assistantDraft";

export interface NodeChipProps {
  node: MentionableNode;
  onClick?: (nodeId: string) => void;
  onRemove?: (nodeId: string) => void;
  /** Dashed, quieter chip for context that was not typed by the person (the selected node). */
  soft?: boolean;
  /** On a dark bubble (the person's own messages). */
  inverted?: boolean;
}

/** A step of the workflow, shown as a small badge; clicking it centres the canvas on the step. */
export const NodeChip: React.FC<NodeChipProps> = ({ node, onClick, onRemove, soft, inverted }) => {
  const icon = node.type ? nodeRegistry.getNodeType(node.type)?.icon : undefined;
  const base = inverted
    ? "border-white/40 bg-white/15 text-white hover:bg-white/25"
    : soft
    ? "border-dashed border-border bg-muted/40 text-muted-foreground hover:bg-muted"
    : "border-[hsl(var(--brand-600))]/40 bg-[hsl(var(--brand-600))]/10 text-foreground hover:bg-[hsl(var(--brand-600))]/20";
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 align-middle text-[12px] leading-4 ${base}`}
    >
      <button
        type="button"
        onClick={() => onClick?.(node.id)}
        title="Show this step on the canvas"
        className="inline-flex min-w-0 items-center gap-1"
      >
        {icon && <span className="inline-flex h-3 w-3 shrink-0 items-center [&>svg]:h-3 [&>svg]:w-3">{renderIcon(icon)}</span>}
        <span className="truncate">{node.name}</span>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(node.id)}
          aria-label={`Remove ${node.name}`}
          className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
};

/** A message with every "@Step" or quoted step name shown as a chip. */
export const MentionText: React.FC<{
  text: string;
  nodes: MentionableNode[];
  onFocusNode?: (nodeId: string) => void;
  inverted?: boolean;
}> = ({ text, nodes, onFocusNode, inverted }) => {
  const segments = splitNodeMentions(text, nodes);
  return (
    <span className="whitespace-pre-wrap">
      {segments.map((segment, index) =>
        "node" in segment ? (
          <NodeChip key={index} node={segment.node} onClick={onFocusNode} inverted={inverted} />
        ) : (
          <React.Fragment key={index}>{segment.text}</React.Fragment>
        )
      )}
    </span>
  );
};

/** The steps a message names, as a row of chips under it (keeps the message's own formatting). */
export const MentionedNodesRow: React.FC<{
  text: string;
  nodes: MentionableNode[];
  onFocusNode?: (nodeId: string) => void;
}> = ({ text, nodes, onFocusNode }) => {
  const mentioned = splitNodeMentions(text, nodes)
    .filter((segment): segment is { node: MentionableNode } => "node" in segment)
    .map((segment) => segment.node)
    .filter((node, index, all) => all.findIndex((n) => n.id === node.id) === index);
  if (mentioned.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {mentioned.map((node) => (
        <NodeChip key={node.id} node={node} onClick={onFocusNode} />
      ))}
    </div>
  );
};
