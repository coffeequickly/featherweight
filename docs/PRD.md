# Sheaf PRD — v0.1 (Figma → 가벼운 PDF, 진짜 폰트)

> **Historical document.** This is the original product spec written before the
> plugin was built (Korean). It records *why* the architecture looks the way it
> does — the hard constraints of the Figma plugin runtime (§5) and the design
> decisions that follow from them — and it is still the best explanation of the
> `src/main` / `src/ui` / `src/lib` split.
>
> It is **not** a description of the current UI or feature set: the plugin has
> evolved considerably since (tabs, image presets, drag reordering, canvas jump,
> i18n, timestamped file names). For what the plugin does today, see the
> [README](../README.md); for what to verify before shipping, see
> [CHECKLIST.md](CHECKLIST.md).


> repo: `github.com/coffeequickly/featherweight` (구 figma-sheaf 비공개 레포에서 이전)
> status: Draft v0.1 / 2026-08-20
> 독자: Claude Code(구현 에이전트) + PO(QA 겸)
> 사용법: 레포 루트에 `docs/PRD.md`로 두고, §12는 `CLAUDE.md`로 복사한다. 이 문서가 단일 진실 공급원이다.

---

## 0. Claude Code에게 — 한 화면 요약

- 만드는 것: Figma **비공개** 플러그인. 선택한 프레임들을 → 순서 정해서 → 이미지를 다운스케일한 뒤 → PDF 한 파일로 내보낸다. Phase 2에서 텍스트를 글리프 아웃라인 대신 **진짜 폰트로 임베드**한다.
- 사용자 1명(PO), 배포·결제·다중 사용자 없음. 이력서·포트폴리오 PDF가 10~20MB 나오는 문제를 푼다.
- 절대 제약 3개 (§5): ① Figma 기본 PDF는 폰트를 임베드하지 않고 글리프로 뽑는다 ② 플러그인 API의 PDF export에는 옵션이 하나도 없다 ③ 메인 스레드에는 Canvas·DOM·fetch가 없다. 그래서 이미지는 **export 전에 노드의 fill을 교체**하고, 폰트는 **UI iframe에서 pdf-lib로 직접 얹는다.**
- 작업 순서: Phase 0 → 1 → 1.5 → 2 (→ 3). 각 Phase DoD(§9)를 통과하고 사람이 확인하기 전에는 다음 Phase로 가지 않는다.
- 자동으로 검증 가능한 것(순수 모듈 테스트)과 Figma 안에서 사람이 확인해야 하는 것(체크리스트)을 §11에서 구분해 뒀다. 후자는 체크리스트를 출력하고 **멈춘다.**
- 확실하지 않은 Figma 런타임 동작은 §10 스파이크 목록에 있다. 추측으로 코드를 굳히지 말고 `docs/SPIKES.md`에 가설·검증 절차·결과를 기록한다.

---

## 1. 배경과 문제

- 이력서·포트폴리오를 Figma에서 PDF로 내보내면 10~20MB가 된다. 메일 첨부·채용 플랫폼 업로드 한도에 걸린다.
- 원인 후보 (비율은 Phase 0 진단에서 측정한다):
  - (a) 이미지가 원본 해상도 그대로 임베드된다. 3000px 스크린샷을 600pt 박스에 넣어도 3000px 그대로.
  - (b) 텍스트가 폰트가 아니라 글리프 아웃라인(벡터 패스)으로 들어간다. 한글은 획이 많아서 더 무겁다.
  - (c) 섀도우·블러 같은 이펙트가 비트맵으로 래스터된다.
- 부수 문제: 아웃라인 텍스트는 뷰어에 따라 선택·복사가 안 되고, 채용 플랫폼 파서(ATS)가 본문을 못 읽을 수 있다. 이력서에는 치명적이다.
- 기존 대안이 안 맞는 이유:
  - Figma 기본 export 설정의 PDF 이미지 품질(Low/Medium/High)은 품질만 바꾸고 픽셀 수는 못 줄인다. 폰트 문제도 그대로.
  - Ghostscript 후처리(`-dPDFSETTINGS=/ebook`)는 이미지는 줄이지만 폰트는 못 살린다.
  - Typeport 등 상용 플러그인은 멀티페이지·커스텀 폰트가 유료이고, 내 워크플로우(순서·제외·이미지 상한)에 딱 맞지 않는다.

---

## 2. 목표와 성공 기준 (측정 가능한 것만)

| ID | 목표 | 측정 |
|---|---|---|
| G1 | 용량 | 동일 프레임 기준 결과 PDF ≤ Figma 기본 export의 25% (이미지 많은 포폴). 이력서는 ≤ 1MB |
| G2 | 시각 동일 | 200% 줌에서 기본 export와 육안 차이 없음. 이미지 선명도는 설정값(배율·상한)에 종속 |
| G3 | 실 텍스트 (Phase 2) | `pdffonts`에 임베드 서브셋 폰트 표시(emb=yes, sub=yes). `pdftotext` 결과가 Figma 원문과 문자 단위 ≥ 99% 일치(한글 포함) |
| G4 | 원본 무손상 | 플러그인 실행 전후 Figma 문서 변경 0. 실패·취소 시에도 임시 클론 잔존 0 |
| G5 | 속도 | 10페이지 포폴 내보내기 < 60초 (M1 Mac 기준) |

---

## 3. 비목표 (v0에서 하지 않는 것)

- 커뮤니티 배포, 다중 사용자, 결제, 워터마크, 텔레메트리
- FigJam·Slides 등 Figma Design 외 에디터
- 이미지 CROP 변환·TILE 정밀 대응 → 원본 유지 fallback
- 회전 텍스트, 패스 위 텍스트, 그라데이션·이미지 fill 텍스트, 스트로크·이펙트 있는 텍스트 → 아웃라인 유지 fallback
- PDF/A, CMYK, 인쇄용 bleed·crop mark
- 북마크·암호·페이지별 파일 → Phase 3 후보

