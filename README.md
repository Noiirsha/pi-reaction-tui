# pi-reaction-tui

A local Pi extension that puts a monochrome DOS-style workbench around Pi's native conversation renderer and editor. English labels, thin closed frames, a dark menu row, a centered one-row **white** application title and an independent white status strip at the very bottom. Model and thinking level sit on the Input frame's top edge. It does not replace Markdown rendering, change your terminal font, or run a separate agent client.

## Run

Requires **Pi 1.5.0** and Node.js 22.19+ (Node 24 recommended). Pi provides the runtime dependencies; no `npm install` or build is needed.

Try it without modifying your installed package list:

```sh
pi --tui-mode fullscreen -e /Users/noiirsha/workspace/pi_agent_plugins/pi-reaction-tui/index.ts
```

Or install the directory as a local Pi package, then start a fresh fullscreen Pi session:

```sh
pi install /Users/noiirsha/workspace/pi_agent_plugins/pi-reaction-tui
pi --tui-mode fullscreen
```

After installing, an optional zsh alias starts the same workbench without specifying the extension again:

```sh
alias pirt='pi --tui-mode fullscreen'
```

Put it in `~/.zshrc`, then open a new terminal or run `source ~/.zshrc` in an existing one.

For another machine, replace the absolute path. Installation is optional; creating this repository does not change your Pi settings. Other Pi versions retain the native interface. On Pi 1.5.0's regular screen, only the header, editor and footer are customized; the fixed conversation frame needs fullscreen mode.

## Controls

| Action | Entry |
| --- | --- |
| Open menu | `/workbench`, or click a top menu in fullscreen mode |
| Session menu | `/workbench session` |
| Resume across workspaces | `/resume` or `/workbench resume` |
| Select model | `/model`, `/workbench model`, or your configured Pi model shortcut (default Ctrl+L) |
| Thinking level | `/thinking` or `/workbench thinking` |
| Workbench settings | `/settings` or `/workbench view` |
| Tool catalog | `/workbench tools` (read only) |
| Usage, cost, workspace and context details | `/workbench details` |
| Restore native Pi UI | `/workbench off` |
| Re-enable workbench | `/workbench on` |

Type `/` to open Pi's native completion list **inside** the expanding Input frame. Arrow keys select; Tab completes; Enter accepts the selected candidate; a second Enter runs the completed command. Esc dismisses completion. Only exact no-argument `/resume`, `/model`, `/thinking` and `/settings` submissions are routed to workbench dialogs. Other commands retain Pi's normal behavior.

The resume overlay lists workspaces on the left and sessions on the right. Tab switches panes, arrows select, Enter opens a workspace or resumes a session, and Esc cancels. Typing in the sessions pane searches names and first messages. Below 54 columns the same panes appear one at a time. The workspace list groups **saved sessions**, not source files. Resuming delegates to Pi's `switchSession`; it does not change the process working directory. New/resume actions require an idle agent.

Dialogs own keyboard focus and replace the help row above the status strip. Canceling preserves the editor draft and native conversation ScrollView. Native history, multiline editing, external editing (Ctrl+G by default), image paste and transcript rendering remain Pi's responsibilities. The help row uses plain text without individual key backgrounds. It reads actual keybindings, displays each action's first configured binding and separates modifiers from keys with spaces: macOS notation (`⌃ L`, `⇧ ↵`, `⌥ ←`) on macOS, or `Ctrl + L` / `Shift + Enter` notation on other platforms. Control is never replaced with Command. The row omits whole actions as space becomes tight, retaining the final Menu/Cancel action; Help lists all configured editor bindings. `/settings` opens the workbench's limited settings; use `/workbench off` for Pi's complete native settings dialog.

## Status strip

The screen's final row is always a full-width, one-row white strip with black text, without a border. It stays visible while a dialog owns focus. Run state appears on the left; RO/RW stays at the right when the optional mode plugin is loaded.

| Field | Meaning |
| --- | --- |
| UP / DN | Session totals for recorded input / output tokens. UP is the SDK's input counter; cache tokens are reported separately. These are not network byte counts. |
| CR / CW | Session totals for cache-read / cache-write tokens. |
| HIT | Latest assistant request's cache-read tokens divided by input + cache read + cache write. |
| COST | Sum of recorded session usage costs in USD; rounded to three decimals in the strip. |
| TTFT | Time from the foreground provider-request hook until the first nonempty counted output delta. |
| OUT | Latest request's output tokens per second; `~` marks estimated token counts. |
| CTX | Current context percentage / context-window capacity. |

Session totals include recorded auxiliary usage, such as compaction, across saved session entries. Unknown values display `-`; a new session does not claim a zero-percent cache hit. Numbers use compact k/M/B units. Narrow terminals first shorten CTX capacity, then omit COST, CW and CR before primary counters, request performance and current context. Fields are omitted whole and never wrap; `/workbench details` retains exact counts, cost and performance details. Totals are cached between completed message/turn, session and compaction events so resizing and ordinary keypresses do not rescan history.

