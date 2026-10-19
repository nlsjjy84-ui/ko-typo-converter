# 한영 타자 변환기 — JetBrains 플러그인

VS Code 확장 「한영 타자 변환기」와 같은 규칙으로 동작하는 IntelliJ 계열(IntelliJ IDEA, PyCharm, WebStorm, DataGrip 등) 플러그인입니다.
한/영 전환을 깜빡하고 영문 상태로 친 한글(`dkssud`)을 주석·문자열·태그 안에서 한글(`안녕`)로 고칩니다.

## 동작

| 언제 | 무엇을 |
| --- | --- |
| 스페이스·엔터·구두점을 칠 때 | 바로 앞 단어 하나 |
| 타이핑을 잠깐 멈췄을 때 (기본 0.5초) | 커서 바로 앞 단어 하나 |
| 저장할 때 | 문서 전체에 남은 것 |
| `Ctrl+Alt+Shift+K` (맥 `Cmd+Alt+Shift+K`) | 선택한 글자 (코드 자리여도) |
| 오른쪽 클릭 → 한영 타자 변환기 → 문서 전체 한영 오타 고치기 | 문서 전체 |

- 바꾸는 자리: 주석(`//`, `/* */`, `#`, `--`, `<!-- -->` — 파일 종류에 맞게), 따옴표 안 문자열, HTML·JSX·마크다운의 태그 안 글자, 코드에 붙지 않은 소괄호. 코드 자리는 바꾸지 않습니다.
- 반대 방향: 코드 자리에서 한글 상태로 친 영어 용어(`채ㅜ내ㅣㄷ`)는 알려진 용어나 이 파일에 이미 쓰인 이름과 글자 하나까지 같을 때만 `console`로 되돌립니다.
- 흔한 영어 단어 10,748개(air, city, test …)는 우연히 한글이 되더라도 그대로 둡니다.
- 자동완성 목록이 떠 있으면 먼저 닫고 바꿉니다. 바뀐 것은 `Ctrl+Z`로 되돌릴 수 있고, 되돌린 글자는 다시 바꾸지 않습니다.
- 설정: Settings → Tools → 한영 타자 변환기 (자판 2벌식/세벌식 390/세벌식 최종, 멈춤 시간, 최소 신뢰도, 반대 방향, 제외 파일).

## 구조

```
src/main/java/io/github/nlsjjy84ui/kotypo/
├── core/   편집기와 상관없는 엔진 (VS Code 확장의 JS를 그대로 옮김)
│   ├── HangulAssembler      2벌식 조합
│   ├── ThreeBeolAssembler   세벌식 390·최종 조합 (libhangul 자판 자료)
│   ├── KeyboardLayout       자판별 단어 규칙
│   ├── ZoneDetector         주석·문자열·태그·괄호 영역
│   ├── Confidence           신뢰도
│   ├── ReverseMapper        반대 방향 표
│   └── Engine               위를 묶어 "어디를 무엇으로 바꿀지"만 돌려줌
└── ide/    IntelliJ 연결 (타이핑·멈춤·저장 리스너, 설정 화면, 메뉴)
src/main/resources/kotypo/   단어 목록·자판 표 (JS 원본에서 뽑은 것)
```

## 테스트

```bash
node tools/make-fixtures.js ..   # VS Code 확장(JS 엔진)으로 대조 기준값 만들기
./gradlew test                   # 21개
```

- `EngineParityTest` (5개): JS 엔진의 답과 Java 엔진의 답을 하나씩 대조합니다 — 조합 18,000건, 주석·문자열 구분 문서 1,500개, 저장 때 고치는 자리 2,133곳, 스페이스를 쳤을 때 1,500건. 하나라도 다르면 실패합니다.
- `KoTypoPluginTest` (16개): 테스트용 IntelliJ를 띄워 실제로 타이핑·멈춤·엔터·저장·되돌리기·자동완성 목록·세벌식·메뉴가 동작하는지 확인합니다.

## 만들기

```bash
./gradlew buildPlugin   # build/distributions/ko-typo-converter-jetbrains-0.1.0.zip
```

Java 21, Gradle 9(래퍼 포함), IntelliJ Platform Gradle Plugin 2.19. 2024.2(빌드 242) 이후 IDE에서 동작합니다.

## 사용한 자료

- 세벌식 자판 배열·겹낱자 규칙: [libhangul](https://github.com/libhangul/libhangul) (LGPL-2.1)
- 흔한 영어 단어 목록: [SCOWL](http://wordlist.aspell.net/) (Copyright 2000-2016 Kevin Atkinson)