---

## 4. 사용자 시나리오

1. Figma에서 페이지 역할을 하는 최상위 프레임 8개를 선택하고 플러그인을 실행한다.
2. 목록에서 순서를 조정하고(↑↓), 이번엔 안 보낼 프레임을 ✕로 제외한다. **원본 레이어는 건드리지 않는다.**
3. 이미지 설정을 확인한다. 기본값: 품질 0.8 / 배율 1.5x / 긴 변 상한 2048.
4. [PDF 내보내기] → 진행률 → 저장 다이얼로그 → 결과 요약(용량·이미지 절감·fallback 목록).
5. (Phase 2) "텍스트를 실제 폰트로 임베드"를 켜면 결과 PDF의 본문이 선택·검색·복사되고 파서가 읽는다.

---

## 5. 확정된 제약 (Figma Plugin API 팩트 — 바꿀 수 없다)

| ID | 제약 | 대응 |
|---|---|---|
| C1 | Figma 기본 PDF export는 텍스트를 글리프로 뽑는다. 폰트 임베드 없음 | 폰트는 UI에서 pdf-lib + fontkit으로 직접 얹는다 |
| C2 | `ExportSettingsPDF`는 `format` 외 옵션 없음 (이미지 품질·아웃라인 토글 없음) | 이미지는 export 전에 노드 fill을 교체한다 |
| C3 | 메인 스레드(`src/main/**`)에는 DOM·Canvas·fetch·window 없음 | 리사이즈·인코딩·PDF 조립·다운로드는 UI iframe(`src/ui/**`) |
| C4 | `figma.createImage`는 PNG/JPG/GIF만, 최대 4096×4096 | 타깃 긴 변 상한 4096 고정, WebP 금지 |
| C5 | SVG export에 `svgOutlineText:false`를 주면 `<text>/<tspan>`으로 나온다 | 줄바꿈·줄 위치 계산을 Figma에 맡긴다 (Phase 2) |
| C6 | `TextNode.visible=false`는 오토레이아웃 형제를 재배치한다 | 텍스트 제거는 `fills = []`로만 한다 |
| C7 | 메인↔UI는 `postMessage`(structured clone). `Uint8Array` 전달 가능, transferable 없음 | 이미지·PDF는 한 번에 하나씩 순차 처리 |
| C8 | `networkAccess.allowedDomains: ["none"]` | 폰트 파일은 빌드 시 번들(base64) |
| C9 | `documentAccess: "dynamic-page"` | `getNodeByIdAsync` 등 `*Async` API만 사용 |

---

## 6. 기능 요구사항

우선순위: P0 = Phase 1/1.5, P1 = Phase 2, P2 = Phase 3

### FR-1 선택 목록 (P0)

- 실행 시 `figma.currentPage.selection`에서 export 가능한 노드(FRAME, COMPONENT, COMPONENT_SET, INSTANCE, SECTION, GROUP)를 목록화한다. 0개면 "프레임을 선택하세요" 안내 후 대기하고, `figma.on('selectionchange')`로 목록을 갱신한다.
- 항목 정보: `id, name, width, height, imageCount(이미지 fill 수), textCount(텍스트 노드 수), thumb(PNG, 긴 변 160px)`.
- 정렬: 기본은 캔버스 위치(위→아래 행, 행 안에서 왼→오른. 행 판정 허용오차 = 프레임 높이의 50%). 버튼으로 이름순 전환.
- 수용 기준: 선택 변경이 1초 안에 목록에 반영된다. 썸네일 실패가 목록 표시를 막지 않는다.

### FR-2 순서 변경 / 제외 (P0)

- ↑↓ 버튼(P0), 드래그 정렬(P2, dnd-kit).
- ✕는 **목록에서 제외만** 한다. 원본 레이어에 아무 영향 없다. 하단 "제외됨 n개 · 복원" 링크로 되돌릴 수 있다.
- 수용 기준: 결과 PDF의 페이지 순서 == 목록 순서. 제외한 프레임은 결과에 없다.

### FR-3 이미지 압축 옵션 (P0)

- 옵션
  - `quality`: 0.5~0.95, step 0.05, 기본 0.8 (JPEG)
  - `multiplier`: 1 / 1.5 / 2, 기본 1.5 (표시 크기 대비 픽셀 배율)
  - `maxEdge`: 1024 / 1600 / 2048 / 4096, 기본 2048
  - `reencodeOpaquePng`: 기본 true (투명 없는 PNG는 JPEG로)
- 타깃 계산 (`src/lib/imageTarget.ts`, 순수 함수, 테스트 필수)

  ```
  displayedLongEdge = max(node.width, node.height)     // FILL/FIT/CROP 공통 단순화, TILE은 처리 제외
  target = min(maxEdge, ceil(displayedLongEdge × multiplier))
  같은 imageHash를 여러 노드가 쓰면 target = 그 노드들의 max
  원본 longEdge ≤ target → 리사이즈 생략 (reencodeOpaquePng면 재인코딩만)
  처리 결과 바이트 ≥ 원본 바이트 → 원본 유지
  ```

- 알파 보존: PNG에 투명 픽셀이 있으면 PNG 유지(리사이즈만). 검사는 리사이즈된 캔버스의 `getImageData`를 16픽셀 간격으로 샘플링.
- 축소 품질: `createImageBitmap(blob, { resizeWidth, resizeHeight, resizeQuality: 'high' })`. 2배 초과 축소는 절반씩 단계 축소.
- 수용 기준: `pdfimages -list` 결과에서 모든 이미지의 긴 변 ≤ 해당 target, 불투명 이미지 enc=jpeg, 투명 이미지 유지.

