# 한영 타자 변환기 (Ko-Typo Converter)

## 🎯 소개

코딩할 때 영문 대신 한글이 입력되는 **오타(타입 미스)**를 자동으로 감지하고 변환해주는 VS Code 확장입니다.

예: `dkssud` → `안녕`

---

## ✨ 주요 기능

### 1️⃣ **2벌식 한글 자모 조합**
- 영문 키보드로 친 한글을 자동으로 인식
- 정확한 한글음절 변환 (유니코드 기반)

### 2️⃣ **4가지 컨텍스트 감지**
- 문자열 내부 ("string", 'string', `template`)
- 주석 (// 한줄 주석, /* 블록 주석 */)
- HTML/JSX 태그 (<tag>)
- 괄호 내부 ({}, (), [])

### 3️⃣ **신뢰도 기반 변환**
- **90점 이상**: 자동 변환
- **70~89점**: 제안 표시 (황색 물결)
- **50~69점**: 무시

### 4️⃣ **실무 단어 인식**
- 코드에서 자주 사용되는 90+ 한글 단어
- 카테고리: 기술용어, 에러메시지, 데이터베이스, 상태, 동작, 어미

---

## 🚀 설치 방법

### 방법 1: VS Code Marketplace (공개 예정)
```
VS Code → Extensions → "한영 타자 변환기" 검색 → 설치
```

### 방법 2: 수동 설치 (개발 중)
```bash
# 1. VSIX 파일 생성
npm run package

# 2. VS Code에 설치
code --install-extension ko-typo-converter-0.0.1.vsix
```

### 방법 3: 로컬 개발 모드
```bash
# 1. 이 폴더를 VS Code에서 열기
code .

# 2. F5 키 눌러서 확장 실행
# (새 VS Code 창이 열림 - 확장이 로드됨)
```

---

## 📖 사용법

### ⌨️ 단축키
- **Ctrl+Shift+K** (Windows/Linux)
- **Cmd+Shift+K** (Mac)
→ 현재 파일의 모든 오타 변환

### 🎛️ 설정
VS Code → 설정 (`Ctrl+,`) → "한영 변환"

```json
{
  "ko-typo.autoConvert": true,           // 자동 변환 활성화
  "ko-typo.confidenceThreshold": 70,     // 제안 표시 임계값
  "ko-typo.showDiagnostics": true,       // 진단 정보 표시
  "ko-typo.excludePatterns": [           // 제외 파일 패턴
    "*.md",
    "*.txt",
    "package.json"
  ]
}
```

---

## 📁 프로젝트 구조

```
ko-typo-converter/
├── extension.js                 # VS Code 확장 메인 파일
├── hangulAssembler.js          # 2벌식 한글 조합 엔진
├── contextDetector.js          # 코드 컨텍스트 감지
├── confidenceCalculator.js     # 신뢰도 계산 로직
├── practicalWords.js           # 실무 한글 단어 목록
├── package.json                # npm 패키지 설정
├── .vscodeignore               # 배포 제외 파일
└── README.md                   # 이 파일
```

---

## 🔧 기술 스택

- **Runtime**: Node.js 14+
- **Platform**: VS Code 1.60.0+
- **Language**: JavaScript (ES6+)
- **Encoding**: UTF-8

---

## 🧪 테스트

```bash
# 단위 테스트 실행
npm test

# 수동 테스트
# 1. F5 키로 확장 실행
# 2. 새 창에서 코드 타이핑
# 3. 한글 오타 시 자동 변환/제안 확인
```

---

## 📊 신뢰도 계산 방식

```
기본점수: 50점

보너스:
+ 컨텍스트 (문자열/주석) : 5~10점
+ 어미 패턴 (입니다, 했어요 등) : 20점
+ 도메인 명사 (클래스, 테이블 등) : 30점
+ 실무 단어 (에러, 코드 등) : 15점

최종: 0~100점
```

---

## 🐛 알려진 제한사항

- ❌ 자동 완성 중에는 작동 안 함
- ❌ 매우 큰 파일 (10MB+)에서는 느릴 수 있음
- ❌ 일부 특수 문자열은 미감지

---

## 💬 피드백 & 버그 리포트

학원 동기들 대상으로 사용자 테스트를 진행하고 있습니다!

**피드백 전달:**
- 주영에게 직접 말씀해주세요
- 또는 이슈 등록: [GitHub Issues](https://github.com/nlsjjy84-ui/ko-typo-converter/issues)

---

## 📜 라이선스

MIT License - 자유롭게 사용, 수정, 배포 가능

---

## 🎓 제작

- **작가**: 주영 (Jo YoungSol)
- **학원**: 서울 풀스택 부트캠프
- **전공**: 국악(사물놀이/풍물) → 개발자 전환
- **시작**: 2026년 8월

**Version**: 0.0.1 (베타)

---

## 🚀 향후 계획

- [ ] 3벌식 한글 지원
- [ ] 더 많은 도메인 단어 추가
- [ ] 학습 기반 신뢰도 개선 (ML)
- [ ] 다국어 지원
- [ ] VS Code Marketplace 공식 배포
