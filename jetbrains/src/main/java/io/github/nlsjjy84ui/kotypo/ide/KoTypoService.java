package io.github.nlsjjy84ui.kotypo.ide;

import com.intellij.codeInsight.lookup.LookupManager;
import com.intellij.openapi.Disposable;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.application.ModalityState;
import com.intellij.openapi.command.CommandProcessor;
import com.intellij.openapi.command.WriteCommandAction;
import com.intellij.openapi.command.undo.UndoManager;
import com.intellij.openapi.components.Service;
import com.intellij.openapi.editor.Document;
import com.intellij.openapi.editor.Editor;
import com.intellij.openapi.editor.EditorFactory;
import com.intellij.openapi.editor.event.DocumentEvent;
import com.intellij.openapi.fileEditor.FileDocumentManager;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.util.TextRange;
import com.intellij.openapi.vfs.VirtualFile;
import com.intellij.testFramework.LightVirtualFile;
import com.intellij.util.Alarm;
import io.github.nlsjjy84ui.kotypo.core.Engine;
import java.util.List;

/**
 * 편집기에서 일어나는 일(글자 입력, 잠깐 멈춤, 저장)을 받아 엔진의 판단대로 문서를 고친다.
 * VS Code 확장의 extension.js에서 VS Code API를 쓰는 부분에 해당한다.
 */
@Service(Service.Level.APP)
public final class KoTypoService implements Disposable {

    static final String COMMAND_NAME = "한영 변환";

    private final Alarm alarm = new Alarm(Alarm.ThreadToUse.SWING_THREAD, this);
    /** 우리가 고치는 편집 때문에 다시 반응하지 않게 막는 표시 */
    private boolean applying;

    public static KoTypoService getInstance() {
        return ApplicationManager.getApplication().getService(KoTypoService.class);
    }

    private static KoTypoSettings settings() {
        return KoTypoSettings.getInstance();
    }

    static Engine engine() {
        KoTypoSettings.State s = settings().getState();
        return new Engine(s.keyboardLayout, s.confidenceThreshold, s.reverseConvert);
    }

    /** 이 문서를 다뤄도 되는지: 실제 파일이고, 제외 목록에 없어야 한다 */
    static VirtualFile targetFile(Document document) {
        VirtualFile file = FileDocumentManager.getInstance().getFile(document);
        if (file == null || file instanceof LightVirtualFile || !file.isWritable()) return null;
        if (settings().isExcluded(file.getName())) return null;
        return file;
    }

    private static Editor editorFor(Document document) {
        Editor[] editors = EditorFactory.getInstance().getEditors(document);
        for (Editor e : editors) {
            if (e.getProject() != null && !e.isViewer()) return e;
        }
        return null;
    }

    /** 글자가 바뀔 때마다 (editorFactoryDocumentListener에서 부른다) */
    void onDocumentChanged(DocumentEvent event) {
        if (applying) return;
        if (!settings().getState().autoConvert) return;
        Document document = event.getDocument();
        VirtualFile file = targetFile(document);
        if (file == null) return;
        Editor editor = editorFor(document);
        if (editor == null) return;
        Project project = editor.getProject();

        // 되돌리기(Ctrl+Z)로 돌아온 글자는 다시 바꾸지 않는다. 사용자가 일부러 되돌린 것이다.
        if (UndoManager.getInstance(project).isUndoOrRedoInProgress()) {
            alarm.cancelAllRequests();
            return;
        }

        String inserted = event.getNewFragment().toString();
        String languageId = LanguageIds.of(file.getName());
        Engine engine = engine();

        if (engine.layout().isBoundary(inserted)) {
            alarm.cancelAllRequests();
            Engine.Edit edit = engine.wordFixEndingAt(document.getText(), event.getOffset(), languageId);
            if (edit != null) {
                ApplicationManager.getApplication().invokeLater(
                    () -> apply(project, editor, document, edit), ModalityState.defaultModalityState(), project.getDisposed());
            }
            return;
        }

        // 그 밖의 입력이면, 잠깐 멈췄을 때 커서 바로 앞 단어를 한 번 더 본다
        alarm.cancelAllRequests();
        alarm.addRequest(() -> {
            if (editor.isDisposed() || project.isDisposed()) return;
            if (!settings().getState().autoConvert) return;
            int caret = editor.getCaretModel().getOffset();
            Engine.Edit edit = engine().wordFixEndingAt(document.getText(), caret, languageId);
            if (edit != null) apply(project, editor, document, edit);
        }, settings().delayMs());
    }

    /**
     * 한 단어를 바꾼다. 자동완성 목록이 떠 있으면 먼저 닫고, 그 사이 사용자가 글자를 고쳤으면
     * 손대지 않는다 (VS Code 확장의 applyWordFix와 같은 안전장치).
     */
    void apply(Project project, Editor editor, Document document, Engine.Edit edit) {
        if (project.isDisposed() || editor.isDisposed() || !document.isWritable()) return;
        LookupManager.hideActiveLookup(project);
        if (edit.end > document.getTextLength()) return;
        if (!document.getText(new TextRange(edit.start, edit.end)).equals(edit.expected)) return;
        applying = true;
        try {
            WriteCommandAction.runWriteCommandAction(project, COMMAND_NAME, null,
                () -> document.replaceString(edit.start, edit.end, edit.replacement));
        } finally {
            applying = false;
        }
    }

    /**
     * 저장 직전 안전망: 스페이스나 엔터 없이 저장해 버린 단어까지 문서 전체에서 고친다.
     * 뒤에서부터 바꿔야 앞쪽 위치가 밀리지 않는다.
     */
    void onBeforeSave(Document document) {
        if (applying || !settings().getState().autoConvert) return;
        VirtualFile file = targetFile(document);
        if (file == null) return;
        List<Engine.Edit> edits = engine().editsOnSave(document.getText(), LanguageIds.of(file.getName()));
        if (edits.isEmpty()) return;
        // 저장은 이미 쓰기 작업 안에서 불린다. IntelliJ의 "저장할 때 줄 끝 공백 지우기"와 같은 방식으로
        // 되돌리기 기록에 따로 남기지 않고 바로 고친다.
        applying = true;
        try {
            CommandProcessor.getInstance().runUndoTransparentAction(
                () -> ApplicationManager.getApplication().runWriteAction(() -> replaceAll(document, edits)));
        } finally {
            applying = false;
        }
    }

    /** 여러 곳을 한 번에 고친다 (저장, 문서 전체 고치기) */
    void applyAll(Project project, Document document, List<Engine.Edit> edits) {
        applying = true;
        try {
            WriteCommandAction.runWriteCommandAction(project, COMMAND_NAME, null, () -> replaceAll(document, edits));
        } finally {
            applying = false;
        }
    }

    private static void replaceAll(Document document, List<Engine.Edit> edits) {
        for (int i = edits.size() - 1; i >= 0; i--) {
            Engine.Edit e = edits.get(i);
            if (e.end > document.getTextLength()) continue;
            if (!document.getText(new TextRange(e.start, e.end)).equals(e.expected)) continue;
            document.replaceString(e.start, e.end, e.replacement);
        }
    }

    @Override
    public void dispose() {
    }
}
