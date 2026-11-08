import { Input, matchesKey, type Component, type TUI } from "@earendil-works/pi-tui";
import type { SessionInfo } from "@earendil-works/pi-coding-agent";
import { clean, center, edge, fit, inverse, muted, row, shell } from "./style.ts";
import { keyText, navigation, type DialogKeys } from "./keys.ts";

export interface Item { value: string; label: string; description?: string }
interface SessionActions {
  rename?: (session: SessionInfo, name: string) => Promise<void>;
  remove?: (session: SessionInfo) => Promise<void>;
  isCurrent?: (path: string) => boolean;
  hintsChanged?: (hints: string) => void;
}

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
  private mode: "browse" | "rename" | "delete" = "browse";
  private nameInput = new Input({ prompt: "" });
  private target?: SessionInfo;
  private pending = false;
  private error = "";
  constructor(private tui: TUI, private keys: DialogKeys, private sessions: SessionInfo[], cwd: string,
    private done: (path: string | undefined) => void, private height = () => tui.terminal.rows - 6,
    private actions: SessionActions = {}) {
    this.workspaces = [...new Set(sessions.map(session => session.cwd || "Unknown workspace"))].sort();
    this.workspace = Math.max(0, this.workspaces.indexOf(cwd));
    this.updateHints();
  }
  invalidate() { this.search.invalidate(); this.nameInput.invalidate(); }
  private hints() {
    if (this.pending) return this.mode === "delete" ? "Deleting..." : "Saving...";
    if (this.mode !== "browse") return `${keyText(this.keys, "tui.select.confirm")} ${this.mode === "delete" ? "Delete" : "Save"}  ${keyText(this.keys, "tui.select.cancel")} Cancel`;
    const selected = this.filtered()[this.selected];
    const actions = [];
    if (this.pane === 1 && selected) {
      if (this.actions.rename && this.keys.getKeys("app.session.rename").length)
        actions.push(`${keyText(this.keys, "app.session.rename")} Rename`);
      if (this.actions.remove && this.keys.getKeys("app.session.delete").length && !this.actions.isCurrent?.(selected.path))
        actions.push(`${keyText(this.keys, "app.session.delete")} Delete`);
    }
    return [...actions, `${keyText(this.keys, "tui.input.tab")} Pane`, navigation(this.keys)].join("  ");
  }
  private updateHints() { this.actions.hintsChanged?.(this.hints()); }
  private redraw() { this.updateHints(); this.tui.requestRender(); }
  private back() { this.mode = "browse"; this.target = undefined; this.error = ""; this.redraw(); }
  private async save() {
    const target = this.target;
    if (!target || this.pending) return;
    const name = this.nameInput.getValue().replace(/[\r\n]+/g, " ").trim();
    if (this.mode === "rename" && !name) { this.error = "Name cannot be empty."; this.redraw(); return; }
    this.pending = true; this.error = ""; this.redraw();
    try {
      if (this.mode === "rename") {
        await this.actions.rename!(target, name);
        target.name = name;
      } else {
        if (this.actions.isCurrent?.(target.path)) throw new Error("Switch sessions before deleting the current session.");
        await this.actions.remove!(target);
        const workspace = this.workspaces[this.workspace];
        this.sessions = this.sessions.filter(session => session.path !== target.path);
        this.workspaces = [...new Set(this.sessions.map(session => session.cwd || "Unknown workspace"))].sort();
        this.workspace = this.workspaces.includes(workspace) ? this.workspaces.indexOf(workspace) :
          Math.max(0, Math.min(this.workspace, this.workspaces.length - 1));
      }
      this.selected = Math.max(0, Math.min(this.selected, this.filtered().length - 1));
      this.mode = "browse"; this.target = undefined;
    } catch (error) { this.error = error instanceof Error ? error.message : String(error); }
    finally { this.pending = false; this.redraw(); }
  }
  private filtered() {
    const query = this.search.getValue().toLocaleLowerCase();
    return this.sessions.filter(session => (session.cwd || "Unknown workspace") === this.workspaces[this.workspace] &&
      `${session.name ?? ""} ${session.firstMessage}`.toLocaleLowerCase().includes(query));
  }
  handleInput(data: string) {
    if (this.pending) return;
    if (this.mode !== "browse") {
      if (this.keys.matches(data, "tui.select.cancel")) this.back();
      else if (this.keys.matches(data, "tui.select.confirm")) void this.save();
      else if (this.mode === "rename") { this.nameInput.handleInput(data); this.error = ""; this.redraw(); }
      return;
    }
    if (this.keys.matches(data, "tui.select.cancel")) return this.done(undefined);
    const selected = this.filtered()[this.selected];
    if (this.pane === 1 && selected) {
      const rename = this.actions.rename && this.keys.matches(data, "app.session.rename");
      const remove = this.actions.remove && (this.keys.matches(data, "app.session.delete") ||
        (!this.search.getValue() && this.keys.matches(data, "app.session.deleteNoninvasive")));
      if (rename || remove) {
        if (remove && this.actions.isCurrent?.(selected.path)) {
          this.error = "Switch sessions before deleting the current session."; this.redraw(); return;
        }
        this.mode = rename ? "rename" : "delete";
        this.target = selected; this.error = ""; this.nameInput.setValue(selected.name ?? "");
        this.redraw(); return;
      }
    }
    this.error = "";
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
    this.redraw();
  }
  render(width: number) {
    if (this.mode !== "browse") return this.renderAction(width);
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
    lines.push(row(this.error || "─".repeat(inner), width), row(this.hints(), width), edge(width, "", true));
    return lines;
  }
  private renderAction(width: number) {
    this.nameInput.focused = this.focused && this.mode === "rename" && !this.pending;
    return [edge(width), row(inverse(center(this.mode === "rename" ? "Rename Session" : "Delete Session", width - 2)), width),
      row(clean(this.target?.name || this.target?.firstMessage || "Untitled"), width),
      row(this.mode === "rename" ? this.nameInput.render(Math.max(1, width - 2))[0] : "Permanently delete this session?", width),
      row(this.error || clean(this.target?.path ?? ""), width),
      row(this.mode === "delete" ? "This cannot be undone." : "Enter a session name.", width),
      row(this.hints(), width), edge(width, "", true)];
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
      row(this.error || `${keyText(this.keys, "tui.input.tab")} Pane`, width),
      row(this.hints(), width), edge(width, "", true)];
  }
}
