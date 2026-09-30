/**
 * extension.reverse.test.js
 * 기능 추가 (2026-09-29, 사용자 요청): "영어로 쳤는데 한글이면 한글로" 뿐 아니라 반대로
 * "한글로 쳐졌지만 사실은 프로그래밍 키워드/이 파일에 이미 쓰인 식별자였다면 원래 영어로
 * 되돌린다"는 반대 방향 기능(reverseMapper.js) 검증.
 * (VS Code 없이 실행: node test/extension.reverse.test.js)
 */

const assert = require('assert');
const vscode = require('vscode'); // node_modules/vscode (mock)이 잡힘
const ext = require('../extension');
const { convertEngToKor } = require('../hangulAssembler');

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

// extension.js는 문서별 역방향 조회 표를 document.version이 바뀔 때만 다시 만든다
// (성능을 위한 캐시). 테스트마다 텍스트가 달라지므로, 실제 VS Code처럼 호출마다
// version을 증가시켜서 매번 새로 계산되게 한다.
let docVersionCounter = 0;
function makeDoc(text) {
  docVersionCounter += 1;
  return {
    uri: { scheme: 'file', fsPath: '/tmp/test.js', toString: () => '/tmp/test.js' },
    version: docVersionCounter,
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

  console.log('\n[extension.js] 반대 방향 자동 변환 (한글로 잘못 쳐진 영어 키워드/식별자 복원)');

  const consoleGarbled = convertEngToKor('console'); // '채누디'
  const errorGarbled = convertEngToKor('error'); // '객'
  const constGarbled = convertEngToKor('const'); // '채눗'

  await test('코드 안에서 "console"이 한글로 잘못 조합됐으면 저장 시 "console"로 되돌린다', async () => {
    const edits = await getSaveEdits(`${consoleGarbled}.log("hi");`);
    assert.ok(edits.length > 0, '되돌릴 후보가 1개 이상 있어야 함');
    const result = applyEdits(`${consoleGarbled}.log("hi");`, edits);
    assert.strictEqual(result, 'console.log("hi");');
  });

  await test('알려진 프로그래밍 키워드(const, error)가 한글로 잘못 조합됐으면 저장 시 되돌린다', async () => {
    const edits = await getSaveEdits(`${constGarbled} e = new ${errorGarbled}();`);
    const result = applyEdits(`${constGarbled} e = new ${errorGarbled}();`, edits);
    assert.strictEqual(result, 'const e = new error();');
  });

  await test('주석/문자열 "안"의 같은 한글은 진짜 한글일 수 있으므로 건드리지 않는다', async () => {
    const text = `// ${consoleGarbled} 얘기가 아니라 진짜 한글 문장입니다`;
    const edits = await getSaveEdits(text);
    assert.strictEqual(edits.length, 0);
  });

  await test('이 문서에 이미 쓰인 식별자(예: helper)가 한글로 잘못 조합됐으면 저장 시 되돌린다', async () => {
    const garbledIdent = convertEngToKor('helper');
    const text = `function helper(x) { return ${garbledIdent}(x); }`;
    const edits = await getSaveEdits(text);
    const result = applyEdits(text, edits);
    assert.strictEqual(result, 'function helper(x) { return helper(x); }');
  });

  await test('ko-typo.reverseConvert를 꺼두면 반대 방향 변환을 하지 않는다', async () => {
    vscode.__setConfig('reverseConvert', false);
    const edits = await getSaveEdits(`${consoleGarbled}.log("hi");`);
    vscode.__resetConfig();
    assert.strictEqual(edits.length, 0);
  });

  await test('알려진 용어와 일치하지 않는 평범한 한글 코드/변수명은 그대로 둔다', async () => {
    // "안녕" 같은 흔한 한글은 프로그래밍 키워드/식별자 사전에 없으므로 대상이 아니다.
    const edits = await getSaveEdits('const 안녕 = 1;');
    assert.strictEqual(edits.length, 0);
  });

  console.log(`\n${passed}개 통과, ${failed}개 실패\n`);
  if (failed > 0) process.exitCode = 1;
}

main();
