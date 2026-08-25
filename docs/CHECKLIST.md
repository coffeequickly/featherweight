# Manual QA

What a person has to check inside Figma, because no automated test can.
Everything else — coordinate math, the SVG parser, font matching, the catalog,
i18n, presets, file names — is covered by `npm test` (and `npm run
verify:catalog` for the real CDN plus a full text-pipeline run against real
fonts).

Work through this before publishing a new version to the Community.
Run `npm run install:local` first, then reopen the plugin and confirm the version
in the bottom-right corner is the build you mean to ship.

## Layout & states

- [ ] Three tabs (Export / Images / Fonts); the export button, progress and
      result stay visible from every tab
- [ ] Export tab: the summary line ("Balanced · 4 fonts ready") matches reality,
      and clicking each chip opens the matching tab
- [ ] Clicking a frame row reveals that frame on the canvas (selection unchanged)
- [ ] Dragging a row reorders it; ↑↓ buttons still work; ✕ excludes and the
      excluded list restores individually
- [ ] Images tab: the three presets switch; touching a number shows "Custom"
- [ ] Fonts tab: "Embed text as real fonts" is **on** by default; the font list
      and Add button work; clicking a path copies it (toast confirms)
- [ ] With one or two frames the window is compact; resizing it by hand stops the
      automatic sizing from taking over again
- [ ] Empty state: no sort control, no "(0 pages)" in the button
- [ ] Nothing is clipped — Hangul ascenders/descenders and Latin g/j/y tails

## Language & platform

- [ ] Figma app language Korean → Korean UI; English → English UI
- [ ] On Windows: font paths show `C:\Windows\Fonts` and `%LOCALAPPDATA%\...`,
      and the guidance mentions the file name field (**no ⌘⇧G**)
- [ ] On macOS: `~/Library/Fonts` and `/Library/Fonts`, guidance mentions ⌘⇧G
- [ ] Figma in the browser: export and download still work

`npm run ui:preview` renders most of these without Figma:
`?tab=fonts&theme=dark&lang=en-US&platform=win&frames=12&bare=1`.

## Export behaviour

- [ ] Button shows the right page count; progress reads like
      "Page 3/8 · optimizing images 1/4"
- [ ] The save dialog is pre-filled with `name_20260826134512.pdf`
      (single frame → frame name, multiple → document name)
- [ ] A canvas toast confirms the save; the report's first line has file name,
      pages, size and elapsed time

## Text embedding

- [ ] A single text node mixing Regular and Bold → only the bold part is bold in
      the PDF, and `pdffonts` lists both weights as embedded subsets
- [ ] `pdftotext` output matches the Figma text, Hangul included
- [ ] Underlined text keeps its underline (stays as outlines), and the report
      says why
- [ ] Clicking a reason in the report selects those layers on the canvas

## Fonts & fallback

- [ ] A catalog font (e.g. Nanum Gothic) is embedded with no upload needed
- [ ] A font outside the catalog shows "no file" and stays as outlines — the
      export tab warns with the font's name and jumps to the Fonts tab
- [ ] Offline (Wi-Fi off): catalog fonts fall back to outlines and the PDF still
      exports cleanly

## Images

- [ ] A logo well within the frame's budget comes out untouched —
      `pdfimages -list` shows the original dimensions and encoding
- [ ] An oversized screenshot is downscaled; no image exceeds its target
- [ ] Transparent PNGs stay PNG (no black boxes)

## Document safety

- [ ] After exporting, the Figma document is unchanged (text fills intact)
- [ ] No `__sheaf_tmp__` layers left behind, including after a cancel or an error
- [ ] Cancelling mid-export leaves the document clean

## Inspecting the result

```bash
pdfinfo out.pdf                 # size, pages, producer
pdffonts out.pdf                # embedded subsets (emb=yes, uni=yes)
pdftotext out.pdf - | head -40  # extracted text
pdfimages -list out.pdf         # per-image dimensions and encoding
```
