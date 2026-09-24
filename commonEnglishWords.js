/**
 * commonEnglishWords.js
 *
 * 설계 변경 (2026-09-24): 원래 confidenceCalculator는 "변환된 한글 단어"의 특성(어미
 * 패턴, 도메인 명사 여부 등)만 보고 점수를 매겼는데, 그러다보니 "dkssud"→"안녕"처럼
 * 아무 특수 패턴도 없는 지극히 평범한 오타는 55점 정도밖에 못 받고, 자동변환
 * 기준(90점)을 절대 넘지 못하는 구조였다. 즉 진짜 흔한 영단어(function, error, test
 * 등)와 "한글을 영문 자판으로 잘못 친 것"을 구분하는 장치가 사실상 없어서, 그 대신
 * 자동변환 기준 자체를 극단적으로 높여서 오탐을 억지로 막고 있었던 것이다 — 결과적으로
 * 거의 모든 실제 오타가 자동변환되지 않는 문제로 이어졌다.
 *
 * 이 파일은 그 문제를 정면으로 해결한다: 코드 주석/문자열에서 실제로 자주 쓰이는 흔한
 * 영단어 목록을 블록리스트로 만들어서, 이 목록에 있는 단어는 애초에 변환 후보에서
 * 제외한다. 2벌식 키맵이 알파벳 26자를 전부 커버하기 때문에 사실상 모든 영단어가
 * "변환 가능"으로 판정되는데, 이 블록리스트가 그 중 "진짜 영어일 가능성이 매우 높은"
 * 것들을 걸러내는 역할을 한다. 이 필터가 오탐 방지 역할을 대신 맡아주기 때문에,
 * 신뢰도 임계값 자체는 훨씬 낮고 현실적인 수준으로 낮출 수 있다.
 */

const COMMON_ENGLISH_WORDS = new Set([
  // 관사/전치사/접속사/대명사류
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'has', 'had',
  'was', 'were', 'this', 'that', 'with', 'from', 'into', 'your', 'our', 'their',
  'have', 'been', 'will', 'what', 'when', 'where', 'which', 'while', 'about',
  'above', 'below', 'each', 'every', 'some', 'any', 'none', 'other', 'than',
  'then', 'once', 'here', 'there', 'these', 'those', 'such', 'only', 'just',
  'also', 'more', 'most', 'less', 'least', 'over', 'under', 'again',

  // 코드/개발 관련 흔한 용어
  'function', 'return', 'const', 'let', 'var', 'true', 'false', 'null',
  'undefined', 'class', 'object', 'array', 'string', 'number', 'boolean',
  'value', 'values', 'name', 'names', 'code', 'error', 'errors', 'message',
  'messages', 'status', 'type', 'types', 'data', 'item', 'items', 'list',
  'lists', 'map', 'maps', 'set', 'sets', 'key', 'keys', 'index', 'indices',
  'length', 'count', 'check', 'checks', 'update', 'updates', 'delete',
  'deletes', 'create', 'creates', 'get', 'gets', 'add', 'adds', 'remove',
  'removes', 'test', 'tests', 'testing', 'user', 'users', 'admin', 'group',
  'groups', 'team', 'teams', 'file', 'files', 'path', 'paths', 'url', 'urls',
  'api', 'apis', 'request', 'requests', 'response', 'responses', 'server',
  'servers', 'client', 'clients', 'database', 'table', 'tables', 'column',
  'columns', 'row', 'rows', 'field', 'fields', 'method', 'methods', 'result',
  'results', 'callback', 'callbacks', 'event', 'events', 'handler', 'handlers',
  'component', 'components', 'props', 'state', 'render', 'renders', 'style',
  'styles', 'import', 'imports', 'export', 'exports', 'module', 'modules',
  'require', 'async', 'await', 'promise', 'promises', 'then', 'catch',
  'finally', 'try', 'throw', 'new', 'default', 'extends', 'super', 'static',
  'public', 'private', 'protected', 'interface', 'implements', 'package',
  'node', 'npm', 'dev', 'prod', 'env', 'config', 'build', 'start', 'stop',
  'run', 'debug', 'log', 'logs', 'info', 'warn', 'warning', 'fix', 'fixed',
  'bug', 'bugs', 'todo', 'fixme', 'note', 'notes', 'done', 'pending',
  'active', 'inactive', 'enable', 'enabled', 'disable', 'disabled', 'valid',
  'invalid', 'success', 'fail', 'failed', 'failure', 'ok', 'yes', 'no',

  // 일반 단어 (주석/문자열에 흔히 등장)
  'first', 'last', 'next', 'prev', 'previous', 'before', 'after', 'begin',
  'end', 'title', 'label', 'button', 'input', 'output', 'form', 'page',
  'view', 'model', 'controller', 'service', 'store', 'action', 'reducer',
  'context', 'provider', 'hook', 'hooks', 'effect', 'memo', 'ref', 'refs',
  'node', 'nodes', 'tree', 'trees', 'queue', 'stack', 'graph', 'json',
  'html', 'css', 'text', 'image', 'images', 'icon', 'icons', 'color', 'size',
  'width', 'height', 'top', 'bottom', 'left', 'right', 'center', 'align',
]);

/**
 * 주어진 단어가 흔한 영단어 목록에 있어서 "변환하면 안 되는" 진짜 영어일
 * 가능성이 높은지 확인한다. 대소문자는 구분하지 않는다.
 * @param {string} word
 * @returns {boolean}
 */
function isCommonEnglishWord(word) {
  if (!word) return false;
  return COMMON_ENGLISH_WORDS.has(word.toLowerCase());
}

module.exports = { COMMON_ENGLISH_WORDS, isCommonEnglishWord };
