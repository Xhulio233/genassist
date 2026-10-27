import React, { useState, useRef, useMemo, useCallback } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/tabs";
import { AlertTriangle, GripVertical, HelpCircle, Search, Sparkles, Plus, Pencil, Trash2, X, ExternalLink, Undo2, MoreHorizontal, MessageSquarePlus } from "lucide-react";
import { RichInput } from "@/components/richInput";
import nodeRegistry from "@/views/AIAgents/Workflows/registry/nodeRegistry";
import { getNodeBgColor, getNodeIconColor } from "@/views/AIAgents/Workflows/utils/nodeColors";
import { renderIcon } from "@/views/AIAgents/Workflows/utils/iconUtils";
import { useFeatureFlagVisible } from "@/components/featureFlag";
import { FeatureFlags } from "@/config/featureFlags";
import { useHiddenNodeTypes } from "../../hooks/useHiddenNodeTypes";
import type { AssistantMessage } from "@/views/AIAgents/Workflows/utils/assistantDraft";
import {
  parseSlashCommand,
  SLASH_COMMANDS,
} from "@/views/AIAgents/Workflows/utils/assistantDraft";
import type { AssistProposal } from "@/services/workflowBuilder";
import type { ComposerMentionable } from "@/components/AssistantComposer";
import type { PendingChange } from "@/views/AIAgents/Workflows/hooks/useCanvasAssistant";
import { AssistantMessageExtras, PendingChangeBar } from "./AssistantMessageExtras";
import { MentionedNodesRow, MentionText, NodeChip } from "./NodeChips";
import { ThinkingIndicator, Typewriter } from "./AssistantMotion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { Checkbox } from "@/components/checkbox";
import FormattedText from "@/components/FormattedText";
import { AssistantComposer } from "@/components/AssistantComposer";
import { mentionedIds, removeMention } from "@/components/assistantComposerTokens";
import { AssistantEmptyState } from "@/components/AssistantEmptyState";
import { Button } from "@/components/button";
import { Badge } from "@/components/badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/dialog";
import type {
  NodeData,
  NodeHelpContent,
  NodeTypeDefinition,
} from "@/views/AIAgents/Workflows/types/nodes";
import { AI_NODES_HELP_CONTENT } from "@/views/AIAgents/Workflows/nodeTypes/llm/helperDefinition";
import { IO_NODES_HELP_CONTENT } from "@/views/AIAgents/Workflows/nodeTypes/io/helperDefinition";
import { ROUTING_NODES_HELP_CONTENT } from "@/views/AIAgents/Workflows/nodeTypes/router/helperDefinition";
import { TOOLS_NODES_HELP_CONTENT } from "@/views/AIAgents/Workflows/nodeTypes/tools/helperDefinition";
import { TRAINING_NODES_HELP_CONTENT } from "@/views/AIAgents/Workflows/nodeTypes/training/helperDefinition";
import {
  FORMATTING_NODES_HELP_CONTENT,
  UTILS_NODES_HELP_CONTENT,
} from "@/views/AIAgents/Workflows/nodeTypes/utils/helperDefinition";
import { INTEGRATION_NODES_HELP_CONTENT } from "@/views/AIAgents/Workflows/nodeTypes/integrations/helperDefinition";
import { AUDIO_NODES_HELP_CONTENT } from "@/views/AIAgents/Workflows/nodeTypes/audio/helperDefinition";
import {
  defaultHelpHeaderGradient,
  helpHeaderGradientByCategory,
} from "@/views/AIAgents/Workflows/utils/helpHeaderGradients";
import { getNodeDocsUrl } from "@/views/AIAgents/Workflows/utils/nodeDocsLinks";
import { isNewNode } from "@/views/AIAgents/Workflows/utils/newNodes";

export const NODE_PANEL_DEFAULT_WIDTH_PX = 360;
const NODE_PANEL_MIN_WIDTH_PX = 320;

