package io.github.nlsjjy84ui.kotypo.core;

import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 반대 방향: 한글 상태로 잘못 친 영어 용어(console → 채ㅜ내ㅣㄷ)를 되돌린다.
 * 한글을 거꾸로 풀지 않고, 알려진 용어와 이 문서의 식별자를 미리 한글로 조합해 표를 만든 뒤
 * 글자 하나까지 같을 때만 되돌린다. reverseMapper.js와 같다.
 */
public final class ReverseMapper {

    private static final Pattern HANGUL_ONLY = Pattern.compile("^[가-힣ㄱ-ㅣ]+$");
    private static final Pattern IDENTIFIER = Pattern.compile("[A-Za-z_$][A-Za-z0-9_$]*");

    private ReverseMapper() {
    }

    static boolean isHangulOnly(String s) {
        if (!HANGUL_ONLY.matcher(s).matches()) return false;
        return s.length() >= 2 || HangulAssembler.isFullyComposedHangul(s);
    }

    /** 조합된 한글 → 원래 영어 용어 */
    public static Map<String, String> buildTable(Iterable<String> terms, KeyboardLayout layout) {
        Map<String, String> table = new HashMap<>();
        for (String term : terms) {
            if (term == null || term.length() < 2) continue;
            String garbled = layout.convert(term);
            if (garbled == null || garbled.equals(term) || !isHangulOnly(garbled)) continue;
            String existing = table.get(garbled);
            if (existing == null) {
                table.put(garbled, term);
                continue;
            }
            boolean existingIsLower = existing.equals(existing.toLowerCase(Locale.ROOT));
            boolean termIsLower = term.equals(term.toLowerCase(Locale.ROOT));
            if (!existingIsLower && termIsLower) table.put(garbled, term);
        }
        return table;
    }

    /** 문서에 이미 쓰인 영문 식별자 (처음 나온 순서대로) */
    public static Set<String> documentIdentifiers(String text) {
        Set<String> seen = new LinkedHashSet<>();
        Matcher m = IDENTIFIER.matcher(text);
        while (m.find()) {
            if (m.group().length() >= 2) seen.add(m.group());
        }
        return seen;
    }
}
