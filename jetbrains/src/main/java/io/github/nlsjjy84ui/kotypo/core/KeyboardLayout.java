package io.github.nlsjjy84ui.kotypo.core;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 설정한 자판("2" | "390" | "3final")에 맞는 단어 규칙과 변환 함수.
 * VS Code 확장의 keyboardLayout.js와 같다. 세벌식은 숫자·일부 기호도 자모 키라서
 * 단어 범위와 "단어가 끝났다"고 보는 문자가 자판마다 다르다.
 */
public final class KeyboardLayout {

    private static final Pattern DEFAULT_BOUNDARY = Pattern.compile("^[ \\t\\n.,!?;:)\\]}\"'`]$");
    private static final Pattern SPACE_BOUNDARY = Pattern.compile("^[ \\t\\n]$");
    /** 줄바꿈 뒤에 들여쓰기가 함께 들어오는 경우 (엔터를 치면 편집기가 들여쓰기를 붙여 넣는다) */
    private static final Pattern NEWLINE_WITH_INDENT = Pattern.compile("^\\r?\\n[ \\t]*$");
    private static final Pattern HAS_LETTER = Pattern.compile("[a-zA-Z]");
    private static final Map<String, KeyboardLayout> CACHE = new HashMap<>();

    public final String id;
    public final Pattern wordTail;
    public final Pattern wordGlobal;

    private KeyboardLayout(String id, String keyClass) {
        this.id = id;
        // JS의 $는 문자열 끝에서만 맞지만 자바의 $는 끝 줄바꿈 앞에서도 맞으므로 입력의 맨 끝(\z)을 쓴다
        this.wordTail = Pattern.compile(keyClass + "{3,}\\z");
        this.wordGlobal = Pattern.compile(keyClass + "{3,}");
    }

    public static synchronized KeyboardLayout get(String id) {
        String key = "390".equals(id) || "3final".equals(id) ? id : "2";
        return CACHE.computeIfAbsent(key, k -> {
            if ("2".equals(k)) return new KeyboardLayout("2", "[a-zA-Z]");
            StringBuilder cls = new StringBuilder("[");
            for (int cp : ThreeBeolAssembler.keys(k)) cls.append(String.format("\\x{%x}", cp));
            cls.append(']');
            return new KeyboardLayout(k, cls.toString());
        });
    }

    private boolean isTwo() {
        return "2".equals(id);
    }

    /** 방금 친 글자가 단어를 끝내는 문자인지 */
    public boolean isBoundary(String text) {
        if (text == null) return false;
        if (NEWLINE_WITH_INDENT.matcher(text).matches()) return true;
        if (isTwo()) return DEFAULT_BOUNDARY.matcher(text).matches();
        if (SPACE_BOUNDARY.matcher(text).matches()) return true;
        return DEFAULT_BOUNDARY.matcher(text).matches() && !ThreeBeolAssembler.isHangulKey(id, text.codePointAt(0));
    }

    public boolean isConvertible(String word) {
        if (isTwo()) return HangulAssembler.isConvertibleAlphabet(word);
        if (!HAS_LETTER.matcher(word).find()) return false;
        return word.codePoints().allMatch(cp -> ThreeBeolAssembler.isHangulKey(id, cp));
    }

    /** 자판에 맞춰 조합한다. 세벌식은 자판에 없는 글자가 섞이면 null. */
    public String convert(String word) {
        if (isTwo()) return HangulAssembler.convertEngToKor(word);
        return ThreeBeolAssembler.convert(word, id);
    }

    /** 선택 영역 변환: 세벌식은 자모 키가 이어진 부분만 바꾸고 나머지는 그대로 둔다 */
    public String convertText(String text) {
        if (isTwo()) return HangulAssembler.convertEngToKor(text);
        StringBuilder out = new StringBuilder();
        StringBuilder run = new StringBuilder();
        text.codePoints().forEach(cp -> {
            if (ThreeBeolAssembler.isHangulKey(id, cp)) {
                run.appendCodePoint(cp);
                return;
            }
            if (run.length() > 0) {
                out.append(ThreeBeolAssembler.convert(run.toString(), id));
                run.setLength(0);
            }
            out.appendCodePoint(cp);
        });
        if (run.length() > 0) out.append(ThreeBeolAssembler.convert(run.toString(), id));
        return out.toString();
    }
}
