package io.github.nlsjjy84ui.kotypo.core;

import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * VS Code 확장과 같은 단어 목록. 목록 파일은 JS 원본에서 그대로 뽑아 넣는다.
 * - 흔한 영어 단어 10,748개: 이 단어는 한글로 바꾸지 않는다
 * - 프로그래밍 용어: 한글로 잘못 쳐졌을 때 영어로 되돌릴 후보
 * - 실무 한글 단어: 신뢰도 점수 참고용
 */
public final class WordLists {

    private static final Set<String> COMMON_ENGLISH = new HashSet<>(Resources.lines("common-english.txt"));
    public static final List<String> PROGRAMMING_TERMS = Collections.unmodifiableList(Resources.lines("programming-terms.txt"));
    private static final Set<String> PRACTICAL = new HashSet<>(Resources.lines("practical-words.txt"));

    private WordLists() {
    }

    public static boolean isCommonEnglishWord(String word) {
        if (word == null || word.isEmpty()) return false;
        return COMMON_ENGLISH.contains(word.toLowerCase(Locale.ROOT));
    }

    static boolean isPracticalWord(String word) {
        return word != null && !word.isEmpty() && PRACTICAL.contains(word);
    }

    public static int commonEnglishCount() {
        return COMMON_ENGLISH.size();
    }
}