### FR-4 PDF 생성 · 머지 · 다운로드 (P0)

- 프레임마다: clone → 이미지 교체 → (Phase 2: 텍스트 추출·제거) → `exportAsync({format:'PDF'})` → UI 전송 → 클론 제거. 전부 도착하면 UI에서 pdf-lib로 순서대로 머지.
- 출력: 기본 단일 파일 `{figma.root.name}.pdf`. 페이지별 파일은 P2.
- 메타데이터: Title = 파일명, Producer = "Sheaf", CreationDate.
- 진행률: 현재 단계 텍스트("이미지 3/12", "페이지 2/8") + 취소 버튼. 취소 시 진행 중 클론 제거 후 중단.
- 수용 기준: G4(원본 무변경, 잔여 클론 0). 실패한 프레임이 있어도 나머지로 PDF를 만들고 리포트에 표시한다.

### FR-5 결과 리포트 (P0)

- 결과 파일 크기, 이미지 바이트 절감(원본 fill 바이트 합계 → 교체 후 합계), 처리 이미지 수, 소요 시간, 경고(실패 이미지·건너뛴 프레임), Phase 2에서는 fallback 텍스트 노드 수와 사유.
- "비교 모드"(P2): 같은 프레임을 무압축으로 한 번 더 export해서 Before/After 크기를 정확히 보여준다. 시간이 2배라 기본 off.

### FR-6 설정 영속화 (P0)

- `figma.clientStorage` key `sheaf.settings.v1`. 마지막 설정을 다음 실행에 복원. 스키마 버전이 다르면 기본값으로.

### FR-7 실 텍스트 임베드 (P1, Phase 2)

- 토글 "텍스트를 실제 폰트로 임베드". Phase 2 완료 후 기본 on.
- 대상 TextNode 조건(전부 만족해야 처리, 하나라도 아니면 아웃라인 유지 + 사유 기록):
  1. `visible`, 회전 없음(`absoluteTransform`의 회전 성분 0), 패스 텍스트 아님
  2. `fills`가 전부 visible한 SOLID, `strokes` 없음, `effects` 없음
  3. 모든 세그먼트의 `fontName`이 `fonts/fonts.json`에 매핑됨
  4. 매핑된 폰트가 `characters`의 모든 코드포인트 글리프를 가짐 (UI의 fontkit으로 검사 — 이모지·특수문자 때문에 필수)
- 추출(메인): 조건 1~3 통과 노드마다
  - `svg = await node.exportAsync({ format:'SVG_STRING', svgOutlineText:false, useAbsoluteBounds:true })`
  - `segments = node.getStyledTextSegments(['fontName','fontSize','fills','letterSpacing','textDecoration','textCase','hyperlink'])`
  - `offset = { x: node.absoluteBoundingBox.x − frame.absoluteBoundingBox.x, y: 같은 방식 }` (S3에서 기준 확정)
  - 위 페이로드를 UI로 보내 조건 4 검증(`text:validate`) → 통과한 노드만 클론에서 `fills = []` → PDF export
- 파싱(`src/lib/svgText.ts`, 순수, DOMParser 주입): `<text>`/`<tspan>`을 문서 순서로 걸어 `runs[]`를 만든다.
  - `run = { text, x?, y, fontFamily, fontWeight, fontStyle, fontSize, letterSpacing, fill, opacity, charStart, charEnd }`
  - `x` 없는 tspan은 앞 run의 끝에서 이어 붙인다(폭 = `font.widthOfTextAtSize` + letterSpacing × 글자 수).
  - 문자 인덱스 매핑: tspan 텍스트를 `characters`에서 cursor 이후 첫 등장 위치로 정렬(줄바꿈·공백 차이 허용). 매핑되면 `fontName`은 segments에서, 실패하면 SVG 속성(font-weight/font-style)으로 대체 매칭.
- 그리기(`src/ui/textLayer.ts`): 머지된 페이지 위에
  - `page.drawText(run.text, { x: offset.x + run.x, y: pageHeight − (offset.y + run.y), size, font, color, opacity })`
  - letterSpacing ≠ 0이면 `pushOperators(setCharacterSpacing(v))`로 감싼다(그린 뒤 0으로 복원).
  - 폰트는 문서당 파일별 1회 `embedFont(bytes, { subset:true })` 후 캐시.
  - `textDecoration` UNDERLINE/STRIKETHROUGH → `drawLine` (P1 후반).
  - `hyperlink`(URL) → Link annotation(`/Annots`, `/A /URI`), rect = run 바운딩박스. Figma 기본 링크 잔존 여부는 S5 결과에 따라 중복 방지.
- 폰트 자원: `fonts/*.ttf` + `fonts/fonts.json`

  ```json
  [{ "family": "Pretendard", "style": "Bold", "weight": 700, "italic": false, "file": "Pretendard-Bold.ttf" }]
  ```

  `build-figma-plugin.ui.js`에서 esbuild loader `'.ttf': 'base64'`로 인라인. Variable 폰트 금지(서브셋 불안정) — static만.
- 매핑(`src/lib/fontMatch.ts`): family 정확 일치 + style 정확 일치 → 없으면 같은 family에서 weight 최근접(italic 일치 우선) → 없으면 실패.
- 수용 기준: G3. 200% 줌에서 글리프 위치 차이 ±0.5pt 이내. fallback 노드 수와 사유가 리포트에 나온다.

### FR-8 페이지별 파일 / 드래그 정렬 / 북마크 / 암호 / 비교 모드 (P2)

- Phase 3에서 필요하면 한다. 이 문서에서 설계하지 않는다.

---

## 7. 기술 설계

### 7.1 스택 (여기 없는 의존성은 사유 없이 추가하지 않는다)

