import { stripTerminalSequences, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// These colors belong only to the shell; never apply them to transcript lines.
export const RESET = "\x1b[0m";
const foreground = "\x1b[38;2;222;222;222m";
const background = "\x1b[48;2;24;24;24m";
export const shell = (text: string) => foreground + background + text
  .replaceAll(RESET, foreground + background).replaceAll("\x1b[39m", foreground)
  .replaceAll("\x1b[49m", background) + RESET;
export const muted = (text: string) => `\x1b[38;2;150;150;150m${text}\x1b[39m`;
export const inverse = (text: string) => `\x1b[30m\x1b[107m${text}${RESET}`;
export const clean = (text: string) => stripTerminalSequences(text).replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
export const fit = (text: string, width: number) => {
  const size = Math.max(0, width);
  const clipped = truncateToWidth(text, size, "");
  return clipped + " ".repeat(Math.max(0, size - visibleWidth(clipped)));
};
export const center = (text: string, width: number) => {
  const clipped = truncateToWidth(clean(text), Math.max(0, width), "");
  return fit(" ".repeat(Math.max(0, Math.floor((width - visibleWidth(clipped)) / 2))) + clipped, width);
};
export const edge = (width: number, label = "", bottom = false) => {
  if (width < 2) return shell("─".repeat(Math.max(0, width)));
  const caption = label ? truncateToWidth(` ${label} `, Math.max(0, width - 4), "") : "";
  return shell((bottom ? "└" : "┌") + "─".repeat(Math.min(1, width - 2)) + caption +
    "─".repeat(Math.max(0, width - 3 - visibleWidth(caption))) + (bottom ? "┘" : "┐"));
};
export const row = (text: string, width: number) => width < 2 ? shell(fit(text, width)) :
  shell("│") + shell(fit(text, width - 2)) + shell("│");
export const framed = (lines: string[], width: number, title = "") =>
  [edge(width, title), ...lines.map(line => row(line, width)), edge(width, "", true)];
export const hint = (key: string, label: string) => `${inverse(` ${clean(key)} `)} ${clean(label)}`;
export const monochromeEditorTheme = {
  borderColor: shell,
  selectList: {
    selectedPrefix: inverse, selectedText: inverse,
    description: muted, scrollInfo: muted, noMatch: muted,
  },
};
