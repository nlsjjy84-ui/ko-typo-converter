/**
 * hangulAssembler.js
 * 2벌식 자모 조합으로 영문을 한글 음절로 변환하는 핵심 엔진
 * 
 * 원리: 2벌식 키보드의 각 키(d,k,s 등)는 특정 자모(ㅇ,ㅏ,ㄴ)를 의미
 *      여러 자모를 조합하면 한글 음절이 됨
 *      예: d(ㅇ) + k(ㅏ) + s(ㄴ) = "안"
 */

class HangulAssembler {
  constructor() {
    // 2벌식 표준 키보드 매핑
    // 버그 수정 (2026-09-24): 이전 매핑은 실제 표준 2벌식 자판과 달랐다 (예: z를 ㅎ으로,
    // p를 ㅓ로 매핑하고 있었고, g/j 키는 아예 매핑에서 빠져있었음). 표준 자판에서 유명한
    // 예시인 "dkssudgktpdy" = "안녕하세요"를 이 매핑으로 직접 조합해 검증했다:
    //   d(ㅇ)k(ㅏ)s(ㄴ) s(ㄴ)u(ㅕ)d(ㅇ) g(ㅎ)k(ㅏ) t(ㅅ)p(ㅔ) d(ㅇ)y(ㅛ) → 안 녕 하 세 요 ✓
    this.keyMap = {
      // 자음 (표준 2벌식)
      q: 'ㅂ',   Q: 'ㅃ',
      w: 'ㅈ',   W: 'ㅉ',
      e: 'ㄷ',   E: 'ㄸ',
      r: 'ㄱ',   R: 'ㄲ',
      t: 'ㅅ',   T: 'ㅆ',
      a: 'ㅁ',
      s: 'ㄴ',
      d: 'ㅇ',
      f: 'ㄹ',
      g: 'ㅎ',
      z: 'ㅋ',
      x: 'ㅌ',
      c: 'ㅊ',
      v: 'ㅍ',

      // 모음 (표준 2벌식)
      y: 'ㅛ',
      u: 'ㅕ',
      i: 'ㅑ',
      o: 'ㅐ',
      p: 'ㅔ',
      h: 'ㅗ',
      j: 'ㅓ',
      k: 'ㅏ',
      l: 'ㅣ',
      b: 'ㅠ',
      n: 'ㅜ',
      m: 'ㅡ',

      // Shift 모음 (표준 2벌식에서 실제로 존재하는 건 이 둘 뿐)
      O: 'ㅒ',
      P: 'ㅖ',
    };

    // 한글 유니코드 배열 (정확한 순서 - 유니코드 표준 초성19/중성21/종성28)
    // 버그 수정 (2026-09-24): 기존 배열에 초성 'ㅎ'이 통째로 빠져있었고(18개만 존재),
    // 중성 배열은 'ㅛㅜㅠㅡ' 4개가 통째로 빠진 채 끝에 유효하지 않은 문자(ㅤ,ㅥ,ㅦ,ㅧ - 채움문자/옛한글
    // 자음)로 길이만 21개로 맞춰놓은 상태였다. 그 결과 'ㅎ'으로 시작하거나 'ㅣㅜㅠㅡ' 등을 포함하는
    // (매우 흔한) 단어들의 조합이 전부 깨지거나 완전히 다른 글자로 잘못 조합되고 있었다.
    this.chosungList = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
    this.jungsungList = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
    this.jongsungList = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

    // 복합 모음 규칙 - 연속된 두 모음 키 입력이 하나의 이중모음으로 합쳐지는 경우만 규정한다.
    // 버그 수정 (2026-09-24): ㅐ/ㅔ/ㅒ/ㅖ는 표준 자판에서 o/p/O/P 단일 키로 바로 입력되는
    // 모음이라 "ㅏ+ㅣ=ㅐ" 같은 합성 규칙 자체가 틀렸다 (실제 타이핑에서는 "가"+"이"처럼 두
    // 글자가 그대로 유지돼야 하는데, 이 규칙이 있으면 잘못 합쳐져버린다). 실제로 두 키를
    // 이어 쳐서 만들어지는 이중모음(ㅘㅙㅚㅝㅞㅟㅢ)만 남겼다.
    this.complexVowels = {
      'ㅗㅏ': 'ㅘ',
      'ㅗㅐ': 'ㅙ',
      'ㅗㅣ': 'ㅚ',
      'ㅜㅓ': 'ㅝ',
      'ㅜㅔ': 'ㅞ',
      'ㅜㅣ': 'ㅟ',
      'ㅡㅣ': 'ㅢ',
    };

    // 현재 상태
    this.reset();
  }

  reset() {
    this.chosung = null;      // 초성
    this.jungsung = null;     // 중성
    this.jungsung2 = null;    // 복합 모음의 두 번째 중성
  }

