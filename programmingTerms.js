/**
 * programmingTerms.js
 * 한/영 키를 안 바꾸고 타이핑해서 한글로 잘못 조합되기 쉬운, 실제 프로그래밍에서
 * 자주 쓰이는 예약어/자주 쓰는 이름 사전. reverseMapper의 hangulToLatin()으로 복원한
 * 문자열이 이 목록에 있으면 "이건 원래 영어(코드 용어)였다"고 판단한다.
 *
 * 값(대소문자 표기)은 실제로 코드에서 쓰이는 관용적인 표기를 그대로 담아둔다
 * (예: 'function'은 소문자, 'Array'는 대문자 시작).
 */

const TERMS = [
  // JS/TS 예약어·자주 쓰는 키워드
  'function', 'return', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'do',
  'switch', 'case', 'default', 'break', 'continue', 'class', 'extends', 'implements',
  'interface', 'type', 'enum', 'namespace', 'import', 'export', 'from', 'as',
  'async', 'await', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'super',
  'typeof', 'instanceof', 'in', 'of', 'delete', 'void', 'yield', 'static',
  'get', 'set', 'public', 'private', 'protected', 'readonly', 'abstract',
  'null', 'undefined', 'true', 'false', 'NaN',

  // 자주 쓰는 내장 객체/타입
  'Array', 'Object', 'String', 'Number', 'Boolean', 'Map', 'Set', 'Promise',
  'Error', 'Date', 'RegExp', 'JSON', 'Math', 'Symbol', 'WeakMap', 'WeakSet',

  // 자주 쓰는 메서드/속성 이름
  'length', 'push', 'pop', 'shift', 'unshift', 'slice', 'splice', 'concat',
  'join', 'split', 'replace', 'match', 'test', 'exec', 'filter', 'map', 'reduce',
  'forEach', 'find', 'findIndex', 'includes', 'indexOf', 'some', 'every', 'sort',
  'keys', 'values', 'entries', 'assign', 'freeze', 'parse', 'stringify',
  'then', 'resolve', 'reject', 'all', 'race',

  // 콘솔/디버깅
  'console', 'log', 'error', 'warn', 'info', 'debug', 'trace',

  // 흔한 변수/파라미터 이름
  'data', 'result', 'value', 'key', 'index', 'item', 'items', 'list', 'array',
  'object', 'string', 'number', 'boolean', 'callback', 'params', 'param',
  'args', 'options', 'config', 'context', 'event', 'target', 'element',
  'response', 'request', 'req', 'res', 'err', 'error', 'message', 'name',
  'id', 'type', 'state', 'props', 'component', 'render', 'style', 'className',

  // Node.js / 모듈
  'require', 'module', 'exports', 'process', 'global', 'Buffer', '__dirname', '__filename',

  // VS Code 확장 API에서 자주 쓰는 이름 (이 프로젝트 자체에서도 많이 등장)
  'vscode', 'document', 'editor', 'window', 'workspace', 'commands', 'languages',
  'extension', 'context', 'subscriptions', 'activate', 'deactivate', 'range', 'position',
];

const TERM_SET = new Map(TERMS.map((t) => [t.toLowerCase(), t]));

/**
 * 주어진 단어가 알려진 프로그래밍 용어인지 확인하고, 맞으면 관용적인 표기를 돌려준다.
 * @param {string} word
 * @returns {string|null}
 */
function lookupProgrammingTerm(word) {
  if (!word) return null;
  return TERM_SET.get(word.toLowerCase()) || null;
}

module.exports = { TERMS, lookupProgrammingTerm };
