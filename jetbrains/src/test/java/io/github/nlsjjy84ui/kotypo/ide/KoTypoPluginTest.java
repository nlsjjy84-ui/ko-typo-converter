package io.github.nlsjjy84ui.kotypo.ide;

import com.intellij.codeInsight.lookup.LookupManager;
import com.intellij.openapi.actionSystem.IdeActions;
import com.intellij.openapi.editor.Document;
import com.intellij.openapi.fileEditor.FileDocumentManager;
import com.intellij.testFramework.PlatformTestUtil;
import com.intellij.testFramework.fixtures.BasePlatformTestCase;

/**
 * 실제 IntelliJ 환경(테스트용 IDE)에서 플러그인이 붙어 동작하는지 확인한다:
 * 타이핑 → 문서 변경 리스너 → 엔진 → 문서 수정까지 한 번에.
 */
public class KoTypoPluginTest extends BasePlatformTestCase {

    private KoTypoSettings.State saved;

    @Override
    protected void setUp() throws Exception {
        super.setUp();
        KoTypoSettings.State s = KoTypoSettings.getInstance().getState();
        saved = new KoTypoSettings.State();
        saved.keyboardLayout = s.keyboardLayout;
        saved.autoConvertDelayMs = s.autoConvertDelayMs;
        saved.autoConvert = s.autoConvert;
        s.autoConvertDelayMs = 150;
    }

    @Override
    protected void tearDown() throws Exception {
        try {
            KoTypoSettings.State s = KoTypoSettings.getInstance().getState();
            s.keyboardLayout = saved.keyboardLayout;
            s.autoConvertDelayMs = saved.autoConvertDelayMs;
            s.autoConvert = saved.autoConvert;
        } finally {
            super.tearDown();
        }
    }

    private void flush() {
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue();
    }

