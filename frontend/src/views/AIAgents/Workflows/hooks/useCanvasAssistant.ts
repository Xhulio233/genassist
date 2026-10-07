import { useCallback, useEffect, useRef, useState } from "react";
import { type ChatMessage } from "genassist-chat-react";
import { Node, Edge } from "reactflow";
import { v4 as uuidv4 } from "uuid";
import { useChatService } from "@/hooks/useChatService";
import {
  getBuilderDraft,
  putBuilderDraft,
  type BuilderCanvasSnapshot,
} from "@/services/workflowBuilder";
import {
  changesAffectLayout,
  mergeDraftNodes,
  reportableIssues,
  serializeCanvasForDraft,
  type AssistantMessage,
} from "../utils/assistantDraft";

interface UseCanvasAssistantArgs {
  nodes: Node[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  /** Rebuilds what plain JSON nodes lack (registry handles, data callbacks). */
  hydrateNodes: (nodes: Node[]) => Node[];
  /**
   * Called after a turn in which the assistant added or removed nodes or
   * connections, so the canvas can auto-arrange once the new nodes are rendered.
   */
  onStructureChanged?: () => void;
  /** The person's latest test run on the canvas, shared with the assistant on each message. */
  getLastTestRun?: () => BuilderCanvasSnapshot["last_test_run"];
  /** The node the user has selected, so "this node" means something to the assistant. */
  selectedNodeId?: string | null;
  /** When this changes the conversation resets so context from a previous workflow doesn't leak. */
  workflowScopeId?: string;
}

/**
 * Chat with the Workflow Builder agent about the workflow on the canvas.
 *
 * Each message is a round trip through a server-side draft: the canvas is
 * uploaded as the draft, the agent edits it with its tools (every edit is
 * validated on the server), and the result is read back and applied here.
 * Nothing is parsed out of the agent's reply text.
 */
export function useCanvasAssistant({
  nodes,
  edges,
  setNodes,
  setEdges,
  hydrateNodes,
  onStructureChanged,
  getLastTestRun,
  selectedNodeId,
  workflowScopeId,
}: UseCanvasAssistantArgs) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const suppressWelcomeRef = useRef(false);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const selectedNodeIdRef = useRef(selectedNodeId);
  // Draft revision already reflected on the canvas; a higher one means the agent changed something.
  const appliedRevisionRef = useRef(0);

  // Keep refs in sync so callbacks always see current canvas state
  nodesRef.current = nodes;
  edgesRef.current = edges;
  selectedNodeIdRef.current = selectedNodeId;
  const getLastTestRunRef = useRef(getLastTestRun);
  getLastTestRunRef.current = getLastTestRun;

  // Mirror of `messages` that is current the moment it is written, so a reply
  // can be tied to its message id without waiting for a render.
  const messagesRef = useRef<AssistantMessage[]>([]);
  const updateMessages = useCallback(
    (update: (prev: AssistantMessage[]) => AssistantMessage[]) => {
      messagesRef.current = update(messagesRef.current);
      setMessages(messagesRef.current);
    },
    []
  );