- TypeScript strict, Node 20+
- `create-figma-plugin` (`@create-figma-plugin/ui` Preact 컴포넌트, `@create-figma-plugin/utilities`의 `emit/on/showUI`). 스캐폴드: `npx --yes create-figma-plugin` → UI 포함 Preact 플러그인 템플릿.
- `pdf-lib` ^1.17, `@pdf-lib/fontkit`
- `vitest` (+ `jsdom` 환경은 svgText 테스트에만), `eslint`, `prettier`
- P2에서만: `@dnd-kit/core`

### 7.2 레포 구조

```
figma-sheaf/
  package.json                 "figma-plugin" 필드로 manifest 생성 (editorType ["figma"], documentAccess "dynamic-page", networkAccess none)
  build-figma-plugin.ui.js     esbuild loader 추가: .ttf → base64
  CLAUDE.md                    §12 복사
  docs/PRD.md                  이 문서
  docs/SPIKES.md               §10 가설·검증·결과
  docs/CHECKLIST.md            Phase별 수동 체크리스트 (Claude Code가 갱신)
  fonts/                       *.ttf + fonts.json   (.gitignore: *.ttf)
  samples/                     테스트용 개인 PDF     (.gitignore 전체)
  src/
    main.ts                    엔트리: showUI, 선택 관찰, export 오케스트레이션, 잔여 클론 정리
    main/
      selection.ts             선택 → FrameItem[] (정렬·썸네일)
      exporter.ts              프레임 1개 파이프라인 (clone → images → text → pdf → cleanup)
      images.ts                이미지 fill 수집·타깃 계산 호출·교체
      text.ts                  Phase 2: 대상 판정, SVG·세그먼트 추출, fills 제거
      bridge.ts                reqId 기반 요청/응답 promise 맵, 타임아웃 30s
    ui.tsx                     엔트리: render(App)
    ui/
      App.tsx  FrameList.tsx  ImageSettings.tsx  Progress.tsx  Report.tsx
      resize.ts                createImageBitmap/OffscreenCanvas, 알파 검사, 인코딩
      pdf.ts                   머지·메타·저장(Blob → a[download])
      textLayer.ts             Phase 2: runs → drawText, 폰트 캐시, 링크 annotation
      fonts.ts                 fonts.json + base64 → bytes, 글리프 커버리지 검사
    lib/                       ★ Figma·DOM 의존 없음. 전부 테스트 대상
      types.ts                 메시지·데이터 타입 (main·ui 공유)
      imageTarget.ts           타깃 크기 계산
      order.ts                 위치순·이름순 정렬
      svgText.ts               SVG → runs 파서 (DOMParser 주입)
      fontMatch.ts             fontName → 폰트 파일 매핑
  tests/
    fixtures/                  S3에서 확보한 실제 SVG_STRING 샘플
```

### 7.3 메시지 프로토콜 (`src/lib/types.ts`)

모든 요청은 `reqId`를 갖고, 응답은 같은 `reqId`로 돌아온다. `bridge.ts`가 `Map<reqId, {resolve, reject, timer}>`를 관리한다.

```ts
export type Settings = {
  version: 1
  quality: number            // 0.5–0.95
  multiplier: 1 | 1.5 | 2
  maxEdge: 1024 | 1600 | 2048 | 4096
  reencodeOpaquePng: boolean
  embedText: boolean         // Phase 2
}

export type FrameItem = {
  id: string; name: string; width: number; height: number
  imageCount: number; textCount: number; thumb?: Uint8Array
}

export type TextRunSource = {          // Phase 2, 메인 → UI
  nodeId: string; characters: string
  svg: string; offset: { x: number; y: number }
  segments: Array<{ start: number; end: number; fontName: { family: string; style: string }
    fontSize: number; fills: Array<{ r: number; g: number; b: number; a: number }>
    letterSpacing: { unit: 'PIXELS' | 'PERCENT'; value: number }
    textDecoration: string; textCase: string; hyperlink: { type: 'URL'; value: string } | null }>
}

export type MainToUI =
  | { type: 'settings'; value: Settings }
  | { type: 'selection'; items: FrameItem[] }
  | { type: 'image:resize'; reqId: string; bytes: Uint8Array; targetLongEdge: number
      quality: number; reencodeOpaquePng: boolean }
  | { type: 'text:validate'; reqId: string; items: Array<{ nodeId: string; characters: string
      fontNames: Array<{ family: string; style: string }> }> }
  | { type: 'pdf:part'; index: number; name: string; bytes: Uint8Array
      text: TextRunSource[]; stats: { imagesProcessed: number; bytesBefore: number; bytesAfter: number
      fallbacks: Array<{ nodeId: string; reason: string }> } }
  | { type: 'progress'; label: string; current: number; total: number }
  | { type: 'done'; skipped: Array<{ id: string; reason: string }> }
  | { type: 'error'; message: string }

export type UIToMain =
  | { type: 'ui:ready' }
  | { type: 'settings:save'; value: Settings }
  | { type: 'export'; order: string[]; settings: Settings }
  | { type: 'cancel' }
  | { type: 'image:resize:result'; reqId: string; ok: true; bytes: Uint8Array
      mime: 'image/jpeg' | 'image/png'; width: number; height: number }
  | { type: 'image:resize:result'; reqId: string; ok: false; reason: string }
  | { type: 'text:validate:result'; reqId: string; eligible: string[]
      rejected: Array<{ nodeId: string; reason: string }> }
```

### 7.4 내보내기 파이프라인 — 프레임 1개 (`src/main/exporter.ts`)

