const vscode = require('vscode');
const { convertEngToKor, isConvertibleAlphabet } = require('./hangulAssembler');
// 버그 수정 (2026-09-24): 실제 파일명은 confidenceCalculator.js인데 './confidence'를
// require하고 있어서 활성화 즉시 "Cannot find module" 에러로 확장이 죽고 있었다.
const { calculateConfidence, confidenceLabel } = require('./confidenceCalculator');

const diagnosticCollection = vscode.languages.createDiagnosticCollection('ko-typo-converter');

// 저장 시 Diagnostics로 보여줄 최소 신뢰도는 ko-typo.confidenceThreshold 설정에서 가져온다
// (아래 getConfidenceThreshold() 참고, 기본값 70점 = 0.7).
// 타이핑 중 "자동으로 바로 바꿔치기"할 최소 신뢰도 (오탐 방지를 위해 더 높게 잡음)
// 버그 수정 (2026-09-24): README/설정 설명에는 "90점 이상 자동 변환"이라고 문서화되어
// 있는데 실제 코드는 0.75(=75점)로 자동 변환을 해버리고 있어서 문서와 동작이 달랐다.
// 문서 기준(90점)에 맞춰 0.9로 올린다.
const AUTO_CONVERT_THRESHOLD = 0.9;

// 주석/문자열 영역을 찾는 정규식 (extension.js 전체에서 재사용)
const ZONE_REGEX = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
const WORD_REGEX = /[a-zA-Z]{3,}/g;

// 버그 수정 (2026-09-24): package.json/README에는 ko-typo.autoConvert,
// ko-typo.confidenceThreshold, ko-typo.showDiagnostics, ko-typo.excludePatterns 네 가지
// 설정이 문서화되어 있는데, 실제로는 어디서도 vscode.workspace.getConfiguration()으로
// 읽어오질 않아서 사용자가 설정을 바꿔도 아무 효과가 없었다. 아래 헬퍼들로 실제 동작에
// 반영한다.
function getConfig() {
  return vscode.workspace.getConfiguration('ko-typo');
}

function isAutoConvertEnabled() {
  return getConfig().get('autoConvert', true);
}

function isDiagnosticsEnabled() {
  return getConfig().get('showDiagnostics', true);
}

/** 설정의 confidenceThreshold(0~100)를 내부에서 쓰는 0~1 스케일로 변환 */
function getConfidenceThreshold() {
  const raw = getConfig().get('confidenceThreshold', 70);
  const clamped = Math.max(0, Math.min(100, Number(raw) || 0));
  return clamped / 100;
}

function getExcludePatterns() {
  return getConfig().get('excludePatterns', ['*.md', '*.txt', 'package.json']);
}

/** 간단한 글롭 패턴("*.md" 등)을 정규식으로 변환 */
function globToRegExp(glob) {
  const escaped = String(glob).replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${pattern}$`, 'i');
}

/** @param {import('vscode').TextDocument} document */
function isExcludedDocument(document) {
  const fileName = document.uri.fsPath.split(/[\\/]/).pop() || '';
  return getExcludePatterns().some((pattern) => globToRegExp(pattern).test(fileName));
}

/**
 * 개선 (2026-09-24): confidenceCalculator는 컨텍스트 타입(string_double, comment_line 등)에
 * 따라 보너스 점수를 주도록 만들어져 있었는데, 지금까지 아무 데서도 그 값을 넘겨주지 않아서
 * 이 보너스가 전혀 적용되지 않고 있었다. zoneText의 시작 부분을 보고 어떤 종류의 영역인지
 * 판별해서 넘겨준다.
 * @param {string} zoneText
 */
function getZoneType(zoneText) {
  if (zoneText.startsWith('//')) return 'comment_line';
  if (zoneText.startsWith('/*')) return 'comment_block';
  if (zoneText.startsWith('"')) return 'string_double';
  if (zoneText.startsWith("'")) return 'string_single';
  if (zoneText.startsWith('`')) return 'template_literal';
  return null;
}

/**
 * 문서에서 "주석"과 "문자열 리터럴" 영역만 골라 영단어 후보를 찾는다.
 * @param {import('vscode').TextDocument} document
 */
