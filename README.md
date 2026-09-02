# Featherweight – Compressed PDF Export with Real Fonts

![Featherweight — compressed PDF export with real fonts](docs/brand/cover-1920x960.png?v=5)

A Figma plugin that exports frames as **light PDFs with real embedded fonts**.

Figma's built-in PDF export turns every letter into vector outlines. Your text
can't be selected, searched, or read by résumé scanners (ATS) — and text-heavy
documents balloon to 10–20MB that no compressor can shrink, because there are no
images to compress.

Featherweight fixes the text problem itself:

- **Real fonts, not outlines** — text is re-embedded as subset fonts, so it stays
  selectable, searchable, copy-pasteable and ATS-parseable.
- **Smart image downscaling** — images are resized to their displayed size before
  export; anything already within the frame's budget passes through untouched.
- **Fit to a target size** — name a number (say 5 MB) and Featherweight finds the
  best image quality that still fits, or tells you the smallest it can reach.

A text-heavy résumé drops from ~10MB to under 1MB.

**[Install from the Figma Community →](https://www.figma.com/community/plugin/1672509720278498323/featherweight-compressed-pdf-export-with-real-fonts)**

The plugin UI follows your Figma app language (English / Korean). 한국어 안내는 [아래](#한국어-안내)에 있습니다.

**New in 2.1** — works in **Figma Slides**: run it in a deck and every slide
is a page, in deck order, with real fonts and downscaled images (Slides' own
PDF export outlines the text and keeps every image at full size). Selecting a
section exports the frames inside it. Selecting thirty frames no longer
freezes the canvas, and image-heavy exports are faster.

**New in 2.0** — one screen instead of tabs. Presets are tiles that show the
numbers they set; a *Before you export* checklist says how many images will
shrink, which fonts are ready and exactly which text layers would stay as
outlines (and why), with a link to the layer. Missing fonts can be picked out
of your font folder in one go. Advanced settings open with an HD-to-4K chart of
what your images become.

## How it works

1. Select frames on the canvas and run Featherweight — in Figma Slides, run it
   with nothing selected to export the whole deck
2. Pick a preset at the top — Sharp / Balanced / Smallest, or **Target** to name
   a file size. The chips underneath show exactly what changes
3. Read the **Before you export** checklist: frames, images, fonts, text. A
   warning row tells you what will be outlined and takes you straight to the fix
   (**Order & exclude**, **Add fonts**, **Show layers**) — your layers are never
   modified
4. **Export PDF** — the save dialog is pre-filled with a timestamped file name.
   In the report, click a reason to select the affected layers on canvas

## Fonts

60 families are downloaded and embedded automatically — 43 Latin (Inter, Roboto,
Open Sans, Montserrat, Lato, Poppins, IBM Plex, JetBrains Mono…) and 17 Korean
(Pretendard, Noto Sans KR, Nanum, Gothic A1, Spoqa…), italics included.

The Fonts screen lists every font your document uses, in one of three states:

| State | What happens |
|---|---|
| In catalog | Downloaded from a CDN (jsDelivr) at export time and embedded. Nothing to do |
| Added by you | Add a static TTF once — or pick your font folder and the matching files are found for you. Stored and embedded from then on |
| No file | **Kept as outlines** — identical look, you just don't get the size and search benefits |

**Fonts are never substituted.** If a font can't be embedded, the original
outlines stay exactly as Figma drew them.

Auto-downloaded families (all SIL OFL 1.1):

> Pretendard · Pretendard JP · Nanum Gothic · Nanum Myeongjo · Nanum Gothic
> Coding · Nanum Pen/Brush Script · Gothic A1 · Gowun Dodum · Gowun Batang ·
> IBM Plex Sans KR · Spoqa Han Sans Neo · Do Hyeon · Jua · Black Han Sans

Every URL in the catalog is verified against the real files by
`npm run verify:catalog` (is it a static TTF, does it cover Hangul, does the
weight match).

## What stays as outlines

These are kept as original outlines by design — the report tells you which nodes
and why, and clicking a reason selects them on canvas:

- Rotated or flipped text, text on a path
- Text with gradient/image fills, strokes, or effects (shadow, blur)
- Underlined or struck-through text (redrawing those isn't implemented yet —
  better an outline than a silently dropped underline)
- Text whose font file can't be obtained, or containing glyphs the font lacks

## Good to know

- **Always proofread the exported PDF before submitting it anywhere.** Text is
  redrawn with real fonts and may differ subtly from Figma's rendering. You are
  responsible for the files you produce with this plugin.
- **Fonts you add yourself are embedded as-is.** Confirming that your font's
  license permits document embedding is your responsibility — many commercial
  fonts restrict it. All auto-downloaded fonts are SIL OFL and permit embedding.
- **Network access is used only to download open-license fonts**
  (`cdn.jsdelivr.net`). Your document's content never leaves your machine, and
  there is no telemetry.
- Text is embedded in an extractable form, but no specific ATS parsing result is
  guaranteed.

## 한국어 안내

Figma 기본 PDF 내보내기는 글자를 전부 벡터 아웃라인으로 바꿉니다. 텍스트를 선택할
수도, 검색할 수도, 채용 시스템(ATS)이 읽을 수도 없습니다. 게다가 글 위주 문서가
10~20MB로 불어나는데, 이미지가 없으니 어떤 압축 도구로도 줄지 않습니다.

Featherweight는 텍스트 자체를 고치고, 파일을 필요한 크기로 맞추고, 내보내기 전에
무슨 일이 일어날지 먼저 알려 줍니다. 플러그인 화면은 Figma 앱 언어 설정에 따라
한국어로 나옵니다.

**[Figma Community에서 설치 →](https://www.figma.com/community/plugin/1672509720278498323/featherweight-compressed-pdf-export-with-real-fonts)**

### 하는 일

- **아웃라인 대신 진짜 폰트** — 텍스트를 서브셋 폰트로 다시 넣습니다. 이탤릭까지요.
  선택·검색·복사가 되고 ATS가 읽습니다. Inter(Figma 기본 서체), Roboto, Pretendard
  등 60종은 자동으로 받아 넣습니다. 글 위주 이력서가 10MB에서 1MB 아래로 내려갑니다.
- **보이는 크기에 맞춘 이미지 압축** — 이미지는 실제로 표시되는 크기에 맞춰 줄이고
  다시 인코딩합니다. 선명하게 / 균형 / 최소 용량 중 하나를 고르면 어떤 숫자가
  적용되는지 바로 보이고, 고급 설정에서 배율·상한(HD~4K)·품질을 직접 정할 수도
  있습니다. 로고와 작은 이미지는 손대지 않으니 선명하던 것이 뭉개지지 않습니다.
- **목표 용량 맞추기** — 업로드 한도가 5MB라면 숫자만 적으세요. 한 번 내보내 크기를
  재고, 그 안에 드는 가장 좋은 화질을 찾아 다시 내보냅니다. 화질에는 하한이 있어서
  목표가 무리면 가능한 가장 작은 파일과 함께 그 하한을 알려 드립니다.
- **내보내기 전에 미리 확인** — 메인 화면의 체크리스트 한 장이 말해 줍니다. 이미지
  몇 장이 줄어드는지, 폰트는 준비됐는지, 어떤 텍스트가 왜 아웃라인으로 남는지 — 그
  레이어로 바로 가는 링크와 함께. 내보낸 뒤에 놀랄 일이 없습니다.

이 넷이 합쳐지면 차이가 큽니다. 12쪽 포트폴리오가 같은 페이지, 같은 모습으로
22.7MB에서 4.0MB가 됐습니다.

### 사용법

1. 프레임을 선택하고 Featherweight를 실행합니다. Figma Slides에서는 아무것도
   고르지 않으면 덱 전체가 대상입니다
2. 프리셋을 고릅니다. 목표 용량이면 원하는 크기를 적습니다
3. 체크리스트를 읽습니다. 경고가 있으면 따라가서 페이지를 정렬하거나, 폰트를
   넣거나, 레이어를 찾습니다
4. 내보내기 — 저장 창에 날짜가 붙은 파일명이 미리 채워져 있습니다

### 다른 점

- 오픈 라이선스 폰트 60종이 자동으로 들어갑니다. Figma 기본 서체 Inter부터 Roboto,
  Open Sans, Montserrat, Lato, Poppins 등 라틴 43종, Pretendard, Noto Sans KR,
  나눔, Gothic A1, Spoqa 등 한글 17종. 모든 굵기, 정체와 이탤릭 전부. 그 밖의
  폰트는 폰트 폴더를 한 번 고르면 맞는 TTF를 찾아 넣습니다.
- 폰트를 절대 바꿔치기하지 않습니다. 넣지 못한 텍스트는 원래 아웃라인 그대로
  남깁니다. 보기엔 똑같고, 사유를 클릭하면 캔버스에서 그 레이어를 찾아 줍니다.
- 전부 내 컴퓨터 안에서 처리됩니다. 문서는 어디로도 나가지 않고, 네트워크는 오픈
  라이선스 폰트를 받는 데(cdn.jsdelivr.net)만 씁니다. 텔레메트리도, 계정도,
  업로드도 없습니다.
- 무료, 오픈소스(MIT).

### 알아 두실 것

- 내보낸 PDF는 제출 전에 꼭 확인하세요. 텍스트를 진짜 폰트로 다시 그리기 때문에
  Figma 렌더링과 미세하게 다를 수 있습니다. 만든 파일의 책임은 사용자에게 있습니다.
- 직접 넣은 폰트는 그대로 임베드됩니다. 정적 TTF만, 굵기마다 한 파일씩(가변
  폰트·OTF 불가). 그 폰트의 라이선스가 문서 임베딩을 허용하는지는 직접 확인하셔야
  합니다. 자동으로 받는 폰트는 전부 SIL OFL이라 임베딩이 허용됩니다.
- 회전된 텍스트, 그라데이션·선·효과가 있는 텍스트, 밑줄 텍스트는 원래 아웃라인을
  유지합니다(의도한 동작이고, 조용히 바꾸지 않습니다). 체크리스트가 내보내기 전에
  어느 것인지 알려 줍니다.
- 텍스트는 추출 가능한 형태로 들어가지만 특정 ATS의 파싱 결과를 보장하지는
  않습니다. Figma, Inc.와 무관합니다.
- 폰트 출처와 라이선스는 아래 [Credits](#credits)에 있습니다.

## Development

```
npm ci
npm run dev             # watch build
npm test                # unit tests
npm run lint            # eslint + prettier
npm run verify:catalog  # font catalog + pipeline check against the real CDN (network)
npm run build           # production build
npm run install:local   # install into ~/figma-plugins/ for manual QA
npm run package         # dist/*.zip
npm run ui:preview      # render the UI in a browser without Figma
```

To run a development build in Figma: `npm run install:local`, then in the Figma
desktop app choose Plugins → Development → **Import plugin from manifest…** and
pick `~/figma-plugins/sheaf/manifest.json`. After that, re-running
`install:local` is enough — no re-import needed.

`ui:preview` accepts query flags for reviewing states without Figma:
`?screen=fonts&theme=dark&lang=en-US&platform=win&frames=12&fit=1&text=clean&bare=1`.
`screen` is one of `settings` / `frames` / `fonts` / `text` / `preview`; omit it
for the main screen. `report=1` shows the result card as it looks after an export.

### Repo layout

```
src/main/**   Figma sandbox — no DOM, Canvas, or fetch
src/ui/**     plugin iframe — Canvas, fetch, PDF assembly
src/lib/**    pure logic, no Figma or DOM. Fully unit-tested
tools/**      build, packaging, local install, UI preview, Figma publish
```

The split mirrors the plugin runtime's hard constraints. `docs/PRD.md` explains
the reasoning, `docs/SPIKES.md` records the runtime assumptions verified against
the real API, `docs/FIT-TO-SIZE.md` covers how the target-size search works,
`docs/CHECKLIST.md` is the manual QA pass, and `docs/RELEASE.md` is the release
playbook.

## Releasing

Pushing to `main` runs tests and refreshes the rolling `latest` prerelease.
A `v*` tag builds a versioned GitHub Release with the zip attached.

Publishing a new version to the Figma Community is **deliberately manual**
(Plugins → Manage plugins → Publish new version) — see `docs/RELEASE.md` for why.

## Credits

### Fonts

Every auto-downloaded font is licensed under the **SIL Open Font License 1.1**,
which permits embedding in documents. Featherweight does not modify, host or
redistribute any font file — your machine fetches the upstream original at
export time over the jsDelivr CDN. Every URL is pinned to a commit or a package
version and verified weekly (`.github/workflows/catalog.yml`).

| Source | Families | |
|---|---|---|
| [Google Fonts](https://github.com/google/fonts) | 20 | first-party |
| [Expo Google Fonts](https://github.com/expo/google-fonts) | 37 | static builds of families Google now ships variable-only |
| [Pretendard](https://github.com/orioncactus/pretendard) | 2 | first-party |
| [Spoqa Han Sans Neo](https://github.com/spoqa/spoqa-han-sans) | 1 | first-party |

Not affiliated with, or endorsed by, any of these projects. Font names are
trademarks of their respective owners.

### Everything else

- Not affiliated with Figma, Inc.
- Built with [pdf-lib](https://github.com/Hopding/pdf-lib) (MIT) ·
  [fontkit](https://github.com/foliojs/fontkit) (MIT) ·
  [create-figma-plugin](https://github.com/yuanqing/create-figma-plugin) (MIT)
- License: [MIT](LICENSE)