```
0. 시작 시 페이지에서 name === '__sheaf_tmp__' 노드가 있으면 전부 제거 (이전 크래시 잔여물) + 알림
1. node = await figma.getNodeByIdAsync(id); export 가능 타입인지 검증
2. clone = node.clone(); clone.name = '__sheaf_tmp__'
   figma.currentPage.appendChild(clone); clone.x = 100000 + index*10000   // 오토레이아웃 부모 영향 차단 + 화면 밖
3. 이미지
   a. nodes = clone.findAll(n => 'fills' in n && Array.isArray(n.fills)
                                && n.fills.some(p => p.type==='IMAGE' && p.visible !== false))
   b. hash → { target(max), usages[] } 집계 (lib/imageTarget.ts)
   c. hash마다 순차로: img = figma.getImageByHash(hash); bytes = await img.getBytesAsync();
      size = await img.getSizeAsync(); 처리 필요하면 UI에 image:resize 요청 → 결과 bytes로
      figma.createImage(bytes).hash → map[hash] = newHash. 실패하면 원본 유지 + 경고
   d. usages마다 node.fills = node.fills.map(p =>
        p.type==='IMAGE' && map[p.imageHash] ? { ...p, imageHash: map[p.imageHash] } : p)
4. 텍스트 (settings.embedText일 때만, Phase 2)
   a. texts = clone.findAll(n => n.type==='TEXT'); 조건 1~3 판정
   b. 통과 노드: SVG_STRING + segments + offset 추출 (fills 제거 전에!)
   c. UI에 text:validate → eligible만 t.fills = []; 나머지는 fallback 사유 기록
5. pdf = await clone.exportAsync({ format:'PDF', contentsOnly:true })
6. finally: clone.remove()   // 성공·실패·취소 공통
7. UI로 pdf:part 전송
```

- 동시성 1. 페이지 N개를 순차 처리한다. 빠르게 만들려다 메모리로 죽는 쪽이 더 비싸다.
- 취소 플래그는 각 await 경계에서 확인한다.

### 7.5 UI 측 조립 (`src/ui/pdf.ts`, `textLayer.ts`)

```
parts를 index 순으로 보관. done 수신 시:
out = await PDFDocument.create(); out.registerFontkit(fontkit)
for part of parts:
  src = await PDFDocument.load(part.bytes)
  [page] = await out.copyPages(src, [0]); out.addPage(page)
  if (embedText) drawTextLayer(out, page, part.text)       // Phase 2
메타데이터 설정 → bytes = await out.save({ useObjectStreams:true })
Blob → <a download="{name}.pdf"> click
```

- `pageHeight = page.getHeight()`를 쓴다. 1px = 1pt 가정은 S7에서 확인한다.

### 7.6 리사이즈 (`src/ui/resize.ts`)

```
blob = new Blob([bytes]); bitmap = await createImageBitmap(blob)
scale = target / max(bitmap.width, bitmap.height)   (scale ≥ 1이면 리사이즈 생략)
단계 축소: scale < 0.5면 절반씩 createImageBitmap(prev, {resizeWidth, resizeHeight, resizeQuality:'high'}) 반복
canvas = new OffscreenCanvas(w, h); ctx.drawImage(bitmap, 0, 0, w, h)
hasAlpha = 원본이 PNG일 때만 getImageData 샘플링(16px 간격)으로 판정
out = hasAlpha ? canvas.convertToBlob({ type:'image/png' })
               : canvas.convertToBlob({ type:'image/jpeg', quality })
결과 바이트 ≥ 원본이면 원본 그대로 반환 (ok:true, 원본 bytes)
```

### 7.7 실패 모드

| 상황 | 동작 |
|---|---|
| `getImageByHash` null / `getBytesAsync` 실패 | 그 이미지 원본 유지, 리포트 경고 |
| `createImage` throw (형식·크기) | 원본 유지, 경고 |
| `exportAsync` 실패·30s 타임아웃 | 그 프레임 건너뛰고 계속. 최종 리포트에 표시 |
| UI 닫힘 / 취소 | 진행 중 클론 제거 후 중단 |
| 재실행 시 `__sheaf_tmp__` 잔존 | 자동 삭제 + 알림 (7.4-0) |
| 폰트 매핑·글리프 커버리지 실패 (Phase 2) | 그 TextNode만 fallback, 사유 기록 |
| 메시지 타임아웃 | reject → 해당 단위 실패 처리, 파이프라인은 계속 |
| parts 합계 > 200MB | 머지 전 경고 표시(계속 가능) |

### 7.8 성능 목표

- 이미지 1장(4096→2048) < 300ms, 페이지당 < 5s, 10페이지 < 60s (G5)
- 측정은 리포트의 "소요 시간"으로 한다. 목표 미달이면 이미지 처리만 동시성 2까지 허용.

---

## 8. UI 스펙

> **2026-08-21 주:** 아래는 최초 스펙이다. 이후 실사용 피드백으로 UI 가 크게 진화했다 —
> 탭 3개(내보내기/이미지/폰트) 구조, 하단 고정 푸터, 이미지 프리셋, 드래그 정렬,
> 목록·리포트에서 캔버스로 점프, 파일명 자동 생성(다이얼로그에 채움), 한/영 자동 전환,
> 창 높이 자동 조절. 현재 화면 기준은 README 와 `npm run ui:preview` 실물이다.

- `@create-figma-plugin/ui` 컴포넌트만 사용(Figma 룩, 다크모드 자동). 폭 400, 높이는 목록에 맞춰 자동(420–680), resizable.
- 라벨 한국어(앱 언어 영어면 영어). 아래 와이어는 초기 버전이다.

