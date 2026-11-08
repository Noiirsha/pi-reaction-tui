# Image generation prompts

These prompts produced earlier design explorations. The final approved menu-first layout and the user's solid-white title correction supersede conflicting details. Images are concepts, not runtime screenshots.

## Resume Session concept (earlier layout)

Use case: ui-mockup. Create ONE realistic English-only terminal screenshot of Pi Reaction TUI, showing a RESUME SESSION DIALOG over the DOS-style workbench in the attached reference. Reference is the approved style target: thin closed rectangular square-corner frames, narrow monospace font, dense terminal cell grid, neutral charcoal background and strictly black-white-gray UI chrome. Landscape 16:10. No OS chrome, poster titles, desktop, perspective, rounded corners, shadows, gradients, thick frames, bright accents or F keys. No Chinese anywhere.

Preserve the underlying workbench structure: closed header rectangle with 'Pi / pi_agent_plugins' and 'TUI design', a second row menu 'Session   Model   Tools   View   Help'. A single wide framed Conversation region with a few native-looking Markdown paragraphs and small green/purple code accents visible around the dialog edges. Closed Input frame below. Closed bottom status/help rectangle. All shell text and boundaries grayscale.

Place an opaque neutral charcoal RESUME SESSION dialog centered over Conversation, almost full conversation width but with a visible margin exposing the original reading area behind it. It must unmistakably be an overlay, not a permanently split application. Closed thin light gray rectangular border with inline title ' Resume session '. This dialog itself has a left workspace selector occupying 28% and a right sessions area 72%, separated by ONE thin vertical line.
Left title 'Workspaces', text tree:
'~/workspace'
'  pi_agent_plugins'
'  PiProviderManager'
'  notes'
'  android-tools'
pi_agent_plugins row monochrome selected. No source files, folders within projects or decorative icons. This is a list of workspaces with sessions, not a code file browser.
Right header 'pi_agent_plugins' and muted '4 sessions'; a thin closed search field 'Search sessions...'; compact session table with headings 'Session                         Updated   Messages', four rows 'TUI design                      Now       28', 'Thinking preview                Today     16', 'RO / RW mode                    Yesterday 42', 'DeepSeek tool setup             Nov 03    35'. First session is the active selection, BLACK text on WHITE/very light gray full rectangular row. Inactive selected workspace may use subtle gray selection to distinguish keyboard focus.
At bottom inside dialog show unboxed compact metadata 'Workspace  ~/workspace/pi_agent_plugins' and 'Model      deepseek-flash / high', then thin divider and hints 'Tab Switch pane   Up/Down Select   Enter Resume   Esc Cancel'. Keep titlebar-close instruction unnecessary; keyboard controlled.
The underlying Input rectangle shows existing draft '> Continue with the interface design...' in gray to communicate draft retention; no active input cursor while modal owns focus. Bottom status 'IDLE   deepseek-flash / high   CTX 1.8% / 1.0M' with inverse 'RW' right. Very bottom hints switch to modal controls 'Tab Switch pane   Up/Down Select   Enter Resume   Esc Cancel', with nano-like inverse grayscale key tokens. Do NOT show Enter Send while modal active. Menus never use color. All content labels/frames fit terminal character grid, close every rectangle. Keep normal small type scale from reference, realistic functional TUI, no enormous headings. Do not add implementation annotations.

## Slash completion concept (earlier layout)

Use case: ui-mockup. Create ONE realistic screenshot of Pi Reaction TUI showing SLASH COMMAND AUTOCOMPLETE at the bottom of the Input area. Use attached approved normal-screen concept as reference. All text English. Flat charcoal #181818 background, thin fully CLOSED square-corner Unicode rectangular frames, uniform narrow monospace font, dense authentic terminal cell grid. Outer header/menu/editor/autocomplete/status/help strictly black-white-gray, only native Markdown content may have green/purple/gold/muted bluegray semantic colors. Landscape 16:10, terminal application only, no desktop or OS chrome. No card layout, rounded corners, shadows, gradients, giant titles, F keys or bright UI accents.

Keep top closed header with 'Pi / pi_agent_plugins' left, 'TUI design' right, second row 'Session   Model   Tools   View   Help'. One full-width closed Conversation rectangle. Under it the custom Input rectangle expands temporarily to include a SLASH COMPLETION LIST DIRECTLY BELOW the input line. Do NOT show a floating centered dialog, and do NOT show completion above the input line. This visual should clearly answer what the UI does when the user types '/' in Input.

Conversation shows a compact native-looking response with headings 'Keep the native conversation renderer', 'Add a compact workbench shell', a small green/purple TypeScript code sample 'ctx.ui.setEditorComponent(createWorkbenchEditor);' and normal prose 'The editor keeps completion, history, image paste, and external editing.' and gold heading 'Next steps'. Keep plenty of visible original conversation; autocomplete should consume a bounded 5-row area in lower portion, not take over the whole screen.

A thin full-width CLOSED Input frame: inline top-border title ' Input '. First text row '> /' followed by WHITE BLOCK CURSOR. Below this input line a thin gray divider then a small muted column heading 'Commands'. Then exactly FIVE aligned candidate rows with descriptions:
'/resume       Resume a saved session'
'/model        Select a model'
'/thinking     Set thinking level'
'/settings     Open settings'
'/workbench    Open workbench menu'
First row '/resume' is selected with WHITE background, BLACK text across the row. All other rows gray or white on charcoal. A tiny muted right-aligned '1/5' indicator can appear in the heading, not scrollbar requiring mouse. Close Input rectangle at bottom with correct corner characters. Candidate list width matches Input inner width. This frame temporarily expands downward while completion is open. Typing more characters filters matches; this behavior belongs in supporting docs, do not add annotation outside screen.

Below Input, a single compact CLOSED footer rectangle. Status row 'IDLE   deepseek-flash / high   CTX 1.8% / 1.0M' and inverse 'RW' at far right, followed by one thin divider. Bottom hint line in nano-like inverse key tokens: 'Up/Down Select   Tab Complete   Enter Accept   Esc Dismiss'. These are autocomplete-specific hints, NOT normal Enter Send. Enter accepts a candidate into the input, it does not immediately execute in this preview design. No instruction to send slash text to language model, no hidden execution. The user will confirm the filled-in command in a second Enter, opening the appropriate original Pi command UI. Do not illustrate two states, just this single candidate selection state. No Chinese characters. All frames closed and aligned, visually light. Keep the simple functional DOS workbench style of reference, native Markdown only chromatic zone.
