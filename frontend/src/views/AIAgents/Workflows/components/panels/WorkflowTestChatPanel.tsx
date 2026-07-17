import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GenAgentChat,
  GENASSIST_AGENT_METADATA_UPDATED,
} from "genassist-chat-react";
import { AlertTriangle, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/button";
import { getApiUrl, getWsUrl, isWsEnabled, isPollEnabled } from "@/config/api";
import { getAgentIntegrationKey } from "@/services/api";

interface WorkflowTestChatPanelProps {
  /** Agent whose deployed workflow the chat talks to (resolves its API key). */
  agentId?: string;
  /** When true, the editor has changes not yet saved to the deployed agent. */
  hasUnsavedChanges?: boolean;
  onClose: () => void;
}

interface MetaRow {
  id: string;
  key: string;
  value: string;
}

let metaRowSeq = 0;
const nextRowId = () => `meta-${metaRowSeq++}`;

/** localStorage keys are shared with the Integrations "Chat as Customer" page. */
const metadataStorageKey = (apiKey: string) => `genassist_metadata:${apiKey}`;
const agentMetadataStorageKey = (apiKey: string) =>
  `genassist_agent_chat_input_metadata:${apiKey}`;

/** Coerce any stored value into an editable string. */
const toEditableString = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
};

const rowsFromObject = (obj: Record<string, unknown>): MetaRow[] =>
  Object.entries(obj).map(([key, value]) => ({
    id: nextRowId(),
    key,
    value: toEditableString(value),
  }));

const objectFromRows = (rows: MetaRow[]): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key) out[key] = row.value;
  }
  return out;
};

const safeParseObject = (raw: string | null): Record<string, unknown> | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore malformed storage
  }
  return null;
};

/**
 * Split-screen "Test Chat" panel for the workflow editor.
 *
 * Renders the real GenAgentChat widget authenticated with the agent's integration
 * API key, so it exercises the deployed/saved workflow. Metadata is handled the
 * same way the Integrations page does it: the agent automatically receives its
 * workflow-defined Chat Input metadata (fetched by the chat service on start),
 * and any user-supplied metadata values (persisted per API key) are reused here
 * and editable inline.
 */
