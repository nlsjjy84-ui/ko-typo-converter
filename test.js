/**
 * test.js
 * ko-typo-converter 핵심 로직(hangulAssembler, confidenceCalculator) 단위 테스트
 *
 * extension.js는 VS Code 안에서만 로드 가능한 'vscode' 모듈을 필요로 하므로
 * (F5로 확장 실행 / Command Palette 등은 실제 VS Code 안에서 수동으로 확인),
 * 여기서는 VS Code 없이도 돌아가는 순수 로직 파일들만 검증한다.
 *
 * 실행: node test.js  (또는 npm test)
 */

const assert = require('assert');
const { convertEngToKor, isConvertibleAlphabet, isFullyComposedHangul } = require('./hangulAssembler');
const { calculateConfidence, confidenceLabel } = require('./confidenceCalculator');
const ContextDetector = require('./contextDetector');
const { isPracticalWord, getWordCategory } = require('./practicalWords');
const { isCommonEnglishWord } = require('./commonEnglishWords');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log(`  ✗ ${name}`);
    console.log(`      ${err.message}`);
  }
}

console.log('\n[hangulAssembler] 2벌식 -> 한글 변환');

test('dkssud -> 안녕 (기본 조합 + 종성/다음 초성 lookahead)', () => {
  assert.strictEqual(convertEngToKor('dkssud'), '안녕');
});

test('gktpdy -> 하세요 (ㅎ 초성 + ㅔ 중성 + 종성 없는 lookahead)', () => {
  assert.strictEqual(convertEngToKor('gktpdy'), '하세요');
});

test('dkssudgktpdy -> 안녕하세요 (전체 인사말, 2벌식 표준 예문)', () => {
  assert.strictEqual(convertEngToKor('dkssudgktpdy'), '안녕하세요');
});

test('rkwk -> 가자 (받침 없는 두 음절)', () => {
  assert.strictEqual(convertEngToKor('rkwk'), '가자');
});

test('dnfl -> 우리 (ㅜ/ㅡ/ㅣ 모음 - 예전에 매핑이 빠져있던 모음들)', () => {
  assert.strictEqual(convertEngToKor('dnfl'), '우리');
});

test('tkfkdgo -> 사랑해 (ㅎ 초성이 들어간 실제 단어)', () => {
  assert.strictEqual(convertEngToKor('tkfkdgo'), '사랑해');
});

test('rud -> 경 (받침 자음으로 끝나는 단어, 종성 확정)', () => {
  // r(ㄱ) u(ㅕ) d(ㅇ) -> 초성ㄱ+중성ㅕ, 다음 글자 없음 -> 종성ㅇ 확정
  assert.strictEqual(convertEngToKor('rud'), '경');
});

test('복합모음: fhk -> 롸 (ㅗ+ㅏ = ㅘ)', () => {
  assert.strictEqual(convertEngToKor('fhk'), '롸');
});

test('숫자/기호가 섞이면 매핑 안 된 문자는 원래대로 두고, 대기 중이던 자모는 흘리지 않는다', () => {
  // d(ㅇ) k(ㅏ) 다음에 숫자 '1'이 오면: 대기 중인 초성+중성('안'에 해당하는 조합)을
  // 먼저 완성해서 흘리고, 그 다음 '1'은 그대로 붙는다.
  const result = convertEngToKor('dk1');
  assert.strictEqual(result, '아1');
});

test('isConvertibleAlphabet: 매핑 가능한 문자만 있으면 true', () => {
  assert.strictEqual(isConvertibleAlphabet('dkssud'), true);
});

test('isConvertibleAlphabet: 숫자가 섞이면 false', () => {
  assert.strictEqual(isConvertibleAlphabet('dk1ssud'), false);
});

test('convertEngToKor: 빈 문자열/falsy는 그대로 반환', () => {
  assert.strictEqual(convertEngToKor(''), '');
  assert.strictEqual(convertEngToKor(null), null);
});

console.log('\n[hangulAssembler] 왕복 검증 (실제 단어 인코딩 -> 디코딩)');

test('여러 실무 단어가 인코딩 후 다시 정확히 디코딩된다', () => {
  // 아래 2벌식 키 시퀀스들은 실제 표준 자판으로 각 한글 단어를 타이핑했을 때 나오는 키다.
  const roundTrip = [
    ['gkatn', '함수'],
    ['qusghksrl', '변환기'],
    ['wjwkd', '저장'],
    ['ejqhrl', '더보기'],
    ['epdlxj', '데이터'],
  ];
  for (const [keys, expected] of roundTrip) {
    assert.strictEqual(convertEngToKor(keys), expected, `${keys} -> 예상: ${expected}`);
  }
});

console.log('\n[confidenceCalculator] 신뢰도 계산 (0~1 스케일 래퍼)');

