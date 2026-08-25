# SPIKES — 구현 전에 검증할 가정

> **Historical document.** Runtime assumptions that had to be verified against
> the real Figma API before the code could rely on them, with the measurements
> that settled each one (Korean). Useful when you wonder "why does it do it this
> odd way" — the answer is usually "because the obvious way was measured and it
> didn't work".
>
> The baseline numbers at the top are from the very first export, before any
> optimisation existed.


각 항목: 가설 / 검증 절차 / 결과(검증 후 채움) / 결정.
결과가 없는 스파이크에 의존하는 코드는 플래그 뒤에 둔다. (PRD §10, §12)

상태 표기: `미검증` · `통과` · `실패(플랜 B)`

---

## Baseline — 실측 진단 (2026-08-20)

Phase 1 로 내보낸 `Playground.pdf` (이력서 5쪽, Figma 기본 export 와 내용 동일 — Phase 1 은
이미지·텍스트를 손대지 않는다).

```
$ pdfinfo Playground.pdf
File size:   9,617,591 bytes · Pages: 5 · Page size: 595 x 842 pts (A4)
Producer:    Sheaf

$ pdfimages -list Playground.pdf
페이지당 image(jpeg, 2383x804) 40.0K + smask 23.6K → 5쪽 합계 약 318,000 bytes

$ pdffonts Playground.pdf
Type 3 폰트 47개, 전부 emb=yes / uni=yes  (이름 [none], encoding Custom)

$ pdftotext Playground.pdf -
16,253자 추출됨. 한글 정확.
유니크 코드포인트 656개 (한글 563 · 라틴 82 · 기호 11)
KS X 1001 2,350자로 못 덮는 글자: 0개
조합형 자모(U+1100–11FF)가 섞여 나옴 → 서브셋 범위에 자모 영역 추가함

스트림 크기 분포 (전체 9,109,217 bytes = 파일의 95%)
  페이지 콘텐츠 스트림 5개: 2,239,843 + 1,557,324 + 1,540,846 + 1,504,304 + 1,232,326
                          = 8,074,643 bytes (파일의 84%)
  그 다음 큰 것부터 42,598 / 40,930 / 40,930 (이미지)
```

### 판정 — PRD §1 의 가설 검증

| PRD 가정 | 실측 | 결론 |
|---|---|---|
| (a) 이미지가 원본 해상도로 임베드돼 무겁다 | 318KB, 파일의 **3.3%** | **틀림.** 이 문서에선 이미지가 범인이 아니다 |
| (b) 텍스트가 글리프로 들어가 무겁다 | 콘텐츠 스트림 **84%**, Type 3 폰트 47개 | **맞음.** 유일한 레버 |
| 부수 문제: 파서가 본문을 못 읽는다 | `pdftotext` 가 16,253자를 정확히 뽑음 | **틀림.** Type 3 에 ToUnicode 가 붙어 있어 검색·복사·ATS 파싱은 이미 된다 |

### Phase 2 효과 추정 (실측 기반)

추출한 실제 텍스트 14,121자를 Pretendard static 4종으로 서브셋 임베드해서 측정:

```
텍스트 부분        193,303 bytes   (폰트 4종 임베드 포함, pdffonts 전부 emb=yes)
이미지 부분(그대로) 318,000 bytes
합계                511,303 bytes  →  현재의 5.3%
```

G1(이력서 ≤ 1MB) 을 여유 있게 넘긴다.

### 그래서 Phase 순서

- **Phase 1.5(이미지 압축)를 다 해도 최대 300KB 준다** (9.6MB → 9.3MB). 이 문서엔 무의미.
- Phase 2 가 유일한 레버이고, 그 효과가 20배다.
- → Phase 1.5 를 뒤로 미루고 Phase 2 를 먼저 하는 것을 권고. (이미지 많은 포트폴리오를 내보낼
  때는 Phase 1.5 가 여전히 필요하므로 폐기가 아니라 순서 변경이다.)