### Output performance

Each foreground provider request starts fresh timings using a monotonic clock. TTFT includes request setup, network/server wait and hidden reasoning before the first counted delta. It is time to the first client-visible output chunk, not a server-side token timestamp. Empty start events and tool-call arguments do not stop that clock. Output speed is the counted output divided by the interval from first to last counted delta, excluding the wait before output, the usage/network tail afterward and subsequent tool execution. Final results remain until the next request; session start/reload/branch navigation clears them. Older saved sessions have no restored timing measurements.

OpenAI Responses-family reasoning summaries and redacted thinking are excluded: TTFT waits for text, and OUT counts text only. Other APIs' actual streamed thinking counts together with text. This follows the provider stream, irrespective of whether you collapse Pi's thinking display. Hidden reasoning with no stream therefore never becomes visible output.

While streaming, token counts use the same rough character/4 heuristic as Pi's `estimateTokens`, applied only to counted text/thinking deltas; OUT shows `~`. This is not a model-specific tokenizer and can be inaccurate, especially for non-English text. Completion replaces that estimate with provider usage only when the selected output can be separated: output minus reported reasoning for text-only responses, or total output for fully streamed thinking plus text. Tool calls, missing reasoning breakdowns, mixed redacted/visible thinking and aborted/error responses retain estimates. Provider-reported zero reasoning is trusted; missing or inaccurate upstream breakdowns cannot be repaired by the UI. UP/DN billing counters keep their original session totals.

A response with no counted output displays `-` for both measurements. A single buffered chunk can have TTFT but no measurable streaming speed; intervals shorter than 100 ms also show `-` rather than an extreme rate. Performance refreshes on stream events; there is no background polling timer or tokenization dependency. All configured calls are measured locally without sending extra model requests.

## Scope and compatibility

The shell, editor, menus and footer use grayscale. The existing conversation, code highlighting, thinking output, tool rendering and inline images remain native, with their existing colors. Third-party widgets, working indicators and Pi notifications keep their own renderers. Your terminal controls font, line spacing and default transcript background; choose a dark terminal background for the approved appearance.

The full frame uses a small, guarded adapter to Pi 1.5.0's private layout. The editor adapter also uses that version's completion geometry and selection callback. These are deliberate version dependencies, isolated in `src/host-layout.ts` and `src/editor.ts`; updating Pi requires reviewing them. Only one extension should own the header/editor/footer. `/workbench off` restores the previous editor factory and Pi's default header/footer, rather than an unrelated extension's previous custom footer. Restart Pi after installing/removing competing UI extensions.

`pi-ro-rw-mode` is optional. When loaded, its public event-bus query supplies a grayscale RO/RW badge. Reaction TUI neither enforces mode restrictions nor imports sibling projects. The RO/RW package itself no longer changes any UI.

## Verification

```sh
npm test
# If Pi lives elsewhere:
PI_NODE_MODULES=/path/to/pi/node_modules npm test
```

Integration tests use the actual Pi 1.5.0 loader, Markdown renderer, native editor, keybindings and fullscreen layout. They cover frame widths, restoring the original layout, completion acceptance, command dispatch, external editor/paste callbacks, model-dialog search/cancel, draft retention, regular-screen fallback, resume workspace/search/selection, the independent status strip, usage refresh, performance event wiring and right-aligned mode at different widths. Pure tests cover usage/cache arithmetic, platform key notation, hidden/streamed thinking, final counter correction, tool arguments, retries, aborts, redaction, buffered responses and a deterministic monotonic clock. A missing Pi runtime causes integration tests to skip; pure tests still run.

An isolated offline 80×24 Pi process was also used to verify startup, framing, a real model dialog opened by Ctrl+L, dialog dismissal and clean exit. No model requests were sent. OS clipboard image data, launching a real external editor, authenticated model execution and switching a personal saved session have not been exercised end to end; automated tests verify the native callbacks and selected session path.

## Local history and backup

This is a private local Git repository. `.gitignore` excludes dependencies, generated caches, logs, secrets and backup bundles; `.gitattributes` normalizes text to LF and marks images binary. No remote is required.

Back up the repository including `.git`, or create a portable history bundle after committing changes:

```sh
git bundle create /path/to/backup/pi-reaction-tui.bundle --all
git bundle verify /path/to/backup/pi-reaction-tui.bundle
```

A bundle contains committed files and history, not uncommitted work or Pi session/authentication data. Remove an installed package with `pi remove /absolute/path/to/pi-reaction-tui`, then restart Pi.

Approved generated concepts and implementation notes live under [docs](docs/design.md). Concept images are design references, not screenshots of the running code.
