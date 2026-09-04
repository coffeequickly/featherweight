# Manual QA

What a person has to check inside Figma, because no automated test can.
Everything else — coordinate math, the SVG parser, font matching, the catalog,
i18n, presets, file names — is covered by `npm test` (and `npm run
verify:catalog` for the real CDN plus a full text-pipeline run against real
fonts).

Work through this before publishing a new version to the Community.
Run `npm run install:local` first, then reopen the plugin and confirm the version
in the header is the build you mean to ship.

## Layout & states

- [ ] One main screen: preset tiles, value chips, "Before you export"
      checklist. No header of its own (Figma's title bar already says
      Featherweight). The gear next to the export button opens Advanced
      settings and disappears while exporting; the button and progress stay
      visible from every sub-screen; "‹" returns to the main screen
- [ ] Every checklist row has a title and exactly one detail line, in every
      preset including Target — the four rows line up
- [ ] Presets: four square tiles (icon · name · one-line tag); the chosen one
      has a blue border and tint; picking one changes the three chips; touching
      a number in Advanced settings deselects every tile and adds a "Reset"
      chip; Target puts the MB field and a single "auto" chip in the same row —
      the checklist below never moves when switching presets
- [ ] After an export the result card appears under the checklist on the main
      screen (you are brought back there from any sub-screen); ✕ closes it;
      "Check what a parser reads" opens the Text check screen
- [ ] Target on an image-heavy deck (the 31-slide Playground, 9.5 MB) lands
      within about 1.5 MB under the target, never over it, and the report says
      "Fits 9.5MB — the best quality that stays under it"; a text-only document
      with a generous target keeps Balanced ("Already under…")
- [ ] Target: typing "0.8" works, an emptied field falls back to the previous
      value (never silently 0.5), and −/+ step by 1 MB (0.5 ↔ 1 at the bottom)
- [ ] Checklist matches reality: frame count and size; "N of M images will be
      downscaled" appears a moment after the list (it arrives with the
      thumbnails); a font outside the catalog turns the Fonts row orange with
      the font's name and "Add fonts ›" (the Fonts row states the cause only);
      the Text row alone states the outcome, counting stroked/gradient/effect
      texts and texts in missing fonts together, with "Show layers ›"
- [ ] Selecting 30 frames shows the list at once and the canvas keeps
      responding while the counts and checklist fill in; thumbnails appear only
      after opening Arrange; clicking around inside the same frames (or inside a
      slide in Slides) does not re-run the scan or reset a custom order
- [ ] Selecting a section lists the frames inside it, not the section itself
- [ ] Figma Slides: with nothing selected the whole deck is listed in grid
      order and the rows say "slides"; selecting a slide row lists its slides;
      the exported PDF embeds real fonts (`pdffonts` shows CIDFontType2, no
      Type 3) and no temporary slide flashes or is left behind
- [ ] Arrange: clicking a row reveals that frame on the canvas
      (selection unchanged); dragging reorders; ↑↓ still work; ✕ excludes and
      the excluded list restores individually; the Frames row then says
      "Custom order · 1 excluded"
- [ ] Advanced settings opens with the resolution chart: HD / FHD / QHD / 4K
      nested from the bottom-left, the chosen cap tinted, and a dashed box for
      frame × scale (in the frame's own aspect). When the dashed box pokes out
      of the tinted one it turns amber and the line below says the cap
      decides, not the scale. Every choice (Scale, Max edge, Keep under) is a row of buttons in
      the same style as the preset tiles — no segmented controls; Max edge is
      HD / FHD / QHD / 4K with the pixel count as the tag. A 1.4 install that
      had 2048 / 4096 / 1600 stored comes up as FHD / 4K / HD, not unselected;
      "Reset" in the header restores defaults; in Target mode
      the Size and Compression sections are replaced by a note; "Export all
      text as outlines" is **off** by default and turning it on makes the Text
      row orange with a "Turn off" action; the version is shown at the bottom
- [ ] A font file added by an old version that today's screen would refuse (a
      variable .ttf, or a file whose weight differs from its slot) is flagged on
      open: the Fonts row turns orange with "1 added file doesn't match its
      slot", and the row on the Fonts screen shows why in orange under the file
      name; replacing the file clears both
- [ ] Latin headings match Figma's width (pair kerning): "Forward Deployed"
      in a kerned font is not wider than the native export
- [ ] A layer with a stylistic set on (e.g. SUIT ss18 arrow) exports that
      alternate glyph; a layer with Kerning turned off in Figma exports unkerned
- [ ] A layer mixing two fonts (an arrow in another font) draws each run in its
      own font