## S1 — TextNode `fills=[]`이면 Type 3 폰트가 PDF 에서 빠진다

- 상태: **통과** (2026-08-20, 실측)
- 결과: 토글을 켜고 내보낸 5쪽 PDF 가 9,617,591 → 6,301,614 bytes. fill 을 비운 노드의
  Type 3 폰트가 실제로 빠졌다. 남은 Type 3 는 그때 파서 버그로 fallback 된 노드들의 것이다.
- 결론: Phase 2 의 전제가 성립한다. 용량 이득의 원천이 확인됐다.

### (원래 기록)
- 가설: 텍스트 fill을 비우면 PDF에 벡터 패스가 아예 안 들어가서 용량이 줄어든다.
- 검증: 텍스트 많은 프레임 1개를 원본 / `fills=[]` 두 번 export → 파일 크기 비교, `pdftotext` 결과가 비어야 함.
- 플랜 B: 아웃라인 위에 투명 텍스트(render mode 3)만 얹는다. 검색·복사는 되지만 텍스트 용량 이득은 없음.
- 결과:
- 결정:

## S2 — Figma PDF export가 JPEG fill을 재인코딩하는가

- 상태: 미검증 (Phase 1.5 선행)
- 가설: 교체해 넣은 JPEG 바이트가 그대로 임베드된다(재인코딩 없음).
- 검증: q=0.6 JPEG로 fill 교체 후 `pdfimages -list`의 바이트·해상도를 입력과 비교.
- 플랜 B: 재인코딩하면 품질 슬라이더를 "참고값"으로 표기하고 픽셀 상한을 주 레버로 삼는다.
- 결과:
- 결정:

## S3 — `SVG_STRING`(`svgOutlineText:false`) 텍스트 구조

- 상태: **통과 (구조 확인, 파서 수정함)** — 픽스처: `tests/fixtures/figmaSvgText.ts`
- 실물 구조 (2026-08-20, `svg:dump` 로 확보)

  ```xml
  <text fill="black" style="white-space: pre" xml:space="preserve"
        font-family="Pretendard Variable" font-size="7" letter-spacing="-0.015em">
    <tspan x="0" y="7.48828">첫 줄…&#x2028;</tspan>
    <tspan x="0" y="17.4883">둘째 줄…&#10;</tspan>
  </text>
  ```

  - 가정대로: 줄마다 tspan, y 는 baseline, 좌표는 노드 박스 좌상단 기준, 속성은 `<text>` 에
  - **가정과 달랐던 것**
    1. `xml:space="preserve"` 라서 **tspan 안에 줄바꿈 문자가 남는다** — `&#10;`(LF), `&#x2028;`.
       pdf-lib 의 `drawText` 가 `\n` 에서 줄을 바꿔 텍스트가 쏟아졌다. → `stripLineBreaks` 로 제거
    2. 검정이 hex 가 아니라 `fill="black"` → 이름 색 지원 추가
    3. font-weight 가 `bold` 키워드로도, `800` 숫자로도 온다 → 둘 다 처리
- 결정: 파서 수정 + 픽스처 고정 완료.
- 가설: tspan 좌표 원점 = 노드 박스 좌상단, `y` = baseline, 줄마다 tspan, `textCase`가 이미 적용된 문자열.
- 검증: 텍스트 노드 4종(단일 줄 · 다중 줄 · 혼합 스타일 · 가운데 정렬+자간)의 SVG를 `tests/fixtures/`에 저장하고 좌표를 노드 값과 대조.
- 플랜 B: 원점이 다르면 offset 규칙 수정. 줄 정보가 없으면 Phase 2를 단일 줄 텍스트로 축소(직접 줄바꿈 계산은 하지 않는다).
- 결과:
- 결정:

## S4 — `@pdf-lib/fontkit`이 한글 static TTF를 서브셋 임베드한다

