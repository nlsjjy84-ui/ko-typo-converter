package io.github.nlsjjy84ui.kotypo.core;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.junit.Assert;
import org.junit.BeforeClass;
import org.junit.Test;

/**
 * VS Code 확장(자바스크립트 엔진)이 낸 답과 자바 엔진의 답을 하나하나 대조한다.
 * 기준 파일은 tools/make-fixtures.js로 만든다. 하나라도 다르면 실패한다.
 */
public class EngineParityTest {

    private static JsonObject fx;

    @BeforeClass
    public static void load() throws Exception {
        try (InputStreamReader r = new InputStreamReader(
            EngineParityTest.class.getResourceAsStream("/fixtures/parity.json"), StandardCharsets.UTF_8)) {
            fx = JsonParser.parseReader(r).getAsJsonObject();
        }
    }

    private static String str(JsonElement e) {
        return e == null || e.isJsonNull() ? null : e.getAsString();
    }

    @Test
    public void composeMatchesJs() {
        int n = 0;
        for (String id : new String[] {"2", "390", "3final"}) {
            KeyboardLayout layout = KeyboardLayout.get(id);
            for (JsonElement el : fx.getAsJsonObject("convert").getAsJsonArray(id)) {
                JsonArray c = el.getAsJsonArray();
                String in = c.get(0).getAsString();
                String expected = str(c.get(1));
                String actual = "2".equals(id) ? HangulAssembler.convertEngToKor(in) : ThreeBeolAssembler.convert(in, id);
                Assert.assertEquals(id + " convert " + in, expected, actual);
                Assert.assertEquals(id + " convertText " + in, c.get(2).getAsString(), layout.convertText(in));
                Assert.assertEquals(id + " isConvertible " + in, c.get(3).getAsBoolean(), layout.isConvertible(in));
                n++;
            }
        }
        Assert.assertTrue(n >= 18000);
    }

    @Test
    public void boundaryMatchesJs() {
        for (String id : new String[] {"2", "390", "3final"}) {
            for (JsonElement el : fx.getAsJsonObject("boundary").getAsJsonArray(id)) {
                JsonArray c = el.getAsJsonArray();
                Assert.assertEquals(id + " boundary [" + c.get(0).getAsString() + "]",
                    c.get(1).getAsBoolean(), KeyboardLayout.get(id).isBoundary(c.get(0).getAsString()));
            }
        }
    }

    @Test
    public void zonesMatchJs() {
        for (JsonElement el : fx.getAsJsonArray("zones")) {
            JsonArray c = el.getAsJsonArray();
            List<String> expected = new ArrayList<>();
            for (JsonElement z : c.get(2).getAsJsonArray()) {
                JsonArray a = z.getAsJsonArray();
                expected.add(a.get(0).getAsInt() + "-" + a.get(1).getAsInt() + ":" + str(a.get(2)));
            }
            List<String> actual = new ArrayList<>();
            for (ZoneDetector.Zone z : ZoneDetector.allZones(c.get(0).getAsString(), c.get(1).getAsString())) {
                actual.add(z.start + "-" + z.end + ":" + z.type);
            }
            Assert.assertEquals(c.get(1).getAsString() + "\n" + c.get(0).getAsString(), expected, actual);
        }
    }

    @Test
    public void saveEditsMatchJs() {
        int edits = 0;
        for (JsonElement el : fx.getAsJsonArray("save")) {
            JsonArray c = el.getAsJsonArray();
            Engine engine = new Engine(c.get(0).getAsString(), 50, true);
            String text = c.get(2).getAsString();
            List<String> expected = new ArrayList<>();
            for (JsonElement e : c.get(3).getAsJsonArray()) {
                JsonArray a = e.getAsJsonArray();
                expected.add(a.get(0).getAsInt() + "-" + a.get(1).getAsInt() + ":" + a.get(2).getAsString());
            }
            expected.sort(null);
            List<String> actual = new ArrayList<>();
            for (Engine.Edit e : engine.editsOnSave(text, c.get(1).getAsString())) {
                actual.add(e.start + "-" + e.end + ":" + e.replacement);
            }
            actual.sort(null);
            Assert.assertEquals(c.get(0).getAsString() + "/" + c.get(1).getAsString() + "\n" + text, expected, actual);
            edits += expected.size();
        }
        Assert.assertTrue("기준 파일에 바꿀 자리가 충분히 있어야 한다", edits > 1000);
    }

    @Test
    public void typingMatchesJs() {
        int applied = 0;
        for (JsonElement el : fx.getAsJsonArray("typing")) {
            JsonArray c = el.getAsJsonArray();
            Engine engine = new Engine(c.get(0).getAsString(), 50, true);
            String text = c.get(2).getAsString();
            int at = c.get(3).getAsInt();
            Engine.Edit edit = engine.wordFixEndingAt(text, at, c.get(1).getAsString());
            String expected = c.get(4).isJsonNull() ? null
                : c.get(4).getAsJsonArray().get(0).getAsInt() + "-" + c.get(4).getAsJsonArray().get(1).getAsInt()
                + ":" + c.get(4).getAsJsonArray().get(2).getAsString();
            String actual = edit == null ? null : edit.start + "-" + edit.end + ":" + edit.replacement;
            Assert.assertEquals(c.get(0).getAsString() + "/" + c.get(1).getAsString() + " @" + at + "\n" + text, expected, actual);
            if (expected != null) applied++;
        }
        Assert.assertTrue(applied > 50);
    }
}
