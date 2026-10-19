package io.github.nlsjjy84ui.kotypo.ide;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * 파일 이름 → VS Code의 languageId. 주석 모양(#, --, &lt;!-- --&gt;)과 태그 안 글자 인식을
 * VS Code 확장과 똑같이 맞추려고 같은 이름을 쓴다. 목록에 없으면 // 와 /* *&#47; 를 쓰는 언어로 본다.
 */
final class LanguageIds {

    private static final Map<String, String> BY_EXT = new HashMap<>();
    private static final Map<String, String> BY_NAME = new HashMap<>();

    static {
        put("python", "py", "pyw", "pyi");
        put("yaml", "yml", "yaml");
        put("shellscript", "sh", "bash", "zsh");
        put("dockerfile", "dockerfile");
        put("ruby", "rb");
        put("perl", "pl", "pm");
        put("powershell", "ps1", "psm1");
        put("toml", "toml");
        put("makefile", "mk");
        put("properties", "properties", "ini", "cfg");
        put("r", "r");
        put("coffeescript", "coffee");
        put("sql", "sql");
        put("lua", "lua");
        put("haskell", "hs");
        put("html", "html", "htm");
        put("xml", "xml", "xsd", "xsl", "svg");
        put("vue", "vue");
        put("markdown", "md", "markdown");
        put("svelte", "svelte");
        put("javascriptreact", "jsx");
        put("typescriptreact", "tsx");
        put("javascript", "js", "mjs", "cjs");
        put("typescript", "ts");
        put("java", "java");
        put("kotlin", "kt", "kts");
        BY_NAME.put("dockerfile", "dockerfile");
        BY_NAME.put("makefile", "makefile");
    }

    private LanguageIds() {
    }

    private static void put(String id, String... exts) {
        for (String e : exts) BY_EXT.put(e, id);
    }

    static String of(String fileName) {
        String lower = fileName.toLowerCase(Locale.ROOT);
        String byName = BY_NAME.get(lower);
        if (byName != null) return byName;
        int dot = lower.lastIndexOf('.');
        if (dot < 0) return "plaintext";
        return BY_EXT.getOrDefault(lower.substring(dot + 1), "plaintext");
    }
}
