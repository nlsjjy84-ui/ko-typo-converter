/**
 * zoneDetector.js
 * 코드/문서에서 "실제로 한글 오타 변환을 걸어도 되는 영역(존)"을 찾는 순수 로직.
 * 리팩터링 (2026-09-30): 원래 이 로직 전부가 extension.js 안에 있었는데, extension.js는
 * 'vscode' 모듈이 있어야만 로드되는 파일이라 test.js에서 직접 단위 테스트를 할 수가
 * 없었다. vscode API를 전혀 쓰지 않는 순수 문자열/정규식 로직만 이 파일로 분리해서,
 * test.js가 실제 VS Code 없이도 이 파일을 require해서 테스트할 수 있게 했다.
 */

const QUOTE_PATTERN = '"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`';
// "//" 한 줄 주석과 "/* */" 블록 주석은 따로 관리한다 - SQL처럼 "/* */"는 쓰지만
// "//"는 안 쓰는(정수 나눗셈 등으로 오인될 수 있는) 언어가 있기 때문이다.
const LINE_COMMENT_PATTERN = '\\/\\/[^\\n]*';
const BLOCK_COMMENT_PATTERN = '\\/\\*[\\s\\S]*?\\*\\/';
const HASH_COMMENT_PATTERN = '#[^\\n]*';
const DASH_COMMENT_PATTERN = '--[^\\n]*';
const HTML_COMMENT_PATTERN = '<!--[\\s\\S]*?-->';

const HASH_COMMENT_LANGUAGES = new Set([
  'python', 'yaml', 'shellscript', 'dockerfile', 'ruby', 'perl',
  'powershell', 'toml', 'makefile', 'properties', 'r', 'coffeescript',
  'sql', // MySQL 방언은 "--"뿐 아니라 "#"도 한 줄 주석으로 쓴다
]);
const DASH_COMMENT_LANGUAGES = new Set(['sql', 'lua', 'haskell']);
const HTML_COMMENT_LANGUAGES = new Set(['html', 'xml', 'vue', 'markdown', 'svelte']);
// "//"가 주석이 아니거나(파이썬의 정수 나눗셈 등) 아예 없는 언어들 - "//" 패턴에서 뺀다.
const NO_LINE_COMMENT_LANGUAGES = new Set([
  ...HASH_COMMENT_LANGUAGES, ...DASH_COMMENT_LANGUAGES, ...HTML_COMMENT_LANGUAGES,
]);
// "/* */" 블록 주석 자체가 없는 언어들 - SQL은 "#"/"--" 둘 다 쓰지만 "/* */" 블록 주석도
// 표준으로 지원하므로 이 목록에서 제외한다(그래서 HASH_COMMENT_LANGUAGES를 그대로 재사용하지
// 않고 따로 나열한다).
const NO_BLOCK_COMMENT_LANGUAGES = new Set([
  'python', 'yaml', 'shellscript', 'dockerfile', 'ruby', 'perl',
  'powershell', 'toml', 'makefile', 'properties', 'r', 'coffeescript',
  ...HTML_COMMENT_LANGUAGES,
]);

/** 문서의 languageId에 맞는 "주석/문자열 존" 정규식을 새로 만든다 (호출마다 새 RegExp - lastIndex 공유 방지) */
function buildZoneRegex(languageId) {
  const parts = [QUOTE_PATTERN];
  if (!NO_LINE_COMMENT_LANGUAGES.has(languageId)) parts.push(LINE_COMMENT_PATTERN);
  if (!NO_BLOCK_COMMENT_LANGUAGES.has(languageId)) parts.push(BLOCK_COMMENT_PATTERN);
  if (HASH_COMMENT_LANGUAGES.has(languageId)) parts.push(HASH_COMMENT_PATTERN);
  if (DASH_COMMENT_LANGUAGES.has(languageId)) parts.push(DASH_COMMENT_PATTERN);
  if (HTML_COMMENT_LANGUAGES.has(languageId)) parts.push(HTML_COMMENT_PATTERN);
  return new RegExp(parts.join('|'), 'g');
}

// HTML/JSX 태그 "내부 텍스트"(예: <div>안녕하세요</div>의 "안녕하세요")를 찾는 정규식.
// 개선 (2026-09-30): contextDetector.js에 태그 감지 로직(detectTags)이 있었지만 실제로는
// 어디서도 호출되지 않는 죽은 코드였고, 그나마도 "<>" 사이(태그 자체의 속성 영역)를 잡는
// 것이라 정작 필요한 "태그와 태그 사이의 텍스트"는 잡지 못했다. 여기서는 뒤에 "</"가 바로
// 오는 경우만 인정해서(닫는 태그 시작) "a > b ... c < d" 같은 비교 연산자 나열을 태그로
// 오인할 위험을 크게 줄였다. JSX/TSX도 대부분은 코드라 위험이 남아있어서, 마크업이 실제로
// 쓰이는 언어에서만 켠다.
const TAG_TEXT_REGEX = />([^<>\n]{1,300})<\//g;
const TAG_TEXT_LANGUAGES = new Set([
  'html', 'xml', 'vue', 'svelte', 'markdown', 'javascriptreact', 'typescriptreact',
]);

