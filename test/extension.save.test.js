/**
 * extension.save.test.js
 * extension.js는 원래 'vscode' 모듈이 필요해서 F5(실제 VS Code)로만 확인할 수 있었는데,
 * test/node_modules/vscode 에 최소 기능만 흉내 낸 목(mock)을 넣어서 여기서도 검증한다.
 * (VS Code 없이 실행: node test/extension.save.test.js)
 *
 * 이 파일은 사용자 리포트 버그를 재현/검증하기 위해 추가됐다 (2026-09-29):
 * "안녕하세요"를 영문 자판으로 친 뒤(dkssudgktpdy) 스페이스/엔터 등 구분 문자를
 * 하나도 안 치고 그대로 파일을 저장하면 자동 변환이 전혀 안 되던 문제.
 * -> extension.js에 onWillSaveTextDocument 안전망(convertOnSave)을 추가해서 고쳤다.
 */

const assert = require('assert');
const vscode = require('vscode'); // test/node_modules/vscode (mock)이 잡힘
const ext = require('../extension');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn()
    .then(() => {
      passed++;
      console.log(`  ✓ ${name}`);
    })
    .catch((err) => {
      failed++;
      console.log(`  ✗ ${name}`);
      console.log(`      ${err.message}`);
    });
}

function makeDoc(text) {
  return {
    uri: { scheme: 'file', fsPath: '/tmp/test.js' },
    getText: () => text,
    positionAt: (offset) => offset, // 단순화: 오프셋을 그대로 Position으로 사용
    offsetAt: (position) => position,
  };
}

function applyEdits(text, edits) {
  const sorted = [...edits].sort((a, b) => b.range.start - a.range.start);
  let result = text;
  for (const e of sorted) {
    result = result.slice(0, e.range.start) + e.newText + result.slice(e.range.end);
  }
  return result;
}

async function getSaveEdits(text) {
  const onWillSave = vscode.__registered.onWillSaveTextDocument[0];
  let captured = null;
  onWillSave({ document: makeDoc(text), waitUntil: (p) => { captured = p; } });
  return captured ? await captured : [];
}

async function main() {
  ext.activate({ subscriptions: [] });

  console.log('\n[extension.js] 저장 시점 자동변환 안전망 (onWillSaveTextDocument)');

  await test('구분 문자 없이 "dkssudgktpdy"만 치고 저장 -> "안녕하세요"로 자동 변환된다 (사용자 리포트 버그 재현/수정 확인)', async () => {
    const edits = await getSaveEdits('// dkssudgktpdy');
    assert.ok(edits.length > 0, '변환 후보가 1개 이상 있어야 함');
    const result = applyEdits('// dkssudgktpdy', edits);
    assert.strictEqual(result, '// 안녕하세요');
  });

  await test('실제 영단어("test function")는 저장해도 바뀌지 않는다 (오탐 방지 유지)', async () => {
    const edits = await getSaveEdits('// test function');
    assert.strictEqual(edits.length, 0);
  });

  await test('코드(식별자) 영역은 저장해도 건드리지 않는다 (주석/문자열 밖)', async () => {
    const edits = await getSaveEdits('const dkssud = 1;');
    assert.strictEqual(edits.length, 0);
  });

  console.log(`\n${passed}개 통과, ${failed}개 실패\n`);
  if (failed > 0) process.exitCode = 1;
}

main();
