# Workbench design and implementation

## Final design contract

The top row is always the compact Session / Model / Tools / View / Help menu on charcoal, with only the active item inverted. The second row is a centered Pi / workspace / session title on a solid white background with black text. Both are exactly one terminal row high, with no vertical padding. Conversation and Input use thin, square, closed rectangles with plain captions embedded in their top edges, without underlines or caption tabs. The Input top edge places the current model / thinking level on the right.

Normal conversation uses one full-width reading area. Only the temporary Resume Session overlay has a workspace sidebar. Dialogs are opaque grayscale, with centered white title bars and inverse selected rows. Input keeps the native cursor and completion behavior. A single charcoal help row reflects editor, completion or modal focus, using platform-specific notation for actual configured keys. The final screen row is an independent, unframed, full-width white status strip: run state, UP/DN, CR/CW, latest HIT, COST, CTX and optional RO/RW fixed to the right. It stays one row tall; width adaptation compacts numbers and omits whole secondary fields. Exact usage/cost remain available in Details.

## Native components retained

`index.ts` installs the public extension header, editor and footer hooks and registers `/workbench`. UI actions use `sendUserMessage` with `expandPromptTemplates: true` so Pi dispatches the extension command immediately instead of sending menu text to a model. The submitted UI aliases receive a command context capable of switching sessions. No client/server protocol or second agent runtime is introduced.

`src/host-layout.ts` checks the fullscreen layout structure, detaches the native document's header, and places a two-row fixed header above a frame containing the **same** native ScrollView. The native dock remains mounted. Cleanup restores the original root and document header. Conversation Markdown, tool output, thinking, scrolling and image renderers are never replaced or recolored.

`src/editor.ts` extends `CustomEditor`. It delegates text editing, completion generation, cursor markers, history, paste and external-editor actions to Pi. It reserves two columns for the outer sides and moves the native bottom border below completion rows. Mouse coordinates are translated accordingly. Completion confirmation invokes Pi 1.5.0's own selected-item callback. No global keybindings are changed.

`src/dialogs.ts` provides searchable selection and resume overlays using native Input fields. At small widths, resume displays one pane at a time. Modal height is bounded against the current editor and footer so ordinary 80×24 dialogs leave input visible. Very small terminal heights and very long multiline drafts can still leave insufficient space; enlarging the terminal restores usable space. Menus are compact overlays; selection dialogs use up to 90% width.

`src/status.ts` aggregates recorded session usage separately from its one-row width adaptation. The latest assistant prompt determines HIT; cumulative session usage determines token totals and cost. `src/keys.ts` formats real bindings for macOS or other systems without changing their modifiers. The footer caches statistics until completion/session events; rendering and resizing do not repeatedly copy the session's entire history.

Shortcut hints are plain text on the shell background, without inverse key blocks. Spaces separate modifier symbols and the following key (`⌃ L`, `⇧ ↵`), including in dialog and completion hints, to avoid glyphs touching.

`src/performance.ts` keeps a per-request monotonic clock and visible-output counters. The foreground `before_provider_request` hook starts it; `message_update` text/thinking deltas set TTFT and the streaming interval; `message_end` optionally corrects the token numerator using final usage. Responses summaries/redacted thinking and tool arguments never count as visible thinking/text. Estimates reuse Pi's char/4 rule, labeled `~`. A single chunk or an interval under 100 ms has no speed. Only clocks and counters are retained; no extra request, polling timer, transcript buffer or tokenizer dependency is introduced. Latest measurements appear as TTFT/OUT in the white strip and in Details, and clear across new requests and session changes.

## Boundaries

The version gate runs before any customization. The host adapter validates expected structures before mutation and falls back to public header/editor/footer hooks when fullscreen framing is unavailable. Structural changes in Pi require retesting this adapter, even if public SDK signatures stay stable.

Only shell-owned regions are monochrome. Native progress indicators, third-party widgets and notifications may retain color. A terminal extension cannot set the user's font or physical row height. It also cannot retrieve a previous custom header/footer through public getters; disabling restores the native defaults. Pi's `/settings` has more features than this workbench settings dialog.

Resume groups SessionManager results by their recorded cwd and passes the chosen path to Pi. It is session switching, not an OS directory browser or a process chdir. The editor draft and reading position remain intact when canceling a dialog; a successful session change intentionally loads the selected conversation.

## Reference images

- [Final approved frame and dialog direction](previews/approved-layout.png). Final user correction overrides the image's gray application title: implementation uses solid white.
- [Slash completion direction](previews/slash-completion.png). Earlier header arrangement is superseded by menu first, then centered title.
- [Resume workspace/session direction](previews/resume-session.png). Earlier title arrangement and metadata are illustrative; the final implementation follows the contract above.

These are AI-generated design concepts. The test suite and terminal smoke check validate implementation separately.

The 0.2 layout follows the later EDIT-style reference: the menu is charcoal, only the application title and independent bottom status strip are solid white, and model/thinking moved beside Input. Earlier generated images show the superseded framed footer.
