package io.github.nlsjjy84ui.kotypo.core;

import java.util.HashMap;
import java.util.Map;

/**
 * 2벌식 자판으로 영문 상태에서 친 글자를 한글 음절로 조합한다.
 * VS Code 확장의 hangulAssembler.js를 그대로 옮긴 것이다. 두 엔진의 결과가 같은지는
 * EngineParityTest가 JS 엔진으로 만든 기준 결과와 대조해 확인한다.
 */
public final class HangulAssembler {

    private static final Map<Character, Character> KEY_MAP = new HashMap<>();
    private static final String CHOSUNG = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
    private static final String JUNGSUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
    /** 종성 목록. 0번은 "받침 없음"이라 문자 대신 자리만 차지한다. */
    private static final String JONGSUNG = "\0ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";
    private static final Map<String, Character> COMPLEX_VOWELS = new HashMap<>();
    private static final Map<String, Character> DOUBLE_JONGSUNG = new HashMap<>();

    static {
        String keys = "qQwWeErRtTasdfgzxcvyuiopOPhjklbnm";
        String jamo = "ㅂㅃㅈㅉㄷㄸㄱㄲㅅㅆㅁㄴㅇㄹㅎㅋㅌㅊㅍㅛㅕㅑㅐㅔㅒㅖㅗㅓㅏㅣㅠㅜㅡ";
        for (int i = 0; i < keys.length(); i++) KEY_MAP.put(keys.charAt(i), jamo.charAt(i));

        COMPLEX_VOWELS.put("ㅗㅏ", 'ㅘ');
        COMPLEX_VOWELS.put("ㅗㅐ", 'ㅙ');
        COMPLEX_VOWELS.put("ㅗㅣ", 'ㅚ');
        COMPLEX_VOWELS.put("ㅜㅓ", 'ㅝ');
        COMPLEX_VOWELS.put("ㅜㅔ", 'ㅞ');
        COMPLEX_VOWELS.put("ㅜㅣ", 'ㅟ');
        COMPLEX_VOWELS.put("ㅡㅣ", 'ㅢ');

        String[][] pairs = {
            {"ㄱㅅ", "ㄳ"}, {"ㄴㅈ", "ㄵ"}, {"ㄴㅎ", "ㄶ"}, {"ㄹㄱ", "ㄺ"}, {"ㄹㅁ", "ㄻ"}, {"ㄹㅂ", "ㄼ"},
            {"ㄹㅅ", "ㄽ"}, {"ㄹㅌ", "ㄾ"}, {"ㄹㅍ", "ㄿ"}, {"ㄹㅎ", "ㅀ"}, {"ㅂㅅ", "ㅄ"},
        };
        for (String[] p : pairs) DOUBLE_JONGSUNG.put(p[0], p[1].charAt(0));
    }

    private HangulAssembler() {
    }

    /** 2벌식 자판에서 이 글자가 한글 자모를 내는 키인지 */
    public static boolean isKey(char c) {
        return KEY_MAP.containsKey(c);
    }

    private static boolean isConsonant(char j) {
        return CHOSUNG.indexOf(j) >= 0;
    }

    private static boolean isVowel(char j) {
        return JUNGSUNG.indexOf(j) >= 0;
    }

    private static boolean canBeJongsung(char j) {
        return JONGSUNG.indexOf(j, 1) >= 0;
    }

    private static String syllable(Character cho, Character jung, Character jong) {
        if (cho == null || jung == null) return "";
        int c = CHOSUNG.indexOf(cho);
        int j = JUNGSUNG.indexOf(jung);
        int t = jong == null ? 0 : JONGSUNG.indexOf(jong, 1);
        if (c < 0 || j < 0 || t < 0) return "";
        return String.valueOf((char) (0xAC00 + (c * 21 * 28) + (j * 28) + t));
    }

