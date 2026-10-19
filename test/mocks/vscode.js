// extension.js 테스트용 최소 vscode API 목(mock).
// 실제 vscode 모듈 대신 이걸 require해서, VS Code 없이도 onWillSaveTextDocument 로직을 검증한다.

class Range {
  constructor(start, end) { this.start = start; this.end = end; }
}
class Position {
  constructor(offset) { this.offset = offset; } // 단순화: 줄/컬럼 대신 오프셋만 저장
}
class Diagnostic {
  constructor(range, message, severity) {
    this.range = range; this.message = message; this.severity = severity;
  }
}
class CodeAction {
  constructor(title, kind) { this.title = title; this.kind = kind; }
}
class WorkspaceEdit {
  replace() {}
}
const TextEdit = {
  replace: (range, newText) => ({ range, newText }),
};

const registered = { onDidChangeTextDocument: [], onDidSaveTextDocument: [], onDidOpenTextDocument: [], onWillSaveTextDocument: [] };

// 테스트에서 특정 설정값을 강제로 override하고 싶을 때 쓰는 저장소 (예: autoConvertDelayMs)
const configOverrides = {};

const workspace = {
  getConfiguration: () => ({
    get: (key, def) => (key in configOverrides ? configOverrides[key] : def),
  }),
  onDidChangeTextDocument: (fn) => { registered.onDidChangeTextDocument.push(fn); return { dispose(){} }; },
  onDidSaveTextDocument: (fn) => { registered.onDidSaveTextDocument.push(fn); return { dispose(){} }; },
  onDidOpenTextDocument: (fn) => { registered.onDidOpenTextDocument.push(fn); return { dispose(){} }; },
  onWillSaveTextDocument: (fn) => { registered.onWillSaveTextDocument.push(fn); return { dispose(){} }; },
};

module.exports = {
  Range, Position, Diagnostic, CodeAction, WorkspaceEdit, TextEdit,
  DiagnosticSeverity: { Warning: 1, Hint: 2 },
  TextDocumentChangeReason: { Undo: 1, Redo: 2 },
  CodeActionKind: { QuickFix: 'quickfix' },
  languages: {
    createDiagnosticCollection: () => ({ set(){}, delete(){}, clear(){}, dispose(){} }),
    registerCodeActionsProvider: () => ({ dispose(){} }),
  },
  commands: {
    registerCommand: () => ({ dispose(){} }),
    // v0.1.0: 자동완성 목록 닫기(hideSuggestWidget) 호출을 테스트에서 확인하기 위해 기록한다
    executed: [],
    executeCommand(id) { this.executed.push(id); return Promise.resolve(); },
  },
  window: {
    activeTextEditor: undefined,
    visibleTextEditors: [],
  },
  workspace,
  __registered: registered, // 테스트에서 캡처한 콜백을 꺼내 쓰기 위한 뒷문
  __setConfig: (key, value) => { configOverrides[key] = value; },
  __resetConfig: () => { for (const k of Object.keys(configOverrides)) delete configOverrides[k]; },
};
