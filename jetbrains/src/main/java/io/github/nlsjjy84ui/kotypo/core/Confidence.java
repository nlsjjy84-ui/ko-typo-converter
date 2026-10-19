package io.github.nlsjjy84ui.kotypo.core;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 변환 후보의 신뢰도(0~1). 바꿀지 말지의 기준은 "완성된 한글 음절인가"이고, 이 점수는
 * 설정의 최소 신뢰도(기본 50)로 한 번 더 거르는 보조 기준이다. confidenceCalculator.js와 같다.
 */
public final class Confidence {

    private static final String[] ENDINGS = {
        "입니다", "합니다", "있습니다", "없습니다", "했습니다", "합시다", "하세요", "했어요",
        "있어요", "없어요", "주세요", "으세요", "는거야", "다고", "아", "에", "가",
        "를", "는", "은", "에서", "로", "와",
    };
    private static final String[] DOMAIN_NOUNS = {
        "이름", "주소", "나이", "번호", "비밀번호", "이메일", "클래스", "변수", "필드", "메소드", "함수", "속성",
        "테이블", "데이터베이스", "컬럼", "로우", "에러", "메시지", "상태", "코드", "타입", "사용자", "관리자",
        "게스트", "계정", "권한", "역할", "그룹", "조직",
    };
    private static final Map<String, Integer> CONTEXT_BONUS = new HashMap<>();
    private static final Pattern IDENT_THEN_SEP = Pattern.compile("[a-zA-Z_]\\w*[\\s:=]");

    static {
        CONTEXT_BONUS.put("string_double", 10);
        CONTEXT_BONUS.put("string_single", 10);
        CONTEXT_BONUS.put("template_literal", 8);
        CONTEXT_BONUS.put("comment_line", 5);
        CONTEXT_BONUS.put("comment_block", 5);
        CONTEXT_BONUS.put("comment_hash", 5);
        CONTEXT_BONUS.put("comment_dash", 5);
        CONTEXT_BONUS.put("comment_html", 5);
        CONTEXT_BONUS.put("tag_content", 8);
        CONTEXT_BONUS.put("tag_text", 8);
        CONTEXT_BONUS.put("bracket_brace", 6);
        CONTEXT_BONUS.put("bracket_paren", 6);
        CONTEXT_BONUS.put("bracket_paren_safe", 4);
    }

    private Confidence() {
    }

    /** @return 0~1 */
    public static double of(String original, String converted, String context) {
        int score = 50;
        if (context != null) score += CONTEXT_BONUS.getOrDefault(context, 0);
        for (String e : ENDINGS) {
            if (converted.endsWith(e)) {
                score += 20;
                break;
            }
        }
        for (String n : DOMAIN_NOUNS) {
            if (converted.contains(n)) {
                score += 30;
                break;
            }
        }
        if (WordLists.isPracticalWord(converted)) score += 15;
        if (converted.length() == 1) score -= 5;
        if (original != null && !original.isEmpty()) {
            int bonus = 0;
            if (IDENT_THEN_SEP.matcher(original).find()) bonus += 5;
            if (original.contains("//") || original.contains("/*")) bonus += 5;
            if (original.contains("\"") || original.contains("'")) bonus += 5;
            score += bonus;
        }
        score = Math.max(0, Math.min(100, score));
        return score / 100.0;
    }
}
