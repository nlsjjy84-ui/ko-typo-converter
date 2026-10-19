package io.github.nlsjjy84ui.kotypo.core;

import java.util.HashMap;
import java.util.Map;

/**
 * 세벌식(390·최종) 자판으로 영문 상태에서 친 글자를 한글로 조합한다.
 * 자판 배열과 겹낱자 규칙은 libhangul(LGPL-2.1)의 표를 VS Code 확장과 같은 파일에서 읽는다
 * (resources/kotypo/layout-*.txt, combinations.txt).
 */
public final class ThreeBeolAssembler {

    private static final Map<String, Map<Integer, Integer>> LAYOUTS = new HashMap<>();
    private static final Map<Long, Integer> COMBO = new HashMap<>();
    private static final String CHO_COMPAT = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
    private static final String JONG_COMPAT = "ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";

    static {
        for (String id : new String[] {"390", "3final"}) {
            Map<Integer, Integer> t = new HashMap<>();
            for (String line : Resources.lines("layout-" + id + ".txt")) {
                String[] p = line.split(" ");
                t.put(Integer.parseInt(p[0], 16), Integer.parseInt(p[1], 16));
            }
            LAYOUTS.put(id, t);
        }
        for (String line : Resources.lines("combinations.txt")) {
            String[] p = line.split(" ");
            COMBO.put(key(Integer.parseInt(p[0], 16), Integer.parseInt(p[1], 16)), Integer.parseInt(p[2], 16));
        }
    }

    private ThreeBeolAssembler() {
    }

    private static long key(int a, int b) {
        return ((long) a << 32) | b;
    }

    private static boolean isCho(int c) {
        return c >= 0x1100 && c <= 0x1112;
    }

    private static boolean isJung(int c) {
        return c >= 0x1161 && c <= 0x1175;
    }

    private static boolean isJong(int c) {
        return c >= 0x11a8 && c <= 0x11c2;
    }

    private static String syllable(int cho, int jung, int jong) {
        if (cho != 0 && jung != 0) {
            int code = 0xac00 + ((cho - 0x1100) * 21 + (jung - 0x1161)) * 28 + (jong != 0 ? jong - 0x11a7 : 0);
            return String.valueOf((char) code);
        }
        // 초성·중성이 다 갖춰지지 않은 조각은 낱자로 남긴다
        StringBuilder s = new StringBuilder();
        if (cho != 0) s.append(CHO_COMPAT.charAt(cho - 0x1100));
        if (jung != 0) s.append((char) (0x314f + (jung - 0x1161)));
        if (jong != 0) s.append(JONG_COMPAT.charAt(jong - 0x11a8));
        return s.toString();
    }

    public static boolean isHangulKey(String layout, int codePoint) {
        Map<Integer, Integer> t = LAYOUTS.get(layout);
        return t != null && t.containsKey(codePoint);
    }

    public static Iterable<Integer> keys(String layout) {
        return LAYOUTS.get(layout).keySet();
    }

    /** 세벌식으로 조합한다. 자판에 없는 글자가 섞이면 null. */
    public static String convert(String word, String layout) {
        Map<Integer, Integer> t = LAYOUTS.get(layout);
        if (t == null) return null;
        StringBuilder out = new StringBuilder();
        int cho = 0;
        int jung = 0;
        int jong = 0;
        String last = "";
        int i = 0;
        while (i < word.length()) {
            int cp = word.codePointAt(i);
            i += Character.charCount(cp);
            Integer mapped = t.get(cp);
            if (mapped == null) return null;
            int v = mapped;
            if (isCho(v)) {
                if (cho == 0) {
                    if (jung != 0 || jong != 0) {
                        out.append(syllable(cho, jung, jong));
                        jung = 0;
                        jong = 0;
                    }
                    cho = v;
                } else {
                    Integer c = "cho".equals(last) ? COMBO.get(key(cho, v)) : null;
                    if (c != null && isCho(c)) {
                        cho = c;
                    } else if (c != null && isJong(c) && jong == 0) {
                        // libhangul 기본 동작: 초성 두 개가 겹받침이 되면 받침 자리에 넣는다
                        jong = c;
                        last = "jong";
                        continue;
                    } else {
                        out.append(syllable(cho, jung, jong));
                        jung = 0;
                        jong = 0;
                        cho = v;
                    }
                }
                last = "cho";
            } else if (isJung(v)) {
                if (jung == 0) {
                    if (jong != 0) {
                        out.append(syllable(cho, jung, jong));
                        cho = 0;
                        jong = 0;
                    }
                    jung = v;
                } else {
                    Integer c = "jung".equals(last) ? COMBO.get(key(jung, v)) : null;
                    if (c != null && isJung(c)) {
                        jung = c;
                    } else {
                        out.append(syllable(cho, jung, jong));
                        cho = 0;
                        jong = 0;
                        jung = v;
                    }
                }
                last = "jung";
            } else if (isJong(v)) {
                if (jong == 0) {
                    jong = v;
                } else {
                    Integer c = "jong".equals(last) ? COMBO.get(key(jong, v)) : null;
                    if (c != null && isJong(c)) {
                        jong = c;
                    } else {
                        out.append(syllable(cho, jung, jong));
                        cho = 0;
                        jung = 0;
                        jong = v;
                    }
                }
                last = "jong";
            }
        }
        if (cho != 0 || jung != 0 || jong != 0) out.append(syllable(cho, jung, jong));
        return out.toString();
    }
}
