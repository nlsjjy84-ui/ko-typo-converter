// make-fixtures.js
// VS Code 확장(자바스크립트 엔진)으로 기준 결과를 만들어, 자바 엔진이 똑같이 답하는지 대조할 때 쓴다.
// 실행: node jetbrains/tools/make-fixtures.js <VS Code 확장 폴더> <출력 json>
// 무작위 입력은 씨앗값(seed)을 고정해서, 다시 만들어도 같은 입력이 나온다.

const path = require('path');
const fs = require('fs');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));
const outFile = process.argv[3] || path.join(__dirname, '..', 'src', 'test', 'resources', 'fixtures', 'parity.json');
require(path.join(root, 'test', 'setup.js'));
const vscode = require('vscode');
const ext = require(path.join(root, 'extension'));
const { convertEngToKor } = require(path.join(root, 'hangulAssembler'));
const { convertThreeBeol, LAYOUTS } = require(path.join(root, 'threeBeolAssembler'));
const { getLayoutHelpers } = require(path.join(root, 'keyboardLayout'));
const { getAllZones } = require(path.join(root, 'zoneDetector'));
const { getAllPracticalWords } = require(path.join(root, 'practicalWords'));
const { TERMS } = require(path.join(root, 'programmingTerms'));
const threeFixture = require(path.join(root, 'test', 'fixtures', 'threebeol-libhangul.json'));

let seed = 20261019;
function rand() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (a) => a[Math.floor(rand() * a.length)];
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

// 한글 단어 → 2벌식 키 (실제 오타처럼 만들기 위해)
const CHO = 'rRseEfaqQtTdwWczxvg';
const JUNG = ['k', 'o', 'i', 'O', 'j', 'p', 'u', 'P', 'h', 'hk', 'ho', 'hl', 'y', 'n', 'nj', 'np', 'nl', 'b', 'm', 'ml', 'l'];
const JONG = ['', 'r', 'R', 'rt', 's', 'sw', 'sg', 'e', 'f', 'fr', 'fa', 'fq', 'ft', 'fx', 'fv', 'fg', 'a', 'q', 'qt', 't', 'T', 'd', 'w', 'c', 'z', 'x', 'v', 'g'];
function toKeys2(word) {
  let s = '';
  for (const ch of word) {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c < 0 || c > 11171) continue;
    s += CHO[Math.floor(c / 588)] + JUNG[Math.floor((c % 588) / 28)] + JONG[c % 28];
  }
  return s;
}
const KOREAN = [...new Set([...getAllPracticalWords(), '안녕하세요', '감사합니다', '확인했습니다', '저장', '오늘 할 일',
  '값을 넣으세요', '닭', '없습니다', '않아요', '읽기', '삶', '많이', '괜찮아요', '뭐해', '의사', '왜요', '쉬운'])]
  .flatMap((w) => w.split(' '));
const ENGLISH = ['test', 'function', 'value', 'hello', 'world', 'air', 'city', 'return', 'todo', 'fixme', 'note',
  'user', 'data', 'list', 'item', 'error', 'code', 'name', 'check', 'update', 'qwerty', 'zxcv', 'asdf'];
const IDENTS = ['count', 'userName', 'getData', 'total_sum', 'idx', 'MAX_SIZE', 'console', 'result', 'Array', 'i'];

function garbledWord(layoutId) {
  const r = rand();
  if (layoutId === '2') {
    if (r < 0.45) return toKeys2(pick(KOREAN));
    if (r < 0.75) return pick(ENGLISH);
    let s = '';
    const n = int(1, 9);
    for (let i = 0; i < n; i++) s += pick('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ');
    return s;
  }
  const keys = Object.keys(LAYOUTS[layoutId]);
  if (r < 0.35) return pick(threeFixture.cases[layoutId])[0];
  if (r < 0.6) return pick(ENGLISH);
  let s = '';
  const n = int(1, 9);
  for (let i = 0; i < n; i++) s += pick(keys);
  return s;
}
function garbledTerm() {
  // 코드 자리에 한글로 잘못 쳐진 영어 용어
  return convertEngToKor(pick([...TERMS.slice(0, 60), ...IDENTS]));
}

