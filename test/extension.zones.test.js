/**
 * extension.zones.test.js
 * 2026-09-30: 태그/괄호를 실제로 연결하고, 언어별 주석 스타일(#, --, <!-- -->)을 추가한
 * 작업을 extension.js의 실제 저장 파이프라인(onWillSaveTextDocument) 끝까지 검증한다.
 * zoneDetector.test(test.js)는 "어느 영역을 존으로 볼지"만 확인하고, 여기서는 그 존
 * 정보가 실제로 confidenceCalculator/hangulAssembler까지 이어져서 진짜 치환이
 * 일어나는지(그리고 진짜 코드는 안 건드리는지)까지 문서의 languageId를 지정해서 확인한다.
 *
 * 실행: node test/extension.zones.test.js
 */

const assert = require('assert');
const vscode = require('vscode'); // node_modules/vscode (mock)
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

function makeDoc(text, languageId) {
  return {
    uri: { scheme: 'file', fsPath: `/tmp/test.${languageId}` },
    languageId,
    getText: () => text,
    positionAt: (offset) => offset,
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

async function getSaveEdits(text, languageId) {
  const onWillSave = vscode.__registered.onWillSaveTextDocument[0];
  let captured = null;
  onWillSave({ document: makeDoc(text, languageId), waitUntil: (p) => { captured = p; } });
  return captured ? await captured : [];
}

async function convert(text, languageId) {
  const edits = await getSaveEdits(text, languageId);
  return applyEdits(text, edits);
}

async function main() {
  ext.activate({ subscriptions: [] });

  console.log('\n[extension.js] 언어별 주석 존이 실제로 저장 시점에 변환까지 이어진다');

  await test('파이썬 "#" 주석 안 오타는 저장하면 실제로 변환된다', async () => {
    assert.strictEqual(await convert('x = 1  # dkssudgktpdy', 'python'), 'x = 1  # 안녕하세요');
  });

  await test('파이썬에서 "//"는 주석이 아니므로 그 뒤 텍스트는 안 건드린다', async () => {
    assert.strictEqual(await convert('x = a // dkssud', 'python'), 'x = a // dkssud');
  });

  // 저장 시점(findCandidates) 경로는 타이핑 중 실시간 변환과 달리 신뢰도 임계값
  // (기본 70점)을 넘겨야 하므로, "하세요"로 끝나 어미 패턴 보너스(+20)가 붙는
  // dkssudgktpdy(→안녕하세요)로 테스트한다 - 짧은 dkssud(→안녕)는 컨텍스트 보너스만으론
  // 임계값을 못 넘어서 저장 시점엔 일부러 변환 안 되는 게 맞다(기존 설계, 새 버그 아님).
  await test('SQL "--" 주석 안 오타는 저장하면 실제로 변환된다', async () => {
    assert.strictEqual(await convert('SELECT 1; -- dkssudgktpdy', 'sql'), 'SELECT 1; -- 안녕하세요');
  });

  await test('HTML 주석 안 오타는 저장하면 실제로 변환된다', async () => {
    assert.strictEqual(await convert('<!-- dkssudgktpdy -->', 'html'), '<!-- 안녕하세요 -->');
  });

  console.log('\n[extension.js] 태그 내부 텍스트가 실제로 저장 시점에 변환까지 이어진다');

  await test('JSX 태그 사이 텍스트는 저장하면 실제로 변환된다', async () => {
    assert.strictEqual(await convert('<div>dkssudgktpdy</div>', 'javascriptreact'), '<div>안녕하세요</div>');
  });

  await test('일반 .js 파일(태그 언어가 아님)에서는 "<div>dkssud</div>"를 안 건드린다', async () => {
    assert.strictEqual(await convert('<div>dkssud</div>', 'javascript'), '<div>dkssud</div>');
  });

  console.log('\n[extension.js] 괄호 - 안전한 경우만 변환하고, 진짜 코드는 절대 안 건드린다');

  await test('코드에 안 붙은 순수 텍스트 괄호는 저장하면 실제로 변환된다', async () => {
    assert.strictEqual(
      await convert('const x = 1;\n(dkssudgktpdy) 참고', 'javascript'),
      'const x = 1;\n(안녕하세요) 참고'
    );
  });

  await test('함수 호출 인자는 절대 안 건드린다 (login(dkssud) 그대로 유지)', async () => {
    assert.strictEqual(
      await convert('function login(dkssud) { return dkssud; }', 'javascript'),
      'function login(dkssud) { return dkssud; }'
    );
  });

  await test('if 블록/객체 리터럴 중괄호 안 진짜 코드는 절대 안 건드린다', async () => {
    assert.strictEqual(
      await convert('if (a > b) { dkssud } else { dkssud2 }', 'javascriptreact'),
      'if (a > b) { dkssud } else { dkssud2 }'
    );
    assert.strictEqual(
      await convert('const config = { dkssud };', 'javascript'),
      'const config = { dkssud };'
    );
  });

  console.log('\n[extension.js] 반대 방향(한글→영어) 변환이 새로 추가된 존 타입(태그/안전 괄호)도 똑같이 존중한다');

  await test('JSX 태그 내부의 "채눗"(const 오타)은 진짜 한글일 수 있으니 되돌리지 않는다', async () => {
    assert.strictEqual(await convert('<div>채눗</div>', 'javascriptreact'), '<div>채눗</div>');
  });

  await test('안전한 괄호 존 안의 "채눗"도 되돌리지 않는다 (주석/문자열과 동일 취급)', async () => {
    assert.strictEqual(
      await convert('const y = 1;\n(채눗) 참고', 'javascript'),
      'const y = 1;\n(채눗) 참고'
    );
  });

  await test('반면 코드(식별자) 자리의 "채눗"은 그대로 const로 되돌린다 (존 밖이므로)', async () => {
    assert.strictEqual(await convert('채눗 x = 1;', 'javascript'), 'const x = 1;');
  });

  console.log(`\n${passed}개 통과, ${failed}개 실패\n`);
  if (failed > 0) process.exitCode = 1;
}

main();
