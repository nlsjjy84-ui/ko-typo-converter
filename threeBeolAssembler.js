// threeBeolAssembler.js
// 세벌식(3벌식) 자판으로 영문 상태에서 친 글자를 한글로 조합한다. (v0.1.0)
//
// 자판 배열과 겹낱자 조합 규칙은 리눅스·안드로이드 한글 입력기가 쓰는 표준 라이브러리
// libhangul(https://github.com/libhangul/libhangul)의 hangulkeyboard.h에 있는
// hangul_keyboard_table_390 / hangul_keyboard_table_3final, 그리고
// data/keyboards/hangul-combination-default.xml에서 그대로 옮겼다.
// 조합 순서(초성·중성·종성이 들어올 때 언제 앞 글자를 확정하는지)도 libhangul의
// hangul_ic_process_jaso를 따랐고, test/threebeol.test.js에서 libhangul로 만든
// 기준 결과와 대조한다.
//
// 3벌식은 초성·중성·종성 키가 따로 있어서, 2벌식처럼 "다음 글자를 보고 받침인지 판단"할
// 필요가 없다. 대신 숫자·기호 키(예: 390의 4=ㅛ, /=ㅗ, ;=ㅂ)도 한글 자모라서, 단어를
// 찾는 규칙이 2벌식과 다르다(keyboardLayout.js 참고).

const LAYOUTS = {
  '390': {
    "!": 0x11bd,
    "'": 0x1110,
    "/": 0x1169,
    "0": 0x110f,
    "1": 0x11c2,
    "2": 0x11bb,
    "3": 0x11b8,
    "4": 0x116d,
    "5": 0x1172,
    "6": 0x1163,
    "7": 0x1168,
    "8": 0x1174,
    "9": 0x116e,
    ";": 0x1107,
    "A": 0x11ae,
    "C": 0x11b1,
    "D": 0x11b0,
    "E": 0x11bf,
    "F": 0x11a9,
    "Q": 0x11c1,
    "R": 0x1164,
    "S": 0x11ad,
    "V": 0x11b6,
    "W": 0x11c0,
    "X": 0x11b9,
    "Z": 0x11be,
    "a": 0x11bc,
    "b": 0x116e,
    "c": 0x1166,
    "d": 0x1175,
    "e": 0x1167,
    "f": 0x1161,
    "g": 0x1173,
    "h": 0x1102,
    "i": 0x1106,
    "j": 0x110b,
    "k": 0x1100,
    "l": 0x110c,
    "m": 0x1112,
    "n": 0x1109,
    "o": 0x110e,
    "p": 0x1111,
    "q": 0x11ba,
    "r": 0x1162,
    "s": 0x11ab,
    "t": 0x1165,
    "u": 0x1103,
    "v": 0x1169,
    "w": 0x11af,
    "x": 0x11a8,
    "y": 0x1105,
    "z": 0x11b7,
  },
  '3final': {
    "!": 0x11a9,
    "#": 0x11bd,
    "$": 0x11b5,
    "%": 0x11b4,
    "'": 0x1110,
    "/": 0x1169,
    "0": 0x110f,
    "1": 0x11c2,
    "2": 0x11bb,
    "3": 0x11b8,
    "4": 0x116d,
    "5": 0x1172,
    "6": 0x1163,
    "7": 0x1168,
    "8": 0x1174,
    "9": 0x116e,
    ";": 0x1107,
    "@": 0x11b0,
    "A": 0x11ae,
    "C": 0x11bf,
    "D": 0x11b2,
    "E": 0x11ac,
    "F": 0x11b1,
    "G": 0x1164,
    "Q": 0x11c1,
    "R": 0x11b6,
    "S": 0x11ad,
    "T": 0x11b3,
    "V": 0x11aa,
    "W": 0x11c0,
    "X": 0x11b9,
    "Z": 0x11be,
    "a": 0x11bc,
    "b": 0x116e,
    "c": 0x1166,
    "d": 0x1175,
    "e": 0x1167,
    "f": 0x1161,
    "g": 0x1173,
    "h": 0x1102,
    "i": 0x1106,
    "j": 0x110b,
    "k": 0x1100,
    "l": 0x110c,
    "m": 0x1112,
    "n": 0x1109,
    "o": 0x110e,
    "p": 0x1111,
    "q": 0x11ba,
    "r": 0x1162,
    "s": 0x11ab,
    "t": 0x1165,
    "u": 0x1103,
    "v": 0x1169,
    "w": 0x11af,
    "x": 0x11a8,
    "y": 0x1105,
    "z": 0x11b7,
  },
};