    /** 멈춤 변환(Alarm)이 돌 때까지 기다린다 */
    private void waitFor(String expected) throws InterruptedException {
        long until = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < until) {
            flush();
            if (myFixture.getEditor().getDocument().getText().equals(expected)) return;
            Thread.sleep(20);
        }
        assertEquals(expected, myFixture.getEditor().getDocument().getText());
    }

    public void testSpaceConvertsWordInComment() {
        myFixture.configureByText("a.js", "// <caret>");
        myFixture.type("dkssudgktpdy ");
        flush();
        assertEquals("// 안녕하세요 ", myFixture.getEditor().getDocument().getText());
    }

    public void testCodeIsNotTouched() {
        myFixture.configureByText("a.js", "const a = <caret>");
        myFixture.type("dkssud ");
        flush();
        assertEquals("const a = dkssud ", myFixture.getEditor().getDocument().getText());
    }

    public void testCommonEnglishWordStays() {
        myFixture.configureByText("a.py", "# <caret>");
        myFixture.type("test city air ");
        flush();
        assertEquals("# test city air ", myFixture.getEditor().getDocument().getText());
    }

    public void testPauseConvertsWithoutBoundary() throws InterruptedException {
        myFixture.configureByText("a.js", "const s = \"<caret>\";");
        myFixture.type("rkatkgkqslek");
        waitFor("const s = \"감사합니다\";");
    }

    public void testEnterWithIndentConvertsAtOnce() {
        myFixture.configureByText("A.java", "class A {\n    void f() {\n        // <caret>\n    }\n}");
        KoTypoSettings.getInstance().getState().autoConvertDelayMs = 100000;
        myFixture.type("dkssud");
        myFixture.type("\n");
        flush();
        assertTrue(myFixture.getEditor().getDocument().getText(), myFixture.getEditor().getDocument().getText().contains("// 안녕\n"));
    }

    public void testReverseInCode() {
        myFixture.configureByText("a.js", "console.log(1);\n<caret>");
        myFixture.type("채ㅜ내ㅣㄷ.");
        flush();
        assertEquals("console.log(1);\nconsole.", myFixture.getEditor().getDocument().getText());
    }

    public void testSaveConvertsLeftovers() {
        myFixture.configureByText("a.py", "");
        Document doc = myFixture.getEditor().getDocument();
        // 저장은 바뀐 문서만 하므로, 내용을 넣어 바뀐 상태로 만든 뒤 저장한다
        com.intellij.openapi.command.WriteCommandAction.runWriteCommandAction(getProject(), () -> doc.insertString(0, "x = 1  # rkatkgkqslek"));
        FileDocumentManager.getInstance().saveDocument(doc);
        assertEquals("x = 1  # 감사합니다", doc.getText());
    }

    public void testSaveSkipsExcludedFiles() {
        myFixture.configureByText("notes.md", "");
        Document doc = myFixture.getEditor().getDocument();
        // 저장은 바뀐 문서만 하므로, 내용을 넣어 바뀐 상태로 만든 뒤 저장한다
        com.intellij.openapi.command.WriteCommandAction.runWriteCommandAction(getProject(), () -> doc.insertString(0, "<!-- rkatkgkqslek -->"));
        FileDocumentManager.getInstance().saveDocument(doc);
        assertEquals("<!-- rkatkgkqslek -->", doc.getText());
    }

    public void testOverlappingZonesSaveOnce() {
        myFixture.configureByText("a.js", "");
        Document doc = myFixture.getEditor().getDocument();
        // 저장은 바뀐 문서만 하므로, 내용을 넣어 바뀐 상태로 만든 뒤 저장한다
        com.intellij.openapi.command.WriteCommandAction.runWriteCommandAction(getProject(), () -> doc.insertString(0, "const a = \"(dkssud)\";"));
        FileDocumentManager.getInstance().saveDocument(doc);
        assertEquals("const a = \"(안녕)\";", doc.getText());
    }

    public void testUndoIsNotReverted() throws InterruptedException {
        myFixture.configureByText("a.js", "// <caret>");
        myFixture.type("dkssud ");
        flush();
        assertEquals("// 안녕 ", myFixture.getEditor().getDocument().getText());
        myFixture.performEditorAction(IdeActions.ACTION_UNDO);
        flush();
        String afterUndo = myFixture.getEditor().getDocument().getText();
        assertEquals("// dkssud ", afterUndo);
        Thread.sleep(400);
        flush();
        assertEquals("되돌린 글자를 다시 바꾸면 안 된다", afterUndo, myFixture.getEditor().getDocument().getText());
    }

    public void testUndoAfterPauseIsNotReverted() throws InterruptedException {
        myFixture.configureByText("a.js", "const s = \"<caret>\";");
        myFixture.type("rkatkgkqslek");
        waitFor("const s = \"감사합니다\";");
        myFixture.performEditorAction(IdeActions.ACTION_UNDO);
        flush();
        String afterUndo = myFixture.getEditor().getDocument().getText();
        assertEquals("const s = \"rkatkgkqslek\";", afterUndo);
        Thread.sleep(400);
        flush();
        assertEquals(afterUndo, myFixture.getEditor().getDocument().getText());
    }

    public void testThreeBeol390() {
        KoTypoSettings.getInstance().getState().keyboardLayout = "390";
        myFixture.configureByText("a.js", "// <caret>");
        myFixture.type("jfsheamfncj4 ");
        flush();
        assertEquals("// 안녕하세요 ", myFixture.getEditor().getDocument().getText());
    }

    public void testConvertSelectionAction() {
        myFixture.configureByText("a.txt", "<selection>dkssud gktpdy</selection>");
        myFixture.performEditorAction("KoTypo.ConvertSelection");
        assertEquals("안녕 하세요", myFixture.getEditor().getDocument().getText());
    }

    public void testFixDocumentAction() {
        myFixture.configureByText("a.js", "// dkssud\nconst x = \"rkatkgkqslek\";");
        myFixture.performEditorAction("KoTypo.FixDocument");
        assertEquals("// 안녕\nconst x = \"감사합니다\";", myFixture.getEditor().getDocument().getText());
    }

    public void testLookupIsClosedBeforeConverting() {
        myFixture.configureByText("a.txt", "dkssudHello dkssudWorld\n// dkssud<caret>");
        myFixture.completeBasic();
        assertNotNull("자동완성 목록이 떠 있는 상황을 만든다", LookupManager.getActiveLookup(myFixture.getEditor()));
        Document doc = myFixture.getEditor().getDocument();
        int end = doc.getTextLength();
        KoTypoService.getInstance().apply(getProject(), myFixture.getEditor(), doc,
            new io.github.nlsjjy84ui.kotypo.core.Engine.Edit(end - 6, end, "dkssud", "안녕", 1));
        assertNull("바꾸기 전에 목록을 닫아야 한다", LookupManager.getActiveLookup(myFixture.getEditor()));
        assertEquals("dkssudHello dkssudWorld\n// 안녕", doc.getText());
    }

    public void testEditSkippedWhenUserChangedWord() {
        myFixture.configureByText("a.js", "// hello!");
        Document doc = myFixture.getEditor().getDocument();
        KoTypoService.getInstance().apply(getProject(), myFixture.getEditor(), doc,
            new io.github.nlsjjy84ui.kotypo.core.Engine.Edit(3, 9, "dkssud", "안녕", 1));
        assertEquals("// hello!", doc.getText());
    }
}
