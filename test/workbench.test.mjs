import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const modules = process.env.PI_NODE_MODULES || resolve(homedir(), '.pi/agent/install/releases/1.5.0/node_modules');
const available = existsSync(resolve(modules, '@earendil-works/pi-coding-agent/dist/index.js'));
const root = fileURLToPath(new URL('../', import.meta.url));
const imported = relative => import(pathToFileURL(resolve(modules, relative)).href);
const settle = () => new Promise(resolve => setTimeout(resolve, 30));

export async function host(t, { regular = false } = {}) {
  const lib = await imported('@earendil-works/pi-tui/dist/index.js');
  const sdk = await imported('@earendil-works/pi-coding-agent/dist/index.js');
  const { loadExtensions, createExtensionRuntime } = await imported('@earendil-works/pi-coding-agent/dist/core/extensions/loader.js');
  sdk.initTheme('dark');
  const bus = sdk.createEventBus(), runtime = createExtensionRuntime();
  const opened = [], notices = [], submitted = [];
  let thinking = 'high';
  Object.assign(runtime, {
    getThinkingLevel: () => thinking, setThinkingLevel: value => { thinking = value; },
    sendUserMessage: (value, options) => {
      assert.equal(options?.expandPromptTemplates, true, 'menu actions dispatch commands instead of model prompts');
      opened.push(value);
    },
    getActiveTools: () => ['read'], getAllTools: () => [{ name: 'read', description: 'Read files' }],
    setSessionName: name => { ctx.sessionManager.getSessionName = () => name; },
    setModel: async model => { ctx.model = model; return true; },
  });
  const terminal = { columns: 110, rows: 36, kittyProtocolActive: false,
    write() {}, start() {}, stop() {}, moveBy() {}, hideCursor() {}, showCursor() {}, clearLine() {},
    clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {}, setProgramStatus() {},
  };
  const tui = regular ? new lib.TuiMainScreen(terminal) : new lib.TuiAltScreen(terminal);
  const { KeybindingsManager } = await imported('@earendil-works/pi-coding-agent/dist/core/keybindings.js');
  const bindings = new KeybindingsManager({}, resolve(root, 'test/nonexistent-keybindings.json'));
  lib.setKeybindings(bindings);
  const header = new lib.Container(); header.addChild(new lib.Text('Native header'));
  const messages = new lib.Container();
  messages.addChild(new lib.Markdown('# Native transcript\n\n**Keep this content.**\n\n```js\nconst value = 42;\n```', 0, 0, sdk.getMarkdownTheme()));
  const document = new lib.Container(); document.addChild(header); document.addChild(messages);
  const transcript = new lib.ScrollView(document, { primary: true, follow: 'end', scrollbar: 'hidden' });
  const editorContainer = new lib.Container(), footerContainer = new lib.Container();
  const identity = text => text;
  const originalEditor = new sdk.CustomEditor(tui, { borderColor: identity, selectList: {
    selectedPrefix: identity, selectedText: identity, description: identity, scrollInfo: identity, noMatch: identity,
  } }, bindings);
  let editor = originalEditor, footer, dialog, finish, dialogOptions;
  editorContainer.addChild(editor);
  const dock = new lib.VStack([editorContainer, footerContainer]);
  const originalRoot = new lib.VStack([{ component: transcript, basis: 0, grow: 1 }, dock]);
  if (!regular) tui.setLayoutRoot(originalRoot);
  const ctx = {
    mode: 'tui', hasUI: true, cwd: root, isIdle: () => true,
    model: { id: 'test-model', provider: 'test', reasoning: true, contextWindow: 128000 }, scopedModels: [],
    modelRegistry: { getAvailable: () => [ctx.model] }, getContextUsage: () => ({ percent: 4.9, contextWindow: 128000 }),
    sessionManager: { getSessionName: () => 'UI Test', getEntries: () => [], getBranch: () => [] },
    newSession: async () => ({ cancelled: false }), switchSession: async () => ({ cancelled: false }),
    ui: {
      getEditorComponent: () => undefined,
      setEditorComponent(factory) {
        editor = factory ? factory(tui, {}, bindings) : originalEditor;
        editor.onSubmit = text => submitted.push(text);
        editor.onPasteImage = () => opened.push('paste');
        editor.onAction('app.editor.external', () => opened.push('external-editor'));
        editor.onEscape = () => opened.push('interrupt'); editor.focused = true;
        editorContainer.clear(); editorContainer.addChild(editor);
      },
      setHeader(factory) { header.clear(); header.addChild(factory ? factory(tui, {}) : new lib.Text('Native header')); },
      setFooter(factory) {
        footer?.dispose?.(); footerContainer.clear();
        if (!factory) { footer = undefined; return; }
        footer = factory(tui, {}, { onBranchChange: () => () => {}, getExtensionStatuses: () => new Map() });
        footerContainer.addChild(footer);
      },
      notify(message, level) { notices.push({ message, level }); },
      onTerminalInput() { return () => {}; },
      custom(factory, options) { return new Promise(done => {
        dialogOptions = options;
        finish = value => { dialog = undefined; done(value); };
        dialog = factory(tui, {}, bindings, finish);
      }); },
      getToolsExpanded: () => false, setToolsExpanded() {},
    },
  };
  const loaded = await loadExtensions([resolve(root, 'index.ts')], root, bus, runtime);
  assert.deepEqual(loaded.errors, []);
  const extension = loaded.extensions[0];
  const emit = async name => { for (const f of extension.handlers.get(name) ?? []) await f({}, ctx); };
  await emit('session_start');
  t.after(async () => { finish?.(undefined); await emit('session_shutdown'); runtime.invalidate(); tui.stop(); });
  return { ctx, tui, terminal, bindings, originalRoot, header, document, transcript, messages, notices, opened, submitted,
    editor: () => editor, footer: () => footer, dialog: () => dialog, dialogOptions: () => dialogOptions,
    command: args => extension.commands.get('workbench').handler(args, ctx),
    lines: () => tui.render(terminal.columns), lib, sdk, emit,
  };
}

