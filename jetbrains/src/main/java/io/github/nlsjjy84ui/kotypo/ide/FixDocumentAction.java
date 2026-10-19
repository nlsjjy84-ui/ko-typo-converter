package io.github.nlsjjy84ui.kotypo.ide;

import com.intellij.notification.NotificationGroupManager;
import com.intellij.notification.NotificationType;
import com.intellij.openapi.actionSystem.ActionUpdateThread;
import com.intellij.openapi.actionSystem.AnAction;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.actionSystem.CommonDataKeys;
import com.intellij.openapi.editor.Document;
import com.intellij.openapi.editor.Editor;
import com.intellij.openapi.fileEditor.FileDocumentManager;
import com.intellij.openapi.vfs.VirtualFile;
import io.github.nlsjjy84ui.kotypo.core.Engine;
import java.util.List;
import org.jetbrains.annotations.NotNull;

/**
 * 지금 문서에서 한영 오타를 한 번에 고친다 (저장할 때 하는 것과 같은 판단).
 * 제외 목록에 있는 파일이어도, 직접 실행했으면 고친다.
 */
public final class FixDocumentAction extends AnAction {

    @Override
    public @NotNull ActionUpdateThread getActionUpdateThread() {
        return ActionUpdateThread.BGT;
    }

    @Override
    public void update(@NotNull AnActionEvent e) {
        e.getPresentation().setEnabled(e.getData(CommonDataKeys.EDITOR) != null);
    }

    @Override
    public void actionPerformed(@NotNull AnActionEvent e) {
        Editor editor = e.getData(CommonDataKeys.EDITOR);
        if (editor == null || e.getProject() == null) return;
        Document document = editor.getDocument();
        VirtualFile file = FileDocumentManager.getInstance().getFile(document);
        String languageId = LanguageIds.of(file == null ? "" : file.getName());
        List<Engine.Edit> edits = KoTypoService.engine().editsOnSave(document.getText(), languageId);
        if (!edits.isEmpty()) KoTypoService.getInstance().applyAll(e.getProject(), document, edits);
        NotificationGroupManager.getInstance().getNotificationGroup("Ko Typo Converter")
            .createNotification(edits.isEmpty() ? "고칠 한영 오타가 없습니다." : "한영 오타 " + edits.size() + "곳을 고쳤습니다.",
                NotificationType.INFORMATION)
            .notify(e.getProject());
    }
}
