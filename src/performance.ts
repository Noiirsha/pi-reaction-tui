import type { AssistantMessage, AssistantMessageEvent } from "@earendil-works/pi-ai";

export interface OutputPerformance {
  ttftMs?: number;
  tokensPerSecond?: number;
  estimated: boolean;
  scope: "text" | "text+thinking";
  active: boolean;
}

/** Per foreground provider request; retains only counters and clocks, never message text. */
export class OutputMeter {
  private started?: number;
  private first?: number;
  private last?: number;
  private chunks = 0;
  private characters = 0;
  private visibleThinking = false;
  private hiddenThinking = false;
  private active = false;
  private exactTokens?: number;
  private clock: () => number;

  constructor(clock: () => number = () => performance.now()) { this.clock = clock; }

  reset() {
    this.started = this.first = this.last = this.exactTokens = undefined;
    this.chunks = this.characters = 0;
    this.visibleThinking = this.hiddenThinking = this.active = false;
  }

  begin() { this.reset(); this.started = this.clock(); this.active = true; }

  update(event: AssistantMessageEvent) {
    if (!this.active || (event.type !== "text_delta" && event.type !== "thinking_delta") || !event.delta) return;
    if (event.type === "thinking_delta") {
      // Responses streams expose summaries, not the full hidden reasoning sequence.
      const block = event.partial.content[event.contentIndex];
      if (event.partial.api.includes("responses") || (block?.type === "thinking" && block.redacted)) {
        this.hiddenThinking = true;
        return;
      }
      this.visibleThinking = true;
    }
    const now = this.clock();
    this.first ??= now;
    this.last = now;
    this.chunks++;
    // Same char/4 heuristic as Pi's native estimateTokens; streaming chunks are not tokens.
    this.characters += event.delta.length;
  }

  finish(message: AssistantMessage) {
    if (!this.active) return;
    this.active = false;
    const hasTools = message.content.some(block => block.type === "toolCall");
    const redacted = message.content.some(block => block.type === "thinking" && block.redacted);
    const output = message.usage?.output;
    const reasoning = message.usage?.reasoning;
    const success = message.stopReason !== "error" && message.stopReason !== "aborted";
    if (this.first == null || hasTools || !success || !Number.isFinite(output) || output <= 0) return;
    if (this.visibleThinking && (this.hiddenThinking || redacted)) return;
    const hidden = message.api.includes("responses") || this.hiddenThinking || redacted || !this.visibleThinking;
    // Never treat hidden reasoning as visible output. Missing breakdown stays estimated.
    if (hidden) {
      if (Number.isFinite(reasoning) && reasoning! >= 0 && reasoning! <= output) {
        const textTokens = output - reasoning!;
        if (textTokens > 0) this.exactTokens = textTokens;
      }
    } else {
      this.exactTokens = output;
    }
  }

  stop() { this.active = false; }

  snapshot(): OutputPerformance {
    const elapsed = this.first != null && this.last != null ? this.last - this.first : 0;
    const tokens = this.exactTokens ?? Math.ceil(this.characters / 4);
    return {
      ttftMs: this.first != null && this.started != null ? Math.max(0, this.first - this.started) : undefined,
      // A buffered, single-chunk response has no measurable streaming interval.
      tokensPerSecond: this.chunks >= 2 && elapsed >= 100 && tokens > 0 ? tokens / (elapsed / 1000) : undefined,
      estimated: this.exactTokens == null,
      scope: this.visibleThinking ? "text+thinking" : "text",
      active: this.active,
    };
  }
}

export function ttftText(value?: number): string {
  return value == null ? "-" : value < 1000 ? `${Math.round(value)}ms` : `${(value / 1000).toFixed(1)}s`;
}

export function speedText(value: OutputPerformance): string {
  return value.tokensPerSecond == null ? "-" : `${value.estimated ? "~" : ""}${value.tokensPerSecond.toFixed(1)}t/s`;
}