// [앞 자모, 뒤 자모, 결과] - 같은 종류 키를 연달아 칠 때만 합친다 (ㄱ+ㄱ=ㄲ, ㅗ+ㅏ=ㅘ, ㄹ+ㄱ=ㄺ 등)
const COMBINATIONS = [
  [0x1100, 0x1100, 0x1101],
  [0x1100, 0x1109, 0x11aa],
  [0x1102, 0x110c, 0x11ac],
  [0x1102, 0x1112, 0x11ad],
  [0x1103, 0x1103, 0x1104],
  [0x1105, 0x1100, 0x11b0],
  [0x1105, 0x1106, 0x11b1],
  [0x1105, 0x1107, 0x11b2],
  [0x1105, 0x1109, 0x11b3],
  [0x1105, 0x1110, 0x11b4],
  [0x1105, 0x1111, 0x11b5],
  [0x1105, 0x1112, 0x11b6],
  [0x1107, 0x1107, 0x1108],
  [0x1107, 0x1109, 0x11b9],
  [0x1109, 0x1109, 0x110a],
  [0x110c, 0x110c, 0x110d],
  [0x1169, 0x1161, 0x116a],
  [0x1169, 0x1162, 0x116b],
  [0x1169, 0x1175, 0x116c],
  [0x116e, 0x1165, 0x116f],
  [0x116e, 0x1166, 0x1170],
  [0x116e, 0x1175, 0x1171],
  [0x1173, 0x1175, 0x1174],
  [0x11a8, 0x11a8, 0x11a9],
  [0x11a8, 0x11ba, 0x11aa],
  [0x11ab, 0x11bd, 0x11ac],
  [0x11ab, 0x11c2, 0x11ad],
  [0x11af, 0x11a8, 0x11b0],
  [0x11af, 0x11b7, 0x11b1],
  [0x11af, 0x11b8, 0x11b2],
  [0x11af, 0x11ba, 0x11b3],
  [0x11af, 0x11c0, 0x11b4],
  [0x11af, 0x11c1, 0x11b5],
  [0x11af, 0x11c2, 0x11b6],
  [0x11b8, 0x11ba, 0x11b9],
  [0x11ba, 0x11ba, 0x11bb],
];
const COMBO = new Map(COMBINATIONS.map(([a, b, r]) => [a * 0x10000 + b, r]));

const isCho = (c) => c >= 0x1100 && c <= 0x1112;
const isJung = (c) => c >= 0x1161 && c <= 0x1175;
const isJong = (c) => c >= 0x11a8 && c <= 0x11c2;

const CHO_COMPAT = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JONG_COMPAT = 'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';

function syllable(cho, jung, jong) {
  if (cho && jung) {
    const code = 0xac00 + ((cho - 0x1100) * 21 + (jung - 0x1161)) * 28 + (jong ? jong - 0x11a7 : 0);
    return String.fromCharCode(code);
  }
  // 초성·중성이 다 갖춰지지 않은 조각은 낱자로 남긴다 (완성된 글자가 아니라는 표시)
  let s = '';
  if (cho) s += CHO_COMPAT[cho - 0x1100];
  if (jung) s += String.fromCharCode(0x314f + (jung - 0x1161));
  if (jong) s += JONG_COMPAT[jong - 0x11a8];
  return s;
}

/** 이 자판에서 한글 자모를 내는 키인지 */
function isHangulKey(layout, ch) {
  const t = LAYOUTS[layout];
  return !!t && Object.prototype.hasOwnProperty.call(t, ch);
}

/**
 * 영문 상태로 친 글자를 세벌식으로 조합한다. 자판에 없는 글자가 섞이면 null.
 * @param {string} word
 * @param {'390'|'3final'} layout
 * @returns {string|null}
 */
function convertThreeBeol(word, layout) {
  const t = LAYOUTS[layout];
  if (!t) return null;
  let out = '';
  let cho = 0;
  let jung = 0;
  let jong = 0;
  let last = '';
  const commit = () => {
    out += syllable(cho, jung, jong);
    cho = 0;
    jung = 0;
    jong = 0;
    last = '';
  };
  for (const ch of word) {
    if (!Object.prototype.hasOwnProperty.call(t, ch)) return null;
    const v = t[ch];
    if (isCho(v)) {
      if (!cho) {
        if (jung || jong) commit();
        cho = v;
      } else {
        const c = last === 'cho' ? COMBO.get(cho * 0x10000 + v) : undefined;
        if (c && isCho(c)) {
          cho = c;
        } else if (c && isJong(c) && !jong) {
          // libhangul 기본 동작: 초성 두 개가 겹받침(ㄱ+ㅅ=ㄳ 등)이 되면 받침 자리에 넣는다.
          // 이 경우 중성이 없어 완성된 글자가 되지 않으므로 변환 대상에서 빠진다.
          jong = c;
          last = 'jong';
          continue;
        } else {
          commit();
          cho = v;
        }
      }
      last = 'cho';
    } else if (isJung(v)) {
      if (!jung) {
        if (jong) commit();
        jung = v;
      } else {
        const c = last === 'jung' ? COMBO.get(jung * 0x10000 + v) : undefined;
        if (c && isJung(c)) jung = c;
        else { commit(); jung = v; }
      }
      last = 'jung';
    } else if (isJong(v)) {
      if (!jong) {
        jong = v;
      } else {
        const c = last === 'jong' ? COMBO.get(jong * 0x10000 + v) : undefined;
        if (c && isJong(c)) jong = c;
        else { commit(); jong = v; }
      }
      last = 'jong';
    }
  }
  if (cho || jung || jong) commit();
  return out;
}

module.exports = { convertThreeBeol, isHangulKey, LAYOUTS };