test('calculateConfidence는 0~1 사이의 숫자를 반환한다', () => {
  const c = calculateConfidence('dkssud', '안녕');
  assert.ok(c >= 0 && c <= 1, `범위 밖: ${c}`);
});

test('어미 패턴(하세요 등)이 있으면 신뢰도가 더 높다', () => {
  const withEnding = calculateConfidence('gktpdy', '하세요');
  const noEnding = calculateConfidence('rkwk', '가자');
  assert.ok(withEnding > noEnding, `${withEnding} <= ${noEnding}`);
});

test('컨텍스트(문자열/주석)를 넘기면 신뢰도가 그렇지 않을 때보다 같거나 높다', () => {
  const withoutContext = calculateConfidence('rkwk', '가자');
  const withContext = calculateConfidence('rkwk', '가자', 'string_double');
  assert.ok(withContext >= withoutContext, `${withContext} < ${withoutContext}`);
});

test('confidenceLabel은 한글 레이블 문자열을 반환한다', () => {
  const label = confidenceLabel(0.95);
  assert.strictEqual(typeof label, 'string');
  assert.ok(label.length > 0);
});

console.log('\n[contextDetector] 컨텍스트 감지');

test('큰따옴표 문자열 안쪽을 감지한다', () => {
  const contexts = ContextDetector.detectQuotes('const a = "hello";');
  assert.strictEqual(contexts.length, 1);
  assert.strictEqual(contexts[0].type, 'string_double');
});

test('한줄 주석을 감지한다', () => {
  const contexts = ContextDetector.detectComments('// hello world');
  assert.strictEqual(contexts.length, 1);
  assert.strictEqual(contexts[0].type, 'comment_line');
});

console.log('\n[practicalWords] 실무 단어 목록');

test('isPracticalWord: 목록에 있는 단어는 true', () => {
  assert.strictEqual(isPracticalWord('함수'), true);
});

test('getWordCategory: 올바른 카테고리를 반환한다', () => {
  assert.strictEqual(getWordCategory('함수'), '기본');
});

console.log('\n[commonEnglishWords] 진짜 영단어 블록리스트');

test('흔한 영단어(function, error, test 등)는 블록리스트에 있다', () => {
  assert.strictEqual(isCommonEnglishWord('function'), true);
  assert.strictEqual(isCommonEnglishWord('Error'), true); // 대소문자 무관
  assert.strictEqual(isCommonEnglishWord('test'), true);
});

test('한글 오타로 보이는 단어(dkssud 등)는 블록리스트에 없다', () => {
  assert.strictEqual(isCommonEnglishWord('dkssud'), false);
  assert.strictEqual(isCommonEnglishWord('gktpdy'), false);
});

console.log('\n[hangulAssembler] isFullyComposedHangul - 점수가 아니라 "완성된 한글 음절"인지가 진짜 기준');

test('dkssud -> 안녕은 완전히 조합된 한글 음절이다 (자동변환 대상)', () => {
  assert.strictEqual(isFullyComposedHangul(convertEngToKor('dkssud')), true);
});

test('진짜 영단어 test -> 자음만 연속이라 완성된 음절이 안 나오고 자모만 남는다 (자동변환 제외)', () => {
  const converted = convertEngToKor('test');
  assert.strictEqual(isFullyComposedHangul(converted), false);
});

test('진짜 영단어 code -> 완전한 음절로 안 맞아떨어진다 (자동변환 제외)', () => {
  const converted = convertEngToKor('code');
  assert.strictEqual(isFullyComposedHangul(converted), false);
});

test('빈 문자열/변환 안 된 원본 그대로는 false', () => {
  assert.strictEqual(isFullyComposedHangul(''), false);
  assert.strictEqual(isFullyComposedHangul('abc'), false);
});

console.log('\n[extension.js 자동변환 시나리오] README 기본 예시가 실제로 자동변환 조건(완성된 한글 음절)을 만족하는지 확인');

test('dkssud -> 안녕: 흔한 영단어 블록리스트에도 없고, 완전히 조합된 한글이다 (자동변환 대상 확정)', () => {
  const converted = convertEngToKor('dkssud');
  assert.ok(!isCommonEnglishWord('dkssud'));
  assert.ok(isFullyComposedHangul(converted));
});

test('실제 영단어(test)는 블록리스트로도 걸러지고, 설령 블록리스트에 없었어도 조합 결과가 지저분해서 이중으로 막힌다', () => {
  assert.strictEqual(isCommonEnglishWord('test'), true);
  assert.strictEqual(isFullyComposedHangul(convertEngToKor('test')), false);
});

console.log(`\n${passed}개 통과, ${failed}개 실패\n`);

if (failed > 0) {
  process.exitCode = 1;
}
