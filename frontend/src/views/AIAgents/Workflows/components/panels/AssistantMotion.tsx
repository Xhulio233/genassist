import React, { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

/**
 * Motion for the assistant chat: the "thinking" indicator while a reply is on
 * its way, and a typewriter reveal for a reply that has just arrived.
 * Both respect the reduced-motion preference.
 */

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// What the indicator says as the wait grows; nothing here claims a step the agent may not be taking.
const THINKING_PHASES: Array<[number, string]> = [
  [0, "Thinking"],
  [4000, "Working on it"],
  [12000, "Still working"],
  [30000, "This one takes a while"],
];

export const ThinkingIndicator: React.FC = () => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - started), 1000);
    return () => clearInterval(timer);
  }, []);
  const label = [...THINKING_PHASES].reverse().find(([after]) => elapsed >= after)?.[1] ?? "Thinking";
  return (
    <div className="flex gap-2.5" role="status" aria-live="polite" aria-label={`${label}…`}>
      <div className="flex-shrink-0 mt-1">
        <div className="relative h-6 w-6 rounded-full bg-[hsl(var(--brand-50))] flex items-center justify-center">
          <span className="ai-thinking-ring absolute inset-0 rounded-full" aria-hidden />
          <Sparkles className="ai-thinking-spark h-3.5 w-3.5 text-[hsl(var(--brand-600))]" />
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-sm">
        <span className="ai-shimmer-text">{label}</span>
        <span className="ai-typing-dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </div>
    </div>
  );
};

interface TypewriterProps {
  text: string;
  /** Reveal the text progressively; when false the text is shown at once. */
  animate: boolean;
  onDone?: () => void;
  /** Rendered once the reveal is complete (formatted text, chips...). */
  children: React.ReactNode;
}

// Words per tick and tick length: a reply of ~80 words takes about a second.
const WORDS_PER_TICK = 2;
const TICK_MS = 24;
// Beyond this the reveal would feel slow, so long replies appear at once.
const MAX_ANIMATED_CHARS = 2500;

/**
 * Reveals a reply word by word, then hands over to the fully formatted
 * rendering. Clicking the text skips to the end. If the text grows while
 * revealing (a reply updated in place), the reveal continues from where it is.
 */
export const Typewriter: React.FC<TypewriterProps> = ({ text, animate, onDone, children }) => {
  const shouldAnimate = animate && text.length <= MAX_ANIMATED_CHARS && !prefersReducedMotion();
  const [shownWords, setShownWords] = useState(shouldAnimate ? 0 : Number.MAX_SAFE_INTEGER);
  const words = text.split(/(\s+)/); // keeps the whitespace so the layout does not jump
  const totalWords = words.length;
  const done = shownWords >= totalWords;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (done) return;
    const timer = setInterval(() => {
      setShownWords((count) => Math.min(count + WORDS_PER_TICK * 2, totalWords)); // ×2: words and the spaces between them
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [done, totalWords]);

  useEffect(() => {
    if (done) onDoneRef.current?.();
  }, [done]);

  if (done) return <>{children}</>;
  return (
    <div
      className="cursor-text whitespace-pre-wrap text-sm text-foreground leading-relaxed"
      onClick={() => setShownWords(Number.MAX_SAFE_INTEGER)}
      title="Click to show the whole reply"
    >
      {words.slice(0, shownWords).join("")}
      <span className="ai-caret" aria-hidden />
    </div>
  );
};
