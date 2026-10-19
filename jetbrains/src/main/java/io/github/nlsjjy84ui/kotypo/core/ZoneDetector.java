package io.github.nlsjjy84ui.kotypo.core;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 한글로 바꿔도 되는 영역(주석, 문자열, 태그 안 글자, 안전한 소괄호)을 찾는다.
 * VS Code 확장의 zoneDetector.js와 같은 규칙이다. languageId도 VS Code의 이름을 그대로 쓴다
 * (파일 확장자에서 LanguageIds가 정한다).
 */
public final class ZoneDetector {

    /** 영역 하나. start 이상 end 미만. */
    public static final class Zone {
        public final int start;
        public final int end;
        public final String type;

        Zone(int start, int end, String type) {
            this.start = start;
            this.end = end;
            this.type = type;
        }
    }

    // 자바 정규식은 (a|b)* 반복을 재귀로 처리해 긴 문자열에서 스택이 넘칠 수 있다.
    // 두 갈래가 첫 글자로 갈리므로(역슬래시인지 아닌지) 소유 수량자(*+, ++)로 바꿔도 결과는 같다.
    // JS의 "."는 줄바꿈 4종(\n \r    )을 빼므로 그대로 맞춘다.
    private static final String ANY = "[^\\n\\r\\u2028\\u2029]";
    private static final String QUOTE = "\"(?:[^\"\\\\]++|\\\\" + ANY + ")*+\"|'(?:[^'\\\\]++|\\\\" + ANY + ")*+'|`(?:[^`\\\\]++|\\\\" + ANY + ")*+`";
    private static final String LINE_COMMENT = "//[^\\n]*";
    private static final String BLOCK_COMMENT = "/\\*[\\s\\S]*?\\*/";
    private static final String HASH_COMMENT = "#[^\\n]*";
    private static final String DASH_COMMENT = "--[^\\n]*";
    private static final String HTML_COMMENT = "<!--[\\s\\S]*?-->";

    static final Set<String> HASH_LANGS = set("python", "yaml", "shellscript", "dockerfile", "ruby", "perl",
        "powershell", "toml", "makefile", "properties", "r", "coffeescript", "sql");
    static final Set<String> DASH_LANGS = set("sql", "lua", "haskell");
    static final Set<String> HTML_LANGS = set("html", "xml", "vue", "markdown", "svelte");
    private static final Set<String> NO_LINE_COMMENT = new HashSet<>();
    private static final Set<String> NO_BLOCK_COMMENT = set("python", "yaml", "shellscript", "dockerfile", "ruby",
        "perl", "powershell", "toml", "makefile", "properties", "r", "coffeescript", "html", "xml", "vue", "markdown", "svelte");
    static final Set<String> TAG_TEXT_LANGS = set("html", "xml", "vue", "svelte", "markdown", "javascriptreact", "typescriptreact");

    private static final Pattern TAG_TEXT = Pattern.compile(">([^<>\\n]{1,300})</");
    private static final Pattern UNSAFE_INNER = Pattern.compile("[,;=.(){}\\[\\]:<>+\\-*/&|!?]");
    private static final Pattern CODE_ATTACHED = Pattern.compile("[A-Za-z0-9_ㄱ-ㆎ가-힣)}\\]=,.!&|+\\-*/<>]");

    static {
        NO_LINE_COMMENT.addAll(HASH_LANGS);
        NO_LINE_COMMENT.addAll(DASH_LANGS);
        NO_LINE_COMMENT.addAll(HTML_LANGS);
    }

    private ZoneDetector() {
    }

    private static Set<String> set(String... s) {
        return new HashSet<>(Arrays.asList(s));
    }

    static Pattern zonePattern(String languageId) {
        List<String> parts = new ArrayList<>();
        parts.add(QUOTE);
        if (!NO_LINE_COMMENT.contains(languageId)) parts.add(LINE_COMMENT);
        if (!NO_BLOCK_COMMENT.contains(languageId)) parts.add(BLOCK_COMMENT);
        if (HASH_LANGS.contains(languageId)) parts.add(HASH_COMMENT);
        if (DASH_LANGS.contains(languageId)) parts.add(DASH_COMMENT);
        if (HTML_LANGS.contains(languageId)) parts.add(HTML_COMMENT);
        return Pattern.compile(String.join("|", parts));
    }

    static List<Zone> safeBracketZones(String text) {
        List<Zone> zones = new ArrayList<>();
        int depth = 0;
        int start = -1;
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (ch == '(') {
                if (depth == 0) start = i;
                depth++;
            } else if (ch == ')') {
                depth--;
                if (depth == 0 && start != -1) {
                    String inner = text.substring(start + 1, i);
                    int b = start;
                    while (b > 0 && (text.charAt(b - 1) == ' ' || text.charAt(b - 1) == '\t')) b--;
                    String prev = b > 0 ? String.valueOf(text.charAt(b - 1)) : "";
                    boolean attached = !prev.isEmpty() && CODE_ATTACHED.matcher(prev).find();
                    if (!attached && !UNSAFE_INNER.matcher(inner).find()) {
                        zones.add(new Zone(start, i + 1, "bracket_paren_safe"));
                    }
                    start = -1;
                }
            }
        }
        return zones;
    }

    /** 문서 전체의 영역을 시작 위치 순으로 돌려준다. */
    public static List<Zone> allZones(String text, String languageId) {
        List<Zone> zones = new ArrayList<>();
        Matcher m = zonePattern(languageId).matcher(text);
        while (m.find()) {
            zones.add(new Zone(m.start(), m.end(), zoneType(m.group())));
        }
        if (TAG_TEXT_LANGS.contains(languageId)) {
            Matcher t = TAG_TEXT.matcher(text);
            while (t.find()) zones.add(new Zone(t.start(), t.end(), "tag_text"));
        }
        zones.addAll(safeBracketZones(text));
        zones.sort((a, b) -> Integer.compare(a.start, b.start));
        return zones;
    }

    static String zoneType(String zoneText) {
        if (zoneText.startsWith("//")) return "comment_line";
        if (zoneText.startsWith("/*")) return "comment_block";
        if (zoneText.startsWith("#")) return "comment_hash";
        if (zoneText.startsWith("--")) return "comment_dash";
        if (zoneText.startsWith("<!--")) return "comment_html";
        if (zoneText.startsWith("\"")) return "string_double";
        if (zoneText.startsWith("'")) return "string_single";
        if (zoneText.startsWith("`")) return "template_literal";
        if (zoneText.startsWith(">")) return "tag_text";
        return null;
    }

    /** offset이 어느 영역 안이면 그 영역 종류를, 아니면 null (끝 위치도 안으로 본다: JS와 같음) */
    public static String zoneAt(List<Zone> zones, int offset) {
        for (Zone z : zones) {
            if (offset >= z.start && offset <= z.end) return z.type;
            if (z.start > offset) break;
        }
        return null;
    }
}