```
┌ Sheaf ────────────────────────────────────────┐
│ 페이지 3개                    [위치순] [이름순]  │
│ ▦ 01 Cover        1440×1024  이미지 2   ↑ ↓ ✕  │
│ ▦ 02 About        1440×1024  이미지 5   ↑ ↓ ✕  │
│ ▦ 03 Project-A    1440×1024  이미지 8   ↑ ↓ ✕  │
│ 제외됨 1개 · 복원                               │
├────────────────────────────────────────────────┤
│ 이미지                                          │
│   품질          ◦────●──── 0.80                 │
│   배율          [1x] [1.5x] [2x]                │
│   긴 변 상한    [1024] [1600] [2048] [4096]      │
│   ☑ 투명 없는 PNG는 JPEG로                      │
│ 텍스트                                          │
│   ☑ 텍스트를 실제 폰트로 임베드 (Phase 2)        │
├────────────────────────────────────────────────┤
│ [ PDF 내보내기 ]            이미지 3/12 ▓▓▓░ 취소 │
│ 결과: 2.1MB · 이미지 17.4MB → 1.3MB · 14초       │
│ 경고 1 · fallback 텍스트 2 (자세히)              │
└────────────────────────────────────────────────┘
```

- 내보내기 중에는 목록·설정을 잠근다. 결과 영역은 마지막 결과를 유지한다.
- 선택 0개: 목록 자리에 "내보낼 프레임을 캔버스에서 선택하세요".

---

## 9. 마일스톤과 DoD

### Phase 0 — 진단 + 스캐폴드 (반나절)

- PO: 현재 Figma 기본 export PDF에 아래를 돌려 `docs/SPIKES.md` 맨 위 "Baseline"에 붙여넣는다.

  ```
  brew install poppler qpdf
  ls -l 이력서.pdf
  pdfimages -list 이력서.pdf     # 이미지 수·해상도·인코딩
  pdffonts 이력서.pdf            # 폰트 임베드 상태
  pdftotext 이력서.pdf - | head -40
  ```

- Claude Code: create-figma-plugin 스캐폴드, lint/test/build 스크립트, `lib/types.ts`, 선택 목록을 보여주는 빈 UI, `CLAUDE.md`, `docs/*` 생성.
- DoD: `npm run build` 성공. Figma 데스크톱 → Plugins → Development → Import plugin from manifest → 실행하면 선택한 프레임 이름이 목록에 뜬다.

### Phase 1 — 순서 + 머지 (저녁 1회, 이미지 무압축)

- FR-1, FR-2, FR-4(이미지 교체 없이), FR-5 최소(크기·시간), FR-6
- DoD: 프레임 3개 선택 → 순서 변경·1개 제외 → PDF 1개. 페이지 순서 일치, 원본 문서 무변경, 잔여 클론 0. `pdfimages -list` 결과가 Figma 기본 export와 동일(아직 무압축이므로 같아야 정상).

### Phase 1.5 — 이미지 압축 (저녁 1회)

- FR-3 전체, FR-5 리포트
- DoD: G1 측정(Baseline 대비). `pdfimages -list`의 모든 이미지 긴 변 ≤ target, 불투명은 jpeg, 투명 PNG 유지. 200% 줌 육안 비교 OK. 성공·실패·취소 3경로 모두 잔여 클론 0.
- **여기서 멈춘다.** PO 가 이력서·포폴을 실제로 내보내 본다. 용량·화질이 만족스러우면 Phase 2 착수 여부를 결정한다.

### Phase 2 — 실 폰트 임베드 (주말 1회)

- 선행: S1, S3, S4 통과 필수(§10). 실패 시 §10의 플랜 B로 범위를 조정하고 PRD를 v0.2로 올린다.
- FR-7 전체(링크 포함)
- DoD: G3(`pdffonts`, `pdftotext`), fallback 리포트 정상, 200% 줌 위치 차이 ±0.5pt, 이모지·특수문자 포함 텍스트가 fallback으로 안전하게 빠진다.

### Phase 3 — 품질 (선택)

- FR-8 중 필요한 것만. 착수 전 PRD에 범위를 쓴다.

---

## 10. 스파이크 — 구현 전에 검증할 가정 (`docs/SPIKES.md`)

| ID | 가정 | 검증 방법 | 틀렸을 때 플랜 B |
|---|---|---|---|
| S1 | TextNode `fills=[]`이면 PDF에 글리프 아웃라인이 남지 않는다(용량↓) | 텍스트 많은 프레임 1개를 원본/`fills=[]` 두 번 export → 크기 비교, `pdftotext` 결과가 비어야 함 | 아웃라인 위에 투명 텍스트(render mode 3)만 얹는다. 검색·복사는 되지만 텍스트 용량 이득은 없음 |
| S2 | Figma PDF export가 JPEG fill을 재인코딩한다/안 한다 | q=0.6 JPEG로 교체 후 `pdfimages -list`의 바이트·해상도를 입력과 비교 | 재인코딩하면 품질 슬라이더를 "참고값"으로 표기, 픽셀 상한이 주 레버 |
| S3 | `SVG_STRING`(`svgOutlineText:false`) 텍스트 구조: tspan 좌표 원점 = 노드 박스 좌상단, y = baseline, 줄마다 tspan, textCase 적용됨 | 이력서 텍스트 노드 4종(단일 줄·다중 줄·혼합 스타일·가운데 정렬+자간)의 SVG를 `tests/fixtures/`에 저장하고 좌표를 노드 값과 대조 | 원점이 다르면 offset 규칙 수정. 줄 정보가 없으면 Phase 2를 단일 줄 텍스트로 축소(직접 줄바꿈 계산은 하지 않는다) |
| S4 | `@pdf-lib/fontkit`이 Pretendard static TTF 한글 서브셋을 임베드한다 | Node 스크립트: 한글 100자 drawText → `pdffonts`(emb/sub yes), `pdftotext` 일치 | OTF→TTF 변환 또는 `subset:false`(용량↑) |
| S5 | `fills=[]` 후에도 Figma가 넣던 하이퍼링크 annotation이 남는다/안 남는다 | 링크 있는 텍스트 프레임 export → `qpdf --qdf` 출력에서 `/URI` 확인 | 안 남으면 FR-7 링크 재생성 필수, 남으면 중복 생성 금지 |
| S6 | `clone()`이 오토레이아웃 부모 안에서 형제를 재배치한다 | 오토레이아웃 안 프레임을 선택해 실행, 원본 변화 관찰 | 기본 채택: 클론 직후 `appendChild(page)`로 이동(7.4-2) |
| S7 | PDF 페이지 크기(pt) == 프레임 크기(px) | pdf-lib `page.getSize()` vs `node.width/height` | 스케일 계수를 offset·좌표에 곱한다 |

