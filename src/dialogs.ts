import { Input, matchesKey, type Component, type TUI } from "@earendil-works/pi-tui";
import type { SessionInfo } from "@earendil-works/pi-coding-agent";
import { clean, center, edge, fit, inverse, muted, row, shell } from "./style.ts";
import { keyText, navigation, type DialogKeys } from "./keys.ts";

export interface Item { value: string; label: string; description?: string }

export class ListDialog implements Component {
  readonly capturesViewportInput = true;
  focused = true;
  protected input = new Input({ prompt: "", placeholder: "Search...", placeholderStyle: muted });
  protected selected = 0;
  constructor(protected tui: TUI, protected keys: DialogKeys, private title: string,
    private items: Item[], private done: (value: string | undefined) => void,
    private footer = navigation(keys), private height = () => tui.terminal.rows - 6) {}
  invalidate() { this.input.invalidate(); }
  private filtered() {
    const query = this.input.getValue().toLocaleLowerCase();
    return this.items.filter(item => `${item.label} ${item.description ?? ""}`.toLocaleLowerCase().includes(query));
  }
  handleInput(data: string) {
    if (this.keys.matches(data, "tui.select.cancel")) return this.done(undefined);
    const items = this.filtered();
    if (this.keys.matches(data, "tui.select.up")) this.selected = Math.max(0, this.selected - 1);
    else if (this.keys.matches(data, "tui.select.down")) this.selected = Math.min(items.length - 1, this.selected + 1);
    else if (this.keys.matches(data, "tui.select.confirm")) {
      const item = items[this.selected];
      if (item) return this.done(item.value);
    } else { this.input.handleInput(data); this.selected = 0; }
    this.tui.requestRender();
  }
  render(width: number) {
    const inner = Math.max(1, width - 2);
    this.input.focused = this.focused;
    const items = this.filtered();
    this.selected = Math.max(0, Math.min(this.selected, items.length - 1));
    const count = Math.max(1, Math.min(12, this.height() - 7));
    const start = Math.max(0, this.selected - count + 1);
    const lines = [edge(width), row(inverse(center(this.title, inner)), width),
      row(this.input.render(inner)[0], width), row("─".repeat(inner), width)];
    if (!items.length) lines.push(row(muted(" No matches"), width));
    for (const [offset, item] of items.slice(start, start + count).entries()) {
      const label = fit(` ${clean(item.label)}`, item.description ? Math.min(32, Math.max(8, Math.floor(inner * 0.45))) : inner);
      const text = fit(label + " " + clean(item.description ?? ""), inner);
      lines.push(row(offset + start === this.selected ? inverse(text) : text, width));
    }
    lines.push(row("─".repeat(inner), width), row(this.footer, width), edge(width, "", true));
    return lines;
  }
}

