/**
 * confidenceCalculator.js
 * 한글 변환의 신뢰도를 점수로 계산
 * 
 * 신뢰도 기준:
 * - 기본점수: 50점
 * - 컨텍스트 보너스: +5~10점 (따옴표, 주석 등)
 * - 패턴 보너스: +20~30점 (어미, 도메인 명사 등)
 * - 범위: 50~100점
 * 
 * 활용:
 * - 90점 이상: 자동 변환
 * - 70~89점: 제안 표시
 * - 50~69점: 무시
 */

const { isPracticalWord, getWordCategory } = require('./practicalWords');
const ContextDetector = require('./contextDetector');

class ConfidenceCalculator {
  constructor() {
    // 신뢰도 계산 규칙
    this.baseScore = 50;
    
    // 어미 패턴 (50점 이상일 때 +20점)
    this.endingPatterns = [
      '입니다', '합니다', '있습니다', '없습니다',
      '했습니다', '합시다', '하세요', '했어요',
      '있어요', '없어요', '주세요', '으세요',
      '는거야', '다고', '아', '에', '가',
      '를', '는', '은', '에서', '로', '와'
    ];

    // 도메인 명사 패턴 (50점 이상일 때 +30점)
    this.domainNouns = [
      '이름', '주소', '나이', '번호', '비밀번호', '이메일',
      '클래스', '변수', '필드', '메소드', '함수', '속성',
      '테이블', '데이터베이스', '컬럼', '로우', '에러',
      '메시지', '상태', '코드', '타입', '사용자', '관리자',
      '게스트', '계정', '권한', '역할', '그룹', '조직'
    ];
  }

  /**
   * 변환된 한글 단어의 신뢰도 계산
   * @param {string} word - 한글 단어
   * @param {string} context - 컨텍스트 타입 (string_double, comment_line 등)
   * @param {string} originalText - 원본 텍스트 (패턴 분석용)
   * @returns {number} - 신뢰도 점수 (0~100)
   */
  calculate(word, context = null, originalText = '') {
    let score = this.baseScore;

    // 1. 컨텍스트 기반 보너스
    if (context) {
      score += this.getContextBonus(context);
    }

    // 2. 어미 패턴 확인
    if (this.hasEndingPattern(word)) {
      score += 20;
    }

    // 3. 도메인 명사 확인
    if (this.isDomainNoun(word)) {
      score += 30;
    }

    // 4. 실무 단어 확인
    if (isPracticalWord(word)) {
      score += 15;
    }

    // 5. 단어 길이 (너무 짧으면 감점)
    if (word.length === 1) {
      score -= 5;
    }

    // 6. 주변 문맥 분석 (원본 텍스트가 있을 경우)
    if (originalText) {
      score += this.analyzeContext(word, originalText);
    }

    // 범위 제한 (0~100)
    return Math.max(0, Math.min(100, score));
  }

  /**
   * 컨텍스트 타입별 보너스
   */
  getContextBonus(context) {
    const bonusMap = {
      'string_double': 10,
      'string_single': 10,
      'template_literal': 8,
      'comment_line': 5,
      'comment_block': 5,
      'tag_content': 8,
      'bracket_brace': 6,
      'bracket_paren': 6
    };
    return bonusMap[context] || 0;
  }

  /**
   * 어미 패턴이 포함되어 있는지 확인
   */
  hasEndingPattern(word) {
    return this.endingPatterns.some(pattern => word.endsWith(pattern));
  }

  /**
   * 도메인 명사인지 확인
   */
  isDomainNoun(word) {
    return this.domainNouns.some(noun => word.includes(noun));
  }

  /**
   * 주변 문맥 분석 (간단한 휴리스틱)
   */
  analyzeContext(word, originalText) {
    let bonus = 0;

    // 변수명 패턴 확인 (camelCase 또는 snake_case 다음에 오는 경우)
    if (/[a-zA-Z_]\w*[\s:=]/.test(originalText)) {
      bonus += 5;
    }

    // 주석 키워드 확인
    if (originalText.includes('//') || originalText.includes('/*')) {
      bonus += 5;
    }

    // 문자열 내부 확인
    if (originalText.includes('"') || originalText.includes("'")) {
      bonus += 5;
    }

    return bonus;
  }

  /**
   * 신뢰도 레벨 판정
   * @returns {string} - 'high' | 'medium' | 'low' | 'ignore'
   */
  getLevel(score) {
    if (score >= 90) return 'high';      // 자동 변환
    if (score >= 70) return 'medium';    // 제안
    if (score >= 50) return 'low';       // 무시
    return 'ignore';                     // 변환 안 함
  }

  /**
   * 신뢰도를 시각적으로 표현
   */
  formatConfidence(score, format = 'numeric') {
    const level = this.getLevel(score);
    
    switch (format) {
      case 'numeric':
        return `${score}`;
      case 'percentage':
        return `${score}%`;
      case 'text':
        if (level === 'high') return '높음';
        if (level === 'medium') return '중간';
        if (level === 'low') return '낮음';
        return '무시';
      case 'emoji':
        if (level === 'high') return '🟢';
        if (level === 'medium') return '🟡';
        if (level === 'low') return '🔴';
        return '⚪';
      case 'bar':
        const bars = Math.floor(score / 10);
        return '█'.repeat(bars) + '░'.repeat(10 - bars);
      default:
        return score;
    }
  }

  /**
   * 여러 단어의 평균 신뢰도 계산
   */
  calculateBatch(words, context = null) {
    const scores = words.map(word => this.calculate(word, context));
    const average = scores.reduce((a, b) => a + b, 0) / scores.length;
    return {
      average: Math.round(average),
      scores: scores,
      level: this.getLevel(Math.round(average))
    };
  }
}

// 버그 수정 (2026-09-24): extension.js는 calculateConfidence()/confidenceLabel() 이라는
// "함수"를 require('./confidenceCalculator')에서 구조분해로 가져다 쓰는데, 이 파일은
// 원래 클래스(ConfidenceCalculator)만 export하고 있어서 두 값 모두 undefined였다
// (그래서 실제로 호출되는 순간 "X is not a function" 에러가 났음). 게다가 클래스의
// calculate()는 0~100 점수를 반환하지만, extension.js 쪽 임계값(MIN_CONFIDENCE_THRESHOLD,
// AUTO_CONVERT_THRESHOLD)은 0~1 스케일이라 단위도 안 맞았다. 아래 두 래퍼 함수로 두
// 문제를 한 번에 해결한다: 0~100 점수를 0~1로 정규화해서 돌려준다.
const defaultCalculator = new ConfidenceCalculator();

/**
 * extension.js에서 쓰는 간단한 함수형 인터페이스.
 * @param {string} word - 원본 영문 단어 (오타로 친 것)
 * @param {string} converted - 변환된 한글 단어
 * @param {string} [context] - 컨텍스트 타입 (string_double, comment_line 등, 선택)
 * @returns {number} - 0~1 사이의 신뢰도
 */
function calculateConfidence(word, converted, context = null) {
  const score = defaultCalculator.calculate(converted, context, word);
  return score / 100;
}

/**
 * 0~1 스케일의 신뢰도를 사람이 읽을 수 있는 한글 레이블로 변환.
 * @param {number} confidence - 0~1 사이의 신뢰도
 * @returns {string}
 */
function confidenceLabel(confidence) {
  const score = Math.round(confidence * 100);
  return defaultCalculator.formatConfidence(score, 'text');
}

module.exports = ConfidenceCalculator;
module.exports.calculateConfidence = calculateConfidence;
module.exports.confidenceLabel = confidenceLabel;
