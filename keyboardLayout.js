// keyboardLayout.js
// 설정 ko-typo.keyboardLayout("2" | "390" | "3final")에 따라 단어를 찾는 규칙과 변환 함수를 고른다. (v0.1.0)
//
// 2벌식은 영문자(a-z, A-Z)만 한글 자모 키다. 3벌식(390·최종)은 숫자와 일부 기호
// (예: 390의 4=ㅛ, 9=ㅜ, /=ㅗ, ;=ㅂ, '=ㅌ)도 자모 키라서, 단어 범위와 "단어가 끝났다"고
// 보는 구분 문자가 자판마다 달라야 한다. 예를 들어 390에서 ';'는 ㅂ이므로 단어 끝이 아니다.

const { convertEngToKor, isConvertibleAlphabet } = require('./hangulAssembler');
const { convertThreeBeol, isHangulKey, LAYOUTS } = require('./threeBeolAssembler');

const DEFAULT_BOUNDARY = /^[ \t\n.,!?;:)\]}"'`]$/;
const SPACE_BOUNDARY = /^[ \t\n]$/;
// v0.1.1: 엔터를 치면 편집기가 줄바꿈과 들여쓰기를 한 번에 넣는다("\n    "). 예전에는 글자 하나만
// 단어 끝으로 봐서, 들여쓰기가 있는 줄에서 엔터로 끝낸 단어는 저장할 때까지 바뀌지 않았다.
const NEWLINE_WITH_INDENT = /^\r?\n[ \t]*$/;

const escapeForClass = (ch) => ch.replace(/[\\\]\[^-]/g, (m) => '\\' + m);

const TWO_BEOL = {
  id: '2',
  wordTail: /[a-zA-Z]{3,}$/,
  wordGlobal: /[a-zA-Z]{3,}/g,
  isBoundary: (text) => NEWLINE_WITH_INDENT.test(text) || DEFAULT_BOUNDARY.test(text),
  isConvertible: (word) => isConvertibleAlphabet(word),
  convert: (word) => convertEngToKor(word),
  convertText: (text) => convertEngToKor(text),
};

const cache = new Map();

function threeBeol(id) {
  if (cache.has(id)) return cache.get(id);
  const cls = '[' + Object.keys(LAYOUTS[id]).map(escapeForClass).join('') + ']';
  const helpers = {
    id,
    wordTail: new RegExp(cls + '{3,}$'),
    wordGlobal: new RegExp(cls + '{3,}', 'g'),
    // 이 자판에서 자모가 아닌 기호만 단어 끝으로 본다 (공백·줄바꿈은 항상 단어 끝)
    isBoundary: (text) => NEWLINE_WITH_INDENT.test(text) || SPACE_BOUNDARY.test(text) || (DEFAULT_BOUNDARY.test(text) && !isHangulKey(id, text)),
    // 영문자가 하나도 없으면(숫자·기호만) 한글을 치려던 것으로 보지 않는다
    isConvertible: (word) => /[a-zA-Z]/.test(word) && [...word].every((c) => isHangulKey(id, c)),
    convert: (word) => convertThreeBeol(word, id),
    // 선택 영역 변환: 자모 키가 이어진 부분만 바꾸고 나머지(공백 등)는 그대로 둔다
    convertText: (text) => {
      let out = '';
      let run = '';
      for (const ch of text) {
        if (isHangulKey(id, ch)) { run += ch; continue; }
        if (run) { out += convertThreeBeol(run, id); run = ''; }
        out += ch;
      }
      if (run) out += convertThreeBeol(run, id);
      return out;
    },
  };
  cache.set(id, helpers);
  return helpers;
}

/**
 * @param {string} id - "2" | "390" | "3final" (그 밖의 값은 2벌식)
 */
function getLayoutHelpers(id) {
  if (id === '390' || id === '3final') return threeBeol(id);
  return TWO_BEOL;
}

module.exports = { getLayoutHelpers };
