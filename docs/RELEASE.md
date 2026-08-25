# 릴리즈 플레이북 — Figma Community 공개

> **상태 (2026-08-21): 심사 제출 완료** — https://www.figma.com/community/plugin/1672509720278498323
> 지원 이메일: featherweight@jangwonseok.com · 승인되면 README 설치 절을 Community 링크로 교체.
> 후속: 태그 보강(resume·portfolio·fonts·ats 등), 한국어 설명 추가 여부 확인.

> 목표: Community 무료 공개.
> 이름 확정: **Featherweight** (2026-08-21). Community 에 정확히 일치하는 플러그인 없음을 직접 확인.
> 참고: "Featherlight — Compress, WebP & Batch Export"(Rational Mystic LLC, 유료, 사용 2명)라는
> 한 글자 차이 플러그인이 같은 카테고리에 존재 — 인지하고 진행하기로 결정.
> 내부 식별자(레포 이름 figma-sheaf, manifest id "sheaf", clientStorage 키)는 저장 데이터 호환을 위해 유지한다.
> 방침: 폰트 라이선스·결과물 검증 책임은 면책조건으로 사용자에게 명시한다.
> 플러그인은 임베드 권한(fsType) 검사를 하지 않는다 — 기능은 기능이다.

## 1. 출시 전 남은 일

코드 (완료된 것은 ✅)

- ✅ 혼합 스타일 노드를 run 별 폰트로 드로잉 (2026-08-21)
- ✅ 밑줄·취소선 텍스트는 아웃라인 fallback (2026-08-21)
- ✅ 폰트 카탈로그 15종 확장 + `verify:catalog` 실검증 (2026-08-21)
- ✅ UI 한/영 병행 — 앱 언어 자동 감지, 문장은 `src/lib/i18n.ts` 사전 (2026-08-21)
- ✅ 파이프라인 실검증 (2026-08-21, `npm run verify:catalog` 에 포함) — 실제 Figma SVG 픽스처
      + CDN 실폰트 3굵기(Regular/Bold/ExtraBold)로 PDF 생성: 전부 CID TrueType 임베드,
      `pdftotext` 한글 추출 100%, 서브셋으로 7.5KB (원본 폰트 7.7MB)
- ✅ UI 전면 개편 — 탭 구조·프리셋·드래그 정렬·캔버스 점프·파일명 자동·한/영 (2026-08-21)
- [ ] `docs/CHECKLIST.md` "릴리즈 QA" 섹션 — **사람이 Figma 데스크톱에서 육안 확인만 남음**
      (좌표 정합·굵기 시각 확인·플러그인 UI·clientStorage. 임베드·추출·다운로드는 위에서 기계 검증됨)
- [ ] 타인 문서 최소 2종으로 내보내기 검증 (영문 문서 1종 포함)
- [ ] Figma 웹(브라우저) 버전에서 다운로드 동작 확인

퍼블리싱 형식

- ✅ 이름 확정 Featherweight → manifest name·PDF Producer·패키지 zip·문서 일괄 교체 (2026-08-21)
- ✅ 아이콘 128×128, 커버 1920×960 — `docs/brand/` 에 PNG 저장 (2026-08-21).
      디자인 수정은 캔버스에서: https://claude.ai/code/artifact/c4b4d306-ad6f-4bc1-9297-844c7db6368d (수정 시 PNG 재생성 필요)
- [ ] 지원 연락처(이메일 또는 GitHub Issues), 태그 선정
- ✅ 코드 라이선스 MIT (2026-08-21). 공개 시 새 레포 + 히스토리 리셋 권장 (docs/RELEASE.md 참고)

## 2. 심사 대비 메모

- `networkAccess.allowedDomains: ["https://cdn.jsdelivr.net"]` + reasoning 이 이미
  manifest 에 있다. 리스팅 설명의 프라이버시 문구와 **정확히 일치**시킬 것.
- 문서 데이터는 어떤 서버로도 나가지 않는다. "폰트 다운로드만" 이 심사관에게 명확해야 한다.
- 플러그인 ID 는 퍼블리시 과정에서 Figma 가 발급한다 (`figma-plugin.id: "sheaf"` 는 로컬용).

