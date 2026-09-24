/**
 * contextDetector.js
 * 코드에서 한글이 나타날 수 있는 4가지 컨텍스트 감지
 * 1. "큰따옴표" 안
 * 2. '작은따옴표' 안
 * 3. `백틱` 템플릿 리터럴
 * 4. 한줄 주석(//) 또는 블록 주석
 * 5. <꺾쇠괄호> HTML/JSX 태그
 * 6. {} () [] 괄호 안
 *
 * 버그 수정 (2026-09-24): 이 파일의 최상단 JSDoc 주석 안에 문자 그대로 "/*"와 "*​/"가
 * 들어있어서 (블록 주석 예시를 설명하려던 것) 실제로는 그 지점에서 JSDoc 주석이 조기
 * 종료되고, 그 아래 "5. <꺾쇠괄호>..." 줄이 주석 밖 코드로 취급되어 SyntaxError로 파일
 * 자체가 로드되지 않고 있었다. require('./contextDetector')를 호출하는 confidenceCalculator.js를
 * 비롯해 이 파일을 거치는 모든 것이 그 즉시 깨지는 심각한 버그였다.
 */

class ContextDetector {
  /**
   * 주어진 텍스트에서 컨텍스트 정보 추출
   * @param {string} text - 분석할 코드 텍스트
   * @returns {Array} - [{ type, start, end, confidence }, ...]
   */
  static analyzeContexts(text) {
    const contexts = [];
    
    contexts.push(...this.detectQuotes(text));
    contexts.push(...this.detectComments(text));
    contexts.push(...this.detectTags(text));
    contexts.push(...this.detectBrackets(text));
    
    return contexts;
  }

  /**
   * 따옴표 내부 감지
   */
  static detectQuotes(text) {
    const contexts = [];
    const doubleQuoteRegex = /"([^"\\]*(\\.[^"\\]*)*)"/g;
    const singleQuoteRegex = /'([^'\\]*(\\.[^'\\]*)*)'/g;
    const backtickRegex = /`([^`\\]*(\\.[^`\\]*)*)`/g;

    let match;

    // 큰따옴표
    while ((match = doubleQuoteRegex.exec(text)) !== null) {
      contexts.push({
        type: 'string_double',
        start: match.index,
        end: match.index + match[0].length,
        content: match[1],
        confidence: 0.9
      });
    }

    // 작은따옴표
    while ((match = singleQuoteRegex.exec(text)) !== null) {
      contexts.push({
        type: 'string_single',
        start: match.index,
        end: match.index + match[0].length,
        content: match[1],
        confidence: 0.9
      });
    }

    // 백틱
    while ((match = backtickRegex.exec(text)) !== null) {
      contexts.push({
        type: 'template_literal',
        start: match.index,
        end: match.index + match[0].length,
        content: match[1],
        confidence: 0.9
      });
    }

    return contexts;
  }

  /**
   * 주석 내부 감지
   */
  static detectComments(text) {
    const contexts = [];

    // 한줄 주석 (//)
    const lineCommentRegex = /\/\/(.*)$/gm;
    let match;
    while ((match = lineCommentRegex.exec(text)) !== null) {
      contexts.push({
        type: 'comment_line',
        start: match.index,
        end: match.index + match[0].length,
        content: match[1],
        confidence: 0.85
      });
    }

    // 블록 주석 (/* */)
    const blockCommentRegex = /\/\*([\s\S]*?)\*\//g;
    while ((match = blockCommentRegex.exec(text)) !== null) {
      contexts.push({
        type: 'comment_block',
        start: match.index,
        end: match.index + match[0].length,
        content: match[1],
        confidence: 0.85
      });
    }

    return contexts;
  }

  /**
   * HTML/JSX 태그 감지 (<> 사이)
   */
  static detectTags(text) {
    const contexts = [];
    const tagRegex = /<([^>]*)>/g;
    let match;

    while ((match = tagRegex.exec(text)) !== null) {
      contexts.push({
        type: 'tag_content',
        start: match.index,
        end: match.index + match[0].length,
        content: match[1],
        confidence: 0.8
      });
    }

    return contexts;
  }

  /**
   * 괄호 내부 감지
   */
  static detectBrackets(text) {
    const contexts = [];

    // {} 감지
    contexts.push(...this.detectBracketPairs(text, '{', '}', 'brace'));
    // () 감지
    contexts.push(...this.detectBracketPairs(text, '(', ')', 'paren'));
    // [] 감지 (선택적 - 코드에서는 거의 사용 안 함)
    // contexts.push(...this.detectBracketPairs(text, '[', ']', 'bracket'));

    return contexts;
  }

  /**
   * 괄호 쌍 감지
   */
  static detectBracketPairs(text, open, close, type) {
    const contexts = [];
    let depth = 0;
    let start = -1;

    for (let i = 0; i < text.length; i++) {
      if (text[i] === open) {
        if (depth === 0) start = i;
        depth++;
      } else if (text[i] === close) {
        depth--;
        if (depth === 0 && start !== -1) {
          contexts.push({
            type: `bracket_${type}`,
            start: start,
            end: i + 1,
            content: text.substring(start + 1, i),
            confidence: 0.75
          });
          start = -1;
        }
      }
    }

    return contexts;
  }

  /**
   * 특정 위치가 컨텍스트 내에 있는지 확인
   */
  static isInContext(position, contexts) {
    for (const ctx of contexts) {
      if (position >= ctx.start && position < ctx.end) {
        return ctx;
      }
    }
    return null;
  }

  /**
   * 컨텍스트별 신뢰도 보너스
   */
  static getContextBonus(contextType) {
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
    return bonusMap[contextType] || 0;
  }
}

module.exports = ContextDetector;
