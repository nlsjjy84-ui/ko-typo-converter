/**
 * extension.layout.test.js (v0.1.0)
 * 1) 설정 ko-typo.keyboardLayout을 "390"으로 두면 세벌식으로 친 글자가 실제 타이핑 흐름에서 바뀌는지
 * 2) 자동완성 목록 문제 수정: 바꾸기 전에 목록을 닫고(hideSuggestWidget), 편집이 거절되면 한 번 더 하고,
 *    그 사이 사용자가 더 쳤으면 손대지 않는지
 *
 * 실행: node -r ./test/setup.js test/extension.layout.test.js
 */
const assert = require('assert');
const vscode = require('vscode');
const ext = require('../extension');

let passed = 0;
let failed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((err) => { failed++; console.log(`  ✗ ${name}\n      ${err.stack || err.message}`); });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeDoc(initial, fsPath) {
  let text = initial;
  return {
    uri: { scheme: 'file', fsPath, toString: () => fsPath },
    version: 1,
    getText: () => text,
    positionAt: (o) => o,
    offsetAt: (p) => p,
    _append: (s) => { text += s; },
    _replace: (r, t) => { text = text.slice(0, r.start) + t + text.slice(r.end); },
  };
}
function makeEditor(doc, { rejectFirst = false } = {}) {
  let cursor = doc.getText().length;
  let calls = 0;
  return {
    document: doc,
    get selection() { return { active: cursor }; },
    get editCalls() { return calls; },
    edit: (cb) => {
      calls++;
      if (rejectFirst && calls === 1) return Promise.resolve(false); // VS Code가 편집을 거절한 상황
      cb({ replace: (r, t) => { doc._replace(r, t); cursor = r.start + t.length; } });
      return Promise.resolve(true);
    },
    _setCursor: (n) => { cursor = n; },
  };
}
function typeChars(onChange, doc, editor, chars) {
  for (const ch of chars) {
    const at = doc.getText().length;
    doc._append(ch);
    editor._setCursor(doc.getText().length);
    onChange({ document: doc, contentChanges: [{ range: { start: at, end: at }, text: ch }] });
  }
}

