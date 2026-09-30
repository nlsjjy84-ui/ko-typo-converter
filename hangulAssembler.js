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
        if (this.chosung === null && this.jungsung === null) {
          // 초성 설정
          this.chosung = jamo;
        } else if (this.chosung === null) {
          // 버그 수정 (2026-09-30): 초성 없이 모음만 홀로 대기 중인 상태(예: "const"의
          // c+o+n에서 o(ㅐ)+n(ㅜ)가 복합모음이 아니라 "채"를 흘려보내고 ㅜ만 초성 없이
          // 남은 상태)에서 자음이 오면, 바로 아래 "초성 설정" 분기 조건(chosung===null)에
          // 걸려 이 leftover 모음을 마치 원래 기다리고 있던 짝인 것처럼 새 자음과 엮어버리는
          // 문제가 있었다(예: 대기 중이던 ㅜ + 새 자음 ㄴ → "눈"처럼 잘못 결합). 실제로는
          // 그 모음은 이미 짝 없이 끝난 것이므로 낱자로 먼저 흘려보내고, 새 자음으로 초성을
          // 새로 시작해야 한다.
          result += this.jungsung;
          this.jungsung = null;
          this.chosung = jamo;
        } else if (this.jungsung === null) {
          // 버그 수정 (2026-09-30): 초성만 있고 중성이 없는 상태에서 또 자음이 오면,
          // 실제 한글 입력기에서는 앞 자음이 짝(모음)을 못 찾은 채 독립된 낱자로 화면에
          // 남고, 새 자음이 다음 음절의 초성 후보가 된다. 기존 코드는 이 경우 앞 자음을
          // 뒤 자음으로 그냥 덮어써서 없애버렸는데(예: "return"의 r,e,t가 연달아 와도
          // 마지막 t만 남음), 공개 라이브러리(qwerty-dubeolsik)와 대조해보니 실제
          // 입력기는 덮어쓰지 않고 낱자를 그대로 남긴다는 걸 확인했다. 이 차이 때문에
          // return/const/class/export/string 등 자음 2개 이상으로 시작하는 흔한 영단어가
          // "완전히 조합된 한글 음절"처럼 보여 reverseMapper의 오탐지 위험을 키우고
          // 있었다. 앞 자음을 낱자로 흘려보내고 새 자음으로 초성을 다시 시작하도록 수정.
          result += this.chosung;
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
            // 버그 수정 (2026-09-30): 복합 모음이 아니면 현재까지의 음절을 완성해서
            // 흘려보내야 하는데, 초성이 없는 상태(모음이 자음 없이 먼저 온 경우)에서는
            // createSyllable이 chosung===null이라 빈 문자열을 반환해 앞 모음이 그냥
            // 사라지는 문제가 있었다. 초성이 있으면 음절로 완성하고, 없으면 대기 중인
            // 모음을 낱자 그대로 흘려보낸다(실제 입력기와 동일).
            result += this.chosung !== null
              ? this.createSyllable(this.chosung, this.jungsung, null)
              : this.jungsung;
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

/**
 * 설계 개선 (2026-09-24, 사용자 피드백 반영): 변환된 결과가 "온전히 조합된 한글
 * 음절"로만 이루어져 있는지 확인한다.
 *
 * 사용자가 지적한 핵심 통찰: 진짜 영단어가 2벌식으로 조합됐을 때 완전한 한글
 * 음절로 깔끔하게 맞아떨어지는 경우는 실제로 매우 드물다 (예: "test"는 자음만
 * 4개 연속이라 완성된 음절 없이 자모 하나("ㅅ")만 덩그러니 남고, "code"도 중간에
 * 모음/자음이 어긋나서 깨진 형태로 나온다). 반대로 "dkssud"처럼 실제로 한글
 * 자판으로 친 것은 초성+중성(+종성)이 딱 맞아떨어져서 완전한 음절들로만 구성된
 * 결과가 나온다. 즉 "완전히 조합됐는가"가 "이게 진짜 한글 오타인가"를 가려내는
 * 매우 강력한 신호이다. 이 체크로 흔한 영단어 블록리스트에 없는 단어라도, 조합
 * 결과가 지저분하면(자모가 홀로 남거나 원본 문자가 그대로 섞여있으면) 걸러낼 수
 * 있다.
 * @param {string} str - convertEngToKor()의 변환 결과
 * @returns {boolean} - 완성된 한글 음절(가~힣)로만 이루어져 있으면 true
 */
function isFullyComposedHangul(str) {
  if (!str) return false;
  return /^[가-힣]+$/.test(str);
}

module.exports = HangulAssembler;
module.exports.HangulAssembler = HangulAssembler;
module.exports.convertEngToKor = convertEngToKor;
module.exports.isConvertibleAlphabet = isConvertibleAlphabet;
module.exports.isFullyComposedHangul = isFullyComposedHangul;
