import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { mkdtemp, readFile, readdir, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';

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
    setSessionName: name => {
      if (ctx.sessionManager.appendSessionInfo) ctx.sessionManager.appendSessionInfo(name);
      else ctx.sessionManager.getSessionName = () => name;
    },
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
  const emit = async (name, event = {}) => { for (const f of extension.handlers.get(name) ?? []) await f(event, ctx); };
  await emit('session_start');
  t.after(async () => { finish?.(undefined); await emit('session_shutdown'); runtime.invalidate(); tui.stop(); });
  return { ctx, tui, terminal, bindings, originalRoot, header, document, transcript, messages, notices, opened, submitted,
    editor: () => editor, footer: () => footer, dialog: () => dialog, dialogOptions: () => dialogOptions,
    command: args => extension.commands.get('workbench').handler(args, ctx),
    lines: () => tui.render(terminal.columns), lib, sdk, bus, emit,
  };
}

test('native transcript stays mounted; menu and one-row white title live outside its ScrollView', { skip: !available }, async t => {
  const h = await host(t);
  assert.deepEqual(h.notices, []);
  assert.equal(h.document.children[0], h.messages);
  const lines = h.lines(), text = lines.map(h.lib.stripTerminalSequences);
  assert.match(text[0], /Session.*Model.*Tools.*View.*Help/);
  assert.ok(!lines[0].includes('\x1b[107m'), 'inactive menu has no white background');
  assert.match(text[1], /Pi \| pi-reaction-tui \| UI Test/);
  assert.ok(lines[1].includes('\x1b[107m'));
  assert.ok(text.some(line => line.includes('Native transcript')));
  assert.ok(text.some(line => line.includes('Conversation')));
  assert.ok(text.some(line => line.includes('Input')));
  const inputBorder = h.editor().render(110)[0];
  assert.match(h.lib.stripTerminalSequences(inputBorder), /Input.*test-model \/ high.*┐$/);
  assert.ok(!inputBorder.includes('\x1b[107m'));
  for (const width of [40, 60, 110, 160]) {
    h.terminal.columns = width;
    assert.ok(h.lines().every(line => h.lib.visibleWidth(line) <= width), `overflow at ${width}`);
  }
  await h.command('off'); assert.equal(h.tui.layoutRoot, h.originalRoot);
  assert.equal(h.document.children[0], h.header);
  await h.command('on'); assert.equal(h.document.children[0], h.messages);
});

async function savedSessions(t, h) {
  const directory = await mkdtemp(resolve(tmpdir(), 'pirt-session-actions-'));
  const managers = ['Alpha', 'Beta'].map(name => {
    const manager = h.sdk.SessionManager.create('/work/a', directory);
    manager.appendMessage({ role: 'user', content: 'shared task', timestamp: Date.now() });
    manager.appendSessionInfo(name);
    return manager;
  });
  const original = h.sdk.SessionManager.listAll;
  h.sdk.SessionManager.listAll = async () => (await h.sdk.SessionManager.list('/work/a', directory))
    .sort((a, b) => a.name.localeCompare(b.name));
  h.ctx.cwd = '/work/a'; h.editor().setText('retained draft');
  t.after(async () => { h.sdk.SessionManager.listAll = original; await rm(directory, { recursive: true, force: true }); });
  return { directory, managers, paths: managers.map(manager => manager.getSessionFile()) };
}