---

## 11. 테스트 전략

- 자동(vitest, `npm test`)
  - `lib/imageTarget`: 경계값(4096 상한, scale ≥ 1 생략, 동일 해시 다중 사용 max, 결과 ≥ 원본 시 원본 유지)
  - `lib/order`: 행 허용오차, 동일 행 좌→우, 이름순 natural sort(`01`, `02`, `10`)
  - `lib/svgText`: S3 픽스처 4종 → runs 개수·좌표·문자 인덱스 매핑
  - `lib/fontMatch`: 정확 일치 / weight 근사 / 실패
  - `ui/pdf` 머지 로직: Node에서 pdf-lib로 작은 PDF 2개 생성 → 머지 → 페이지 수·크기·메타 확인 (DOM 없이 동작하도록 저장 부분만 분리)
- 수동(Figma) — Claude Code는 `docs/CHECKLIST.md`를 Phase마다 갱신하고, PO 가 실행 결과(`pdfimages`/`pdffonts`/`pdftotext` 출력, 육안 비교)를 붙여넣으면 판정한다.
- 회귀 픽스처(PO 제공): 이력서 프레임 1개, 이미지 많은 포폴 프레임 1개, 오토레이아웃 내부 프레임 1개, 링크·이모지 포함 텍스트 1개.
- 도구: poppler-utils(`pdfimages`, `pdffonts`, `pdftotext`, `pdftoppm`), `qpdf`.

---

## 12. Claude Code 작업 규칙 (`CLAUDE.md`로 복사)

- 단일 진실 공급원은 `docs/PRD.md`다. PRD에 없는 기능은 만들지 않는다. 필요하다고 판단되면 `docs/PRD.md` 맨 아래 `## 제안` 섹션에 한 줄로 적고 넘어간다.
- Phase 순서(§9)를 지킨다. 각 Phase 끝: `npm run lint && npm test && npm run build` 녹색 → 커밋(`feat(phase-1): ...`) → `docs/CHECKLIST.md` 갱신 → 수동 체크리스트를 출력하고 **멈춘다.** 사람 확인 없이 다음 Phase로 가지 않는다.
- 원본 노드를 절대 수정하지 않는다. 모든 mutation은 `name === '__sheaf_tmp__'`인 클론에서 하고 `try/finally`로 제거한다.
- `src/main/**`에서 DOM·Canvas·fetch·window 사용 금지. `src/ui/**`에서 `figma` 전역 사용 금지. 둘이 공유하는 타입은 `src/lib/types.ts`에만 둔다.
- `src/lib/**`는 Figma·DOM 의존 금지(필요하면 주입). 테스트 없는 lib 코드는 머지하지 않는다.
- Figma 런타임 동작이 확실하지 않으면(§10) 추측으로 굳히지 말고 `docs/SPIKES.md`에 가설·검증 절차를 쓰고 플래그 뒤에 구현한다.
- UI 문구는 한국어, 코드·커밋 메시지는 영어.
- 파일이 300줄을 넘으면 분리한다.
- 의존성은 §7.1 목록 안에서만. 추가가 필요하면 사유를 커밋 메시지에 쓴다.
- `fonts/*.ttf`, `samples/`, 개인 PDF는 커밋 금지(.gitignore).
- 실패 모드(§7.7)는 "나중에"가 아니라 해당 기능과 같은 커밋에서 처리한다.

---

## 13. 오픈 질문 (PO 결정 필요)

1. 이력서·포폴에 쓰는 폰트 목록은? (Pretendard static이면 weight 몇 개?) → `fonts.json` 초기값
2. 기본값 품질 0.8 / 배율 1.5x / 상한 2048로 시작해도 되는지. 포폴 스크린샷은 2x가 나을 수도 있다.
3. 페이지별 파일 출력이 실제로 필요한지(Phase 3).
4. 북마크·암호 필요 여부.
5. 스파이크용 샘플 프레임(이력서 1, 포폴 1, 오토레이아웃 내부 1, 링크·이모지 텍스트 1) 제공 시점.

---

## 14. 참고

- Figma Plugin API: ExportSettings(PDF에 옵션 없음, `svgOutlineText`), Working with images(`createImage` 제한), `TextNode.getStyledTextSegments`, `Image.getBytesAsync/getSizeAsync`, `figma.clientStorage`
- create-figma-plugin: quick-start, recipes(`build-figma-plugin.ui.js`로 esbuild 설정 덮어쓰기)
- pdf-lib: `registerFontkit`, `embedFont(..., { subset })`, `copyPages`, `pushOperators`/`setCharacterSpacing`
- 레퍼런스 기능 세트: https://typeport.app/help#features
- poppler-utils, qpdf

---

## 변경 이력

- v0.1 (2026-08-20) 최초 작성. 요구사항·제약·파이프라인·스파이크·Phase 정의.

## 제안

