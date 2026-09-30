/**
 * reverseMapper.js
 * hangulAssembler.js가 하는 일(영문 키 입력 → 한글 음절)의 "반대 방향"을 잡아낸다.
 *
 * 사용자 요청 (2026-09-29): "영어로 쳤는데 문법이 한글이면 한글로 바꿔주는 것"뿐 아니라,
 * "한글로 되어있는데 사실 영어(그 프로그램의 함수/키워드 등 정해진 용어)였다면 그것도
 * 원래 영어로 고쳐줘야 한다"는 반대 방향 요청 - 한/영 키를 안 바꾸고 타이핑해서 생긴
 * 실수를 양방향으로 다 잡아주는 것.
 *
 * ⚠️ 설계 노트 - 왜 "한글 → 영어 자모 역산"이 아니라 "영어 후보를 미리 순변환해서 표"로
 * 만드는 방식을 쓰는가:
 * 처음에는 한글 음절을 초성/중성/종성으로 분해해서 각 자모가 어떤 키였는지 역으로
 * 찾는 방식(진짜 "역산")을 시도했다. 하지만 hangulAssembler.assemble()은 자음이
 * 모음 없이 연달아 오면 이전 자음을 버리고 덮어쓰는 등(실제 한글 입력기와 동일한 동작)
 * 정보 손실이 있는 상태 기계라서, 이미 한글로 조합되고 난 뒤에는 원래 어떤 영문 철자였는지
 * 되돌릴 수 없는 경우가 많다 (예: "return"을 한글 IME로 치면 "셔구"가 되는데, "셔구"를
 * 거꾸로 자모 분해해서 키를 복원하면 "turn"이 나온다 - 앞의 "re"가 자음 스택킹으로 이미
 * 사라졌기 때문에 진짜 역산으로는 절대 "return"을 복원할 수 없다). 실제로 여러 흔한
 * 키워드로 테스트해본 결과 이런 정보 손실 때문에 순수 역산 방식은 실제 키워드를 거의
 * 맞히지 못했다.
 *
 * 그래서 방향을 바꿨다: "이 문서에서 쓰일 만한 영어 용어 후보들(프로그래밍 키워드 +
 * 이 문서에 이미 등장하는 식별자)"을 미리 알고 있으니, 그 후보들 각각을 hangulAssembler의
 * 검증된 순변환 함수(convertEngToKor)로 한글로 조합해보고, "후보 → 조합된 한글" 표를
 * 만들어둔다. 그리고 문서에서 발견된 한글 덩어리를 이 표에서 그대로 찾아보는 것 -
 * 즉 "역산"이 아니라 "이미 검증된 순변환을 후보마다 미리 계산해서 정확히 일치하는지"로
 * 바꾼 것이다. 이렇게 하면 순변환 로직이 이미 test.js로 검증되어 있으므로 손실/모호함
 * 없이 100% 정확하게 일치 여부를 판단할 수 있다.
 */

const { convertEngToKor, isFullyComposedHangul } = require('./hangulAssembler');

/**
 * 영어 후보 단어 목록을 받아서, "그 단어를 2벌식 한글 IME 상태로 쳤을 때 나오는 한글" →
 * "원래 영어 단어"의 역방향 조회 표를 만든다.
 * @param {Iterable<string>} terms - 후보 영어 단어들 (프로그래밍 키워드, 문서 내 식별자 등)
 * @returns {Map<string, string>} - 조합된 한글 문자열 -> 원래 영어 단어
 */
function buildReverseLookupTable(terms) {
  const table = new Map();
  for (const term of terms) {
    if (!term || term.length < 2) continue;
    const garbled = convertEngToKor(term);
    // 순변환 결과가 "완전히 조합된 한글 음절"이 아니면(자모가 어중간하게 남으면),
    // 실제로 타이핑했을 때도 그런 애매한 형태로 남는다는 뜻이라 조회 대상에서 제외한다
    // (forward 방향과 동일한 기준 - hangulAssembler.js의 isFullyComposedHangul 참고).
    if (!garbled || garbled === term || !isFullyComposedHangul(garbled)) continue;

    const existing = table.get(garbled);
    if (!existing) {
      table.set(garbled, term);
      continue;
    }
    // 첫 글자를 뺀 나머지가 모음 앞에서 자음이 덮어써지는 구조라, 서로 다른 대소문자
    // 표기(예: "error"/"Error")가 우연히 같은 한글로 조합되는 경우가 있다. 이럴 땐
    // 실무에서 더 흔히 쓰이는 소문자 표기 쪽을 우선한다.
    const existingIsLower = existing === existing.toLowerCase();
    const termIsLower = term === term.toLowerCase();
    if (!existingIsLower && termIsLower) table.set(garbled, term);
  }
  return table;
}

/**
 * 문서 전체 텍스트에서 (한글이 아닌) 영문 식별자 토큰을 모아, 이 파일 안에서 실제로
 * 쓰이고 있는 용어 목록을 만든다. "그 프로그램만의 정해져 있는 용어"(함수/변수/클래스
 * 이름 등)를 후보에 포함시키기 위한 것 - 공용 키워드 사전에는 없어도 이 문서 안에서
 * 이미 쓰인 이름이면 후보가 된다.
 * @param {string} text - 문서 전체 텍스트
 * @returns {string[]} - 문서에 등장하는 고유 영문 식별자 목록
 */
function collectDocumentIdentifiers(text) {
  const seen = new Set();
  const IDENTIFIER_REGEX = /[A-Za-z_$][A-Za-z0-9_$]*/g;
  let match;
  while ((match = IDENTIFIER_REGEX.exec(text)) !== null) {
    const word = match[0];
    if (word.length >= 2) seen.add(word);
  }
  return [...seen];
}

module.exports = {
  buildReverseLookupTable,
  collectDocumentIdentifiers,
};