async function until(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for session action');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

test('resume renames the selected saved session without switching or losing search/draft', { skip: !available }, async t => {
  const h = await host(t), f = await savedSessions(t, h);
  const before = await readFile(f.paths[0], 'utf8');
  let switches = 0; h.ctx.switchSession = async () => { switches++; };
  const command = h.command('resume'); await until(() => !!h.dialog());
  const dialog = h.dialog(); dialog.handleInput('shared');
  assert.match(h.footer().render(160)[0], /Rename.*Delete/);
  dialog.handleInput('\x12'); assert.ok(dialog.render(80).some(line => line.includes('Rename Session')));
  dialog.handleInput('\x1b'); assert.equal(await readFile(f.paths[0], 'utf8'), before);
  dialog.handleInput('\x12'); dialog.handleInput('\x01'); dialog.handleInput('\x0b'); dialog.handleInput('\r');
  assert.ok(dialog.render(80).some(line => line.includes('Name cannot be empty')));
  dialog.handleInput('New Alpha'); dialog.handleInput('\r'); dialog.handleInput('\r');
  await until(() => dialog.render(80).some(line => line.includes('Resume Session')));
  const after = await readFile(f.paths[0], 'utf8');
  assert.ok(after.startsWith(before), 'rename appends native session metadata without rewriting messages');
  assert.equal(h.sdk.SessionManager.open(f.paths[0]).getSessionName(), 'New Alpha');
  assert.ok(dialog.render(100).some(line => line.includes('shared')));
  assert.ok(dialog.render(100).some(line => line.includes('New Alpha')));
  dialog.handleInput('\x1b'); await command;
  assert.equal(switches, 0); assert.equal(h.editor().getText(), 'retained draft');
});

test('resume confirms permanent deletion, cancels without mutation and handles the last remaining session', { skip: !available }, async t => {
  const h = await host(t), f = await savedSessions(t, h);
  const command = h.command('resume'); await until(() => !!h.dialog());
  const dialog = h.dialog(); dialog.handleInput('shared'); dialog.handleInput('\x04');
  for (const width of [36, 48, 72, 100]) {
    const lines = dialog.render(width);
    assert.equal(lines.length, 8);
    assert.ok(lines.every(line => h.lib.visibleWidth(line) <= width));
    assert.match(h.lib.stripTerminalSequences(lines[1]), /Delete Session/);
  }
  assert.ok(h.footer().render(160)[0].includes('Delete'));
  dialog.handleInput('\x1b'); assert.ok(existsSync(f.paths[0]));
  dialog.handleInput('\x04'); dialog.handleInput('\r'); dialog.handleInput('\r');
  await until(() => dialog.render(80).some(line => line.includes('Resume Session')));
  assert.equal(existsSync(f.paths[0]), false); assert.ok(existsSync(f.paths[1]));
  assert.deepEqual(await readdir(f.directory), [f.paths[1].split('/').at(-1)], 'no archive or trash is created');
  assert.ok(dialog.render(100).some(line => line.includes('Beta')));
  assert.ok(dialog.render(100).some(line => line.includes('shared')));
  dialog.handleInput('\x04'); dialog.handleInput('\r');
  await until(() => dialog.render(80).some(line => line.includes('No matches')));
  assert.deepEqual(await readdir(f.directory), []);
  assert.ok(!h.footer().render(160)[0].includes('Delete'));
  dialog.handleInput('\x1b'); await command;
  assert.equal(h.editor().getText(), 'retained draft');
});

test('resume renames the active session through Pi and refuses to delete its live file', { skip: !available }, async t => {
  const h = await host(t), f = await savedSessions(t, h);
  h.ctx.sessionManager = f.managers[0];
  const command = h.command('resume'); await until(() => !!h.dialog());
  const dialog = h.dialog();
  assert.ok(!h.footer().render(160)[0].includes('Delete'));
  dialog.handleInput('\x04');
  assert.ok(dialog.render(100).some(line => line.includes('Switch sessions before deleting')));
  assert.ok(existsSync(f.paths[0]));
  dialog.handleInput('\x12'); dialog.handleInput('\x01'); dialog.handleInput('\x0b'); dialog.handleInput('Active renamed'); dialog.handleInput('\r');
  await until(() => dialog.render(80).some(line => line.includes('Resume Session')));
  assert.equal(f.managers[0].getSessionName(), 'Active renamed');
  assert.equal(h.sdk.SessionManager.open(f.paths[0]).getSessionName(), 'Active renamed');
  assert.ok(h.lines()[1].includes('Active renamed'));
  dialog.handleInput('\x1b'); await command;
});

test('resume reports disk failures without closing the list or silently dropping the entry', { skip: !available }, async t => {
  const h = await host(t), f = await savedSessions(t, h);
  const command = h.command('resume'); await until(() => !!h.dialog());
  const dialog = h.dialog(); await unlink(f.paths[0]);
  dialog.handleInput('\x12'); dialog.handleInput('\r');
  await until(() => dialog.render(160).some(line => line.includes('ENOENT')));
  dialog.handleInput('\x1b');
  dialog.handleInput('\x04'); dialog.handleInput('\r');
  await until(() => dialog.render(160).some(line => line.includes('ENOENT')));
  assert.ok(existsSync(f.paths[1]));
  dialog.handleInput('\x1b'); assert.ok(dialog.render(100).some(line => line.includes('Alpha')));
  dialog.handleInput('\x1b'); await command;
});

test('provider and streaming events drive performance in the native footer and clear on session start', { skip: !available }, async t => {
  const h = await host(t);
  await h.emit('agent_start'); await h.emit('before_provider_request', { payload: {} });
  const message = { role: 'assistant', api: 'openai-responses', content: [{ type: 'text', text: 'abcd' }],
    usage: { output: 200, reasoning: 180 }, stopReason: 'stop' };
  const delta = text => h.emit('message_update', { message, assistantMessageEvent: {
    type: 'text_delta', delta: text, contentIndex: 0, partial: message,
  } });
  await delta('abcd'); await new Promise(resolve => setTimeout(resolve, 110)); await delta('efgh');
  assert.match(h.footer().render(160).at(-1), /TTFT \d+ms.*OUT ~/);
  await h.emit('message_end', { message }); await h.emit('agent_settled');
  assert.match(h.footer().render(160).at(-1), /TTFT \d+ms.*OUT \d+\.\dt\/s/);
  await h.emit('before_provider_request', { payload: {} });
  assert.match(h.footer().render(160).at(-1), /TTFT -.*OUT -/);
  await h.emit('session_start');
  assert.match(h.footer().render(160).at(-1), /TTFT -.*OUT -/);
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

test('independent white status strip stays last, preserves mode and refreshes completed usage', { skip: !available }, async t => {
  const h = await host(t);
  let mode = 'ro', reads = 0;
  const off = h.bus.on('ro-rw-mode:get', query => { query.mode = mode; }); t.after(off);
  const usage = { input: 1000, output: 500, cacheRead: 8000, cacheWrite: 1000, cost: { total: 0.01 } };
  h.ctx.sessionManager.getEntries = () => { reads++; return [{ type: 'message', message: { role: 'assistant', usage } }]; };
  await h.emit('message_end');
  const lines = h.footer().render(160), status = h.lib.stripTerminalSequences(lines.at(-1));
  assert.equal(lines.length, 2, 'one help row and one status row, without a shared frame');
  assert.ok(lines.at(-1).startsWith('\x1b[30m\x1b[107m'));
  assert.equal(h.lib.visibleWidth(lines.at(-1)), 160);
  assert.match(status, /IDLE.*UP 1k.*DN 500.*CR 8k.*CW 1k.*HIT 80\.0%.*COST \$0\.010.*CTX 4\.9%\/128k/);
  assert.ok(status.endsWith(' RO ')); assert.ok(!status.includes('test-model'));
  assert.ok(!/[┌┐└┘│]/.test(status));
  for (const width of [1, 2, 3, 10, 40, 60, 80, 110, 160]) {
    const rendered = h.footer().render(width);
    assert.ok(rendered.every(line => h.lib.visibleWidth(line) <= width), `footer overflow at ${width}`);
    assert.equal(h.lib.visibleWidth(rendered.at(-1)), width);
    if (width >= 4) assert.ok(h.lib.stripTerminalSequences(rendered.at(-1)).endsWith(' RO '));
  }
  assert.equal(reads, 1, 'resizing does not rescan session history');
  usage.output = 750; mode = 'rw';
  await h.emit('agent_settled');
  const updated = h.lib.stripTerminalSequences(h.footer().render(160).at(-1));
  assert.match(updated, /DN 750/); assert.ok(updated.endsWith(' RW ')); assert.equal(reads, 2);
  const command = h.command('model'); await settle();
  assert.ok(h.lines()[0].includes('\x1b[107m'), 'only the active menu item is inverted');
  const modalFooter = h.footer().render(160);
  assert.match(h.lib.stripTerminalSequences(modalFooter[0]), /Confirm.*Cancel/);
  assert.ok(modalFooter.at(-1).includes('DN 750'), 'opening a modal leaves the status strip visible');
  h.dialog().handleInput('\x1b'); await command;
});
