const vscode = require('vscode');
const { convertEngToKor, isConvertibleAlphabet, isFullyComposedHangul } = require('./hangulAssembler');
// 버그 수정 (2026-09-24): 실제 파일명은 confidenceCalculator.js인데 './confidence'를
// require하고 있어서 활성화 즉시 "Cannot find module" 에러로 확장이 죽고 있었다.
const { calculateConfidence, confidenceLabel } = require('./confidenceCalculator');
// 설계 변경 (2026-09-24): 아래 설명 참고 - 진짜 영어 단어를 걸러내는 블록리스트.
const { isCommonEnglishWord } = require('./commonEnglishWords');
// 기능 추가 (2026-09-29, 사용자 요청): "영어인데 문법이 한글이면 한글로" 뿐 아니라
// "한글로 쳐졌는데 사실 그 프로그램의 함수/키워드 등 정해진 영어 용어였다면 그것도
// 되돌려야 한다"는 반대 방향 요청 - reverseMapper.js/programmingTerms.js 참고.
const { buildReverseLookupTable, collectDocumentIdentifiers } = require('./reverseMapper');
const { TERMS: PROGRAMMING_TERMS } = require('./programmingTerms');
// 리팩터링 (2026-09-30, 사용자 요청): "띄어쓰기/괄호/주석/따옴표/태그" 전부가 실제로
// 동작하는지 점검하다가, contextDetector.js의 태그(detectTags)·괄호(detectBrackets) 감지가
// 실제 변환 파이프라인에 전혀 연결되지 않은 죽은 코드였다는 걸 발견했다. 아래 ZONE_REGEX
// 기반의 순수 주석/문자열 감지만 실제로 쓰이고 있었던 것 - 그래서 태그/괄호(안전하게 좁힌
// 조건)와 언어별 주석 스타일(#, --, <!-- -->)까지 실제로 인식하도록 zoneDetector.js로
// 분리/확장했다. 자세한 안전장치 설계는 zoneDetector.js 주석 참고.
const { getAllZones } = require('./zoneDetector');

const diagnosticCollection = vscode.languages.createDiagnosticCollection('ko-typo-converter');

// 설계 변경 (2026-09-24): 처음엔 "신뢰도 점수가 임계값을 넘으면 자동변환"하는 방식이었는데,
// 이건 애초에 잘못된 접근이었다 (사용자 피드백으로 정정). 점수를 아무리 잘 조정해도
// "이 단어가 진짜 영어인지 한글 오타인지"를 애매하게 판정할 뿐이고, 실제 2벌식 한글
// 입력기가 하는 일은 그게 아니다 - "이 자모 조합이 문법적으로 완성된 한글 음절을
// 이루는가"만 보고 그렇다면 바로 바꿔주는 것뿐이다. 실제로 영단어가 2벌식으로 조합됐을
// 때 완전한 한글 음절로 깔끔하게 맞아떨어지는 경우는 거의 없다 (예: "test"는 자음만
// 내리 4개라 완성된 음절이 하나도 안 나오고 홀로 남은 자모 "ㅅ"만 남는다). 그래서
// 이제는 점수가 아니라 hangulAssembler.js의 isFullyComposedHangul() - "결과가 완전히
// 조합된 한글 음절로만 이루어져 있는가" - 가 자동변환 여부를 가르는 진짜 기준이다.
// confidenceCalculator의 점수는 이제 게이트가 아니라 Diagnostics에 표시되는 참고
// 정보(심각도/레이블)로만 쓰인다.
// 저장 시 Diagnostics로 보여줄 최소 신뢰도는 ko-typo.confidenceThreshold 설정에서 가져온다
// (아래 getConfidenceThreshold() 참고, 기본값 50점 = 0.5) - 다만 이것도 필수 조건이
// 아니라, 이미 "완성된 한글 음절"이라는 1차 기준을 통과한 후보들 중에서 추가로
// 걸러내고 싶을 때 쓰는 보조 설정이다.