/** Only the resume dialog has a workspace sidebar; normal reading stays full width. */
export class ResumeDialog implements Component {
  readonly capturesViewportInput = true;
  focused = true;
  private search = new Input({ prompt: "", placeholder: "Search sessions...", placeholderStyle: muted });
  private pane = 1;
  private workspace = 0;
  private selected = 0;
  private workspaces: string[];
  constructor(private tui: TUI, private keys: DialogKeys, private sessions: SessionInfo[], cwd: string,
    private done: (path: string | undefined) => void, private height = () => tui.terminal.rows - 6) {
    this.workspaces = [...new Set(sessions.map(session => session.cwd || "Unknown workspace"))].sort();
    this.workspace = Math.max(0, this.workspaces.indexOf(cwd));
  }
  invalidate() { this.search.invalidate(); }
  private filtered() {
    const query = this.search.getValue().toLocaleLowerCase();
    return this.sessions.filter(session => (session.cwd || "Unknown workspace") === this.workspaces[this.workspace] &&
      `${session.name ?? ""} ${session.firstMessage}`.toLocaleLowerCase().includes(query));
  }
  handleInput(data: string) {
    if (this.keys.matches(data, "tui.select.cancel")) return this.done(undefined);
    if (this.keys.matches(data, "tui.input.tab")) this.pane = (this.pane + 1) % 2;
    else if (matchesKey(data, "shift+tab")) this.pane = (this.pane + 1) % 2;
    else if (this.keys.matches(data, "tui.select.up") || this.keys.matches(data, "tui.select.down")) {
      const delta = this.keys.matches(data, "tui.select.up") ? -1 : 1;
      if (this.pane === 0) {
        this.workspace = Math.max(0, Math.min(this.workspaces.length - 1, this.workspace + delta));
        this.selected = 0;
      } else this.selected = Math.max(0, Math.min(this.filtered().length - 1, this.selected + delta));
    } else if (this.keys.matches(data, "tui.select.confirm")) {
      if (this.pane === 0) this.pane = 1;
      else if (this.filtered()[this.selected]) return this.done(this.filtered()[this.selected].path);
    } else if (this.pane === 1) { this.search.handleInput(data); this.selected = 0; }
    this.tui.requestRender();
  }
  render(width: number) {
    if (width < 54) return this.renderNarrow(width);
    const inner = width - 2;
    const left = Math.min(32, Math.max(18, Math.floor(inner * 0.3)));
    const right = Math.max(1, inner - left - 1);
    const count = Math.max(1, Math.min(12, this.height() - 8));
    const sessions = this.filtered();
    this.search.focused = this.focused && this.pane === 1;
    const rightRows = [fit(clean(this.workspaces[this.workspace] ?? "No workspaces"), right),
      this.search.render(right)[0], fit("Session                     Messages", right)];
    const start = Math.max(0, this.selected - count + 1);
    for (let i = 0; i < count; i++) {
      const session = sessions[start + i];
      const text = session ? fit(` ${clean(session.name || session.firstMessage || "Untitled")}`, right - 6) + fit(String(session.messageCount), 6) : i === 0 && !sessions.length ? " No matches" : "";
      rightRows.push(session && start + i === this.selected ?
        (this.pane === 1 ? inverse(fit(text, right)) : muted(fit(text, right))) : fit(text, right));
    }
    const workspaceStart = Math.max(0, this.workspace - count + 1);
    const lines = [edge(width), row(inverse(center("Resume Session", inner)), width)];
    for (let i = 0; i < rightRows.length; i++) {
      let text = i === 0 ? "Workspaces" : "";
      if (i > 1 && i - 2 < count) {
        const index = workspaceStart + i - 2;
        if (this.workspaces[index]) {
          text = fit(clean(this.workspaces[index]), left);
          if (index === this.workspace) text = this.pane === 0 ? inverse(text) : muted(text);
        }
      }
      lines.push(shell("│") + shell(fit(text, left)) + shell("│") + shell(fit(rightRows[i], right)) + shell("│"));
    }
    lines.push(row("─".repeat(inner), width), row(`${keyText(this.keys, "tui.input.tab")} Switch Pane  ${navigation(this.keys)}`, width), edge(width, "", true));
    return lines;
  }
  private renderNarrow(width: number) {
    const sessions = this.filtered();
    const count = Math.max(1, Math.min(12, this.height() - 7));
    const workspacePane = this.pane === 0;
    const items = workspacePane ? this.workspaces : sessions.map(s => s.name || s.firstMessage || "Untitled");
    const selected = workspacePane ? this.workspace : this.selected;
    const start = Math.max(0, selected - count + 1);
    this.search.focused = this.focused && !workspacePane;
    return [edge(width), row(inverse(center("Resume Session", width - 2)), width),
      row(workspacePane ? "Workspaces" : clean(this.workspaces[this.workspace] ?? "No workspaces"), width),
      row(workspacePane ? "Enter: open workspace" : this.search.render(Math.max(1, width - 2))[0], width),
      ...(!items.length ? [row(muted(" No matches"), width)] : items.slice(start, start + count)
        .map((label, i) => row(start + i === selected ? inverse(fit(clean(label), width - 2)) : clean(label), width))),
      row(`${keyText(this.keys, "tui.input.tab")} Switch Pane`, width),
      row(navigation(this.keys), width), edge(width, "", true)];
  }
}
