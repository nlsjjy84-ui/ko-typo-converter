/**
 * threebeol.test.js (v0.1.0)
 * 세벌식 390·최종 조합 엔진(threeBeolAssembler.js)을 libhangul이 실제로 낸 결과와 대조한다.
 * 기준값(test/fixtures/threebeol-libhangul.json)은 libhangul을 직접 빌드해 같은 키 입력을
 * 넣고 받은 결과다. 실제 단어 24개(안녕하세요·감사합니다·없습니다·뷁 등) + 무작위 키 300개씩.
 *
 * 실행: node test/threebeol.test.js
 */
const assert = require('assert');
const { convertThreeBeol } = require('../threeBeolAssembler');
const { getLayoutHelpers } = require('../keyboardLayout');
const fixture = require('./fixtures/threebeol-libhangul.json');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n      ${e.message}`); }
}

console.log('\n[threeBeolAssembler] libhangul과 같은 결과를 내는가');
for (const layout of ['390', '3final']) {
  const cases = fixture.cases[layout];
  test(`${layout}: 기준 ${cases.length}건이 libhangul 결과와 모두 같다`, () => {
    const bad = cases.filter(([keys, expected]) => convertThreeBeol(keys, layout) !== expected);
    assert.strictEqual(bad.length, 0, `다른 결과 ${bad.length}건: ${JSON.stringify(bad.slice(0, 3))}`);
  });
  test(`${layout}: 실제 단어(안녕하세요·없습니다·뷁 등)가 완성된 글자로 조합된다`, () => {
    const words = cases.slice(0, 24).map(([, w]) => w);
    assert.ok(words.includes('안녕하세요') && words.includes('없습니다') && words.includes('뷁'));
    for (const w of words) assert.ok(/^[가-힣]+$/.test(w), `${w}는 완성된 글자여야 함`);
  });
}

test('자판에 없는 글자가 섞이면 null (390에서 대문자 B)', () => {
  assert.strictEqual(convertThreeBeol('kfB', '390'), null);
});

console.log('\n[keyboardLayout] 자판별 단어 규칙');
test('2벌식은 ;를 단어 끝으로 보지만, 390에서 ;는 ㅂ이라 단어 끝이 아니다', () => {
  assert.strictEqual(getLayoutHelpers('2').isBoundary(';'), true);
  assert.strictEqual(getLayoutHelpers('390').isBoundary(';'), false);
  assert.strictEqual(getLayoutHelpers('390').isBoundary(' '), true);
});
test('390에서 숫자·기호만 있는 단어(2026)는 한글로 치려던 것으로 보지 않는다', () => {
  assert.strictEqual(getLayoutHelpers('390').isConvertible('2026'), false);
  assert.strictEqual(getLayoutHelpers('390').isConvertible('jfsheamfncj4'), true);
});
test('390 선택 영역 변환은 공백을 그대로 두고 단어만 바꾼다', () => {
  assert.strictEqual(getLayoutHelpers('390').convertText('jfsheamfncj4 kfznfmf3hduf'), '안녕하세요 감사합니다');
});
test('설정값이 이상하면 2벌식으로 동작한다', () => {
  assert.strictEqual(getLayoutHelpers('xyz').id, '2');
  assert.strictEqual(getLayoutHelpers('xyz').convert('dkssud'), '안녕');
});

console.log(`\n${passed}개 통과, ${failed}개 실패`);
if (failed) process.exit(1);