function findCandidates(document) {
  const text = document.getText();
  const candidates = [];

  ZONE_REGEX.lastIndex = 0;
  let zoneMatch;
  while ((zoneMatch = ZONE_REGEX.exec(text)) !== null) {
    const zoneText = zoneMatch[0];
    const zoneStart = zoneMatch.index;
    const zoneType = getZoneType(zoneText);

    WORD_REGEX.lastIndex = 0;
    let wordMatch;
    while ((wordMatch = WORD_REGEX.exec(zoneText)) !== null) {
      const word = wordMatch[0];
      if (!isConvertibleAlphabet(word)) continue;

      const converted = convertEngToKor(word);
      const confidence = calculateConfidence(word, converted, zoneType);
      if (confidence < getConfidenceThreshold()) continue;

      const absoluteStart = zoneStart + wordMatch.index;
      const startPos = document.positionAt(absoluteStart);
      const endPos = document.positionAt(absoluteStart + word.length);

      candidates.push({
        range: new vscode.Range(startPos, endPos),
        original: word,
        converted,
        confidence,
      });
    }
  }

  return candidates;
}

/** @param {import('vscode').TextDocument} document */
function refreshDiagnostics(document) {
  if (document.uri.scheme !== 'file') return;

  // ko-typo.showDiagnostics가 꺼져 있으면 표시하지 않는다 (이미 떠 있던 것도 지운다)
  if (!isDiagnosticsEnabled()) {
    diagnosticCollection.delete(document.uri);
    return;
  }

  // ko-typo.excludePatterns에 걸리는 파일은 건드리지 않는다
  if (isExcludedDocument(document)) {
    diagnosticCollection.delete(document.uri);
    return;
  }

  const candidates = findCandidates(document);
  const diagnostics = candidates.map((c) => {
    const severity =
      c.confidence >= 0.7 ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Hint;
    const diag = new vscode.Diagnostic(
      c.range,
      `한영 오타 의심: "${c.original}" → "${c.converted}" (신뢰도: ${confidenceLabel(c.confidence)})`,
      severity
    );
    diag.code = 'ko-typo-suggestion';
    diag.source = 'ko-typo-converter';
    return diag;
  });

  diagnosticCollection.set(document.uri, diagnostics);
}

class KoTypoCodeActionProvider {
  provideCodeActions(document, range, context) {
    const actions = [];

    for (const diag of context.diagnostics) {
      if (diag.source !== 'ko-typo-converter') continue;

      const original = document.getText(diag.range);
      const converted = convertEngToKor(original);

      const action = new vscode.CodeAction(
        `"${converted}"(으)로 변환`,
        vscode.CodeActionKind.QuickFix
      );
      action.edit = new vscode.WorkspaceEdit();
      action.edit.replace(document.uri, diag.range, converted);
      action.diagnostics = [diag];
      action.isPreferred = true;
      actions.push(action);
    }

    return actions;
  }
}

/**
 * 주어진 오프셋이 주석/문자열 영역 안에 있는지 확인한다.
 * 개선 (2026-09-24): 단순 boolean 대신 영역 타입(zoneType)까지 반환해서, 호출하는 쪽에서
 * calculateConfidence에 컨텍스트를 넘겨줄 수 있게 했다.
 * @param {string} text
 * @param {number} offset
 * @returns {string|null} - 영역 타입 (string_double 등) 또는 영역 밖이면 null
 */
function isInsideZone(text, offset) {
  ZONE_REGEX.lastIndex = 0;
  let zoneMatch;
  while ((zoneMatch = ZONE_REGEX.exec(text)) !== null) {
    const start = zoneMatch.index;
    const end = start + zoneMatch[0].length;
    if (offset >= start && offset <= end) return getZoneType(zoneMatch[0]);
    if (start > offset) break; // 정렬되어 있으므로 더 뒤질 필요 없음
  }
  return null;
}

// 우리 자신이 만든 edit 때문에 onDidChangeTextDocument가 다시 트리거되는 걸 막는 플래그
let isApplyingAutoFix = false;

/**
 * 타이핑 중 방금 완성된 단어를 검사해서, 신뢰도가 충분히 높으면
 * 자동완성처럼 바로 한글로 바꿔치기한다.
 * @param {import('vscode').TextDocumentChangeEvent} event
 */