export default function WorkflowTestChatPanel({
  agentId,
  hasUnsavedChanges,
  onClose,
}: WorkflowTestChatPanelProps) {
  const tenant = localStorage.getItem("tenant_id");

  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [websocketUrl, setWebsocketUrl] = useState<string | undefined>(undefined);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Applied metadata sent to the chat; editor rows are the working draft.
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<MetaRow[]>([]);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Resolve connection config + the agent's integration key.
  useEffect(() => {
    let cancelled = false;
    if (!agentId) {
      setError("No agent specified");
      return;
    }
    setError(null);
    setApiKey(null);
    (async () => {
      try {
        const apiUrl = await getApiUrl();
        if (cancelled) return;
        setBaseUrl(new URL("..", apiUrl).toString());

        try {
          const ws = await getWsUrl();
          if (!cancelled) setWebsocketUrl(ws);
        } catch {
          if (!cancelled) setWebsocketUrl(undefined);
        }

        const key = await getAgentIntegrationKey(agentId);
        if (!cancelled) setApiKey(key);
      } catch (err: unknown) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to initialize chat";
        setError(message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  // Once the API key is known, restore persisted metadata (values the user set on
  // the Integrations page) and any workflow-defined Chat Input keys.
  useEffect(() => {
    if (!apiKey) return;
    const savedMeta = safeParseObject(localStorage.getItem(metadataStorageKey(apiKey))) ?? {};
    const savedAgentMeta =
      safeParseObject(localStorage.getItem(agentMetadataStorageKey(apiKey))) ?? {};

    // Seed rows with workflow-expected keys the user hasn't filled yet, so they
    // know what the agent expects.
    const merged: Record<string, unknown> = { ...savedAgentMeta, ...savedMeta };
    setMetadata(objectFromRows(rowsFromObject(savedMeta)));
    setRows(rowsFromObject(merged));
    setDirty(false);
  }, [apiKey]);

  // The chat service broadcasts the workflow's Chat Input metadata when a
  // conversation starts. Surface any keys not already in the editor.
  useEffect(() => {
    if (!apiKey) return;
    const handler = (
      e: CustomEvent<{ apiKey: string; metadata: Record<string, unknown> }>
    ) => {
      if (e.detail?.apiKey !== apiKey || e.detail?.metadata == null) return;
      const incoming = e.detail.metadata;
      if (typeof incoming !== "object" || Array.isArray(incoming)) return;
      setRows((prev) => {
        const known = new Set(prev.map((r) => r.key));
        const additions = Object.entries(incoming)
          .filter(([key]) => key && !known.has(key))
          .map(([key, value]) => ({
            id: nextRowId(),
            key,
            value: toEditableString(value),
          }));
        return additions.length ? [...prev, ...additions] : prev;
      });
    };
    window.addEventListener(GENASSIST_AGENT_METADATA_UPDATED, handler as EventListener);
    return () =>
      window.removeEventListener(
        GENASSIST_AGENT_METADATA_UPDATED,
        handler as EventListener
      );
  }, [apiKey]);

  const updateRow = useCallback(
    (id: string, patch: Partial<Pick<MetaRow, "key" | "value">>) => {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      setDirty(true);
    },
    []
  );

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, { id: nextRowId(), key: "", value: "" }]);
    setDirty(true);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setDirty(true);
  }, []);

  const applyMetadata = useCallback(() => {
    const next = objectFromRows(rows);
    setMetadata(next);
    setDirty(false);
    if (apiKey) {
      try {
        localStorage.setItem(metadataStorageKey(apiKey), JSON.stringify(next));
      } catch {
        // ignore quota / serialization errors
      }
    }
  }, [rows, apiKey]);

  const filledCount = useMemo(
    () => rows.filter((r) => r.key.trim() && r.value.trim()).length,
    [rows]
  );

  return (
    <div className="flex h-full w-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold">Test Chat</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-7 w-7"
          aria-label="Close test chat"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Unsaved-changes hint */}
      {hasUnsavedChanges && (
        <div className="flex items-start gap-2 border-b bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            You have unsaved changes. The chat tests the last <strong>saved</strong>{" "}
            version — save to test your latest edits.
          </span>
        </div>
      )}

      {/* Metadata editor (collapsible) */}
      <div className="border-b">
        <button
          type="button"
          onClick={() => setMetadataOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          <span>Metadata{filledCount > 0 ? ` (${filledCount})` : ""}</span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${metadataOpen ? "rotate-180" : ""}`}
          />
        </button>
        {metadataOpen && (
          <div className="space-y-2 px-3 pb-3">
            <p className="text-[11px] leading-snug text-gray-400">
              Sent with each message. The agent also receives its workflow-defined
              Chat Input metadata automatically.
            </p>
            {rows.length === 0 && (
              <p className="text-[11px] text-gray-400">No metadata fields.</p>
            )}
            {rows.map((row) => (
              <div key={row.id} className="flex items-center gap-1.5">
                <input
                  value={row.key}
                  onChange={(e) => updateRow(row.id, { key: e.target.value })}
                  placeholder="key"
                  className="min-w-0 flex-1 rounded-md border px-2 py-1 text-xs"
                />
                <input
                  value={row.value}
                  onChange={(e) => updateRow(row.id, { value: e.target.value })}
                  placeholder="value"
                  className="min-w-0 flex-1 rounded-md border px-2 py-1 text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(row.id)}
                  className="h-7 w-7 shrink-0 text-gray-400 hover:text-red-500"
                  aria-label="Remove field"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={addRow}
                className="h-7 gap-1 px-2 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Add field
              </Button>
              <Button
                size="sm"
                onClick={applyMetadata}
                disabled={!dirty}
                className="h-7 px-3 text-xs"
              >
                Apply
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Chat surface */}
      <div className="relative min-h-0 flex-1">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : !baseUrl || !apiKey ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-500">Loading chat…</p>
          </div>
        ) : (
          <GenAgentChat
            key={apiKey}
            baseUrl={baseUrl}
            websocketUrl={websocketUrl}
            apiKey={apiKey}
            tenant={tenant ?? undefined}
            metadata={metadata}
            mode="embedded"
            headerTitle="Test Chat"
            placeholder="Ask a question..."
            brandLogoUrl="https://cdn.prod.website-files.com/689da2a76e017a77b0596d1c/694291f3d893f585af78bdd7_genassist_logo.svg"
            theme={{
              primaryColor: "#173DED",
              backgroundColor: "#ffffff",
              textColor: "#000000",
              fontFamily: "Roboto, Arial, sans-serif",
              fontSize: "14px",
            }}
            useWs={isWsEnabled}
            usePoll={isPollEnabled}
            useFile={true}
            quickInput={true}
            onError={() => {
              // surfaced within the widget; nothing to do here
            }}
          />
        )}
      </div>
    </div>
  );
}
