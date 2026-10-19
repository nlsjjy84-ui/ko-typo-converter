package io.github.nlsjjy84ui.kotypo.ide;

import com.intellij.openapi.options.Configurable;
import com.intellij.ui.components.JBCheckBox;
import com.intellij.ui.components.JBTextField;
import com.intellij.util.ui.FormBuilder;
import javax.swing.JComboBox;
import javax.swing.JComponent;
import javax.swing.JPanel;
import javax.swing.JSpinner;
import javax.swing.SpinnerNumberModel;
import org.jetbrains.annotations.Nls;

/** Settings → Tools → 한영 타자 변환기 */
public final class KoTypoConfigurable implements Configurable {

    private static final String[] LAYOUT_IDS = {"2", "390", "3final"};
    private static final String[] LAYOUT_NAMES = {"2벌식 (표준 자판)", "세벌식 390", "세벌식 최종"};

    private JBCheckBox autoConvert;
    private JComboBox<String> layout;
    private JSpinner delay;
    private JSpinner threshold;
    private JBCheckBox reverse;
    private JBTextField exclude;

    @Override
    public @Nls String getDisplayName() {
        return "한영 타자 변환기";
    }

    @Override
    public JComponent createComponent() {
        autoConvert = new JBCheckBox("자동 변환 (스페이스·엔터, 잠깐 멈춤, 저장)");
        layout = new JComboBox<>(LAYOUT_NAMES);
        delay = new JSpinner(new SpinnerNumberModel(500, 100, 5000, 100));
        threshold = new JSpinner(new SpinnerNumberModel(50, 0, 100, 5));
        reverse = new JBCheckBox("코드 자리에서 한글로 잘못 친 영어 용어를 되돌리기 (예: 채ㅜ내ㅣㄷ → console)");
        exclude = new JBTextField();
        JPanel panel = FormBuilder.createFormBuilder()
            .addComponent(autoConvert)
            .addLabeledComponent("평소 쓰는 한글 자판:", layout)
            .addLabeledComponent("멈춘 뒤 변환까지 기다리는 시간(ms):", delay)
            .addLabeledComponent("최소 신뢰도(0~100):", threshold)
            .addComponent(reverse)
            .addLabeledComponent("바꾸지 않을 파일 (쉼표로 구분):", exclude)
            .addComponentFillVertically(new JPanel(), 0)
            .getPanel();
        reset();
        return panel;
    }

    private int layoutIndex(String id) {
        for (int i = 0; i < LAYOUT_IDS.length; i++) if (LAYOUT_IDS[i].equals(id)) return i;
        return 0;
    }

    @Override
    public boolean isModified() {
        KoTypoSettings.State s = KoTypoSettings.getInstance().getState();
        return autoConvert.isSelected() != s.autoConvert
            || layout.getSelectedIndex() != layoutIndex(s.keyboardLayout)
            || (int) delay.getValue() != s.autoConvertDelayMs
            || (int) threshold.getValue() != s.confidenceThreshold
            || reverse.isSelected() != s.reverseConvert
            || !exclude.getText().equals(s.excludePatterns);
    }

    @Override
    public void apply() {
        KoTypoSettings.State s = KoTypoSettings.getInstance().getState();
        s.autoConvert = autoConvert.isSelected();
        s.keyboardLayout = LAYOUT_IDS[Math.max(0, layout.getSelectedIndex())];
        s.autoConvertDelayMs = (int) delay.getValue();
        s.confidenceThreshold = (int) threshold.getValue();
        s.reverseConvert = reverse.isSelected();
        s.excludePatterns = exclude.getText();
    }

    @Override
    public void reset() {
        if (autoConvert == null) return;
        KoTypoSettings.State s = KoTypoSettings.getInstance().getState();
        autoConvert.setSelected(s.autoConvert);
        layout.setSelectedIndex(layoutIndex(s.keyboardLayout));
        delay.setValue(Math.max(100, s.autoConvertDelayMs));
        threshold.setValue(Math.max(0, Math.min(100, s.confidenceThreshold)));
        reverse.setSelected(s.reverseConvert);
        exclude.setText(s.excludePatterns);
    }
}