  /**
   * 주어진 단어(영문 자모)를 한글로 변환
   * @param {string} word - 변환할 단어 (예: "dkssud")
   * @returns {string|null} - 변환된 한글 또는 null
   */
  assemble(word) {
    if (!word || word.length === 0) return null;

    this.reset();
    let result = '';
    let i = 0;

    while (i < word.length) {
      const char = word[i];
      const jamo = this.keyMap[char];

      if (!jamo) {
        // 매핑되지 않은 문자는 원래대로 (단, 먼저 대기 중인 자모는 완성/방출)
        result += this.flushPending();
        result += char;
        i++;
        continue;
      }

      // 자음 확인
      if (this.isConsonant(jamo)) {
        if (this.chosung === null) {
          // 초성 설정
          this.chosung = jamo;
        } else if (this.jungsung === null) {
          // 초성만 있고 중성이 없으면 (쌍자음 등) 초성 업데이트
          this.chosung = jamo;
        } else {
          // 버그 수정 (2026-09-24): 초성+중성이 이미 있는 상태에서 자음이 오면, 그 자음이
          // 현재 음절의 종성인지 다음 음절의 초성인지 그 다음 글자를 먼저 봐야 알 수 있다
          // (lookahead). 다음 글자가 모음이면 이 자음은 다음 음절의 초성이고, 모음이
          // 아니거나(자음/끝) 없으면 현재 음절의 종성이다. 예: "dkssud" (안녕)에서 마지막
          // d(ㅇ)는 뒤에 아무것도 없으므로 종성이 아니라 "다음 음절의 초성 대기" 상태로
          // 남아야 하고, "gktpdy" (하세요)에서 t(ㅅ) 다음에 p(ㅔ, 모음)가 오므로 t는
          // 종성이 아니라 다음 음절 "세"의 초성이 되어야 한다.
          const nextChar = word[i + 1];
          const nextJamo = nextChar ? this.keyMap[nextChar] : null;
          const nextIsVowel = nextJamo ? this.isVowel(nextJamo) : false;

          if (nextIsVowel) {
            // 다음 글자가 모음 → 이 자음은 다음 음절의 초성
            result += this.createSyllable(this.chosung, this.jungsung, null);
            this.chosung = jamo;
            this.jungsung = null;
          } else {
            // 다음 글자가 모음이 아니거나 없음 → 이 자음은 현재 음절의 종성
            result += this.createSyllable(this.chosung, this.jungsung, jamo);
            this.chosung = null;
            this.jungsung = null;
          }
        }
      }
      // 모음 확인
      else if (this.isVowel(jamo)) {
        if (this.jungsung === null) {
          this.jungsung = jamo;
        } else {
          // 복합 모음 처리
          const complex = this.complexVowels[this.jungsung + jamo];
          if (complex) {
            this.jungsung = complex;
          } else {
            // 복합 모음이 아니면, 현재까지의 음절 완성
            const syllable = this.createSyllable(this.chosung, this.jungsung, null);
            result += syllable;
            this.chosung = null;
            this.jungsung = jamo;
          }
        }
      }

      i++;
    }

    // 남은 자모 처리
    result += this.flushPending();

    return result || null;
  }

  /**
   * 조합 도중 남아있는 초성/중성을 마무리 처리한다.
   * 버그 수정 (2026-09-24): assemble()의 lookahead 분기와 단어 끝 처리에서 공통으로
   * 쓰이는 "남은 자모 정리" 로직을 하나로 모았다 (기존에는 단어 끝에서만 처리되고,
   * 매핑 안 되는 문자를 만났을 때는 대기 중인 자모가 그냥 버려지는 문제가 있었다).
   */
  flushPending() {
    if (this.chosung !== null && this.jungsung !== null) {
      const syllable = this.createSyllable(this.chosung, this.jungsung, null);
      this.chosung = null;
      this.jungsung = null;
      return syllable;
    }
    if (this.chosung !== null) {
      const c = this.chosung;
      this.chosung = null;
      return c;
    }
    if (this.jungsung !== null) {
      const j = this.jungsung;
      this.jungsung = null;
      return j;
    }
    return '';
  }

  /**
   * 초성+중성+종성으로 한글 음절 생성
   */
  createSyllable(chosung, jungsung, jongsung) {
    if (!chosung || !jungsung) return '';

    const chosungIdx = this.chosungList.indexOf(chosung);
    const jungsungIdx = this.jungsungList.indexOf(jungsung);
    const jongsungIdx = jongsung ? this.jongsungList.indexOf(jongsung) : 0;

    if (chosungIdx < 0 || jungsungIdx < 0 || jongsungIdx < 0) return '';

    // 한글 유니코드: 0xAC00 + (초성*21*28) + (중성*28) + 종성
    const codePoint = 0xAC00 + (chosungIdx * 21 * 28) + (jungsungIdx * 28) + jongsungIdx;
    return String.fromCharCode(codePoint);
  }

  isConsonant(jamo) {
    // 버그 수정 (2026-09-24): 'ㅎ' 빠져있던 것 추가
    return 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'.includes(jamo);
  }

  isVowel(jamo) {
    // 버그 수정 (2026-09-24): 'ㅛㅜㅠㅡ' 빠져있던 것 추가
    return 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'.includes(jamo);
  }
}

/**
 * 주어진 영문 단어를 2벌식 자모 조합으로 한글로 변환한다.
 * 조합에 실패하면(변환 결과가 없으면) 원본 단어를 그대로 반환한다.
 * @param {string} word
 * @returns {string}
 */
function convertEngToKor(word) {
  if (!word) return word;
  const assembler = new HangulAssembler();
  const result = assembler.assemble(word);
  return result || word;
}

/**
 * 주어진 단어가 2벌식 키보드 매핑으로 전부 변환 가능한 알파벳으로만
 * 이루어져 있는지 확인한다 (숫자/기호가 섞여있으면 false).
 * @param {string} word
 * @returns {boolean}
 */
function isConvertibleAlphabet(word) {
  if (!word) return false;
  const assembler = new HangulAssembler();
  return [...word].every((ch) => assembler.keyMap[ch] !== undefined);
}

module.exports = HangulAssembler;
module.exports.HangulAssembler = HangulAssembler;
module.exports.convertEngToKor = convertEngToKor;
module.exports.isConvertibleAlphabet = isConvertibleAlphabet;
