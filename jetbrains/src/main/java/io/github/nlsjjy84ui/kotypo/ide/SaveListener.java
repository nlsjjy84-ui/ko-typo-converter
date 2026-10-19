package io.github.nlsjjy84ui.kotypo.ide;

import com.intellij.openapi.editor.Document;
import com.intellij.openapi.fileEditor.FileDocumentManagerListener;
import org.jetbrains.annotations.NotNull;

/** 저장 직전에 남은 오타를 고친다 (plugin.xml의 applicationListeners). */
public final class SaveListener implements FileDocumentManagerListener {

    @Override
    public void beforeDocumentSaving(@NotNull Document document) {
        KoTypoService.getInstance().onBeforeSave(document);
    }
}