## 3. 리스팅 문안 (2026-08-21 — 인기작 패턴 분석 반영)

> 참조: Compressed PDF and Image Exporter(143k 사용자)·Hypermatic 리스팅 분석.
> 발견한 패턴 — ① 이름에 검색 키워드를 붙인다 ② 태그라인은 기능+키워드 압축 한 줄
> ③ 설명은 문제 후킹 → 기능 불릿 → 사용 3단계 → 차별점 → 지원 순서.
> 결정적 근거: CPIE 개발자가 댓글에서 "폰트 임베드는 못 한다. Figma 가 전부 아웃라인으로
> 뽑는 게 근본 문제"라고 인정 — 이력서 사용자들이 "전부 텍스트라 용량이 안 준다"고 호소.
> **우리 카피는 그 지점(진짜 폰트 임베드)을 정면에 세운다.**

### 이름 (퍼블리시 폼 Name)

> **Featherweight – Light PDF Export (Real Fonts)**

Community 검색은 이름 가중치가 커서 키워드를 이름에 붙이는 게 업계 관행
(CPIE 도 "(PDF, PNG, JPG, WebP)" 를 이름에 달았다). 메뉴에 조금 길게 보이는 대신
"pdf export" 검색에 잡힌다. 짧은 이름을 원하면 "Featherweight" 단독도 가능.

### 태그라인 (검색 카드 한 줄)

> EN: Tiny PDFs with real embedded fonts — selectable, searchable, ATS-ready. Résumés & portfolios from 10MB to <1MB.
>
> KR: 프레임을 가벼운 PDF 로 — 텍스트는 아웃라인이 아니라 진짜 폰트. 검색·복사되는 이력서·포트폴리오.

### 설명 (Description)

Figma's built-in PDF export turns every letter into vector outlines. Your text
can't be selected, searched, or read by résumé scanners (ATS) — and text-heavy
documents balloon to 10–20MB that no compressor can shrink, because there are
no images to compress.

Featherweight fixes the text problem itself:

🪶 REAL FONTS, NOT OUTLINES
Text is re-embedded as real subset fonts. It stays selectable, searchable,
copy-pasteable, and ATS-parseable. A text-heavy résumé drops from ~10MB to
under 1MB.

🪶 SMART IMAGE DOWNSCALING
Images are resized to their displayed size before export. Pick a preset —
Sharp / Balanced / Smallest — or fine-tune quality, scale and resolution caps.

HOW IT WORKS
1. Select frames and run Featherweight
2. Drag to reorder pages, exclude what you don't need
3. Export — the save dialog is pre-filled with a timestamped file name

WHAT MAKES IT DIFFERENT
• 15 open-license Korean & Latin font families are downloaded and embedded
  automatically (Pretendard, Nanum, Gothic A1, IBM Plex Sans KR, Spoqa…).
  Add your own TTF/OTF once for anything else.
• Never substitutes fonts. Anything it can't embed keeps its original
  outlines — identical look, honestly reported with a reason you can click
  to locate the exact layer on canvas.
• 100% local. Your document never leaves your machine — network access is
  used only to download open-license fonts (cdn.jsdelivr.net). No telemetry,
  no account, no upload.
• Free and open source (MIT): github.com/coffeequickly/featherweight

GOOD TO KNOW
• Always proofread the exported PDF before submitting it anywhere. Text is
  redrawn with real fonts and may differ subtly from Figma's rendering. You
  are responsible for the files you produce.
• Fonts you upload yourself are embedded as-is — confirming that your font's
  license permits document embedding is your responsibility. All
  auto-downloaded fonts are SIL OFL and permit embedding.
• Rotated text, gradient/stroke/effect text and underlines keep their
  original outlines (by design — never silently altered).
• Text is embedded in an extractable form, but no specific ATS parsing
  result is guaranteed. Not affiliated with Figma, Inc.

---

한국어