async function main() {
  ext.activate({ subscriptions: [] });
  const onChange = vscode.__registered.onDidChangeTextDocument[0];
  vscode.__setConfig('autoConvertDelayMs', 30);

  console.log('\n[extension.js] 세벌식(390) 설정');
  vscode.__setConfig('keyboardLayout', '390');

  await test('390: 주석에서 "jfsheamfncj4"(안녕하세요)를 치고 스페이스를 누르면 바로 바뀐다', async () => {
    const doc = makeDoc('// ', '/tmp/l1.js');
    const editor = makeEditor(doc);
    vscode.window.activeTextEditor = editor;
    vscode.window.visibleTextEditors = [editor];
    typeChars(onChange, doc, editor, 'jfsheamfncj4 '.split(''));
    await sleep(20);
    assert.strictEqual(doc.getText(), '// 안녕하세요 ');
  });

  await test('390: ;(ㅂ)를 쳐도 단어가 끊기지 않고, 멈추면 "감사합니다"로 바뀐다', async () => {
    const doc = makeDoc('// ', '/tmp/l2.js');
    const editor = makeEditor(doc);
    vscode.window.activeTextEditor = editor;
    vscode.window.visibleTextEditors = [editor];
    typeChars(onChange, doc, editor, 'kfznfmf3hduf'.split(''));
    await sleep(70);
    assert.strictEqual(doc.getText(), '// 감사합니다');
  });

  await test('390: 코드 자리(주석·문자열 밖)는 바꾸지 않는다', async () => {
    const doc = makeDoc('const a = ', '/tmp/l3.js');
    const editor = makeEditor(doc);
    vscode.window.activeTextEditor = editor;
    vscode.window.visibleTextEditors = [editor];
    typeChars(onChange, doc, editor, 'jfsheamfncj4 '.split(''));
    await sleep(20);
    assert.strictEqual(doc.getText(), 'const a = jfsheamfncj4 ');
  });

  console.log('\n[extension.js] 자동완성 목록 문제 수정 (2벌식)');
  vscode.__setConfig('keyboardLayout', '2');

  await test('바꾸기 전에 자동완성 목록 닫기(hideSuggestWidget)를 먼저 실행한다', async () => {
    vscode.commands.executed.length = 0;
    const doc = makeDoc('// ', '/tmp/s1.js');
    const editor = makeEditor(doc);
    vscode.window.activeTextEditor = editor;
    vscode.window.visibleTextEditors = [editor];
    typeChars(onChange, doc, editor, 'dkssud '.split(''));
    await sleep(20);
    assert.strictEqual(doc.getText(), '// 안녕 ');
    assert.ok(vscode.commands.executed.includes('hideSuggestWidget'));
  });

  await test('편집이 한 번 거절되면(목록과 부딪힌 경우) 잠깐 뒤 다시 해서 결국 바뀐다', async () => {
    const doc = makeDoc('// ', '/tmp/s2.js');
    const editor = makeEditor(doc, { rejectFirst: true });
    vscode.window.activeTextEditor = editor;
    vscode.window.visibleTextEditors = [editor];
    typeChars(onChange, doc, editor, 'dkssud '.split(''));
    await sleep(150);
    assert.strictEqual(doc.getText(), '// 안녕 ');
    assert.strictEqual(editor.editCalls, 2);
  });

  await test('바꾸기 직전에 사용자가 그 단어를 고쳤으면 손대지 않는다', async () => {
    const doc = makeDoc('// ', '/tmp/s3.js');
    const editor = makeEditor(doc, { rejectFirst: true });
    vscode.window.activeTextEditor = editor;
    vscode.window.visibleTextEditors = [editor];
    typeChars(onChange, doc, editor, 'dkssud '.split(''));
    // 첫 편집이 거절되고 다시 하기 전(60ms)에 사용자가 단어를 다른 글자로 바꿔 버린 상황
    doc._replace({ start: 3, end: 9 }, 'hello!');
    await sleep(150);
    assert.strictEqual(doc.getText(), '// hello! ');
  });

  await test('v0.1.1: 들여쓰기 있는 줄에서 엔터("\\n    ")로 단어를 끝내도 바로 바뀐다', async () => {
    vscode.__setConfig('autoConvertDelayMs', 400);
    const doc = makeDoc('    // ', '/tmp/s4.js');
    const editor = makeEditor(doc);
    vscode.window.activeTextEditor = editor;
    vscode.window.visibleTextEditors = [editor];
    typeChars(onChange, doc, editor, 'dkssud'.split(''));
    const at = doc.getText().length;
    doc._append('\n    ');
    editor._setCursor(doc.getText().length);
    onChange({ document: doc, contentChanges: [{ range: { start: at, end: at }, text: '\n    ' }] });
    await sleep(20); // 멈춤 대기(400ms)보다 훨씬 전에 바뀌어 있어야 한다
    assert.strictEqual(doc.getText(), '    // 안녕\n    ');
    await sleep(420);
    vscode.__setConfig('autoConvertDelayMs', 30);
  });

  await test('v0.1.1: 멈춤으로 바뀐 단어를 되돌리기(Ctrl+Z)하면 다시 바꾸지 않는다', async () => {
    const doc = makeDoc('// ', '/tmp/s5.js');
    const editor = makeEditor(doc);
    vscode.window.activeTextEditor = editor;
    vscode.window.visibleTextEditors = [editor];
    typeChars(onChange, doc, editor, 'dkssud'.split(''));
    await sleep(70);
    assert.strictEqual(doc.getText(), '// 안녕');
    // 되돌리기: "안녕"이 다시 "dkssud"로, 커서는 단어 바로 뒤
    doc._replace({ start: 3, end: 5 }, 'dkssud');
    editor._setCursor(doc.getText().length);
    onChange({ document: doc, reason: vscode.TextDocumentChangeReason.Undo, contentChanges: [{ range: { start: 3, end: 5 }, text: 'dkssud' }] });
    await sleep(70);
    assert.strictEqual(doc.getText(), '// dkssud');
  });

  vscode.__resetConfig();
  console.log(`\n${passed}개 통과, ${failed}개 실패\n`);
  if (failed) process.exit(1);
}
main();