    /**
     * 영문 단어를 2벌식으로 조합한다. 조합 결과가 비면 null.
     */
    public static String assemble(String word) {
        if (word == null || word.isEmpty()) return null;
        StringBuilder result = new StringBuilder();
        Character cho = null;
        Character jung = null;
        int i = 0;
        while (i < word.length()) {
            char ch = word.charAt(i);
            Character jamo = KEY_MAP.get(ch);
            if (jamo == null) {
                // 자판에 없는 글자: 기다리던 자모를 먼저 내보내고 글자는 그대로 둔다
                if (cho != null && jung != null) result.append(syllable(cho, jung, null));
                else if (cho != null) result.append(cho);
                else if (jung != null) result.append(jung);
                cho = null;
                jung = null;
                result.append(ch);
                i++;
                continue;
            }
            if (isConsonant(jamo)) {
                if (cho == null && jung == null) {
                    cho = jamo;
                } else if (cho == null) {
                    // 초성 없이 남은 모음은 낱자로 끝내고, 새 자음으로 다시 시작
                    result.append(jung);
                    jung = null;
                    cho = jamo;
                } else if (jung == null) {
                    // 짝 없는 자음은 낱자로 남긴다
                    result.append(cho);
                    cho = jamo;
                } else {
                    // 받침인지 다음 글자의 초성인지는 다음 글자를 보고 정한다
                    Character next = i + 1 < word.length() ? KEY_MAP.get(word.charAt(i + 1)) : null;
                    boolean nextIsVowel = next != null && isVowel(next);
                    if (nextIsVowel) {
                        result.append(syllable(cho, jung, null));
                        cho = jamo;
                        jung = null;
                    } else {
                        Character nextNext = i + 2 < word.length() ? KEY_MAP.get(word.charAt(i + 2)) : null;
                        Character doubled = next != null && isConsonant(next)
                            ? DOUBLE_JONGSUNG.get("" + jamo + next) : null;
                        if (doubled != null && !(nextNext != null && isVowel(nextNext))) {
                            result.append(syllable(cho, jung, doubled));
                            cho = null;
                            jung = null;
                            i++;
                        } else if (canBeJongsung(jamo)) {
                            result.append(syllable(cho, jung, jamo));
                            cho = null;
                            jung = null;
                        } else {
                            // ㄸ·ㅃ·ㅉ은 받침이 될 수 없다
                            result.append(syllable(cho, jung, null));
                            cho = jamo;
                            jung = null;
                        }
                    }
                }
            } else if (isVowel(jamo)) {
                if (jung == null) {
                    jung = jamo;
                } else {
                    Character complex = COMPLEX_VOWELS.get("" + jung + jamo);
                    if (complex != null) {
                        jung = complex;
                    } else {
                        if (cho != null) result.append(syllable(cho, jung, null));
                        else result.append(jung);
                        cho = null;
                        jung = jamo;
                    }
                }
            }
            i++;
        }
        if (cho != null && jung != null) result.append(syllable(cho, jung, null));
        else if (cho != null) result.append(cho);
        else if (jung != null) result.append(jung);
        return result.length() == 0 ? null : result.toString();
    }

    /** 조합에 실패하면 원래 단어를 그대로 돌려준다 (JS의 convertEngToKor와 같음) */
    public static String convertEngToKor(String word) {
        if (word == null || word.isEmpty()) return word;
        String r = assemble(word);
        return r == null ? word : r;
    }

    /** 모든 글자가 2벌식 키인지 */
    public static boolean isConvertibleAlphabet(String word) {
        if (word == null || word.isEmpty()) return false;
        for (int i = 0; i < word.length(); i++) {
            if (!KEY_MAP.containsKey(word.charAt(i))) return false;
        }
        return true;
    }

    /** 완성된 한글 음절(가~힣)로만 이뤄져 있는지 */
    public static boolean isFullyComposedHangul(String s) {
        if (s == null || s.isEmpty()) return false;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c < '가' || c > '힣') return false;
        }
        return true;
    }
}