test('native transcript stays mounted; menu and one-row white title live outside its ScrollView', { skip: !available }, async t => {
  const h = await host(t);
  assert.deepEqual(h.notices, []);
  assert.equal(h.document.children[0], h.messages);
  const lines = h.lines(), text = lines.map(h.lib.stripTerminalSequences);
  assert.match(text[0], /Session.*Model.*Tools.*View.*Help/);
  assert.match(text[1], /Pi \| pi-reaction-tui \| UI Test/);
  assert.ok(lines[1].includes('\x1b[107m'));
  assert.ok(text.some(line => line.includes('Native transcript')));
  assert.ok(text.some(line => line.includes('Conversation')));
  assert.ok(text.some(line => line.includes('Input')));
  for (const width of [40, 60, 110, 160]) {
    h.terminal.columns = width;
    assert.ok(h.lines().every(line => h.lib.visibleWidth(line) <= width), `overflow at ${width}`);
  }
  await h.command('off'); assert.equal(h.tui.layoutRoot, h.originalRoot);
  assert.equal(h.document.children[0], h.header);
  await h.command('on'); assert.equal(h.document.children[0], h.messages);
});

test('completion accepts before submitting; native editing actions and keybindings survive', { skip: !available }, async t => {
  const h = await host(t), editor = h.editor();
  editor.setAutocompleteProvider(new h.lib.CombinedAutocompleteProvider([
    { name: 'resume', description: 'Resume a session' }, { name: 'model', description: 'Select a model' },
  ], root));
  editor.handleInput('/'); await settle();
  assert.equal(editor.isShowingAutocomplete(), true);
  const lines = editor.render(80).map(h.lib.stripTerminalSequences);
  assert.ok(lines.at(-1).startsWith('└'));
  assert.ok(lines.some(line => line.includes('resume')), JSON.stringify(lines));
  editor.handleInput('\r');
  assert.equal(editor.isShowingAutocomplete(), false); assert.equal(h.submitted.length, 0);
  assert.match(editor.getText(), /^\/resume/);
  editor.handleInput('\r'); assert.deepEqual(h.submitted, ['/workbench resume']);
  editor.handleInput('\x07'); editor.handleInput('\x16');
  assert.ok(h.opened.includes('external-editor')); assert.ok(h.opened.includes('paste'));
  editor.handleInput('\x0c'); assert.ok(h.opened.includes('/workbench model'));
  assert.equal(h.bindings.matches('\r', 'tui.select.confirm'), true);
});