/**
 * 괄호를 "안전한 경우"로만 좁혀서 감지한다 (2026-09-30, 사용자 논의 반영).
 * contextDetector.js의 원래 설계(괄호 안 전부를 컨텍스트로 인정)는 실제 코드 -
 * 함수 호출 `login(dkssud)`, 조건문 `if (dkssud)` 등 - 까지 변환 대상으로 열어버려서
 * "실제 코드는 절대 안 건드린다"는 원칙과 정면으로 부딪혔다. 그래서 여기서는 소괄호 `()`만,
 * 두 조건을 모두 만족할 때만 "괄호 존"으로 인정한다:
 *   1. 여는 괄호 바로 앞(공백 제외)이 "코드가 이어지고 있다"는 신호(식별자 문자, 닫는
 *      괄호, 대입/비교/산술 연산자 등)가 아니다 - 함수 호출/제어문(if, for, return 등)/
 *      대입식에 "붙어있는" 괄호가 전부 걸러진다.
 *   2. 괄호 안에 다른 코드처럼 보이는 구조 문자(, ; = . ( ) { } [ ] : < > + - * / & | ! ?)가
 *      전혀 없다 - 인자 여러 개, 연산, 중첩 호출 등이 있으면 진짜 코드일 가능성이 높다고
 *      보고 뺀다.
 * 중괄호 `{}`는 처음엔 포함했었는데, 테스트해보니 `if (a > b) { dkssud }`처럼 블록문/
 * 객체 리터럴이 거의 항상 "식별자에 안 붙어있는" 모양(닫는 괄호나 `=`, `=>` 뒤)으로
 * 나타나서 위 1번 조건을 그냥 통과해버렸다 - 즉 실제 코드 블록을 안전한 텍스트로 오인할
 * 위험이 너무 커서, 중괄호는 아예 대상에서 뺐다.
 * 이 정도로 좁히면 남는 건 "괄호로만 감싸인 순수 텍스트" 정도뿐이라, 실효는 크지 않지만
 * (정당한 경우 대부분은 이미 주석/문자열로 커버됨) 실제 코드를 건드릴 위험은 거의 없다.
 */
const BRACKET_PAIRS = [
  ['(', ')', 'bracket_paren_safe'],
];
const UNSAFE_INNER_CHARS = /[,;=.(){}[\]:<>+\-*/&|!?]/;
// 괄호 바로 앞에 있으면 "이 괄호는 코드에 붙어있다"고 보는 문자들 - 식별자(함수/변수/
// 키워드 이름), 닫는 괄호류, 대입·비교·산술·논리 연산자, 쉼표·점(멤버 접근/인자 구분) 등.
const CODE_ATTACHED_PRECEDING_CHAR = /[A-Za-z0-9_ㄱ-ㆎ가-힣)}\]=,.!&|+\-*/<>]/;

function findSafeBracketZones(text) {
  const zones = [];
  for (const [open, close, type] of BRACKET_PAIRS) {
    let depth = 0;
    let start = -1;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === open) {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === close) {
        depth--;
        if (depth === 0 && start !== -1) {
          const inner = text.slice(start + 1, i);
          const before = text.slice(0, start).replace(/[ \t]+$/, '');
          const prevChar = before.length ? before[before.length - 1] : '';
          const attachedToCode = CODE_ATTACHED_PRECEDING_CHAR.test(prevChar);
          if (!attachedToCode && !UNSAFE_INNER_CHARS.test(inner)) {
            zones.push({ start, end: i + 1, type });
          }
          start = -1;
        }
      }
    }
  }
  return zones;
}

/**
 * 문서 전체에서 "컨텍스트 존"(주석/문자열/태그 내부 텍스트/안전한 괄호)을 전부 찾아
 * 시작 위치 순으로 정렬해서 반환한다. isInsideZone과 findCandidates가 공유한다.
 * @param {string} text
 * @param {string} languageId
 * @returns {Array<{start: number, end: number, type: string}>}
 */
function getAllZones(text, languageId) {
  const zones = [];

  const zoneRegex = buildZoneRegex(languageId);
  let zoneMatch;
  while ((zoneMatch = zoneRegex.exec(text)) !== null) {
    zones.push({
      start: zoneMatch.index,
      end: zoneMatch.index + zoneMatch[0].length,
      type: getZoneType(zoneMatch[0]),
    });
  }

  if (TAG_TEXT_LANGUAGES.has(languageId)) {
    TAG_TEXT_REGEX.lastIndex = 0;
    let tagMatch;
    while ((tagMatch = TAG_TEXT_REGEX.exec(text)) !== null) {
      zones.push({
        start: tagMatch.index,
        end: tagMatch.index + tagMatch[0].length,
        type: 'tag_text',
      });
    }
  }

  zones.push(...findSafeBracketZones(text));

  zones.sort((a, b) => a.start - b.start);
  return zones;
}

/**
 * 개선 (2026-09-24): confidenceCalculator는 컨텍스트 타입(string_double, comment_line 등)에
 * 따라 보너스 점수를 주도록 만들어져 있었는데, 지금까지 아무 데서도 그 값을 넘겨주지 않아서
 * 이 보너스가 전혀 적용되지 않고 있었다. zoneText의 시작 부분을 보고 어떤 종류의 영역인지
 * 판별해서 넘겨준다.
 * @param {string} zoneText
 */
function getZoneType(zoneText) {
  if (zoneText.startsWith('//')) return 'comment_line';
  if (zoneText.startsWith('/*')) return 'comment_block';
  if (zoneText.startsWith('#')) return 'comment_hash';
  if (zoneText.startsWith('--')) return 'comment_dash';
  if (zoneText.startsWith('<!--')) return 'comment_html';
  if (zoneText.startsWith('"')) return 'string_double';
  if (zoneText.startsWith("'")) return 'string_single';
  if (zoneText.startsWith('`')) return 'template_literal';
  if (zoneText.startsWith('>')) return 'tag_text';
  return null;
}

module.exports = { getAllZones, buildZoneRegex, getZoneType, findSafeBracketZones, TAG_TEXT_LANGUAGES, HASH_COMMENT_LANGUAGES, DASH_COMMENT_LANGUAGES, HTML_COMMENT_LANGUAGES };
