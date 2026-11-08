import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { speedText, ttftText, type OutputPerformance } from "./performance.ts";

export interface Statistics {
  input: number; output: number; cacheRead: number; cacheWrite: number; cost: number;
  recorded: boolean; hit?: number;
}

export function statistics(entries: readonly SessionEntry[]): Statistics {
  const totals: Statistics = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, recorded: false };
  for (const entry of entries) {
    const used = entry.type === "message" && (entry.message.role === "assistant" || entry.message.role === "toolResult")
      ? entry.message.usage : "usage" in entry ? entry.usage : undefined;
    if (!used) continue;
    totals.recorded = true;
    totals.input += used.input; totals.output += used.output;
    totals.cacheRead += used.cacheRead; totals.cacheWrite += used.cacheWrite;
    totals.cost += used.cost.total;
    if (entry.type === "message" && entry.message.role === "assistant") {
      const prompt = used.input + used.cacheRead + used.cacheWrite;
      totals.hit = prompt > 0 ? used.cacheRead / prompt * 100 : undefined;
    }
  }
  return totals;
}

export function compact(value: number): string {
  for (const [unit, divisor] of [["B", 1e9], ["M", 1e6], ["k", 1e3]] as const) {
    if (value >= divisor) return (Math.floor(value / divisor * 10) / 10).toFixed(1).replace(/\.0$/, "") + unit;
  }
  return String(Math.round(value));
}

/** Plain ASCII only: stable cell widths and whole-field omission in narrow terminals. */
export function statusText(width: number, run: string, totals: Statistics,
  context: { percent?: number | null; contextWindow?: number } | undefined, mode?: "ro" | "rw",
  output?: OutputPerformance): string {
  const size = Math.max(0, width);
  const number = (value: number) => totals.recorded ? compact(value) : "-";
  const fields = [
    { name: "up", text: `UP ${number(totals.input)}` },
    { name: "down", text: `DN ${number(totals.output)}` },
    { name: "read", text: `CR ${number(totals.cacheRead)}` },
    { name: "write", text: `CW ${number(totals.cacheWrite)}` },
    { name: "hit", text: `HIT ${totals.hit == null ? "-" : totals.hit.toFixed(1) + "%"}` },
    { name: "cost", text: `COST ${totals.recorded ? "$" + totals.cost.toFixed(3) : "-"}` },
    ...(output ? [{ name: "ttft", text: `TTFT ${ttftText(output.ttftMs)}` },
      { name: "speed", text: `OUT ${speedText(output)}` }] : []),
    { name: "ctx", text: `CTX ${context?.percent == null ? "-" : context.percent.toFixed(1) + "%"}` +
      (context?.contextWindow ? "/" + compact(context.contextWindow) : "") },
  ];
  const badge = mode ? ` ${mode.toUpperCase()} ` : "";
  if (size < badge.length) return badge.trim().slice(0, size).padStart(size);
  const available = size - badge.length;
  const text = () => " " + [run, ...fields.map(field => field.text)].join("  ");
  // Preserve the latest hit rate and context ahead of less frequent statistics.
  if (text().length > available) {
    fields.find(field => field.name === "ctx")!.text = fields.find(field => field.name === "ctx")!.text.split("/")[0];
  }
  for (const name of ["cost", "write", "read", "hit", "down", "up", "speed", "ttft", "ctx"]) {
    if (text().length <= available) break;
    const index = fields.findIndex(field => field.name === name);
    if (index >= 0) fields.splice(index, 1);
  }
  return text().slice(0, available).padEnd(available) + badge;
}
