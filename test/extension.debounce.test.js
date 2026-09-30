/**
 * extension.debounce.test.js
 * 사용자 요청(2026-09-29): "구분 문자(스페이스 등)를 안 쳐도, 타이핑을 잠깐 멈추면
 * 문법적으로 완성된 한글은 바로바로 바뀌어야 한다" -> extension.js의
 * scheduleDebouncedConvert(ko-typo.autoConvertDelayMs, 기본 500ms)를 검증한다.
 *
 * 실행: node test/extension.debounce.test.js
 */

const assert = require('assert');
const vscode = require('vscode'); // node_modules/vscode (mock)
const ext = require('../extension');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`  ✓ ${name}`);
    })
    .catch((err) => {
      failed++;
      console.log(`  ✗ ${name}`);
      console.log(`      ${err.stack || err.message}`);
    });
}

function makeMutableDoc(initialText, fsPath) {
  let text = initialText;
  return {
    uri: { scheme: 'file', fsPath },
    getText: () => text,
    positionAt: (offset) => offset, // 단순화: 오프셋을 그대로 Position으로 사용
    offsetAt: (pos) => pos,
    _append: (s) => { text += s; },
    _applyReplace: (range, newText) => {
      text = text.slice(0, range.start) + newText + text.slice(range.end);
    },
  };
}

function makeEditor(document) {
  let cursor = document.getText().length;
  return {
    document,
    get selection() { return { active: cursor }; },
    edit: (cb) => {
      cb({
        replace: (range, newText) => {
          document._applyReplace(range, newText);
          cursor = range.start + newText.length;
        },
      });
      return Promise.resolve(true);
    },
    _setCursor: (n) => { cursor = n; },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 문자를 한 글자씩, 실제 타이핑처럼 onDidChangeTextDocument 이벤트로 흘려보낸다 */
function typeChars(onChangeHandler, document, editor, chars) {
  for (const ch of chars) {
    const startOffset = document.getText().length;
    document._append(ch);
    editor._setCursor(document.getText().length);
    onChangeHandler({
      document,
      contentChanges: [{ range: { start: startOffset, end: startOffset }, text: ch }],
    });
  }
}

async function main() {
  vscode.window.visibleTextEditors = [];
  ext.activate({ subscriptions: [] });
  const onChange = vscode.__registered.onDidChangeTextDocument[0];
  assert.ok(onChange, 'onDidChangeTextDocument 핸들러가 등록되어야 함');

  // 테스트가 30초씩 기다리지 않도록 딜레이를 짧게(30ms) 오버라이드
  vscode.__setConfig('autoConvertDelayMs', 30);

  console.log('\n[extension.js] 타이핑 멈춤 디바운스 자동변환 (scheduleDebouncedConvert)');

  await test('구분 문자 없이 "dkssudgktpdy"를 한 글자씩 치고 멈추면, 짧은 지연 후 "안녕하세요"로 자동 변환된다', async () => {
    const doc = makeMutableDoc('// ', '/tmp/debounce1.js');
    const editor = makeEditor(doc);
    vscode.window.activeTextEditor = editor;
    vscode.window.visibleTextEditors = [editor];

    typeChars(onChange, doc, editor, 'dkssudgktpdy'.split(''));

    // 타이핑 직후(디바운스 대기 중)엔 아직 안 바뀌어 있어야 한다
    assert.strictEqual(doc.getText(), '// dkssudgktpdy');

    await sleep(60); // 디바운스(30ms)가 끝날 때까지 대기

    assert.strictEqual(doc.getText(), '// 안녕하세요');
  });

  await test('타이핑 도중 새로 친 글자가 있으면 타이머가 계속 리셋되어, 전부 치기 전엔 변환되지 않는다', async () => {
    const doc = makeMutableDoc('// ', '/tmp/debounce2.js');
    const editor = makeEditor(doc);
    vscode.window.activeTextEditor = editor;
    vscode.window.visibleTextEditors = [editor];

    // 20ms 간격으로 한 글자씩 치면, 디바운스(30ms)가 매번 리셋되어 다 칠 때까지 안 바뀐다
    for (const ch of 'dkssudgktpdy'.split('')) {
      const startOffset = doc.getText().length;
      doc._append(ch);
      editor._setCursor(doc.getText().length);
      onChange({ document: doc, contentChanges: [{ range: { start: startOffset, end: startOffset }, text: ch }] });
      await sleep(15);
    }
    assert.strictEqual(doc.getText(), '// dkssudgktpdy', '아직 타이핑 중이므로 변환되면 안 됨');

    await sleep(50);
    assert.strictEqual(doc.getText(), '// 안녕하세요', '멈추고 나면 결국 변환되어야 함');
  });

  await test('흔한 영단어("function")는 멈춰도 변환되지 않는다 (오탐 방지 유지)', async () => {
    const doc = makeMutableDoc('// ', '/tmp/debounce3.js');
    const editor = makeEditor(doc);
    vscode.window.activeTextEditor = editor;
    vscode.window.visibleTextEditors = [editor];

    typeChars(onChange, doc, editor, 'function'.split(''));
    await sleep(60);

    assert.strictEqual(doc.getText(), '// function');
  });

  vscode.__resetConfig();
  console.log(`\n${passed}개 통과, ${failed}개 실패\n`);
  if (failed > 0) process.exitCode = 1;
}

main();
