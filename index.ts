import { basename } from "node:path";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai/compat";
import { SessionManager, VERSION, type ExtensionAPI, type ExtensionContext, type ExtensionCommandContext,
  type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { type Component, type TUI, visibleWidth } from "@earendil-works/pi-tui";
import { WorkbenchEditor } from "./src/editor.ts";
import { ListDialog, ResumeDialog, type Item } from "./src/dialogs.ts";
import { formatKey, keyText, navigation } from "./src/keys.ts";
import { statistics, statusText } from "./src/status.ts";
import { installLayout } from "./src/host-layout.ts";
import { center, clean, edge, fit, hint, inverse, muted, row, shell } from "./src/style.ts";

const TABS = ["Session", "Model", "Tools", "View", "Help"];
const PAGES = ["menu", "session", "resume", "new", "rename", "model", "thinking", "tools", "view", "settings", "help", "details", "off", "on"];
const EDITOR_ACTIONS = [
  ["tui.input.submit", "Send"], ["tui.input.newLine", "Newline"],
  ["app.model.select", "Model"], ["app.editor.external", "Editor"],
  ["app.clipboard.pasteImage", "Paste"], ["app.thinking.cycle", "Thinking"],
];

export default function reactionTui(pi: ExtensionAPI) {
  let context: ExtensionContext;
  let tui: TUI | undefined;
  let editor: WorkbenchEditor | undefined;
  let keys: KeybindingsManager | undefined;
  let restoreLayout: (() => void) | undefined;
  let previousEditor: ReturnType<ExtensionContext["ui"]["getEditorComponent"]>;
  let unsubscribeInput: (() => void) | undefined;
  let enabled = false;
  let busy = false;
  let working = "IDLE";
  let dialogHints: string | undefined;
  let activeTab = "";
  let footerHeight = 2;
  let stats = statistics([]);
  let statsDirty = true;
  const modalHeight = () => Math.max(8, (tui?.terminal.rows ?? 24) -
    (editor?.render(tui?.terminal.columns ?? 80).length ?? 3) - footerHeight - 4);
  const modalOptions = () => ({ width: "90%" as const, row: 3, maxHeight: modalHeight() });
  const redraw = () => tui?.requestRender();
  const open = (page: string) => {
    if (!busy) pi.sendUserMessage(`/workbench ${page}`, { expandPromptTemplates: true });
  };

  const header: Component = {
    invalidate() {},
    render(width) {
      const menu = TABS.map(tab => tab === activeTab ? inverse(` ${tab} `) : ` ${tab} `).join(" ");
      const cwd = context?.cwd ?? "";
      const session = context?.sessionManager.getSessionName() || "New Session";
      // A terminal row is the unit of height: no vertical padding on either bar.
      return [shell(fit(menu, width)), inverse(center(`Pi | ${basename(cwd) || cwd} | ${session}`, width))];
    },
    handleMouse(event) {
      if (event.type !== "click" || event.y !== 0) return;
      let x = 0;
      for (const tab of TABS) {
        const size = visibleWidth(` ${tab} `);
        if (event.x >= x && event.x < x + size) { open(tab.toLowerCase()); return { handled: true }; }
        x += size + 1;
      }
    },
  };

  function hints() {
    if (dialogHints) return dialogHints;
    if (!keys) return "/workbench Menu";
    if (editor?.isShowingAutocomplete()) return [
      hint(keyText(keys, "tui.select.up") + "/" + keyText(keys, "tui.select.down"), "Select"),
      hint(keyText(keys, "tui.input.tab"), "Complete"), hint(keyText(keys, "tui.select.confirm"), "Accept"),
      hint(keyText(keys, "tui.select.cancel"), "Dismiss"),
    ].join("  ");
    const entries = [...EDITOR_ACTIONS];
    if (!context.isIdle()) entries.unshift(["app.interrupt", "Abort"]);
    return entries.filter(([action]) => keys!.getKeys(action).length > 0)
      .map(([action, label]) => hint(keyText(keys!, action), label)).concat(hint("/workbench", "Menu")).join("  ");
  }

  function disable(ctx: ExtensionContext) {
    if (!enabled) return;
    unsubscribeInput?.(); unsubscribeInput = undefined;
    restoreLayout?.(); restoreLayout = undefined;
    ctx.ui.setEditorComponent(previousEditor);
    ctx.ui.setFooter(undefined);
    ctx.ui.setHeader(undefined);
    editor = undefined;
    enabled = false;
    redraw();
  }

  function install(ctx: ExtensionContext) {
    if (ctx.mode !== "tui" || !ctx.hasUI) return;
    if (VERSION !== "1.5.0") {
      ctx.ui.notify(`Reaction TUI supports Pi 1.5.0; found ${VERSION}. Native UI retained.`, "warning");
      return;
    }
    if (enabled) disable(ctx);
    context = ctx;
    statsDirty = true;
    enabled = true;
    previousEditor = ctx.ui.getEditorComponent();
    ctx.ui.setEditorComponent((hostTui, _theme, bindings) => {
      tui = hostTui;
      keys = bindings;
      editor = new WorkbenchEditor(hostTui, bindings, redraw, open,
        () => `${clean(context.model?.id ?? "No model")} / ${pi.getThinkingLevel()}`);
      return editor;
    });
    ctx.ui.setHeader(() => header);
    ctx.ui.setFooter((hostTui, _theme, data) => {
      tui = hostTui;
      const offBranch = data.onBranchChange(redraw);
      return {
        invalidate() {},
        dispose() { offBranch(); },
        render(width) {
          const usage = context.getContextUsage();
          const query: { mode?: "ro" | "rw" } = {};
          pi.events.emit("ro-rw-mode:get", query);
          if (statsDirty) { stats = statistics(context.sessionManager.getEntries()); statsDirty = false; }
          const run = context.isIdle() ? "IDLE" : working === "IDLE" ? "RUNNING" : working;
          const lines: string[] = [];
          const statuses = [...data.getExtensionStatuses()].filter(([key]) => key !== "ro-rw-mode")
            .map(([, value]) => clean(value));
          if (statuses.length) lines.push(shell(fit(muted(statuses.join("  ")), width)));
          const hintText = hints();
          // Keep one help row. Reserve its final action (Menu or Cancel) when space is tight.
          const parts = hintText.split("  ");
          const last = parts.pop() ?? "";
          let line = "";
          for (const part of parts) {
            const next = line + (line ? "  " : "") + part;
            if (visibleWidth(next + "  " + last) <= width) line = next;
          }
          line += (line ? "  " : "") + last;
          lines.push(shell(fit(line, width)));
          // The EDIT-style status strip is always the last, full-width, unframed row.
          lines.push(inverse(statusText(width, run, stats,
            usage ? { ...usage, contextWindow: usage.contextWindow ?? context.model?.contextWindow } : undefined, query.mode)));
          footerHeight = lines.length;
          return lines;
        },
      };
    });
    if (tui && VERSION === "1.5.0") restoreLayout = installLayout(tui, header);
    if (!restoreLayout) ctx.ui.notify("Reaction TUI: full framing requires Pi 1.5.0 fullscreen mode; using header/editor/footer only.", "warning");
    // Completion can arrive asynchronously after a key handler returns.
    unsubscribeInput = ctx.ui.onTerminalInput(() => { redraw(); return undefined; });
    redraw();
  }

  async function choose(ctx: ExtensionCommandContext, title: string, items: Item[], dropdown = false) {
    dialogHints = keys ? navigation(keys) : "";
    redraw();
    try {
      return await ctx.ui.custom<string | undefined>((hostTui, _theme, bindings, done) =>
        new ListDialog(hostTui, bindings, title, items, done, navigation(bindings), modalHeight), {
          overlay: true, overlayOptions: () => dropdown ? {
            ...modalOptions(), width: Math.min(48, tui?.terminal.columns ?? 80),
            col: Math.min(activeTab === "View" ? 24 : 0, Math.max(0, (tui?.terminal.columns ?? 80) - 48)),
          } : modalOptions(),
        });
    } finally { dialogHints = undefined; redraw(); }
  }

  async function textInput(ctx: ExtensionCommandContext, title: string, initial = "") {
    dialogHints = keys ? `${keyText(keys, "tui.select.confirm")} Confirm  ${keyText(keys, "tui.select.cancel")} Cancel` : "";
    redraw();
    try {
      const { Input } = await import("@earendil-works/pi-tui");
      return await ctx.ui.custom<string | undefined>((hostTui, _theme, bindings, done) => {
        const input = new Input({ prompt: "" }); input.setValue(initial);
        return {
          focused: true, capturesViewportInput: true, invalidate() { input.invalidate(); },
          handleInput(data: string) {
            if (bindings.matches(data, "tui.select.cancel")) done(undefined);
            else if (bindings.matches(data, "tui.select.confirm")) done(input.getValue());
            else { input.handleInput(data); hostTui.requestRender(); }
          },
          render(width: number) {
            input.focused = true;
            return [edge(width), row(inverse(center(title, width - 2)), width),
              row(input.render(Math.max(1, width - 2))[0], width), row(dialogHints ?? "", width), edge(width, "", true)];
          },
        };
      }, { overlay: true, overlayOptions: modalOptions });
    } finally { dialogHints = undefined; redraw(); }
  }

  async function run(page: string, ctx: ExtensionCommandContext): Promise<void> {
    if (page === "off") { disable(ctx); return; }
    if (page === "on") { install(ctx); return; }
    if (!enabled) {
      install(ctx);
      if (!enabled) return;
    }
    if (page === "menu") {
      const tab = await choose(ctx, "Workbench", TABS.map(label => ({ label, value: label.toLowerCase() })), true);
      if (tab) await run(tab, ctx);
    } else if (page === "session") {
      activeTab = "Session";
      const action = await choose(ctx, "Session", [
        { value: "new", label: "New Session" }, { value: "resume", label: "Resume Session" },
        { value: "rename", label: "Rename Session" }, { value: "details", label: "Session Details" },
      ], true);
      if (action) await run(action, ctx);
    } else if (page === "new") {
      if (!ctx.isIdle()) return ctx.ui.notify("Wait for the current run to finish before starting a new session.", "info");
      await ctx.newSession();
    } else if (page === "resume") {
      activeTab = "Session";
      if (!ctx.isIdle()) return ctx.ui.notify("Wait for the current run to finish before switching sessions.", "info");
      const sessions = await SessionManager.listAll();
      if (!sessions.length) return ctx.ui.notify("No saved sessions found.", "info");
      dialogHints = keys ? `${keyText(keys, "tui.input.tab")} Switch Pane  ${navigation(keys)}` : "";
      const path = await ctx.ui.custom<string | undefined>((hostTui, _theme, bindings, done) =>
        new ResumeDialog(hostTui, bindings, sessions, ctx.cwd, done, modalHeight), {
          overlay: true, overlayOptions: modalOptions,
        });
      dialogHints = undefined;
      if (path) await ctx.switchSession(path);
    } else if (page === "rename") {
      const name = await textInput(ctx, "Rename Session", ctx.sessionManager.getSessionName() ?? "");
      if (name?.trim()) pi.setSessionName(name.trim());
    } else if (page === "model") {
      activeTab = "Model";
      const models = ctx.scopedModels.length ? ctx.scopedModels.map(item => item.model) : ctx.modelRegistry.getAvailable();
      const selected = await choose(ctx, "Select Model", models.map(model => ({
        value: `${model.provider}/${model.id}`, label: model.id, description: model.provider,
      })));
      const model = models.find(model => `${model.provider}/${model.id}` === selected);
      if (model && !await pi.setModel(model)) ctx.ui.notify("Model change failed. Check authentication.", "error");
    } else if (page === "thinking") {
      const levels = ctx.model ? getSupportedThinkingLevels(ctx.model) : [];
      const selected = await choose(ctx, "Thinking Level", levels.map(level => ({
        value: level, label: level, description: level === pi.getThinkingLevel() ? "Current" : "",
      })));
      if (selected) pi.setThinkingLevel(selected as ReturnType<ExtensionAPI["getThinkingLevel"]>);
    } else if (page === "tools") {
      activeTab = "Tools";
      const active = new Set(pi.getActiveTools());
      const tools = pi.getAllTools().filter(tool => tool.exposure !== "hidden");
      await choose(ctx, "Tools (Read Only)", tools.map(tool => ({ value: tool.name,
        label: `${active.has(tool.name) ? "[on] " : "[off]"} ${tool.name}`, description: tool.description })));
    } else if (page === "view" || page === "settings") {
      activeTab = "View";
      const action = await choose(ctx, "Workbench Settings", [
        { value: "thinking", label: "Thinking Level" },
        { value: "expand", label: ctx.ui.getToolsExpanded() ? "Collapse Tool Output" : "Expand Tool Output" },
        { value: "details", label: "Session Details" }, { value: "off", label: "Restore Native Interface" },
      ], true);
      if (action === "expand") ctx.ui.setToolsExpanded(!ctx.ui.getToolsExpanded());
      else if (action) await run(action, ctx);
    } else if (page === "details") {
      const usage = ctx.getContextUsage();
      const entries = ctx.sessionManager.getEntries();
      const totals = statistics(entries);
      await choose(ctx, "Session Details", [
        { value: "cwd", label: "Workspace", description: ctx.cwd },
        { value: "session", label: "Session", description: ctx.sessionManager.getSessionName() || "Untitled" },
        { value: "model", label: "Model", description: `${ctx.model?.provider}/${ctx.model?.id}` },
        { value: "context", label: "Context", description: `${usage?.percent?.toFixed(1) ?? "?"}% / ${usage?.contextWindow ?? ctx.model?.contextWindow ?? "?"} tokens` },
        { value: "tokens", label: "Input / Output Tokens", description: `${totals.input} / ${totals.output}` },
        { value: "cache", label: "Cache Read / Write", description: `${totals.cacheRead} / ${totals.cacheWrite}` },
        { value: "hit", label: "Latest Prompt Cache Hit", description: totals.hit == null ? "Unavailable" : `${totals.hit.toFixed(1)}%` },
        { value: "cost", label: "Recorded Cost", description: `$${totals.cost.toFixed(4)}` },
        { value: "entries", label: "Session Entries", description: String(entries.length) },
        { value: "host", label: "Pi Version", description: VERSION },
      ]);
    } else if (page === "help") {
      activeTab = "Help";
      await choose(ctx, "Reaction TUI Help", [
        { value: "completion", label: "Command Completion", description: "Type /, select, Enter to accept; Enter again to run" },
        { value: "menu", label: "Menu", description: "/workbench; click the top menu in fullscreen mode" },
        { value: "resume", label: "Resume", description: "/resume; Tab switches workspace and session panes" },
        { value: "native", label: "Native Features", description: "History, image paste, external editor and Markdown stay native" },
        { value: "settings", label: "Settings", description: "/settings opens Workbench settings; /workbench off restores Pi UI" },
        ...EDITOR_ACTIONS.filter(([action]) => keys?.getKeys(action).length).map(([action, label]) => ({
          value: action, label, description: keys!.getKeys(action).map(binding => formatKey(binding)).join(" / "),
        })),
      ]);
    }
  }

  pi.registerCommand("workbench", {
    description: "Open Reaction TUI menus, dialogs and settings",
    getArgumentCompletions: prefix => PAGES.filter(page => page.startsWith(prefix)).map(page => ({ value: page, label: page })),
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") return ctx.ui.notify("Reaction TUI requires interactive terminal mode.", "info");
      if (busy) return;
      const page = args.trim().toLowerCase() || "menu";
      if (!PAGES.includes(page)) return ctx.ui.notify(`Unknown workbench page: ${page}`, "error");
      busy = true;
      try { await run(page, ctx); }
      catch (error) { ctx.ui.notify(`Reaction TUI: ${error instanceof Error ? error.message : String(error)}`, "error"); }
      finally { busy = false; activeTab = ""; dialogHints = undefined; redraw(); }
    },
  });
  pi.on("session_start", (_event, ctx) => install(ctx));
  pi.on("session_info_changed", (_event, ctx) => { context = ctx; redraw(); });
  pi.on("agent_start", (_event, ctx) => { context = ctx; working = "RUNNING"; redraw(); });
  pi.on("tool_execution_start", (_event, ctx) => { context = ctx; working = "TOOL"; redraw(); });
  pi.on("tool_execution_end", () => { working = "RUNNING"; redraw(); });
  pi.on("agent_settled", (_event, ctx) => { context = ctx; statsDirty = true; working = "IDLE"; redraw(); });
  pi.on("message_end", (_event, ctx) => { context = ctx; statsDirty = true; redraw(); });
  pi.on("turn_end", (_event, ctx) => { context = ctx; statsDirty = true; redraw(); });
  pi.on("session_compact", (_event, ctx) => { context = ctx; statsDirty = true; redraw(); });
  pi.on("session_tree", (_event, ctx) => { context = ctx; statsDirty = true; redraw(); });
  pi.on("message_update", (_event, ctx) => { context = ctx; redraw(); });
  pi.on("model_select", (_event, ctx) => { context = ctx; redraw(); });
  pi.on("thinking_level_select", (_event, ctx) => { context = ctx; redraw(); });
  pi.on("session_shutdown", (_event, ctx) => disable(ctx));
}
