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
- [ ] A layer with superscript/subscript text (e.g. "1st, 2nd" with Position:
      Superscript) stays as outlines and looks exactly as in Figma; the
      pre-flight Text row and the report both say "superscript/subscript"
- [ ] A bulleted or numbered list keeps its bullets/numbers (stays as outlines)
      and the report says "bulleted/numbered list"
- [ ] Text used as a mask, text with Multiply blend, text inside a 50% opacity
      group, and text overflowing a clipping frame all stay as outlines with
      their own reason; text inside a card with a filled drop shadow is still
      embedded
- [ ] A 60% opacity text layer is embedded and the PDF shows it at 60%
- [ ] Inter body text: a line of "1111111111" in Inter Regular 40pt has the same
      width in the PDF as in Figma's own PDF export (`pdftotext -bbox`), and an
      Inter Semi Bold layer is embedded (`pdffonts` shows Inter-SemiBold as
      CID Type 0C), not outlined
- [ ] Baseline snap: in the exported PDF's content stream every `Tm` y of our
      text equals Figma's own PDF export for the same layer (integer baselines,
      e.g. 376 not 376.45) and `npm run compare` reports no vertical shift
- [ ] Fonts screen: Inter shows "v3.19 · the build Figma bundles", Pretendard
      shows its version, and an uploaded file shows "file vX.Y" read from the
      font; stored fonts list the version too
- [ ] Font build check: with a font Figma renders in one build and a *different*
      build uploaded for a family that is not in the catalog (e.g. upload an
      older/newer version of a custom font), the export keeps that font's text
      as outlines and the report says "letter widths differ from Figma by N%";
      a full Pretendard/Inter resume produces no such reason (no false alarms)
- [ ] A link on part of a line whose text mixes a fallback glyph (e.g. "—") has
      its link rectangle exactly under the linked words
- [ ] Cancelling at any point (page loop, Fit-to-Size probing, final pass) saves
      nothing, shows a "Cancelled" toast and returns the panel to idle at once;
      clicking Export again right away runs a fresh export after the previous
      one finishes cleaning up, with no leftover clone on the canvas
- [ ] The result card says the target was missed if the file is bigger than the
      Fit-to-Size target
- [ ] With Wi-Fi turned off after the pre-flight check passed, an export whose
      catalog font can't be fetched at draw time ends with "could not be drawn"
      and saves nothing, instead of a PDF with missing text
- [ ] Clicking a reason in the report selects those layers on the canvas
- [ ] With frames selected, editing a text (characters, font, size) or swapping
      an image inside one of them refreshes the pre-flight rows within a second
      while a manual order and exclusions in the Pages screen are kept

## Fonts & fallback

- [ ] A catalog font (e.g. Nanum Gothic) is embedded with no upload needed
- [ ] A catalog font whose style Figma spells differently ("Semi Bold" vs
      "SemiBold", "Regular Italic" vs "Italic", a "… Variable" family) still
      shows as "auto-downloaded"
- [ ] macOS: "Find in a font folder…" on /System/Library/Fonts adds Helvetica
      Neue and Apple SD Gothic Neo from their .ttc collections, and the stored
      entry says "HelveticaNeue.ttc (Bold)"; exporting embeds them (`pdffonts`
      shows Helvetica Neue as CID TrueType, Apple SD Gothic Neo as CID Type 0C)
- [ ] Uploading a .ttc to a slot it doesn't contain (e.g. Helvetica.ttc for
      "Helvetica Neue Bold") says which faces the collection has
- [ ] A Google Fonts download folder holding both the variable file and a
      `static` folder: the scan adds the static weights (not the variable file),
      and a folder with only the variable file reports "only as variable files"
- [ ] An optical-size family whose static files are all suffixed (Inter,
      Merriweather, Newsreader, Fraunces, Bodoni Moda — "Inter 18pt" in the
      name table) is found under the family name Figma shows; with the text at
      14 px the 18pt file is picked, at 40 px the 28pt file
- [ ] "Open Sans" / "Condensed Bold" (variable Open Sans installed) gets
      `OpenSans_Condensed-Bold.ttf`, not the normal-width Bold; with no
      Condensed file in the folder the font is reported as weight missing
- [ ] The scan summary counts what happened per font: added, several matching
      files (newest used), could not be saved (with the reason), weight missing,
      variable only, unusable, not in this folder; with an unreadable file in
      the folder the wording changes to "not found (scan incomplete)"
- [ ] "Added N" only counts fonts the plugin confirmed saving; fill the storage
      close to 5 MB first and the summary reports the failed saves
- [ ] After a folder scan the result stays on the Fonts screen (a two-line box:
      "Folder scan: 3 added · 4 out of room · 1 not found", then "X needed,
      Y free" with "Retry N") until it is closed or the next scan starts — also
      after switching screens and back; no toast is involved
- [ ] Each font row is two lines and the second says what the scan found:
      "no room · size · file" with a Retry button in place of Add; "not in that
      folder"; "family in the folder, not this weight"; "only a variable file —
      use its static folder"; "not found — scan incomplete". Never a bare "no
      file" for a font the scan found; no text-node counts, no paragraphs
      between the rows, and a long file name never hides the reason
- [ ] With the storage nearly full: scan, delete a stored font, press Retry on
      the row (or "Retry N" in the box) — the font is saved without picking the
      folder again and the row switches to the file; a font larger than 5 MB
      says so instead of offering Retry
- [ ] Storage use ("storage X of 5.0MB" and the bar) shows at the top of the
      Fonts screen; the folder button reads "Choose font folder…" and the line
      under it says the greyed-out files are normal
- [ ] Nothing stored is deleted automatically when a scan runs out of room —
      deleting is always the user's click under "Stored fonts"
- [ ] macOS: Helvetica Neue "Medium Italic" and "Thin Italic" from the .ttc are
      stored without a "will export as Medium weight" warning (their italic
      bits are unset in the file; the name decides)
- [ ] Embedding flag: a font whose OS/2 fsType is Restricted only is refused by
      Add ("license flag forbids embedding") and by the folder scan (row says
      "the folder's file forbids embedding"); Futura Medium (Restricted +
      Preview & Print) and DIN Alternate (Preview & Print) are accepted;
      Helvetica Neue (Installable) and Apple SD Gothic Neo (Editable) too
- [ ] A restricted font stored by an older version is re-read on open, flagged
      on the Fonts screen and in the pre-flight, and its text stays as outlines
      at export with the reason in the report — the export finishes and the PDF
      is written; it never stops with "text would be lost"
- [ ] Retry can't be double-counted: click Retry twice quickly (or Retry N while
      a row retry is running) and the added count rises by one per font; a retry
      answered after a new folder scan starts does not touch the new result
- [ ] Opening a file whose stored font has no version or embedding data does not
      loop: the Fonts screen settles and the font list is not rewritten
      repeatedly (watch the console/Network idle after the panel loads)
- [ ] A font file whose glyph table is broken is skipped as one candidate: the
      scan reads the rest of the folder, counts it under "scan incomplete", and
      if the scan does stop, the result box says why and keeps what was added
- [ ] Memory: scanning /System/Library/Fonts (370 files, 778 MB) with a font that
      is not there finishes in about a second and the plugin stays responsive.
      Node measurement 2026-09-08: reading every file gave peak RSS 1 GB from
      file buffers awaiting GC (heap 21 MB, retained faces 3 MB); with files
      over 32 MB whose names don't match skipped (4 of 370, reported as not
      checked) the peak is 400 MB in 0.6 s. The 64 MB cap is on retained faces,
      not on the peak
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