const LANGS = ['javascript', 'python', 'sql', 'html', 'markdown', 'typescriptreact', 'java', 'yaml', 'lua', 'vue'];
function comment(lang, body) {
  if (['python', 'yaml'].includes(lang)) return `# ${body}`;
  if (lang === 'sql') return pick([`-- ${body}`, `# ${body}`, `/* ${body} */`]);
  if (lang === 'lua') return `-- ${body}`;
  if (['html', 'markdown', 'vue'].includes(lang)) return `<!-- ${body} -->`;
  return pick([`// ${body}`, `/* ${body} */`]);
}
function phrase(layoutId, n) {
  const ws = [];
  for (let i = 0; i < n; i++) ws.push(garbledWord(layoutId));
  return ws.join(pick([' ', ' ', ', ', '. ']));
}
function line(layoutId, lang) {
  const r = rand();
  const p = () => phrase(layoutId, int(1, 4));
  if (r < 0.25) return comment(lang, p());
  if (r < 0.45) return `const ${pick(IDENTS)} = ${pick(['"', "'", '`'])}${p()}${pick(['"', "'", '`'])};`;
  if (r < 0.55) return `${pick(IDENTS)}(${p()});`;
  if (r < 0.62) return `x = (${garbledWord(layoutId)})`;
  if (r < 0.7) return `<div>${p()}</div>`;
  if (r < 0.8) return `${garbledTerm()} ${pick(IDENTS)} = ${garbledTerm()}.${pick(IDENTS)};`;
  if (r < 0.86) return `print("(${garbledWord(layoutId)})")  ${comment(lang, '(' + garbledWord(layoutId) + ')')}`;
  if (r < 0.9) return `"unterminated ${p()}`;
  return `${pick(IDENTS)} ${garbledWord(layoutId)} ${garbledTerm()}`;
}
function doc(layoutId, lang) {
  const n = int(1, 6);
  const lines = [];
  for (let i = 0; i < n; i++) lines.push(pick(['', '  ', '    ']) + line(layoutId, lang));
  return lines.join(pick(['\n', '\n', '\r\n']));
}

let docSeq = 0;
function makeDoc(text, lang) {
  let t = text;
  // 문서마다 주소를 다르게 한다. 같은 주소·같은 버전이면 확장이 반대 방향 표를 다시 쓰기(캐시) 때문이다.
  const id = `/tmp/doc${docSeq++}.src`;
  return {
    uri: { scheme: 'file', fsPath: id, toString: () => id },
    languageId: lang,
    version: 1,
    getText: () => t,
    positionAt: (o) => o,
    offsetAt: (p) => p,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  ext.activate({ subscriptions: [] });
  const onSave = vscode.__registered.onWillSaveTextDocument[0];
  const onChange = vscode.__registered.onDidChangeTextDocument[0];
  vscode.__setConfig('autoConvertDelayMs', 100000); // 멈춤 변환은 쓰지 않는다 (경계 문자 경로만 대조)

  const out = { source: 'ko-typo-converter (VS Code) engine', convert: {}, boundary: {}, zones: [], save: [], typing: [] };

  // 1) 조합
  for (const id of ['2', '390', '3final']) {
    const helpers = getLayoutHelpers(id);
    const cases = [];
    const keys = id === '2' ? 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' : Object.keys(LAYOUTS[id]).join('');
    for (let i = 0; i < 6000; i++) {
      let s = i % 3 === 0 ? garbledWord(id) : '';
      const n = int(1, 12);
      for (let j = 0; j < n && i % 3 !== 0; j++) s += rand() < 0.93 ? pick(keys) : pick(' .,1@#\n');
      cases.push([s, id === '2' ? convertEngToKor(s) : convertThreeBeol(s, id), helpers.convertText(s), helpers.isConvertible(s)]);
    }
    out.convert[id] = cases;
    const b = [];
    for (let c = 32; c < 127; c++) b.push([String.fromCharCode(c), helpers.isBoundary(String.fromCharCode(c))]);
    for (const s of ['\n', '\t', '\n    ', '\r\n', '\r\n\t', 'ab', '', '  ', '\n x']) b.push([s, helpers.isBoundary(s)]);
    out.boundary[id] = b;
  }

  // 2) 영역 + 3) 저장 + 4) 타이핑 경계
  for (let i = 0; i < 1500; i++) {
    const id = pick(['2', '2', '390', '3final']);
    const lang = pick(LANGS);
    const text = doc(id, lang);
    vscode.__setConfig('keyboardLayout', id);
    out.zones.push([text, lang, getAllZones(text, lang).map((z) => [z.start, z.end, z.type])]);

    let captured = null;
    onSave({ document: makeDoc(text, lang), waitUntil: (p) => { captured = p; } });
    const edits = captured ? await captured : [];
    out.save.push([id, lang, text, edits.map((e) => [e.range.start, e.range.end, e.newText])]);

    // 단어 끝 자리 하나를 골라 스페이스를 친 상황
    const ends = [];
    for (let k = 1; k <= text.length; k++) {
      if (/[^\s]/.test(text[k - 1]) && (k === text.length || /\s/.test(text[k]))) ends.push(k);
    }
    if (!ends.length) continue;
    const at = pick(ends);
    const typed = text.slice(0, at) + ' ' + text.slice(at);
    const d = makeDoc(typed, lang);
    let applied = null;
    const editor = {
      document: d,
      selection: { active: at + 1 },
      edit: (cb) => { cb({ replace: (r, t) => { applied = [r.start, r.end, t]; } }); return Promise.resolve(true); },
    };
    vscode.window.activeTextEditor = editor;
    vscode.window.visibleTextEditors = [editor];
    onChange({ document: d, contentChanges: [{ range: { start: at, end: at }, text: ' ' }] });
    await sleep(2);
    out.typing.push([id, lang, typed, at, applied]);
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(out));
  const n = (k) => out[k].length;
  console.log(`zones ${n('zones')}, save ${n('save')} (edits ${out.save.reduce((a, s) => a + s[3].length, 0)}), typing ${n('typing')} (applied ${out.typing.filter((t) => t[4]).length})`);
  process.exit(0);
}

main();
