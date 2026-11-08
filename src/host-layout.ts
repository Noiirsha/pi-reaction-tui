import { HStack, VStack, type Component, type TUI } from "@earendil-works/pi-tui";
import { edge, shell } from "./style.ts";

type HostStack = Component & { entries: { component: Component }[] };
type HostTui = TUI & { mode: string; layoutRoot?: HostStack; setLayoutRoot(root: Component): void };

/** The only dependency on Pi 1.5.0's private layout. Keep native ScrollView intact. */
export function installLayout(tui: TUI, header: Component): (() => void) | undefined {
  const host = tui as HostTui;
  if (host.mode !== "fullscreen" || typeof host.setLayoutRoot !== "function") return;
  const original = host.layoutRoot;
  if (!original || original.entries?.length !== 2) return;
  const [transcript, dock] = original.entries.map(entry => entry.component);
  const scroll = transcript as Component & { primary?: boolean; children?: Component[]; scrollToEnd?: () => void };
  const document = scroll.children?.[0] as (Component & { children?: Component[] }) | undefined;
  if (!scroll.primary || typeof scroll.scrollToEnd !== "function" || !document?.children ||
      !Array.isArray((dock as HostStack).entries)) return;
  // Header belongs outside the scrollable document. Preserve the component and its
  // contents so disposal/reload restores Pi's exact tree rather than rebuilding it.
  const oldHeader = document.children.shift();
  if (!oldHeader) return;
  const line = (bottom: boolean): Component => ({ invalidate() {}, render: width => [edge(width, bottom ? "" : "Conversation", bottom)] });
  const side: Component = { invalidate() {}, render: () => Array.from({ length: Math.max(1, tui.terminal.rows) }, () => shell("│")) };
  const frame = new VStack([
    { component: line(false), basis: 1, shrink: 0 },
    { component: new HStack([
      { component: side, basis: 1, shrink: 0 },
      { component: transcript, basis: 0, grow: 1, minSize: 1 },
      { component: side, basis: 1, shrink: 0 },
    ]), basis: 0, grow: 1, minSize: 1 },
    { component: line(true), basis: 1, shrink: 0 },
  ]);
  const root = new VStack([
    { component: header, basis: 2, shrink: 0 },
    { component: frame, basis: 0, grow: 1, shrink: 1, minSize: 3 },
    { component: dock, basis: "auto", shrink: 1, minSize: 4 },
  ]);
  host.setLayoutRoot(root);
  return () => {
    if (host.layoutRoot === root) host.setLayoutRoot(original);
    if (!document.children!.includes(oldHeader)) document.children!.unshift(oldHeader);
  };
}
