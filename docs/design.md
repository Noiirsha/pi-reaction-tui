# Workbench design and implementation

## Final design contract

The top row is always the compact Session / Model / Tools / View / Help menu. The second row is a centered Pi / workspace / session title on a solid white background with black text. Both are exactly one terminal row high, with no vertical padding. Conversation and Input use thin, square, closed rectangles with plain captions embedded in their top edges, without underlines or caption tabs.

Normal conversation uses one full-width reading area. Only the temporary Resume Session overlay has a workspace sidebar. Dialogs are opaque grayscale, with centered white title bars and inverse selected rows. Input keeps the native cursor and completion behavior. Footer status concentrates on run state, model, thinking level, context percentage and optional mode; usage/cost details live in a separate dialog. Help reflects editor, completion or modal focus.

## Native components retained

`index.ts` installs the public extension header, editor and footer hooks and registers `/workbench`. UI actions use `sendUserMessage` with `expandPromptTemplates: true` so Pi dispatches the extension command immediately instead of sending menu text to a model. The submitted UI aliases receive a command context capable of switching sessions. No client/server protocol or second agent runtime is introduced.

`src/host-layout.ts` checks the fullscreen layout structure, detaches the native document's header, and places a two-row fixed header above a frame containing the **same** native ScrollView. The native dock remains mounted. Cleanup restores the original root and document header. Conversation Markdown, tool output, thinking, scrolling and image renderers are never replaced or recolored.

`src/editor.ts` extends `CustomEditor`. It delegates text editing, completion generation, cursor markers, history, paste and external-editor actions to Pi. It reserves two columns for the outer sides and moves the native bottom border below completion rows. Mouse coordinates are translated accordingly. Completion confirmation invokes Pi 1.5.0's own selected-item callback. No global keybindings are changed.

`src/dialogs.ts` provides searchable selection and resume overlays using native Input fields. At small widths, resume displays one pane at a time. Modal height is bounded against the current editor and footer so ordinary 80×24 dialogs leave input visible. Very small terminal heights and very long multiline drafts can still leave insufficient space; enlarging the terminal restores usable space. Menus are compact overlays; selection dialogs use up to 90% width.

## Boundaries

The version gate runs before any customization. The host adapter validates expected structures before mutation and falls back to public header/editor/footer hooks when fullscreen framing is unavailable. Structural changes in Pi require retesting this adapter, even if public SDK signatures stay stable.

Only shell-owned regions are monochrome. Native progress indicators, third-party widgets and notifications may retain color. A terminal extension cannot set the user's font or physical row height. It also cannot retrieve a previous custom header/footer through public getters; disabling restores the native defaults. Pi's `/settings` has more features than this workbench settings dialog.

Resume groups SessionManager results by their recorded cwd and passes the chosen path to Pi. It is session switching, not an OS directory browser or a process chdir. The editor draft and reading position remain intact when canceling a dialog; a successful session change intentionally loads the selected conversation.

## Reference images

- [Final approved frame and dialog direction](previews/approved-layout.png). Final user correction overrides the image's gray application title: implementation uses solid white.
- [Slash completion direction](previews/slash-completion.png). Earlier header arrangement is superseded by menu first, then centered title.
- [Resume workspace/session direction](previews/resume-session.png). Earlier title arrangement and metadata are illustrative; the final implementation follows the contract above.

These are AI-generated design concepts. The test suite and terminal smoke check validate implementation separately.
