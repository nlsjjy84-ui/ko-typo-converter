package io.github.nlsjjy84ui.kotypo.ide;

import com.intellij.openapi.editor.event.DocumentEvent;
import com.intellij.openapi.editor.event.DocumentListener;
import org.jetbrains.annotations.NotNull;

/** 모든 편집기 문서의 변경을 받는다 (plugin.xml의 editorFactoryDocumentListener). */
public final class TypingListener implements DocumentListener {

    @Override
    public void documentChanged(@NotNull DocumentEvent event) {
        KoTypoService.getInstance().onDocumentChanged(event);
    }
}
