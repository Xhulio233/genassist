import React from "react";
import { AlertTriangle, Check, Pencil, Plus, Trash2, Undo2, Wrench, Play } from "lucide-react";
import { Button } from "@/components/button";
import type { AssistProposal, ReviewFinding } from "@/services/workflowBuilder";
import type { PendingChange } from "@/views/AIAgents/Workflows/hooks/useCanvasAssistant";
import {
  changeKind,
  FIX_ISSUES_MESSAGE,
  type AssistantMessage,
} from "@/views/AIAgents/Workflows/utils/assistantDraft";

const BADGE = {
  add: "bg-green-50 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/30",
  update: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/30",
  remove: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30",
};

const SEVERITY = {
  error: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30",
  warning: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30",
  setup: "bg-muted text-muted-foreground border-border",
};

interface Props {
  msg: AssistantMessage;
  /** True for the newest message, where action buttons make sense. */
  isLatest: boolean;
  busy: boolean;
  onSend: (message: string, focusNodeIds?: string[]) => void;
  onApplyProposal?: (messageId: string, proposal: AssistProposal) => void;
  onRunSuggestedTest?: (message: string) => void;
  /** Centre the canvas on a node and open its settings (for issues and findings). */
  onFocusNode?: (nodeId: string, openSettings: boolean) => void;
}

/**
 * Everything an assistant message can carry besides its text: the change
 * badges, the issues it left (with a one-click fix), proposals waiting for
 * approval, suggested test messages, and review findings.
 */
export const AssistantMessageExtras: React.FC<Props> = ({
  msg,
  isLatest,
  busy,
  onSend,
  onApplyProposal,
  onRunSuggestedTest,
  onFocusNode,
}) => {
  const issues = msg.issues ?? [];
  const findings: ReviewFinding[] = msg.findings ?? [];
  return (
    <>
      {msg.changes && msg.changes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {msg.changes.map((change, index) => {
            const kind = changeKind(change);
            const Icon = kind === "add" ? Plus : kind === "update" ? Pencil : Trash2;
            return (
              <span
                key={`${change.op}-${index}`}
                className={`inline-flex items-center gap-1 text-xs border rounded-full px-2.5 py-1 ${BADGE[kind]}`}
              >
                <Icon className="h-3 w-3" />
                {change.summary}
              </span>
            );
          })}
        </div>
      )}

      {issues.length > 0 && (
        <ul className="mt-2 space-y-1">
          {issues.map((issue, index) => (
            <li
              key={`${issue.code}-${index}`}
              className={`flex items-start gap-1.5 text-xs rounded-md border px-2.5 py-1.5 ${SEVERITY[issue.severity]}`}
            >
              <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              {issue.node_id && onFocusNode ? (
                <button
                  type="button"
                  className="text-left underline-offset-2 hover:underline"
                  onClick={() => onFocusNode(issue.node_id as string, issue.severity === "setup")}
                >
                  {issue.message}
                </button>
              ) : (
                <span>{issue.message}</span>
              )}
            </li>
          ))}
          {isLatest && !busy && issues.some((issue) => issue.severity === "error") && (
            <li>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onSend(FIX_ISSUES_MESSAGE)}>
                Fix these
              </Button>
            </li>
          )}
        </ul>
      )}

      {msg.proposals && msg.proposals.length > 0 && (
        <ul className="mt-2 space-y-2">
          {msg.proposals.map((proposal, index) => (
            <li key={`${proposal.title}-${index}`} className="rounded-md border border-border bg-muted/40 px-3 py-2">
              <div className="text-xs font-medium text-foreground">{proposal.title}</div>
              {proposal.why && <div className="mt-0.5 text-xs text-muted-foreground">{proposal.why}</div>}
              {proposal.operations.length === 1 &&
                typeof proposal.operations[0].value === "string" && (
                  <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-[11px] leading-4 text-foreground">
                    {String(proposal.operations[0].value)}
                  </pre>
                )}
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={busy || !onApplyProposal}
                  onClick={() => onApplyProposal?.(msg.id, proposal)}
                >
                  <Check className="mr-1 h-3 w-3" />
                  Apply
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {msg.suggestions && msg.suggestions.length > 0 && (
        <ul className="mt-2 space-y-1">
          {msg.suggestions.map((suggestion, index) => (
            <li key={index}>
              <button
                type="button"
                disabled={!onRunSuggestedTest}
                onClick={() => onRunSuggestedTest?.(suggestion)}
                className="flex w-full items-start gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-left text-xs hover:bg-muted disabled:cursor-default"
              >
                <Play className="mt-0.5 h-3 w-3 flex-shrink-0 text-[hsl(var(--brand-600))]" />
                <span>{suggestion}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {findings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {findings.map((finding, index) => (
            <li
              key={`${finding.code}-${index}`}
              className={`flex items-start gap-1.5 text-xs rounded-md border px-2.5 py-1.5 ${SEVERITY[finding.severity]}`}
            >
              <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                {finding.node_id && onFocusNode ? (
                  <button
                    type="button"
                    className="text-left underline-offset-2 hover:underline"
                    onClick={() => onFocusNode(finding.node_id as string, finding.severity === "setup")}
                  >
                    {finding.message}
                  </button>
                ) : (
                  <span>{finding.message}</span>
                )}
              </div>
              {finding.fix && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSend(finding.fix as string, finding.node_id ? [finding.node_id] : [])}
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-current/30 px-1.5 py-0.5 text-[11px] hover:bg-background/60"
                >
                  <Wrench className="h-3 w-3" />
                  Fix
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
};

/** Bar shown while the assistant's last change is highlighted on the canvas. */
export const PendingChangeBar: React.FC<{
  change: PendingChange;
  onKeep: () => void;
  onUndo: () => void;
}> = ({ change, onKeep, onUndo }) => (
  <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-[hsl(var(--brand-600))]/40 bg-[hsl(var(--brand-600))]/10 px-3 py-2 text-xs">
    <span className="min-w-0 flex-1 truncate text-foreground" title={change.summary}>
      The assistant changed {change.count} thing{change.count === 1 ? "" : "s"} (highlighted on the canvas).
    </span>
    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onUndo}>
      <Undo2 className="mr-1 h-3 w-3" />
      Undo
    </Button>
    <Button size="sm" className="h-7 text-xs" onClick={onKeep}>
      <Check className="mr-1 h-3 w-3" />
      Keep
    </Button>
  </div>
);
