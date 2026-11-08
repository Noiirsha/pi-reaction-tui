import { CustomEditor, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import type { TUI, TuiMouseEvent } from "@earendil-works/pi-tui";
import { edge, fit, monochromeEditorTheme, shell } from "./style.ts";

export class WorkbenchEditor extends CustomEditor {
  constructor(tui: TUI, private bindings: KeybindingsManager, private changed: () => void,
    private open: (page: string) => void) {
    super(tui, monochromeEditorTheme, bindings, { paddingX: 1, autocompleteMaxVisible: 5 });
    let submit: ((text: string) => void) | undefined;
    // Pi supplies onSubmit after construction. Route only UI commands through a
    // real extension command so resume receives a command-capable context.
    Object.defineProperty(this, "onSubmit", {
      configurable: true,
      get: () => (text: string) => {
        const match = text.trim().match(/^\/(resume|model|thinking|settings)\s*$/);
        submit?.(match ? `/workbench ${match[1]}` : text);
      },
      set: value => { submit = value; },
    });
  }

  // Pi assigns its themed border after construction. Draw using shell colors instead.
  protected renderTopBorder(width: number): string { return edge(width, "Input"); }
  protected renderBottomBorder(width: number): string { return edge(width, "", true); }

  render(width: number): string[] {
    if (width < 4) return super.render(width);
    const lines = super.render(width - 2);
    // Native completion renders after the editor's bottom border. Move that border
    // to the end so the expanded input + candidates remain one closed rectangle.
    const native = this as unknown as { renderedVisibleLineCount: number };
    const bottomIndex = native.renderedVisibleLineCount + 1;
    const result = lines.filter((_, index) => index !== 0 && index !== bottomIndex)
      .map(line => shell("│") + shell(fit(line, width - 2)) + shell("│"));
    return [edge(width, "Input"), ...result, edge(width, "", true)];
  }

  handleInput(data: string): void {
    if (!this.isShowingAutocomplete() && this.bindings.matches(data, "app.model.select")) {
      this.open("model");
      return;
    }
    // Accept a completion first; submitting a slash command requires the next Enter.
    // Delegate the actual completion, cursor movement, history and paste to Pi.
    if (this.isShowingAutocomplete() && this.bindings.matches(data, "tui.select.confirm")) {
      // Pi 1.5.0 exposes the native acceptance behavior on its SelectList. Use
      // the same callback as a mouse selection, without changing shared bindings.
      const list = (this as unknown as { autocompleteList?: {
        getSelectedItem(): unknown; onSelect?: (item: unknown) => void;
      } }).autocompleteList;
      const item = list?.getSelectedItem();
      if (item && list?.onSelect) { list.onSelect(item); this.changed(); return; }
    }
    super.handleInput(data);
    this.changed();
  }

  handleMouse(event: TuiMouseEvent) {
    const native = this as unknown as { renderedVisibleLineCount: number };
    const completion = this.isShowingAutocomplete() && event.y >= native.renderedVisibleLineCount + 1;
    return super.handleMouse({ ...event, x: event.x - 1, y: event.y + (completion ? 1 : 0),
      width: Math.max(1, event.width - 2) });
  }
}