- (Claude Code가 작업 중 떠오른 PRD 외 아이디어를 여기에 한 줄씩)
- Phase 0: §7.1의 "Node 20+"는 실제로 Node 22+ 여야 한다. `@create-figma-plugin/common@4.0.3`이 `engines.node >= 22`를 요구한다(Node 20에서 EBADENGINE 경고). 레포에 `.nvmrc`(22)를 뒀다.
- Phase 0: G3의 `pdffonts` `sub=yes` 기준은 달성 불가 — pdf-lib은 서브셋 폰트에 `ABCDEF+` 태그를 안 붙인다(S4 실측). `emb=yes` + 파일 크기 + `pdftotext` 일치로 바꾸자.
- Phase 2 선행: `fonts/`에 원본 TTF를 그대로 두면 base64 인라인 시 weight당 1.5~2.5MB가 UI 번들에 실린다(4 weight면 8~10MB, 플러그인 열 때마다 파싱). 빌드 전에 한글 2350자 + 라틴으로 **미리 서브셋한 TTF**를 두는 편이 낫다.
- Phase 0(구현됨, PO 승인): FR-1 에 "선택한 프레임이 쓰는 폰트 목록 + fonts.json 초안" 표시를 추가했다. 오픈 질문 1을 플러그인이 직접 답하게 하려는 것. 메시지 타입 `fonts` 가 §7.3 에 추가됐다 — FR-1 본문에 반영 필요.
- Phase 2: FR-7 의 fontMatch "weight 최근접" 폴백은 Bold 를 SemiBold 로 그려놓고 성공 처리할 수 있다. family+style 정확 일치만 임베드하고 나머지는 fallback 하는 편이 "내가 쓴 그 폰트로 나와야 한다"는 요구에 맞다.
- 레퍼런스 조사(2026-08-20, typeport.app): Typeport 는 ① Google Fonts 를 export 시점에 감지·임베드(무료) ② 커스텀 폰트는 TTF/OTF **업로드** 후 임베드(PRO) ③ 무료 티어의 커스텀 폰트는 **rasterize** ④ 멀티페이지·북마크·암호·워터마크 제거 = PRO $5/mo·$60/yr ⑤ 전부 로컬 처리(서버 없음). → 플러그인 안에서 진짜 폰트 임베드가 상용으로 돌아간다는 확인. 폰트 조달은 번들/네트워크/업로드 셋 중 하나뿐이라는 것도 확인(플러그인 API 는 로컬 폰트 바이너리를 못 읽는다).
- Pretendard 는 Google Fonts 에 없다 → Typeport 무료 티어로는 PO 이력서 텍스트가 rasterize 된다. 비교 대상은 Typeport PRO($60/yr).
- Phase 2 폰트 자원: FR-7 의 "빌드 시 base64 번들"(C8) 대신 `figma.clientStorage` 보관으로 간다(S8). 번들 3.3MB 증가가 없고, 폰트를 바꿔도 재빌드가 필요 없다. 서브셋은 여전히 필수(원본 4종 12.6MB > 5MB 한도). S8 이 실패하면 번들로 되돌린다 — `.ttf` 로더는 남겨 뒀다.
- 폰트 파일에서 family/style 을 자동으로 못 읽는다: variable 에서 뽑은 static 인스턴스의 이름표는 RIBBI 규칙 때문에 "Pretendard Variable SemiBold / Regular" 로 나와 Figma 가 부르는 이름과 어긋난다. 그래서 UI 는 문서가 쓰는 자리를 먼저 보여주고 거기에 파일을 붙이는 방식으로 만들었다.
- **Phase 순서 변경 제안 (Baseline 실측 근거)**: 이력서 문서에서 이미지는 용량의 3.3%, 텍스트가 84%다. Phase 1.5(이미지 압축)를 다 해도 9.6MB→9.3MB 라 의미가 없고, Phase 2 는 9.6MB→0.5MB(5.3%) 로 추정된다. **1.5 와 2 의 순서를 바꾸자.** 포트폴리오용으로 1.5 는 그대로 필요하다.
- G3 수정 근거 추가: Figma PDF 의 텍스트는 아웃라인이 아니라 **Type 3 폰트**로 들어가고 ToUnicode 가 붙어 있어 `pdftotext` 로 이미 정확히 추출된다. 따라서 Phase 2 의 가치는 '검색·복사·파싱 가능'이 아니라 **용량**이다. PRD §1 의 부수 문제 서술을 고쳐야 한다.
- S1 재정의: 검증할 것은 "아웃라인이 사라지는가"가 아니라 "**TextNode `fills=[]` 로 만들면 Figma 가 Type 3 폰트와 콘텐츠 스트림을 아예 안 넣는가**"다. 이게 안 되면 84% 가 그대로 남아 Phase 2 의 용량 이득이 사라진다.
- **의존성 변경 (§7.1)**: `@pdf-lib/fontkit` → `fontkit` 2.x. 전자의 서브셋이 Pretendard 에서 글리프를 깨뜨린다(S9 실측). 어댑터는 `src/ui/fontkitAdapter.ts` 한 파일이고, UI 번들은 오히려 1.47MB → 898KB 로 줄었다.
- **폰트 조달 방식 확정 (FR-7 / C8 변경)**: 빌드 시 base64 번들(C8)도, 로컬 폰트 서버도 쓰지 않는다. 공개 폰트는 `networkAccess.allowedDomains: ["https://cdn.jsdelivr.net"]` 으로 내보낼 때 받고(카탈로그: `src/lib/fontCatalog.ts`), 못 구하는 서체만 사용자가 UI 에서 넣어 clientStorage 에 둔다. Typeport 가 Google Fonts 에 하는 것과 같은 구조다. 번들은 플러그인을 몇 MB 무겁게 하고, 로컬 서버는 레포·Node 가 있어야 돌아서 플러그인이라 할 수 없다. → C8 을 "네트워크 금지" 에서 "폰트 CDN 만 허용" 으로 고쳐야 한다.