test('modal search, centered title, cancel and draft retention', { skip: !available }, async t => {
  const h = await host(t); h.editor().setText('draft remains here');
  const command = h.command('model'); await settle(); assert.ok(h.dialog());
  const lines = h.dialog().render(80); assert.ok(lines[1].includes('\x1b[107m'));
  assert.match(h.lib.stripTerminalSequences(lines[1]), /Select Model/);
  h.dialog().handleInput('no match');
  assert.ok(h.dialog().render(80).some(line => line.includes('No matches')));
  h.dialog().handleInput('\x1b'); await command;
  assert.equal(h.editor().getText(), 'draft remains here');
  assert.ok(h.footer().render(80).some(line => line.includes('Send')));
});

test('regular mode falls back without changing the native transcript', { skip: !available }, async t => {
  const h = await host(t, { regular: true });
  assert.equal(h.document.children[0], h.header); assert.match(h.notices[0].message, /fullscreen/);
  assert.ok(h.editor().render(80).every(line => h.lib.visibleWidth(line) <= 80));
});

test('resume switches workspace, filters sessions, resizes and passes the selected file to Pi', { skip: !available }, async t => {
  const h = await host(t), savedListAll = h.sdk.SessionManager.listAll;
  const sessions = [
    { cwd: '/work/a', name: 'Alpha', firstMessage: 'alpha task', path: '/fixtures/a.jsonl', messageCount: 2 },
    { cwd: '/work/b', name: 'Beta', firstMessage: 'beta task', path: '/fixtures/b.jsonl', messageCount: 5 },
    { cwd: '/work/b', name: 'Other', firstMessage: 'other task', path: '/fixtures/c.jsonl', messageCount: 1 },
  ];
  h.sdk.SessionManager.listAll = async () => sessions;
  t.after(() => { h.sdk.SessionManager.listAll = savedListAll; });
  const switched = []; h.ctx.switchSession = async path => { switched.push(path); return { cancelled: false }; };
  h.ctx.cwd = '/work/a'; h.editor().setText('unfinished draft');
  h.terminal.rows = 24;
  h.lines(); // Measure the footer before opening the overlay, as the host does.
  const command = h.command('resume'); await settle();
  const dialog = h.dialog(); assert.ok(dialog);
  dialog.handleInput('\t'); dialog.handleInput('\x1b[B'); dialog.handleInput('\r');
  dialog.handleInput('beta');
  for (const width of [36, 48, 72, 100]) {
    const lines = dialog.render(width);
    assert.ok(lines.every(line => h.lib.visibleWidth(line) <= width), `resume overflow at ${width}`);
    const options = h.dialogOptions().overlayOptions();
    assert.ok(lines.length <= options.maxHeight, 'dialog fits its allocated height');
    assert.equal(options.row, 3);
    assert.ok(lines.some(line => line.includes('Beta')));
  }
  dialog.handleInput('\r'); await command;
  assert.deepEqual(switched, ['/fixtures/b.jsonl']);
  assert.equal(h.editor().getText(), 'unfinished draft');
  const originalRoot = h.tui.layoutRoot;
  const cancel = h.command('resume'); await settle();
  h.dialog().handleInput('\x1b'); await cancel;
  assert.equal(h.tui.layoutRoot, originalRoot); assert.equal(h.document.children[0], h.messages);
  assert.equal(switched.length, 1); assert.equal(h.editor().getText(), 'unfinished draft');
});