- [ ] Korean body text with word joiners (U+2060) exports as real text, and a
      line's last word lands where Figma put it (letter-spacing counts joiners)
- [ ] A layer containing an em dash or thin space the font lacks stays real
      text — only that character comes from Inter (Pretendard if it is CJK); the
      report says "N characters the font lacks (…) drawn with Inter"; turning
      off "Draw missing characters with a fallback font" in Advanced makes
      that layer outlined again, and the checklist warns before export
- [ ] A heading inside a component instance with vertical auto layout (hug)
      and a divider below it exports with the divider still below the heading,
      not on top of it; same for a text inside a group inside an auto-layout
      column
- [ ] Hyperlinks: a text layer with a URL link on part of its text exports as a
      clickable area over exactly those characters (Preview: hover shows the
      URL); "Keep hyperlinks" off in Advanced removes them; it is greyed out
      when "Export all text as outlines" is on
- [ ] An .otf (CFF) font file is accepted by Add and by the folder picker,
      `pdffonts` shows it as "CID Type 0C" with no "Mismatch" warning from
      `pdftotext`, and the text is selectable
- [ ] Advanced settings → Fonts → "Manage stored fonts…" opens the Fonts screen
      even with nothing selected; the screen is three sections (this file /
      add missing / stored) with dividers
- [ ] Stored fonts: the Fonts screen ends with "Stored fonts · X / 5.0MB", a
      meter, and every stored font (including ones added in another file) with
      a trash button; deleting one frees the meter at once; a newly added .ttf
      shows a stored size well under the file's size (compressed)
- [ ] Fonts: the font list and Add button work; "Find in a font folder…" opens
      a folder picker, reads the .ttf files and adds the matching ones (one
      canvas toast says how many fonts were added — not one per font; adding a
      single file toasts that font; problems stay in the in-panel banner); clicking a path
      copies it (toast confirms)
- [ ] Empty state: the card asks for a selection, the promise line is shown, no
      "(0 pages)" in the button
- [ ] Nothing is clipped — Hangul ascenders/descenders and Latin g/j/y tails;
      English checklist details wrap to two lines instead of being cut

## Language & platform

- [ ] Figma app language Korean → Korean UI; English → English UI
- [ ] On Windows: font paths show `C:\Windows\Fonts` and `%LOCALAPPDATA%\...`,
      and the guidance mentions the file name field (**no ⌘⇧G**)
- [ ] On macOS: `~/Library/Fonts` and `/Library/Fonts`, guidance mentions ⌘⇧G
- [ ] Figma in the browser: export and download still work

`npm run ui:preview` renders most of these without Figma:
`?screen=fonts&theme=dark&lang=en-US&platform=win&frames=12&bare=1`
(`screen` = `settings` / `frames` / `fonts` / `text` / `preview`; `text=clean`
for a document with nothing to outline; `report=1` for the result card).

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
      checklist's Fonts row warns with the font's name and "Add fonts ›" opens
      the Fonts screen
- [ ] Offline (Wi-Fi off): catalog fonts fall back to outlines and the PDF still
      exports cleanly

## Images

- [ ] A logo well within the frame's budget comes out untouched —
      `pdfimages -list` shows the original dimensions and encoding
- [ ] An oversized screenshot is downscaled; no image exceeds its target
- [ ] Transparent PNGs stay PNG (no black boxes)

## Fit to Size

Exports twice, so budget time. Watch the progress bar — it must fill in one
direction only, never restart at the second pass.

- [ ] A target well above the document's size finishes in one pass and reports
      "already under" — the file is byte-identical to the same export with the
      Balanced preset
- [ ] A reachable target lands **under** it — check `pdfinfo` against the number
      you typed, not just the report line
- [ ] An impossible target (say 0.5MB on an image-heavy deck) reports the floor
      in the warning colour, and the file it produced matches that floor
- [ ] A text-only document with a target below its size reports unreachable
      without burning a second pass
- [ ] Cancelling mid-search still leaves a usable PDF and no `__sheaf_tmp__`
      layers

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

## Extracted text (ATS)

The whole point of embedding real fonts is that a parser reads them. Check the
text, not just the picture — a leftover outline is invisible on screen and only
shows up in extraction.

```bash
pdftotext out.pdf - | head -40    # is every paragraph there exactly once?
pdffonts out.pdf                  # Type 3 count should match the outline count
```

- [ ] No paragraph appears twice — once garbled, once whole. That means glyphs
      were hidden but not removed, and a parser reads both
- [ ] The name/heading line is intact (not "장장원석A AI")
- [ ] "Check what a parser reads" in the report matches what `pdftotext` prints
- [ ] With every font embedded, `pdffonts` shows no Type 3 at all
