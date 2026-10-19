package io.github.nlsjjy84ui.kotypo.ide;

import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.components.PersistentStateComponent;
import com.intellij.openapi.components.Service;
import com.intellij.openapi.components.State;
import com.intellij.openapi.components.Storage;
import com.intellij.util.xmlb.XmlSerializerUtil;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import org.jetbrains.annotations.NotNull;

/** 설정 (Settings → Tools → 한영 타자 변환기). 기본값은 VS Code 확장과 같다. */
@Service(Service.Level.APP)
@State(name = "KoTypoSettings", storages = @Storage("ko-typo-converter.xml"))
public final class KoTypoSettings implements PersistentStateComponent<KoTypoSettings.State> {

    public static final class State {
        public boolean autoConvert = true;
        /** "2" 2벌식, "390" 세벌식 390, "3final" 세벌식 최종 */
        public String keyboardLayout = "2";
        public int confidenceThreshold = 50;
        public int autoConvertDelayMs = 500;
        public boolean reverseConvert = true;
        public String excludePatterns = "*.md, *.txt, package.json";
    }

    private State state = new State();

    public static KoTypoSettings getInstance() {
        return ApplicationManager.getApplication().getService(KoTypoSettings.class);
    }

    @Override
    public @NotNull State getState() {
        return state;
    }

    @Override
    public void loadState(@NotNull State loaded) {
        XmlSerializerUtil.copyBean(loaded, state);
    }

    public int delayMs() {
        return state.autoConvertDelayMs >= 100 ? state.autoConvertDelayMs : 500;
    }

    /** 제외할 파일 이름인지 ("*.md" 같은 간단한 패턴, 대소문자 무시) */
    public boolean isExcluded(String fileName) {
        for (Pattern p : excludeRegexes()) {
            if (p.matcher(fileName).matches()) return true;
        }
        return false;
    }

    private List<Pattern> excludeRegexes() {
        List<Pattern> out = new ArrayList<>();
        for (String raw : state.excludePatterns.split(",")) {
            String glob = raw.trim();
            if (glob.isEmpty()) continue;
            StringBuilder re = new StringBuilder();
            for (char c : glob.toCharArray()) {
                if (c == '*') re.append(".*");
                else if (c == '?') re.append('.');
                else re.append(Pattern.quote(String.valueOf(c)));
            }
            out.add(Pattern.compile(re.toString(), Pattern.CASE_INSENSITIVE));
        }
        return out;
    }
}