Figma 기본 PDF 내보내기는 모든 글자를 벡터 아웃라인으로 바꿉니다. 텍스트가
선택·검색되지 않고 채용 시스템(ATS)이 읽지 못하며, 텍스트 위주 문서는
10~20MB 가 됩니다 — 압축할 이미지가 없어서 어떤 압축 도구로도 줄지 않습니다.

Featherweight 는 텍스트 문제 자체를 고칩니다:

🪶 아웃라인이 아니라 진짜 폰트 — 텍스트를 서브셋 폰트로 다시 임베드합니다.
선택·검색·복사가 되고 ATS 가 읽습니다. 텍스트 위주 이력서가 10MB 에서 1MB
아래로 줄어듭니다.

🪶 이미지 다운스케일 — 화면 표시 크기에 맞춰 줄입니다. 프리셋(선명하게/균형/
최소 용량) 또는 세부 조절.

사용법: 프레임 선택 → 실행 → 드래그로 순서 조정 → 내보내기.

• 한글 오픈 폰트 15종 자동 임베드 (Pretendard, 나눔, Gothic A1, Spoqa 등),
  그 외 서체는 TTF/OTF 를 한 번만 등록
• 절대 다른 폰트로 대체하지 않음 — 임베드 못 하는 텍스트는 원본 아웃라인
  유지, 사유를 클릭하면 해당 레이어로 이동
• 100% 로컬 — 문서는 어디에도 전송되지 않습니다 (네트워크는 오픈 폰트
  다운로드 전용). 텔레메트리 없음. 무료 오픈소스(MIT).

유의사항: 제출 전 결과 PDF 를 반드시 확인하세요. 결과물 사용과 직접 등록한
폰트의 라이선스 준수는 사용자 책임입니다.

### 카테고리 (폼에서 최대 2개)

> Import & export (주) + Design tools (보조) — CPIE 와 같은 조합

### 태그

pdf · export · fonts · compress · resume · portfolio · korean · ats

## 4. 출시 절차

1. `npm run lint && npm test && npm run verify:catalog && npm run build`
2. `docs/CHECKLIST.md` 릴리즈 QA 통과 확인
3. zip 배포는 두 트랙이다:
   - **latest** — main 에 푸시하면 CI 가 latest 프리릴리즈를 자동 갱신 (항상 최신)
   - **정식 버전** — `npm version minor` → `git push --follow-tags` (v* Release 자동)
   - **Figma 퍼블리시 자동화(선택)** — `tools/figma-publish.mjs` (자체 구현)

     ```
     # 1) 토큰: figma.com 로그인 → 개발자도구 → Application → Cookies →
     #    `__Host-figma.authn` 값 복사
     gh secret set FIGMA_WEB_AUTHN_TOKEN -R coffeequickly/featherweight

     # 2) 로컬에서 먼저 확인 (아무것도 올리지 않는다)
     FIGMA_WEB_AUTHN_TOKEN=... node tools/figma-publish.mjs --dry-run

     # 3) 수동 퍼블리시
     FIGMA_WEB_AUTHN_TOKEN=... npm run publish:figma "Fix: ..."
     ```

     시크릿을 등록해 두면 `v*` 태그 푸시가 GitHub Release + Figma 새 버전까지
     한 번에 처리한다. 시크릿이 없으면 그 스텝은 건너뛴다.

     **주의** — Figma 는 퍼블리싱 공개 API 가 없어서 데스크톱 앱이 쓰는 내부
     엔드포인트를 호출한다. 언제든 바뀔 수 있으므로 GitHub Release 를 먼저 만든 뒤
     마지막에 실행하고, 실패하면 큰 소리로 멈춘다(조용한 부분 성공 없음).
     그때는 데스크톱 앱에서 Publish new version 을 누르면 된다.
     이름·설명·이미지·태그는 스토어의 기존 값을 그대로 재사용하므로 이 경로로
     리스팅 문구가 바뀌지 않는다 — 문구·이미지 변경은 데스크톱 앱에서 한다.
4. Figma 데스크톱 → Plugins → Development → Publish → 리스팅 문안·면책조건 붙여넣기
5. 심사 통과 후: README 의 설치 절을 Community 링크로 교체