const WORD_REGEX = /[a-zA-Z]{3,}/g;
// 반대 방향(한글 → 영어) 후보를 찾을 때 쓰는 정규식 - 완성된 한글 음절 1글자 이상.
// (예: "error"가 한글로 잘못 조합되면 음절 1개("객")짜리가 되므로 2글자 이상으로
// 제한하면 이런 흔한 키워드를 놓친다 - 대신 사전 완전일치로만 판단해 안전하게 좁힌다.)
const HANGUL_WORD_REGEX = /[가-힣]+/g;

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

/** 반대 방향(한글로 잘못 쳐진 영어 용어를 되돌리는 기능)이 켜져 있는지 */
function isReverseConvertEnabled() {
  return getConfig().get('reverseConvert', true);
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
 * 문서에서 "컨텍스트 존"(주석/문자열/태그 내부 텍스트/안전한 괄호) 영역만 골라
 * 영단어 후보를 찾는다.
 * 개선 (2026-09-30): 예전엔 ZONE_REGEX로 주석/문자열만 봤는데, zoneDetector.js의
 * getAllZones()로 바꿔서 태그 내부 텍스트/안전한 괄호/언어별 주석 스타일(#, --, <!-- -->)
 * 까지 문서의 languageId에 맞게 함께 인식한다.
 * @param {import('vscode').TextDocument} document
 */
function findCandidates(document) {
  const text = document.getText();
  const candidates = [];

  const zones = getAllZones(text, document.languageId);
  for (const zone of zones) {
    const zoneText = text.slice(zone.start, zone.end);
    const zoneStart = zone.start;
    const zoneType = zone.type;

    WORD_REGEX.lastIndex = 0;
    let wordMatch;
    while ((wordMatch = WORD_REGEX.exec(zoneText)) !== null) {
      const word = wordMatch[0];
      if (!isConvertibleAlphabet(word)) continue;
      // 진짜 영단어일 가능성이 높으면 애초에 후보에서 제외 (오탐 방지 1차 안전장치)
      if (isCommonEnglishWord(word)) continue;

      const converted = convertEngToKor(word);
      // 핵심 판단 기준: 결과가 "완전히 조합된 한글 음절"인가 (점수가 아니라 문법 여부)
      if (converted === word || !isFullyComposedHangul(converted)) continue;

      const confidence = calculateConfidence(word, converted, zoneType);
      // 신뢰도는 이제 게이트가 아니라 보조 필터 (기본값 50점이라 대부분 통과함)
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

/**
 * 문서별 "영어 → 한글" 역방향 조회 표 캐시. document.version이 바뀌지 않는 한(= 타이핑이
 * 멈춰있는 동안) 매번 새로 계산하지 않기 위한 것 - 표를 만들려면 문서 안의 모든 식별자를
 * 훑고 프로그래밍 키워드 전체를 순변환해야 해서, 키 입력마다 다시 계산하면 낭비가 크다.
 */
const reverseTableCache = new Map(); // document.uri 문자열 -> { version, table }

/** @param {import('vscode').TextDocument} document */
function getReverseTableForDocument(document) {
  const key = document.uri.toString();
  const cached = reverseTableCache.get(key);
  if (cached && cached.version === document.version) return cached.table;

  const text = document.getText();
  const docIdentifiers = collectDocumentIdentifiers(text);
  const table = buildReverseLookupTable([...PROGRAMMING_TERMS, ...docIdentifiers]);
  reverseTableCache.set(key, { version: document.version, table });
  return table;
}

/**
 * 문서에서 "사실은 영어 용어였는데 한글로 조합돼버린" 후보들을 찾는다. 코드(식별자/키워드)
 * 자리만 대상으로 한다 - 주석/문자열 안의 한글은 진짜 한글 문장/설명일 가능성이 훨씬 높으므로
 * 건드리지 않는다 (findCandidates가 반대로 주석/문자열 "안"만 보는 것과 대칭).
 * @param {import('vscode').TextDocument} document
 */
function findReverseCandidates(document) {
  if (!isReverseConvertEnabled()) return [];

  const text = document.getText();
  const table = getReverseTableForDocument(document);
  const candidates = [];

  HANGUL_WORD_REGEX.lastIndex = 0;
  let match;
  while ((match = HANGUL_WORD_REGEX.exec(text)) !== null) {
    const garbled = match[0];
    const start = match.index;

    if (isInsideZone(document, text, start)) continue; // 주석/문자열/태그/안전 괄호 존 안은 대상 아님

    const restoredTerm = table.get(garbled);
    if (!restoredTerm || restoredTerm === garbled) continue;

    const startPos = document.positionAt(start);
    const endPos = document.positionAt(start + garbled.length);
    candidates.push({ range: new vscode.Range(startPos, endPos), garbled, restoredTerm });
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
 * 주어진 오프셋이 컨텍스트 존(주석/문자열/태그 내부 텍스트/안전한 괄호) 안에 있는지 확인한다.
 * 개선 (2026-09-24): 단순 boolean 대신 영역 타입(zoneType)까지 반환해서, 호출하는 쪽에서
 * calculateConfidence에 컨텍스트를 넘겨줄 수 있게 했다.
 * 개선 (2026-09-30): document(languageId)를 받아 zoneDetector.getAllZones()로 위임 -
 * 태그 내부 텍스트/안전한 괄호/언어별 주석 스타일까지 함께 인식한다.
 * @param {import('vscode').TextDocument} document
 * @param {string} text
 * @param {number} offset
 * @returns {string|null} - 영역 타입 (string_double 등) 또는 영역 밖이면 null
 */
function isInsideZone(document, text, offset) {
  const zones = getAllZones(text, document.languageId);
  for (const zone of zones) {
    if (offset >= zone.start && offset <= zone.end) return zone.type;
    if (zone.start > offset) break; // 정렬되어 있으므로 더 뒤질 필요 없음
  }
  return null;
}

// 우리 자신이 만든 edit 때문에 onDidChangeTextDocument가 다시 트리거되는 걸 막는 플래그
let isApplyingAutoFix = false;

/**
 * boundaryOffset 바로 앞에 붙어있는 영문 단어가 변환 대상이면 실제로 치환한다.
 * handleLiveTyping(구분 문자를 친 순간)과 scheduleDebouncedConvert(타이핑이 잠시
 * 멈췄을 때) 양쪽에서 공유하는 핵심 로직.
 * @param {import('vscode').TextDocument} document
 * @param {number} boundaryOffset
 * @returns {boolean} 실제로 변환을 걸었으면 true
 */
function tryConvertWordEndingAt(document, boundaryOffset) {
  const fullText = document.getText();
  const beforeText = fullText.slice(0, boundaryOffset);
  const wordMatch = beforeText.match(/[a-zA-Z]{3,}$/);
  if (!wordMatch) return false;

  const word = wordMatch[0];
  const wordStartOffset = boundaryOffset - word.length;

  // 코드(식별자) 영역은 건드리지 않고, 주석/문자열/태그 내부 텍스트/안전한 괄호 안에서만 자동 변환
  const zoneType = isInsideZone(document, fullText, wordStartOffset);
  if (!zoneType) return false;

  if (!isConvertibleAlphabet(word)) return false;
  // 진짜 영단어일 가능성이 높으면 자동변환하지 않는다 (오탐 방지 1차 안전장치)
  if (isCommonEnglishWord(word)) return false;

  const converted = convertEngToKor(word);
  if (converted === word) return false; // 변환해도 똑같으면 스킵
  // 핵심 판단 기준: 점수가 아니라, "완전히 조합된 한글 음절"을 이루는가.
  // 이게 실제 한글 입력기가 하는 판단과 같다 - 진짜 영단어는 이 조건을 통과하는
  // 경우가 거의 없으므로(자모가 어중간하게 남음), 이 조건 하나로 충분한 안전장치가 된다.
  if (!isFullyComposedHangul(converted)) return false;

  const editor = vscode.window.visibleTextEditors.find(
    (e) => e.document.uri.toString() === document.uri.toString()
  );
  if (!editor) return false;

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
  return true;
}

/**
 * 기능 추가 (2026-09-29, 사용자 요청): tryConvertWordEndingAt의 반대 방향. boundaryOffset
 * 바로 앞에 붙어있는 "한글" 단어가, 사실은 프로그래밍 키워드나 이 문서에 이미 쓰인 식별자를
 * 한글 IME 상태에서 잘못 쳐서 생긴 것이면 원래 영어 용어로 되돌린다. 코드(식별자/키워드)
 * 자리만 대상으로 하고, 주석/문자열 안은 건드리지 않는다 (그 안의 한글은 진짜 한글 문장일
 * 가능성이 훨씬 높다 - tryConvertWordEndingAt이 반대로 주석/문자열 "안"만 보는 것과 대칭).
 * @param {import('vscode').TextDocument} document
 * @param {number} boundaryOffset
 * @returns {boolean} 실제로 변환을 걸었으면 true
 */
function tryReverseConvertWordEndingAt(document, boundaryOffset) {
  if (!isReverseConvertEnabled()) return false;

  const fullText = document.getText();
  const beforeText = fullText.slice(0, boundaryOffset);
  const wordMatch = beforeText.match(/[가-힣]+$/);
  if (!wordMatch) return false;

  const word = wordMatch[0];
  const wordStartOffset = boundaryOffset - word.length;

  const zoneType = isInsideZone(document, fullText, wordStartOffset);
  if (zoneType) return false; // 주석/문자열/태그/안전 괄호 존 안은 대상 아님

  const table = getReverseTableForDocument(document);
  const restoredTerm = table.get(word);
  if (!restoredTerm || restoredTerm === word) return false;

  const editor = vscode.window.visibleTextEditors.find(
    (e) => e.document.uri.toString() === document.uri.toString()
  );
  if (!editor) return false;

  const wordRange = new vscode.Range(
    document.positionAt(wordStartOffset),
    document.positionAt(boundaryOffset)
  );

  isApplyingAutoFix = true;
  editor
    .edit((editBuilder) => {
      editBuilder.replace(wordRange, restoredTerm);
    })
    .then(() => {
      isApplyingAutoFix = false;
    }, () => {
      isApplyingAutoFix = false;
    });
  return true;
}

/**
 * 개선 (2026-09-29, 사용자 요청): "구분 문자(스페이스/엔터 등)를 쳐야만 바뀐다"는 게
 * 답답하다는 피드백 - "문법적으로 완성된 한글이면 바로바로 바뀌어야 한다"는 요청에 따라,
 * 타이핑이 잠깐(기본 0.5초, ko-typo.autoConvertDelayMs 설정) 멈추면 그 시점 커서 기준으로
 * 한 번 더 변환을 시도한다.
 *
 * ⚠️ 트레이드오프: 자모 단위(키 입력마다)로 즉시 변환하지 않고 "멈췄을 때"만 검사하는
 * 이유 - hangulAssembler는 1글자 lookahead로 "다음 자음이 지금 음절의 받침인지, 다음
 * 음절의 초성인지"를 판단한다(포트폴리오의 "설계 피벗" 참고). 즉 아직 다 안 친 단어를
 * 너무 일찍 확정하면, 그 뒤에 이어 칠 자음을 엉뚱한 곳에 붙이게 될 수 있다. 예를 들어
 * "dks"(간 → 완성된 한 음절 "안")까지만 치고 생각하다가 0.5초 넘게 멈추면 "안"으로
 * 먼저 확정돼버리고, 뒤에 "sud"를 이어 쳐도 "녕"으로 못 이어붙는다 - 이 경우 최종
 * 결과는 "안sud" 상태에서 다시 한 번 변환 판정을 거치게 된다(약간 부자연스럽지만 대부분
 * 다시 올바르게 처리된다). 단어를 치는 도중 문득 멈춰 생각하는 습관이 있다면
 * autoConvertDelayMs를 늘려서(예: 1000~1500) 이 오탐 가능성을 줄일 수 있다.
 */
const pendingConvertTimers = new Map(); // document.uri 문자열 -> setTimeout 핸들

function getAutoConvertDelayMs() {
  const raw = getConfig().get('autoConvertDelayMs', 500);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 500;
}

function scheduleDebouncedConvert(document) {
  const key = document.uri.toString();
  const existingTimer = pendingConvertTimers.get(key);
  if (existingTimer) clearTimeout(existingTimer);

  const timer = setTimeout(() => {
    pendingConvertTimers.delete(key);
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.toString() !== key) return;
    if (isExcludedDocument(editor.document)) return;
    const offset = editor.document.offsetAt(editor.selection.active);
    const converted = tryConvertWordEndingAt(editor.document, offset);
    if (!converted) tryReverseConvertWordEndingAt(editor.document, offset);
  }, getAutoConvertDelayMs());

  pendingConvertTimers.set(key, timer);
}

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

  const document = event.document;
  const change = event.contentChanges[event.contentChanges.length - 1];
  const insertedText = change.text;

  // 단어 경계 문자(스페이스/엔터/흔한 구두점)를 막 입력한 경우 -> 그 자리에서 즉시 변환
  if (/^[ \t\n.,!?;:)\]}"'`]$/.test(insertedText)) {
    const boundaryOffset = document.offsetAt(change.range.start);
    const converted = tryConvertWordEndingAt(document, boundaryOffset);
    if (!converted) tryReverseConvertWordEndingAt(document, boundaryOffset);
    return;
  }

  // 그 외의 일반 입력(자모 등)이면, 잠깐 멈췄을 때를 대비해 디바운스 타이머를 다시 건다.
  // 계속 타이핑 중이면 매번 취소되고 다시 걸리므로, "멈춘 시점"에만 실제로 실행된다.
  scheduleDebouncedConvert(document);
}

/**
 * 버그 수정 (2026-09-29, 사용자 리포트): "안녕하세요"처럼 단어를 치고 나서 스페이스/엔터/
 * 구두점 등 "경계 문자"를 하나도 안 치면(그 상태로 그냥 저장해버리면) handleLiveTyping이
 * 한 번도 트리거되지 않아서 변환이 안 되는 문제가 있었다. handleLiveTyping은 "경계 문자가
 * 입력되는 순간"에만 동작하는데, 그 뒤에 아무것도 안 치면 그 이벤트 자체가 없기 때문.
 * → 저장 시점에 한 번 더, 문서 전체를 훑어서 안전 기준(완전히 조합된 한글 음절)을 통과하는
 * 후보는 실제로 바꿔주는 안전망을 추가한다. Diagnostics(refreshDiagnostics)는 "표시"만
 * 하지만, 이건 "실제 치환"까지 한다 - 그래서 onWillSaveTextDocument + waitUntil(TextEdit[])
 * 로 저장 자체에 끼워 넣는다 (저장이 끝나기 전에 편집이 적용됨).
 * @param {import('vscode').TextDocumentWillSaveEvent} event
 */
function convertOnSave(event) {
  const document = event.document;
  if (document.uri.scheme !== 'file') return;
  if (!isAutoConvertEnabled()) return;
  if (isExcludedDocument(document)) return;

  const forwardCandidates = findCandidates(document);
  const reverseCandidates = findReverseCandidates(document);
  if (forwardCandidates.length === 0 && reverseCandidates.length === 0) return;

  const edits = [
    ...forwardCandidates.map((c) => vscode.TextEdit.replace(c.range, c.converted)),
    ...reverseCandidates.map((c) => vscode.TextEdit.replace(c.range, c.restoredTerm)),
  ];
  event.waitUntil(Promise.resolve(edits));
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

  // 저장 직전에 남아있는 후보들을 실제로 변환 (스페이스/엔터 없이 저장해버린 경우의 안전망)
  vscode.workspace.onWillSaveTextDocument(convertOnSave, null, context.subscriptions);

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
  for (const timer of pendingConvertTimers.values()) clearTimeout(timer);
  pendingConvertTimers.clear();
  diagnosticCollection.clear();
  diagnosticCollection.dispose();
}

module.exports = { activate, deactivate };
