# 릴리즈 플레이북 — Figma Community 공개

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

## 3. 리스팅 문안 초안

### 한국어

> **Featherweight — 가벼운 PDF, 진짜 폰트**
>
> 선택한 프레임을 PDF 한 파일로 내보낸다. 이미지는 화면 크기에 맞춰 줄이고,
> 텍스트는 아웃라인 대신 진짜 폰트로 임베드한다. 이력서·포트폴리오가 10MB 에서
> 1MB 로 줄고, 본문이 선택·검색·복사되며, 채용 플랫폼 파서가 내용을 읽는다.
>
> - 프레임 순서 조정·제외, 원본 문서는 절대 건드리지 않음
> - 이미지 품질·해상도 상한 설정
> - 한글 오픈 폰트 15종 자동 임베드 (Pretendard, 나눔, Gothic A1, Spoqa 등)
> - 그 외 서체는 TTF/OTF 를 한 번만 넣으면 저장
> - 처리 못 하는 텍스트는 원본 아웃라인 그대로 — 다른 폰트로 대체하지 않음

### English

> **Featherweight — light PDFs with real fonts**
>
> Export selected frames as a single PDF. Images are downscaled to their displayed
> size; text is embedded as real subset fonts instead of vector outlines. A 10MB
> portfolio becomes ~1MB, and the text is selectable, searchable, and readable by
> ATS parsers.
>
> - Reorder or exclude frames; your document is never modified
> - Image quality and resolution caps
> - 15 open-license Korean font families auto-embedded (Pretendard, Nanum, …)
> - Add your own TTF/OTF once for any other typeface
> - Unsupported text keeps its original outlines — never substituted

### 면책조건 (리스팅 하단 + README 공통)

> - Always proofread the exported PDF before submitting it anywhere. Text is
>   redrawn with real fonts and may differ subtly from Figma's rendering. You are
>   responsible for the files you produce with this plugin.
> - Fonts you upload yourself are embedded into the PDF as-is. **It is your
>   responsibility to confirm that your font's license permits document
>   embedding.** All auto-downloaded fonts are SIL OFL and permit embedding.
> - Network access is used only to download open-license fonts from
>   cdn.jsdelivr.net. Your document's content never leaves your machine. No
>   telemetry.
> - Text is embedded in an extractable form, but no specific ATS parsing result
>   is guaranteed.
> - Not affiliated with Figma, Inc.

## 4. 출시 절차

1. `npm run lint && npm test && npm run verify:catalog && npm run build`
2. `docs/CHECKLIST.md` 릴리즈 QA 통과 확인
3. zip 배포는 두 트랙이다:
   - **latest** — main 에 푸시하면 CI 가 latest 프리릴리즈를 자동 갱신 (항상 최신)
   - **정식 버전** — `npm version minor` → `git push --follow-tags` (v* Release 자동)
4. Figma 데스크톱 → Plugins → Development → Publish → 리스팅 문안·면책조건 붙여넣기
5. 심사 통과 후: README 의 설치 절을 Community 링크로 교체