- 상태: **통과 (조건부 — 수용 기준 수정 필요)** / 2026-08-20, Pretendard 대신 `AppleGothic.ttf`로 대리 검증
- 가설: static TTF로 한글을 drawText하면 `pdffonts`에 emb=yes, sub=yes로 뜬다.
- 검증: Node 스크립트로 한글 175자(5줄) PDF 생성 → `pdffonts`, `pdftotext`.
- 결과

  ```
  원본 TTF (AppleGothic.ttf)   15,255,648 bytes
  subset:true  PDF                 21,563 bytes
  subset:false PDF              6,318,280 bytes

  $ pdffonts s4-subset.pdf
  name                 type           encoding      emb sub uni object ID
  AppleGothic-8450     CID TrueType   Identity-H    yes no  yes      4  0

  $ pdftotext s4-subset.pdf -
  → 원문 175자와 문자 단위 100% 일치 (한글··(middot)·이메일·괄호 포함)
  ```

- 판정
  - 서브셋 임베드는 **동작한다**. 15MB 폰트가 실린 PDF가 21KB (subset:false 대비 293배 작다).
  - 다만 `pdffonts`의 `sub` 컬럼은 **no**로 나온다. pdf-lib이 서브셋 폰트 이름에 PDF 관례인
    6자 태그(`ABCDEF+`)를 안 붙이기 때문이고, 실제 바이트는 서브셋된 것이 맞다.
  - → **PRD §2 G3의 "sub=yes" 기준은 그대로 두면 통과할 수 없다.** 기준을
    `emb=yes` + 결과 PDF 크기 + `pdftotext` 문자 일치로 바꾼다.
  - **실제 Pretendard 로 재확인 완료 (2026-08-20)** — PO Mac 의 `PretendardVariable.ttf`(6.7MB,
    wght 45~930, 글리프 14,757)에서 `fontTools.varLib.instancer` 로 static 4종을 뽑아 검증했다.

    ```
    static TTF 4종 합계          12,584,736 bytes
    결과 PDF (4종 모두 서브셋)         15,779 bytes   ← 595×842, 한글 174자
    pdffonts → 4종 모두 emb=yes, uni=yes (sub 컬럼은 위와 같은 이유로 no)
    pdftotext → 한글·—·…·※·괄호·영문 혼용까지 문자 단위 100% 일치
    ```

  - weight 4종(400/600/700/800)이 각각 별도 폰트로 임베드되므로 굵기가 뭉개지지 않는다.
- 재현: `node s4.mjs` (스크립트는 스크래치패드에 있음, 필요하면 `tools/`로 옮긴다)
- 결정: Phase 2 진행 가능. G3 수용 기준만 수정.
- 폰트 준비: `tools/make-static-fonts.py` (레포 `.venv` + fontTools). Variable 원본에서 뽑으므로
  Figma 렌더와 같은 글리프·메트릭이 보장된다. 번들 용량 축소(pyftsubset)도 같은 도구로 한다.

## S5 — `fills=[]` 후에도 하이퍼링크 annotation이 남는가

- 상태: 미검증 (Phase 2)
- 가설: Figma가 넣던 `/URI` annotation은 fill과 무관하게 남는다.
- 검증: 링크 있는 텍스트 프레임 export → `qpdf --qdf` 출력에서 `/URI` 확인.
- 플랜 B: 안 남으면 FR-7에서 링크를 재생성한다. 남으면 중복 생성 금지.
- 결과:
- 결정:

## S6 — `clone()`이 오토레이아웃 부모 안에서 형제를 재배치하는가

- 상태: 미검증 (Phase 1)
- 가설: 오토레이아웃 프레임의 자식을 clone하면 형제가 밀린다.
- 검증: 오토레이아웃 안 프레임을 선택해 실행하고 원본 변화를 관찰.
- 기본 채택(플랜 B 아님): 클론 직후 `figma.currentPage.appendChild(clone)`으로 페이지 루트로 옮긴다(PRD §7.4-2).
- 결과:
- 결정:

## S8 — 폰트를 번들 대신 `figma.clientStorage` 에 보관할 수 있다

- 상태: **문서 확인 완료 / Figma 런타임 검증 대기** (Phase 2 선행)
- 배경: 번들(base64)로 가면 서브셋해도 UI 번들이 3.3MB 늘어난다. clientStorage 에 두면 0 이다.
- 문서 팩트 (developers.figma.com, figma.clientStorage)
  - 플러그인당 **총 5MB**. 키 크기 + 값 크기로 계산하되 **Uint8Array 는 JSON 팽창 없이 실제 크기**.
  - 플러그인 ID 기준, **기기 로컬**. 기기 간 동기화 안 됨. 브라우저 캐시를 지우면 날아갈 수 있음.
  - 한도 초과 시 `setAsync` 가 reject.
- 계산

  ```
  서브셋한 static 4종   2,442,696 bytes  →  5MB 의 49%      ✅ 들어간다
  서브셋 안 한 4종     12,584,736 bytes  →  5MB 의 252%     ❌ 못 들어간다
  ```

  즉 clientStorage 로 가더라도 `npm run fonts` 의 서브셋은 여전히 필수다.
- 검증 (Figma 안에서 사람이): 4종을 실제로 넣고 플러그인을 껐다 켜서 목록이 유지되는지,
  용량 표시가 맞는지, 5번째를 넣을 때 초과 처리가 되는지.
- 채우는 방법: `npm run fonts:serve` (localhost:9137, `tools/serve-fonts.mjs`) 를 띄우면 플러그인이
  없는 폰트를 자동으로 받아 clientStorage 에 넣는다. manifest 는 `allowedDomains: ["none"]` 을
  유지하고 localhost 는 `devAllowedDomains` 로만 연다(개발 모드 전용). 서버가 없으면 수동 업로드.
- 플랜 B: 실패하면 번들(base64)로 되돌린다. `build-figma-plugin.ui.js` 의 `.ttf` 로더는 그대로 뒀다.
- 결과:
- 결정:

## S9 — pdf-lib 의 폰트 서브셋이 Pretendard 에서 깨진다

- 상태: **실패 → 대체 방법으로 해결** (2026-08-20, 실측)
- 증상: `pdftotext` 는 정확한데 렌더하면 글리프 대부분이 안 보인다. 합성 글리프 문제 아님
  (Pretendard 한글은 전부 단순 글리프). 사전 서브셋 여부와도 무관 — 원본 인스턴스로도 동일.
- 실측 (한글 34자, Pretendard-Regular)

  ```
  @pdf-lib/fontkit  subset:true      5,438 bytes  →  글리프 대부분 누락
  @pdf-lib/fontkit  subset:false   284,700 bytes  →  정상
  fontkit 2.0.4     subset:true      6,082 bytes  →  정상
  ```

- 원인: `@pdf-lib/fontkit` 은 fontkit 1.x 포크다. 2.x 에서 고쳐진 문제로 보인다.
- 결정: `fontkit` 2.x 로 교체하고 `src/ui/fontkitAdapter.ts` 에서 pdf-lib 이 기대하는
  `subset.encodeStream()` 만 이어 준다 (2.x 는 `encode()`). UI 번들도 1.47MB → 898KB 로 줄었다.
- 실측 확인: 실제 이력서 텍스트 8노드 20 run → 38,623 bytes, 렌더·추출 모두 정상.

## S7 — PDF 페이지 크기(pt) == 프레임 크기(px)

- 상태: 미검증 (Phase 1에서 확인 가능)
- 가설: 1px = 1pt.
- 검증: pdf-lib `page.getSize()` vs `node.width/height`.
- 플랜 B: 스케일 계수를 offset·좌표에 곱한다.
- 결과:
- 결정:
