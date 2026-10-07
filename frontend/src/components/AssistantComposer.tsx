import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { ArrowUp, Sparkles } from "lucide-react";

import { cn } from "@/helpers/utils";

// The field grows with its content up to this height, then scrolls.
const MAX_FIELD_HEIGHT_PX = 200;

type AssistantComposerProps = {
  value: string;
  onChange: (value: string) => void;
  /** Receives the trimmed message; the composer clears the field itself. */
  onSubmit: (message: string) => void;
  placeholder?: string;
  /** Blocks typing and sending while the assistant is answering. */
  busy?: boolean;
  className?: string;
};

/**
 * The message box for the assistant surfaces: one rounded field with the send control inside it.
 * It starts as a single line and grows as the message wraps or gains lines (Shift+Enter).
 * Shared by the workflow builder's Conversational tab and the conversation detail's Ask GenAI
 * pane so both compose messages the same way.
 */
export function AssistantComposer({
  value,
  onChange,
  onSubmit,
  placeholder = "Ask GenAI...",
  busy = false,
  className,
}: AssistantComposerProps) {
  const canSend = value.trim().length > 0 && !busy;
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  const fitToContent = useCallback(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    const contentHeight = field.scrollHeight;
    field.style.height = `${Math.min(contentHeight, MAX_FIELD_HEIGHT_PX)}px`;
    field.style.overflowY = contentHeight > MAX_FIELD_HEIGHT_PX ? "auto" : "hidden";
  }, []);

  useLayoutEffect(fitToContent, [value, fitToContent]);

  // The text re-wraps when the surrounding panel is resized, so refit on width changes.
  useEffect(() => {
    const field = fieldRef.current;
    if (!field || typeof ResizeObserver === "undefined") return;
    let lastWidth = field.clientWidth;
    const observer = new ResizeObserver(() => {
      if (field.clientWidth === lastWidth) return;
      lastWidth = field.clientWidth;
      fitToContent();
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, [fitToContent]);

  const submit = () => {
    if (!canSend) return;
    onSubmit(value.trim());
    onChange("");
  };

  return (
    <div
      className={cn(
        "flex items-end gap-2 rounded-3xl border border-border bg-card py-1.5 pl-3.5 pr-1.5 shadow-sm transition-all focus-within:border-[hsl(var(--brand-600))] focus-within:ring-2 focus-within:ring-[hsl(var(--brand-600))]/20",
        busy && "opacity-60",
        className
      )}
      onClick={(event) => {
        if (event.target === event.currentTarget) fieldRef.current?.focus();
      }}
    >
      <Sparkles
        className="pointer-events-none mb-2 h-4 w-4 shrink-0 text-[hsl(var(--brand-600))]"
        aria-hidden
      />
      <textarea
        ref={fieldRef}
        rows={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        disabled={busy}
        aria-label={placeholder}
        className="min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm leading-5 placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!canSend}
        aria-label="Send message"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--brand-600))] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:opacity-100 dark:disabled:bg-zinc-700"
      >
        <ArrowUp className="h-4 w-4 text-white" aria-hidden />
      </button>
    </div>
  );
}
