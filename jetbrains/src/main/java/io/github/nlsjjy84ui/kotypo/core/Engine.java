package io.github.nlsjjy84ui.kotypo.core;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 편집기와 상관없는 판단 로직 전체. extension.js에서 VS Code API를 쓰지 않는 부분을 그대로 옮겼다.
 * IntelliJ 쪽(ide 패키지)은 이 결과를 받아 문서에 적용만 한다.
 */
public final class Engine {

    /** 바꿀 자리 하나: [start, end) 글자를 replacement로 바꾼다. expected는 지금 그 자리에 있어야 할 글자. */
    public static final class Edit {
        public final int start;
        public final int end;
        public final String expected;
        public final String replacement;
        public final double confidence;

        public Edit(int start, int end, String expected, String replacement, double confidence) {
            this.start = start;
            this.end = end;
            this.expected = expected;
            this.replacement = replacement;
            this.confidence = confidence;
        }

        @Override
        public String toString() {
            return start + ":" + end + ":" + expected + "->" + replacement;
        }
    }

    private static final Pattern LEADING_NON_LETTERS = Pattern.compile("^[^a-zA-Z]+");
    private static final Pattern HANGUL_WORD = Pattern.compile("[가-힣ㄱ-ㅣ]+");
    private static final Pattern HANGUL_TAIL = Pattern.compile("[가-힣ㄱ-ㅣ]+\\z");

    private final KeyboardLayout layout;
    private final double threshold;
    private final boolean reverseEnabled;

    /**
     * @param layoutId "2" | "390" | "3final"
     * @param thresholdPercent 최소 신뢰도 0~100 (기본 50)
     */
    public Engine(String layoutId, int thresholdPercent, boolean reverseEnabled) {
        this.layout = KeyboardLayout.get(layoutId);
        this.threshold = Math.max(0, Math.min(100, thresholdPercent)) / 100.0;
        this.reverseEnabled = reverseEnabled;
    }

    public KeyboardLayout layout() {
        return layout;
    }

    /** { 시작 위치(단어 안), 바꿀 단어, 결과 } 또는 null */
    String[] resolveConvertible(String word) {
        List<String> tries = new ArrayList<>();
        tries.add(word);
        String stripped = LEADING_NON_LETTERS.matcher(word).replaceFirst("");
        if (!stripped.equals(word) && stripped.length() >= 3) tries.add(stripped);
        for (String w : tries) {
            if (!layout.isConvertible(w)) continue;
            if (WordLists.isCommonEnglishWord(w)) continue;
            String converted = layout.convert(w);
            if (converted == null || converted.equals(w) || !HangulAssembler.isFullyComposedHangul(converted)) continue;
            return new String[] {String.valueOf(word.length() - w.length()), w, converted};
        }
        return null;
    }

    /** 문서 전체에서 한글로 바꿀 후보 (저장할 때 쓰는 안전망). 겹치는 후보는 앞의 것만 남긴다. */
    public List<Edit> findCandidates(String text, String languageId) {
        List<Edit> out = new ArrayList<>();
        for (ZoneDetector.Zone zone : ZoneDetector.allZones(text, languageId)) {
            String zoneText = text.substring(zone.start, zone.end);
            Matcher m = layout.wordGlobal.matcher(zoneText);
            while (m.find()) {
                String[] r = resolveConvertible(m.group());
                if (r == null) continue;
                double confidence = Confidence.of(r[1], r[2], zone.type);
                if (confidence < threshold) continue;
                int abs = zone.start + m.start() + Integer.parseInt(r[0]);
                out.add(new Edit(abs, abs + r[1].length(), r[1], r[2], confidence));
            }
        }
        out.sort((a, b) -> Integer.compare(a.start, b.start));
        List<Edit> kept = new ArrayList<>();
        int lastEnd = -1;
        for (Edit e : out) {
            if (e.start < lastEnd) continue;
            kept.add(e);
            lastEnd = e.end;
        }
        return kept;
    }

    Map<String, String> reverseTable(String text) {
        List<String> all = new ArrayList<>(WordLists.PROGRAMMING_TERMS);
        all.addAll(ReverseMapper.documentIdentifiers(text));
        return ReverseMapper.buildTable(all, layout);
    }

    /** 코드 자리에서 한글로 잘못 쳐진 영어 용어 후보 */
    public List<Edit> findReverseCandidates(String text, String languageId) {
        List<Edit> out = new ArrayList<>();
        if (!reverseEnabled) return out;
        Map<String, String> table = reverseTable(text);
        List<ZoneDetector.Zone> zones = ZoneDetector.allZones(text, languageId);
        Matcher m = HANGUL_WORD.matcher(text);
        while (m.find()) {
            if (ZoneDetector.zoneAt(zones, m.start()) != null) continue;
            String restored = table.get(m.group());
            if (restored == null || restored.equals(m.group())) continue;
            out.add(new Edit(m.start(), m.end(), m.group(), restored, 1));
        }
        return out;
    }

    /** 저장할 때 적용할 편집 전체 (한글로 바꾸기 + 영어로 되돌리기), 겹치지 않게 앞에서부터 */
    public List<Edit> editsOnSave(String text, String languageId) {
        List<Edit> all = new ArrayList<>(findCandidates(text, languageId));
        all.addAll(findReverseCandidates(text, languageId));
        all.sort((a, b) -> Integer.compare(a.start, b.start));
        List<Edit> kept = new ArrayList<>();
        int lastEnd = -1;
        for (Edit e : all) {
            if (e.start < lastEnd) continue;
            kept.add(e);
            lastEnd = e.end;
        }
        return kept;
    }

    /**
     * 단어를 끝내는 글자를 친 순간(또는 잠깐 멈춘 순간) boundaryOffset 바로 앞의 단어를 볼 때.
     * 주석·문자열 안의 영문이면 한글로, 코드 자리의 한글이면 영어 용어로. 바꿀 게 없으면 null.
     */
    public Edit wordFixEndingAt(String text, int boundaryOffset, String languageId) {
        String before = text.substring(0, boundaryOffset);
        List<ZoneDetector.Zone> zones = null;

        Matcher m = layout.wordTail.matcher(before);
        if (m.find()) {
            String[] r = resolveConvertible(m.group());
            if (r != null) {
                int start = boundaryOffset - r[1].length();
                zones = ZoneDetector.allZones(text, languageId);
                if (ZoneDetector.zoneAt(zones, start) != null) {
                    return new Edit(start, boundaryOffset, r[1], r[2], 1);
                }
            }
        }

        if (!reverseEnabled) return null;
        Matcher h = HANGUL_TAIL.matcher(before);
        if (!h.find()) return null;
        String word = h.group();
        int start = boundaryOffset - word.length();
        if (zones == null) zones = ZoneDetector.allZones(text, languageId);
        if (ZoneDetector.zoneAt(zones, start) != null) return null;
        String restored = reverseTable(text).get(word);
        if (restored == null || restored.equals(word)) return null;
        return new Edit(start, boundaryOffset, word, restored, 1);
    }
}