  // Read the draft after the agent's turn and bring the canvas in line with it.
  const applyDraft = useCallback(
    async (conversationId: string, messageId: string) => {
      const draft = await getBuilderDraft(conversationId);
      if (!draft || draft.revision <= appliedRevisionRef.current) return;
      appliedRevisionRef.current = draft.revision;

      const draftEdges = draft.edges as unknown as Edge[];
      const merged = hydrateNodes(
        mergeDraftNodes(nodesRef.current, draft.nodes as unknown as Node[])
      );
      nodesRef.current = merged;
      edgesRef.current = draftEdges;
      setNodes(merged);
      setEdges(draftEdges);
      if (changesAffectLayout(draft.changes)) onStructureChanged?.();

      updateMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, changes: draft.changes, issues: reportableIssues(draft) }
            : msg
        )
      );
    },
    [hydrateNodes, onStructureChanged, setNodes, setEdges, updateMessages]
  );

  // ── Message handler ──
  const handleMessage = useCallback(
    (message: ChatMessage) => {
      if (message.speaker === "agent") {
        if (suppressWelcomeRef.current) {
          suppressWelcomeRef.current = false;
          return;
        }

        setIsThinking(false);

        // Update or add the latest agent message
        const last = messagesRef.current[messagesRef.current.length - 1];
        const messageId = last?.speaker === "agent" ? last.id : uuidv4();
        updateMessages((prev) =>
          last?.speaker === "agent"
            ? [...prev.slice(0, -1), { ...last, text: message.text }]
            : [...prev, { id: messageId, speaker: "agent", text: message.text }]
        );

        const conversationId = chatRef.current?.getConversationId?.();
        if (conversationId) {
          applyDraft(conversationId, messageId).catch(() => {
            updateMessages((prev) => [
              ...prev,
              {
                id: uuidv4(),
                speaker: "agent",
                text: "I couldn't load the updated workflow, so the canvas was not changed.",
              },
            ]);
          });
        }
      } else if (message.speaker === "special") {
        setIsThinking(false);
        updateMessages((prev) => [
          ...prev,
          { id: uuidv4(), speaker: "agent", text: message.text },
        ]);
      }
    },
    // chatRef is a stable ref from useChatService
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyDraft, updateMessages]
  );

  const {
    sendMessage: chatSend,
    resetConversation,
    hasConfig,
    chatRef,
    startConversationIfNeeded,
  } = useChatService({
    onMessage: handleMessage,
    scopeId: workflowScopeId,
  });

  // Reset local state when scope changes
  const prevScopeRef = useRef(workflowScopeId);
  useEffect(() => {
    if (prevScopeRef.current !== undefined && workflowScopeId !== prevScopeRef.current) {
      updateMessages(() => []);
      appliedRevisionRef.current = 0;
    }
    prevScopeRef.current = workflowScopeId;
  }, [workflowScopeId, updateMessages]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      updateMessages((prev) => [
        ...prev,
        { id: uuidv4(), speaker: "customer", text: trimmed },
      ]);
      setIsThinking(true);

      try {
        // Only suppress the welcome message when we're actually starting a new conversation;
        // otherwise the first real agent response would be swallowed.
        if (!chatRef.current?.getConversationId?.()) {
          suppressWelcomeRef.current = true;
        }
        await startConversationIfNeeded();
        const conversationId = chatRef.current?.getConversationId?.();
        if (!conversationId) {
          throw new Error("Could not start a conversation with the assistant.");
        }

        // The agent edits a draft of the canvas exactly as it is now, unsaved changes included.
        const uploaded = await putBuilderDraft(
          conversationId,
          serializeCanvasForDraft(
            nodesRef.current,
            edgesRef.current,
            selectedNodeIdRef.current,
            getLastTestRunRef.current?.()
          )
        );
        if (!uploaded) {
          throw new Error("Could not share the workflow with the assistant.");
        }
        appliedRevisionRef.current = uploaded.revision;

        await chatSend(trimmed);
      } catch (err) {
        suppressWelcomeRef.current = false;
        setIsThinking(false);
        const errMsg =
          err instanceof Error ? err.message : "Failed to send message.";
        updateMessages((prev) => [
          ...prev,
          { id: uuidv4(), speaker: "agent", text: errMsg },
        ]);
      }
    },
    // chatRef is a stable ref from useChatService
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatSend, startConversationIfNeeded, updateMessages]
  );

  const clearHistory = useCallback(() => {
    updateMessages(() => []);
    appliedRevisionRef.current = 0;
    resetConversation();
  }, [resetConversation, updateMessages]);

  return {
    messages,
    isThinking,
    sendMessage,
    clearHistory,
    hasConfig,
  };
}
