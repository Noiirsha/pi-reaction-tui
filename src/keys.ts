import type { KeybindingsManager } from "@earendil-works/pi-coding-agent";

export type DialogKeys = Pick<KeybindingsManager, "matches" | "getKeys">;

/** Format the real binding; macOS Control is never substituted with Command. */
export function formatKey(binding: string, platform: string = process.platform): string {
  const parts = binding.toLowerCase().split("+");
  const names: Record<string, string> = {
    escape: "Esc", enter: "Enter", tab: "Tab", space: "Space", backspace: "Backspace",
    delete: "Delete", up: "↑", down: "↓", left: "←", right: "→",
    pageup: "PgUp", pagedown: "PgDn", home: "Home", end: "End",
  };
  if (platform === "darwin") {
    const mac: Record<string, string> = { ctrl: "⌃", shift: "⇧", alt: "⌥", meta: "⌘", super: "⌘",
      enter: "↵", tab: "⇥", backspace: "⌫", delete: "⌦" };
    return parts.map(part => mac[part] ?? names[part] ?? part.toUpperCase()).join("");
  }
  const modifiers: Record<string, string> = { ctrl: "Ctrl", shift: "Shift", alt: "Alt", meta: "Meta", super: "Super" };
  return parts.map(part => modifiers[part] ?? names[part] ?? part.toUpperCase()).join("+");
}

export function keyText(keys: DialogKeys, action: string): string {
  const binding = keys.getKeys(action)[0];
  return binding ? formatKey(binding) : "";
}

export function navigation(keys: DialogKeys) {
  return [[keyText(keys, "tui.select.up"), keyText(keys, "tui.select.down")].filter(Boolean).join("/"), "Select"].join(" ") +
    `  ${keyText(keys, "tui.select.confirm")} Confirm  ${keyText(keys, "tui.select.cancel")} Cancel`;
}
