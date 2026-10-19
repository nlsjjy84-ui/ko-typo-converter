package io.github.nlsjjy84ui.kotypo.ide;

import com.intellij.openapi.actionSystem.ActionUpdateThread;
import com.intellij.openapi.actionSystem.AnAction;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.actionSystem.CommonDataKeys;
import com.intellij.openapi.command.WriteCommandAction;
import com.intellij.openapi.editor.Caret;
import com.intellij.openapi.editor.Editor;
import io.github.nlsjjy84ui.kotypo.core.KeyboardLayout;
import org.jetbrains.annotations.NotNull;

/** 선택한 글자를 설정한 자판 기준으로 한글로 바꾼다 (Ctrl+Alt+Shift+K). 코드 자리여도 바꾼다. */
public final class ConvertSelectionAction extends AnAction {

    @Override
    public @NotNull ActionUpdateThread getActionUpdateThread() {
        return ActionUpdateThread.BGT;
    }

    @Override
    public void update(@NotNull AnActionEvent e) {
        Editor editor = e.getData(CommonDataKeys.EDITOR);
        e.getPresentation().setEnabled(editor != null && editor.getSelectionModel().hasSelection(true));
    }

    @Override
    public void actionPerformed(@NotNull AnActionEvent e) {
        Editor editor = e.getData(CommonDataKeys.EDITOR);
        if (editor == null || e.getProject() == null) return;
        KeyboardLayout layout = KeyboardLayout.get(KoTypoSettings.getInstance().getState().keyboardLayout);
        WriteCommandAction.runWriteCommandAction(e.getProject(), "선택 영역 한영 변환", null, () -> {
            for (Caret caret : editor.getCaretModel().getAllCarets()) {
                if (!caret.hasSelection()) continue;
                String original = caret.getSelectedText();
                if (original == null || original.isEmpty()) continue;
                editor.getDocument().replaceString(caret.getSelectionStart(), caret.getSelectionEnd(), layout.convertText(original));
            }
        });
    }
}