function handleLiveTyping(event) {
  if (isApplyingAutoFix) return;
  if (event.document.uri.scheme !== 'file') return;
  if (event.contentChanges.length === 0) return;

  // ko-typo.autoConvert가 꺼져 있으면 타이핑 중 자동 변환은 하지 않는다
  // (수동 커맨드/코드 액션 제안은 이 설정과 무관하게 계속 동작한다)
  if (!isAutoConvertEnabled()) return;
  if (isExcludedDocument(event.document)) return;

  const change = event.contentChanges[event.contentChanges.length - 1];
  const insertedText = change.text;

  // 단어 경계 문자(스페이스/엔터/흔한 구두점)를 막 입력했을 때만 검사
  if (!/^[ \t\n.,!?;:)\]}"'`]$/.test(insertedText)) return;

  const document = event.document;
  const boundaryOffset = document.offsetAt(change.range.start);
  const fullText = document.getText();

  const beforeText = fullText.slice(0, boundaryOffset);
  const wordMatch = beforeText.match(/[a-zA-Z]{3,}$/);
  if (!wordMatch) return;

  const word = wordMatch[0];
  const wordStartOffset = boundaryOffset - word.length;

  // 코드(식별자) 영역은 건드리지 않고, 주석/문자열 안에서만 자동 변환
  const zoneType = isInsideZone(fullText, wordStartOffset);
  if (!zoneType) return;

  const converted = convertEngToKor(word);
  const confidence = calculateConfidence(word, converted, zoneType);
  if (confidence < AUTO_CONVERT_THRESHOLD) return;
  if (converted === word) return; // 변환해도 똑같으면 스킵

  const editor = vscode.window.visibleTextEditors.find(
    (e) => e.document.uri.toString() === document.uri.toString()
  );
  if (!editor) return;

  const wordRange = new vscode.Range(
    document.positionAt(wordStartOffset),
    document.positionAt(boundaryOffset)
  );

  isApplyingAutoFix = true;
  editor
    .edit((editBuilder) => {
      editBuilder.replace(wordRange, converted);
    })
    .then(() => {
      isApplyingAutoFix = false;
    }, () => {
      isApplyingAutoFix = false;
    });
}

/** @param {import('vscode').ExtensionContext} context */
function activate(context) {
  // 버그 수정 (2026-09-24): package.json에는 'ko-typo.convert'/'ko-typo.scanDocument'로
  // 커맨드가 선언되어 있는데(단축키도 'ko-typo.convert'에 걸려있음), 여기서는 완전히 다른
  // ID('ko-typo-converter.convertSelection' 등)로 등록하고 있어서 커맨드 팔레트/단축키가
  // 전부 "커맨드를 찾을 수 없음" 상태였다. package.json과 ID를 맞춘다.

  // 1) 선택 영역을 즉시 변환하는 커맨드 (수동)
  const convertSelectionCmd = vscode.commands.registerCommand(
    'ko-typo.convert',
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      editor.edit((editBuilder) => {
        for (const selection of editor.selections) {
          const original = editor.document.getText(selection);
          if (!original) continue;
          const converted = convertEngToKor(original);
          editBuilder.replace(selection, converted);
        }
      });
    }
  );

  // 2) 현재 문서 전체를 스캔해서 오타 후보를 Diagnostics로 표시 (신뢰도 낮은 것까지 포함해서 검토용)
  const scanDocumentCmd = vscode.commands.registerCommand(
    'ko-typo.scanDocument',
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      refreshDiagnostics(editor.document);
      vscode.window.showInformationMessage('한영 오타 스캔 완료');
    }
  );

  // 3) 타이핑 중 실시간 자동 변환 (신뢰도 높은 것만)
  vscode.workspace.onDidChangeTextDocument(handleLiveTyping, null, context.subscriptions);

  // 저장/열기 시 Diagnostics 갱신 (놓친 것들 검토용)
  vscode.workspace.onDidSaveTextDocument(refreshDiagnostics, null, context.subscriptions);
  vscode.workspace.onDidOpenTextDocument(refreshDiagnostics, null, context.subscriptions);

  const codeActionProvider = vscode.languages.registerCodeActionsProvider(
    { scheme: 'file' },
    new KoTypoCodeActionProvider(),
    { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
  );

  context.subscriptions.push(
    convertSelectionCmd,
    scanDocumentCmd,
    codeActionProvider,
    diagnosticCollection
  );

  if (vscode.window.activeTextEditor) {
    refreshDiagnostics(vscode.window.activeTextEditor.document);
  }
}

function deactivate() {
  diagnosticCollection.clear();
  diagnosticCollection.dispose();
}

module.exports = { activate, deactivate };
