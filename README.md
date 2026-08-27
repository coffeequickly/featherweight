# Featherweight – Compressed PDF Export with Real Fonts

![Featherweight — compressed PDF export with real fonts](docs/brand/cover-1920x960.png?v=2)

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

The plugin UI follows your Figma app language (English / Korean).

## How it works

1. Select frames on the canvas and run Featherweight
2. Drag rows (or use ↑↓) to reorder pages, ✕ to exclude — your layers are never
   modified. Click a row to reveal that frame on the canvas
3. Pick an image preset in the **Images** tab — Sharp / Balanced / Smallest, or
   **Target** to name a file size; check font readiness in **Fonts**
4. **Export PDF** — the save dialog is pre-filled with a timestamped file name.
   In the report, click a reason to select the affected layers on canvas

## Fonts

The Fonts tab lists every font your document uses, in one of three states:

| State | What happens |
|---|---|
| In catalog | Downloaded from a CDN (jsDelivr) at export time and embedded. Nothing to do |
| Added by you | Add a TTF/OTF once — it is stored and embedded from then on |
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
`?tab=fonts&theme=dark&lang=en-US&platform=win&frames=12&fit=1&bare=1`.
Pass `w=400` to match the real plugin window — the default (380) is narrower and
hides horizontal overflow.

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

- Not affiliated with Figma, Inc.
- Built with [pdf-lib](https://github.com/Hopding/pdf-lib) (MIT) ·
  [fontkit](https://github.com/foliojs/fontkit) (MIT) ·
  [create-figma-plugin](https://github.com/yuanqing/create-figma-plugin) (MIT)
- License: [MIT](LICENSE)