function getMaxNodePanelWidthPx(): number {
  if (typeof window === "undefined") return NODE_PANEL_DEFAULT_WIDTH_PX;
  return Math.max(NODE_PANEL_MIN_WIDTH_PX, Math.round(window.innerWidth * 0.7));
}
function clampNodePanelWidth(w: number): number {
  return Math.max(NODE_PANEL_MIN_WIDTH_PX, Math.min(getMaxNodePanelWidthPx(), Math.round(w)));
}

interface NodePanelProps {
  isOpen: boolean;
  /** Current panel width in px (owned by the parent so it can offset the canvas controls). */
  width?: number;
  onWidthChange?: (width: number) => void;
  /** Fires when a drag-resize starts/ends, so the parent can pause its own transitions. */
  onResizingChange?: (resizing: boolean) => void;
  onClose: () => void;
  onAddNode: (nodeType: string) => void;
  /** When true, picking a node replaces an existing node instead of adding one. */
  replaceMode?: boolean;
  /** Name of the node being replaced (shown in the replace-mode banner). */
  replaceNodeName?: string;
  /** Exit replace mode without replacing. */
  onCancelReplace?: () => void;
  messages?: AssistantMessage[];
  isThinking?: boolean;
  activeConversationalTab?: boolean;
  onSendMessage?: (message: string, focusNodeIds?: string[]) => void;
  /** "/explain", "/review", ... typed in the composer. */
  onCommand?: (command: string, rest: string, nodeIds?: string[]) => void;
  /** Nodes the person can @-mention. */
  mentionables?: ComposerMentionable[];
  pendingChange?: PendingChange | null;
  onKeepChanges?: () => void;
  onUndoChanges?: () => void;
  onApplyProposal?: (messageId: string, proposal: AssistProposal) => void;
  onRunSuggestedTest?: (message: string) => void;
  onFocusNode?: (nodeId: string, openSettings: boolean) => void;
  simulateActions?: boolean;
  onSimulateActionsChange?: (value: boolean) => void;
  /** The node selected on the canvas, shown as context under the composer. */
  selectedNodeId?: string | null;
  /** Undo everything the assistant changed in response to one of the person's messages. */
  onUndoTurn?: (messageId: string) => void;
  /** Forget this chat and start a new conversation with the assistant. */
  onNewChat?: () => void;
}

interface HelpDialogState {
  title: string;
  badgeLabel: string;
  icon: string;
  category: string;
  helpContent: NodeHelpContent;
  docsUrl?: string;
}

const NodePanel: React.FC<NodePanelProps> = ({
  isOpen,
  onClose,
  onAddNode,
  width = NODE_PANEL_DEFAULT_WIDTH_PX,
  onWidthChange,
  onResizingChange,
  replaceMode = false,
  replaceNodeName,
  onCancelReplace,
  messages = [],
  isThinking = false,
  activeConversationalTab = false,
  onSendMessage,
  onCommand,
  mentionables = [],
  pendingChange = null,
  onKeepChanges,
  onUndoChanges,
  onApplyProposal,
  onRunSuggestedTest,
  onFocusNode,
  simulateActions = true,
  onSimulateActionsChange,
  selectedNodeId = null,
  onUndoTurn,
  onNewChat,
}) => {
  // Steps the person attached to the next message (picked with "@"), shown as chips.
  const [focusChips, setFocusChips] = useState<ComposerMentionable[]>([]);
  const chipNodes = mentionables.map((m) => ({ id: m.id, name: m.name, type: m.hint }));
  const selectedNode = selectedNodeId ? chipNodes.find((n) => n.id === selectedNodeId) : undefined;
  const focusCanvasNode = (nodeId: string) => onFocusNode?.(nodeId, false);
  // Replies already revealed; a re-render must not type them out again.
  const revealedRef = useRef<Set<string>>(new Set());
  const shouldReveal = (msg: AssistantMessage) =>
    !!msg.arrivedAt && Date.now() - msg.arrivedAt < 15_000 && !revealedRef.current.has(msg.id);
  const nodeCategories = nodeRegistry.getAllCategories();
  const [draggingNodeType, setDraggingNodeType] = useState<string | null>(null);
  const dragPreviewContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<string>("available");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedHelp, setSelectedHelp] = useState<HelpDialogState | null>(null);
  const [inputMessage, setInputMessage] = useState<string>("");
  const conversationScrollRef = useRef<HTMLDivElement>(null);

  // Drag-resize from the left edge. Pointer capture keeps the drag alive over the canvas.
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null);
  const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeStartRef.current = { x: e.clientX, width };
    onResizingChange?.(true);
  };
  const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current;
    if (!start) return;
    onWidthChange?.(clampNodePanelWidth(start.width + (start.x - e.clientX)));
  };
  const handleResizeEnd = () => {
    if (!resizeStartRef.current) return;
    resizeStartRef.current = null;
    onResizingChange?.(false);
  };

  // When the viewport shrinks, clamp the width so the resize handle stays on screen.
  React.useEffect(() => {
    if (!isOpen) return;
    const handleWindowResize = () => {
      const max = getMaxNodePanelWidthPx();
      if (width > max) onWidthChange?.(max);
    };
    window.addEventListener("resize", handleWindowResize);
    handleWindowResize();
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [isOpen, width, onWidthChange]);

  // Auto-scroll conversation to bottom
  React.useEffect(() => {
    if (conversationScrollRef.current) {
      conversationScrollRef.current.scrollTop = conversationScrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  // Auto-switch to conversational tab when messages arrive
  React.useEffect(() => {
    if (activeConversationalTab) {
      setActiveTab("conversational");
    }
  }, [activeConversationalTab]);

  const showConversationalTab = useFeatureFlagVisible(FeatureFlags.WORKFLOW.CONVERSATIONAL_TAB);
  // Flag-gated node types never appear in the palette (see useHiddenNodeTypes).
  const hiddenNodeTypes = useHiddenNodeTypes();
  const visibleNodesByCategory = useCallback(
    (category: string) =>
      nodeRegistry.getNodeTypesByCategory(category).filter((def) => !hiddenNodeTypes.has(def.type)),
    [hiddenNodeTypes]
  );

  // Focus the node search whenever the panel opens on the Available Nodes tab
  // (e.g. via the ⌘I / Ctrl+I shortcut or the toggle button).
  React.useEffect(() => {
    if (isOpen && (activeTab === "available" || !showConversationalTab)) {
      // Delay so the slide-in transition doesn't swallow the focus.
      const timer = setTimeout(() => searchInputRef.current?.focus(), 60);
      return () => clearTimeout(timer);
    }
  }, [isOpen, activeTab, showConversationalTab]);

  // The composer owns the trimming, the Enter key and clearing the field.
  // "/command rest" goes to the command handler; "@Name" mentions become the focus of the message.
  const handleSend = (message: string, focusNodeIds?: string[]) => {
    const chips = focusChips.map((m) => m.id);
    const tagged = focusNodeIds ?? [...chips, ...mentionedIds(message, mentionables).filter((id) => !chips.includes(id))];
    const command = parseSlashCommand(message);
    if (command && onCommand) {
      setFocusChips([]);
      onCommand(command.command, command.rest, tagged);
      return;
    }
    setFocusChips([]);
    onSendMessage?.(message, tagged);
  };

  // Removing a chip also takes its "@Name" out of the field, so the two never disagree.
  const removeFocusChip = (id: string) => {
    const chip = focusChips.find((c) => c.id === id);
    setFocusChips((prev) => prev.filter((c) => c.id !== id));
    if (chip) setInputMessage((prev) => removeMention(prev, chip.name));
  };

  // Handle drag start
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";

    setDraggingNodeType(nodeType);

    if (dragPreviewContainerRef.current) {
      const dragPreview = dragPreviewContainerRef.current.querySelector(
        `[data-node-type="${nodeType}"]`
      ) as HTMLElement;

      if (dragPreview) {
        // Clone the element for the drag operation
        const dragImage = dragPreview.cloneNode(true) as HTMLElement;
        dragImage.style.position = "absolute";
        document.body.appendChild(dragImage);

        // Clean up after a short delay
        setTimeout(() => {
          if (document.body.contains(dragImage)) {
            document.body.removeChild(dragImage);
          }
        }, 100);
      }
    }
  };

  // Handle drag end to reset visual state
  const onDragEnd = () => {
    setDraggingNodeType(null);
  };

  const categoryLabel: Record<string, string> = {
    io: "I/O",
    ai: "AI",
    routing: "Routing",
    integrations: "Integrations",
    formatting: "Formatting",
    tools: "Tools",
    training: "Training",
    audio: "Audio",
    utils: "Utils",
  };

  const categoryHelpContent: Record<string, NodeHelpContent | undefined> = {
    io: IO_NODES_HELP_CONTENT,
    ai: AI_NODES_HELP_CONTENT,
    routing: ROUTING_NODES_HELP_CONTENT,
    formatting: FORMATTING_NODES_HELP_CONTENT,
    utils: UTILS_NODES_HELP_CONTENT,
    tools: TOOLS_NODES_HELP_CONTENT,
    training: TRAINING_NODES_HELP_CONTENT,
    integrations: INTEGRATION_NODES_HELP_CONTENT,
    audio: AUDIO_NODES_HELP_CONTENT,
  };

  // Filter nodes based on search query
  const filteredNodesByCategory = useMemo(() => {
    if (!searchQuery.trim()) {
      return null; // Return null when no search, will render all categories normally
    }

    const query = searchQuery.toLowerCase();
    const filtered: Record<string, ReturnType<typeof nodeRegistry.getNodeTypesByCategory>> = {};

    nodeCategories.forEach((category) => {
      const nodesInCategory = visibleNodesByCategory(category);
      const matchingNodes = nodesInCategory.filter(
        (node) =>
          node.label.toLowerCase().includes(query) ||
          node.description.toLowerCase().includes(query)
      );

      if (matchingNodes.length > 0) {
        filtered[category] = matchingNodes;
      }
    });

    return filtered;
  }, [searchQuery, nodeCategories, visibleNodesByCategory]);

  // Render node categories
  const renderNodeCategories = () => {
    if (nodeCategories.length === 0) {
      return (
        <div className="text-sm text-muted-foreground p-4">
          Loading node categories...
        </div>
      );
    }

    // If searching, use filtered results
    if (searchQuery.trim() && filteredNodesByCategory) {
      const categories = Object.keys(filteredNodesByCategory);
      
      if (categories.length === 0) {
        return (
          <div className="text-sm text-muted-foreground p-4 text-center">
            No nodes found matching "{searchQuery}"
          </div>
        );
      }

      return categories.map((category) => {
        const nodesInCategory = filteredNodesByCategory[category];
        return renderCategorySection(category, nodesInCategory);
      });
    }

    // Otherwise, render all categories
    return nodeCategories.map((category) => {
      const nodesInCategory = visibleNodesByCategory(category);
      if (nodesInCategory.length === 0) return null;
      return renderCategorySection(category, nodesInCategory);
    });
  };

  // Render a single category section
  const renderCategorySection = (
    category: string,
    nodesInCategory: NodeTypeDefinition<NodeData>[]
  ) => {
    return (
      <div key={category} className="px-4 py-2">
        <div className="flex items-center gap-2 py-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase">
            {categoryLabel[category] ? categoryLabel[category] : category}
          </p>
          {categoryHelpContent[category] && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-background/90"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setSelectedHelp({
                  title: `${categoryLabel[category] ?? category} Nodes`,
                  badgeLabel: "Category",
                  icon: "Sparkles",
                  category,
                  helpContent: categoryHelpContent[category] as NodeHelpContent,
                });
              }}
              aria-label={`Show details for ${categoryLabel[category] ?? category}`}
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {nodesInCategory.map((nodeType) => {
            const isDragging = draggingNodeType === nodeType.type;
            const bgColor = getNodeBgColor(category);
            const iconColor = getNodeIconColor(category);

            return (
              <div
                key={nodeType.type}
                className={`${bgColor} border border-border rounded-lg p-[2px] cursor-pointer transition-all duration-200 select-none ${
                  isDragging
                    ? "opacity-50 scale-95 border-2 border-dashed border-blue-400 bg-blue-50 dark:bg-blue-500/15"
                    : "hover:shadow-sm"
                }`}
                onClick={() => onAddNode(nodeType.type)}
                draggable={true}
                onDragStart={(event) => onDragStart(event, nodeType.type)}
                onDragEnd={onDragEnd}
              >
                <div className="flex gap-2 items-center px-4 pr-2 py-2">
                  <div className="shrink-0 w-4 h-4">
                    {renderIcon(nodeType.icon, `h-4 w-4 ${iconColor}`)}
                  </div>
                  <p className="flex-1 text-sm font-semibold text-accent-foreground min-w-0 truncate">
                    {nodeType.label}
                  </p>
                  {isNewNode(nodeType.type) && (
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                      NEW
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-background/90"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setSelectedHelp({
                        title: nodeType.label,
                        badgeLabel:
                          categoryLabel[nodeType.category] ?? nodeType.category,
                        icon: nodeType.icon,
                        category: nodeType.category,
                        docsUrl: getNodeDocsUrl(nodeType.type),
                        helpContent: nodeType.helpContent ?? {
                          intro: nodeType.description,
                          sections: nodeType.shortDescription
                            ? [
                                {
                                  title: "Quick Overview",
                                  body: nodeType.shortDescription,
                                },
                              ]
                            : [],
                        },
                      });
                    }}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onDragStart={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    aria-label={`Show details for ${nodeType.label}`}
                  >
                    <HelpCircle className="h-4 w-4" />
                  </Button>
                </div>
                <div className="bg-background rounded-md px-4 py-2">
                  <p className="text-sm text-muted-foreground">
                    {nodeType.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderHelpContent = (helpContent: NodeHelpContent) => {
    return (
      <div className="space-y-8">
        <DialogDescription className="text-[18px] leading-8 text-foreground">
          {helpContent.intro}
        </DialogDescription>

        {helpContent.sections?.map((section) => (
          <section key={section.title} className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {section.title}
            </h3>

            {section.body && (
              <p className="text-base leading-7 text-foreground">{section.body}</p>
            )}

            {section.bullets && section.bullets.length > 0 && (
              <ul className="space-y-2 pl-5 text-base leading-7 text-foreground list-disc">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            )}

            {section.steps && section.steps.length > 0 && (
              <ol className="space-y-2 pl-5 text-base leading-7 text-foreground list-decimal">
                {section.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>
    );
  };

  return (
    <>
      <div
        ref={dragPreviewContainerRef}
        className="fixed pointer-events-none"
        style={{ visibility: "hidden" }}
      ></div>

      <div
        className={`fixed top-2 right-2 h-[calc(100vh-1rem)] bg-background shadow-lg rounded-xl transition-transform duration-300 border ${
          selectedHelp ? "z-40" : "z-[1001]"
        } ${
          isOpen ? "translate-x-0" : "translate-x-[calc(100%+0.5rem)]"
        }`}
        style={{ width }}
      >
        {onWidthChange && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panel"
            className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize touch-none z-20 flex items-center justify-center group hover:bg-primary/10 rounded-l-xl transition-colors"
            onPointerDown={handleResizeStart}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
            onDoubleClick={() => onWidthChange(NODE_PANEL_DEFAULT_WIDTH_PX)}
          >
            <div className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        )}
        <div className="flex flex-col h-full">
          {/* Replace-mode banner */}
          {replaceMode && (
            <div className="mx-4 mt-4 flex items-start justify-between gap-3 rounded-lg border border-brand-600/40 bg-brand-600/10 px-3 py-2">
              <div className="min-w-0 text-xs text-foreground">
                <p className="font-semibold">Replace node</p>
                <p className="text-muted-foreground">
                  Pick a node to replace
                  {replaceNodeName ? ` “${replaceNodeName}”` : " this node"}. Its
                  connections are kept.
                </p>
              </div>
              {onCancelReplace && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 px-2 text-xs"
                  onClick={onCancelReplace}
                >
                  Cancel
                </Button>
              )}
            </div>
          )}

          {/* Tabs Header */}
          <div className="p-4">
            {showConversationalTab ? (
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full"
              >
                <TabsList className="w-full h-10 bg-muted p-1 rounded-full">
                  <TabsTrigger
                    value="available"
                    aria-label="Available Nodes"
                    className="flex-1 text-sm font-medium rounded-full"
                  >
                    Available Nodes
                  </TabsTrigger>
                  <TabsTrigger
                    value="conversational"
                    aria-label="Conversational AI"
                    className="relative flex-1 text-sm font-medium rounded-full"
                  >
                    Conversational
                    {onNewChat && activeTab === "conversational" && (
                      // A span, not a button: it sits inside the tab's own button.
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <span
                            role="button"
                            tabIndex={0}
                            title="Chat options"
                            aria-label="Chat options"
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                            className="absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-black/10 hover:text-foreground dark:hover:bg-white/10"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={6} className="z-[2100] min-w-[180px]">
                          <DropdownMenuItem
                            disabled={isThinking || messages.length === 0}
                            onSelect={() => setTimeout(onNewChat, 0)}
                          >
                            <MessageSquarePlus className="mr-2 h-4 w-4" />
                            New chat
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            ) : (
              <h3 className="text-sm font-semibold">Available Nodes</h3>
            )}
          </div>

          {/* Tabs Content */}
          <div className="flex-1 overflow-y-auto bg-background rounded-xl">
            {(activeTab === "available" || !showConversationalTab) && (
              <div className="w-full">
                {/* Search Field */}
                <div className="px-4 pt-4 pb-2 sticky top-0 bg-background z-10">
                  <div className="relative flex items-center">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <RichInput
                      ref={searchInputRef}
                      type="text"
                      placeholder="Search nodes..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 pr-9 h-9 text-sm w-full"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery("");
                          searchInputRef.current?.focus();
                        }}
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center h-4 w-4 rounded-full bg-muted-foreground/40 text-background hover:bg-muted-foreground/60 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                {renderNodeCategories()}
              </div>
            )}
            {showConversationalTab && activeTab === "conversational" && (
              <div className="flex flex-col h-full">
                {/* Messages area */}
                <div ref={conversationScrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                  {messages.length === 0 && !isThinking ? (
                    <div>
                      <AssistantEmptyState
                        title="Let's create your agent together."
                        prompt="What would you like your agent to do?"
                      />
                      {onCommand && (
                        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                          {[
                            ["describe", "Describe this workflow"],
                            ["review", "Review for problems"],
                            ["tests", "Suggest test messages"],
                            ["optimize", "Optimize"],
                          ].map(([command, label]) => (
                            <button
                              key={command}
                              type="button"
                              onClick={() => onCommand(command, "")}
                              className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-foreground hover:bg-muted"
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {messages.map((msg) => (
                        <div key={msg.id}>
                          {msg.speaker === "customer" ? (
                            <div className="group flex items-end justify-end gap-1.5">
                              {msg.undoable && !msg.undone && onUndoTurn && (
                                <button
                                  type="button"
                                  onClick={() => onUndoTurn(msg.id)}
                                  disabled={isThinking}
                                  title="Undo everything the assistant changed for this message"
                                  aria-label="Undo this message's changes"
                                  className="mb-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-60 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 disabled:opacity-30"
                                >
                                  <Undo2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <div
                                className={`max-w-[80%] bg-blue-600 text-white text-sm rounded-2xl rounded-br-md px-4 py-2.5 ${
                                  msg.undone ? "opacity-60 line-through decoration-white/60" : ""
                                }`}
                                title={msg.undone ? "The changes for this message were undone" : undefined}
                              >
                                <MentionText text={msg.text} nodes={chipNodes} onFocusNode={focusCanvasNode} inverted />
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2.5">
                              <div className="flex-shrink-0 mt-1">
                                <div className="h-6 w-6 rounded-full bg-[hsl(var(--brand-50))] flex items-center justify-center">
                                  <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--brand-600))]" />
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-foreground leading-relaxed">
                                  <Typewriter
                                    text={msg.text}
                                    animate={shouldReveal(msg)}
                                    onDone={() => revealedRef.current.add(msg.id)}
                                  >
                                    <FormattedText text={msg.text} />
                                    <MentionedNodesRow text={msg.text} nodes={chipNodes} onFocusNode={focusCanvasNode} />
                                  </Typewriter>
                                </div>
                                <AssistantMessageExtras
                                  msg={msg}
                                  isLatest={msg.id === messages[messages.length - 1]?.id}
                                  busy={isThinking}
                                  onSend={handleSend}
                                  onApplyProposal={onApplyProposal}
                                  onRunSuggestedTest={onRunSuggestedTest}
                                  onFocusNode={onFocusNode}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      {isThinking && <ThinkingIndicator />}
                    </>
                  )}
                </div>
                {pendingChange && onKeepChanges && onUndoChanges && (
                  <PendingChangeBar change={pendingChange} onKeep={onKeepChanges} onUndo={onUndoChanges} />
                )}
                {/* Input bar */}
                <div className="p-3 pt-0">
                  {(focusChips.length > 0 || selectedNode) && (
                    <div className="mb-1.5 flex flex-wrap items-center gap-1 px-1">
                      {focusChips.map((chip) => (
                        <NodeChip
                          key={chip.id}
                          node={{ id: chip.id, name: chip.name, type: chip.hint }}
                          onClick={focusCanvasNode}
                          onRemove={removeFocusChip}
                        />
                      ))}
                      {focusChips.length === 0 && selectedNode && (
                        <>
                          <span className="text-[11px] text-muted-foreground">Selected:</span>
                          <NodeChip node={selectedNode} onClick={focusCanvasNode} soft />
                        </>
                      )}
                    </div>
                  )}
                  <AssistantComposer
                    value={inputMessage}
                    onChange={setInputMessage}
                    onSubmit={handleSend}
                    placeholder="Ask AI to update your workflow... (@ a step, / for commands)"
                    busy={isThinking}
                    mentionables={mentionables}
                    commands={SLASH_COMMANDS}
                    onMentionPick={(mention) => {
                      setFocusChips((prev) => (prev.some((c) => c.id === mention.id) ? prev : [...prev, mention]));
                    }}
                  />
                  {onSimulateActionsChange && (
                    <label className="mt-2 flex cursor-pointer items-center gap-2 px-1 text-[11px] text-muted-foreground">
                      <Checkbox
                        checked={simulateActions}
                        onCheckedChange={(checked) => onSimulateActionsChange(checked === true)}
                        className="h-3.5 w-3.5"
                      />
                      Simulate actions (tickets, emails, messages) in AI test runs
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog
        open={Boolean(selectedHelp)}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setSelectedHelp(null);
          }
        }}
      >
        <DialogContent className="w-[min(92vw,860px)] max-w-[860px] min-h-[420px] max-h-[90vh] p-0 overflow-hidden rounded-xl border border-border shadow-2xl">
          {selectedHelp && (
            <div className="flex min-h-[420px] max-h-[90vh] flex-col bg-card">
              <div
                className={`px-10 pt-10 pb-6 ${
                  helpHeaderGradientByCategory[selectedHelp.category] ??
                    defaultHelpHeaderGradient
                }`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${getNodeBgColor(
                      selectedHelp.category
                    )}`}
                  >
                    {renderIcon(
                      selectedHelp.icon,
                      `h-5 w-5 ${getNodeIconColor(selectedHelp.category)}`
                    )}
                  </div>
                  <DialogHeader className="m-0 flex-1 space-y-3 text-left">
                    <div className="flex items-center gap-3">
                      <DialogTitle className="text-[32px] font-semibold leading-tight text-foreground">
                        {selectedHelp.title} Help
                      </DialogTitle>
                      <Badge
                        variant="secondary"
                        className="rounded-md px-2.5 py-1 text-[11px] uppercase tracking-[0.14em]"
                      >
                        {selectedHelp.badgeLabel}
                      </Badge>
                    </div>
                  </DialogHeader>
                  {selectedHelp.docsUrl && (
                    <a
                      href={selectedHelp.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Docs
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-10 pb-8 pt-8">
                {renderHelpContent(selectedHelp.helpContent)}
              </div>
              <div className="flex justify-end px-10 pb-10">
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11 rounded-full px-7 text-base font-medium shadow-sm"
                  >
                    Close
                  </Button>
                </DialogClose>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default NodePanel;
