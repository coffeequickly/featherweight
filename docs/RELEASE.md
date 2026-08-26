# Release playbook

**Status: live on the Figma Community** —
[Featherweight – Compressed PDF Export with Real Fonts](https://www.figma.com/community/plugin/1672509720278498323/featherweight-compressed-pdf-export-with-real-fonts)
· approved 2026-08-26 · support: featherweight@jangwonseok.com

Repo: [coffeequickly/featherweight](https://github.com/coffeequickly/featherweight) ·
MIT · plugin id `1672509720278498323`

## Cutting a release

```bash
npm run lint && npm test && npm run verify:catalog   # verify:catalog hits the network
npm run install:local                                # load the build into Figma for manual QA
# work through docs/CHECKLIST.md → "Release QA"

npm version patch                                    # or minor / major
git push --follow-tags                               # CI builds the GitHub Release + zip
```

Then publish to the Community (manual, two clicks):

1. Figma desktop → Plugins → Manage plugins → Featherweight → **Publish**
2. **Publish new version**, add a one-line release note, submit

Version updates skip the full review that the first submission went through.
Before clicking, run the plugin once and confirm the version in the bottom-right
corner matches what you intend to ship.

### Two distribution tracks

| Trigger | Result |
|---|---|
| Push to `main` | Tests + build, and the rolling `latest` prerelease is refreshed with a fresh zip |
| Push a `v*` tag | A versioned GitHub Release with `featherweight-X.Y.Z.zip` attached |

The zip is for people who want a development build (unzip → Import plugin from
manifest). Regular users install from the Community.

## Why Community publishing isn't automated

Figma provides no public API for publishing plugins — submissions go through the
desktop app. The unofficial path is to call the internal endpoints the desktop
app uses, authenticating with the `__Host-figma.authn` cookie.

We deliberately don't wire that into CI:

- The cookie **expires**, and there's no way to refresh or rotate it
  programmatically. Automating it produces a release path that works fine until
  one day it silently doesn't.
- It is account-credential-grade. Parking it in CI secrets is a standing risk for
  what is otherwise a two-click manual step.

`tools/figma-publish.mjs` is kept for the cases where clicking isn't an option,
and as a starting point if Figma ever ships an official API:

```bash
# token: figma.com → DevTools → Application → Cookies → __Host-figma.authn
FIGMA_WEB_AUTHN_TOKEN=... node tools/figma-publish.mjs --dry-run   # inspect only
FIGMA_WEB_AUTHN_TOKEN=... npm run publish:figma "Fix: ..."         # actually upload
```

It reuses the listing values (name, description, tags, images) already on the
store, so this path can't change your listing copy. Copy and image edits happen
in the desktop app.

## Listing copy

Kept in sync with what's live. Edit here first, then paste into the publish form.

### Name

> Featherweight – Compressed PDF Export with Real Fonts

Community search weighs the plugin name heavily, hence the keywords after the
brand name (the leading competitor does the same with "(PDF, PNG, JPG, WebP)").

### Tagline

> Tiny PDFs with real embedded fonts — selectable, searchable, ATS-ready.
> Résumés & portfolios from 10MB to <1MB.

### Description

Figma's built-in PDF export turns every letter into vector outlines. Your text
can't be selected, searched, or read by résumé scanners (ATS) — and text-heavy
documents balloon to 10–20MB that no compressor can shrink, because there are no
images to compress.

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

### Categories & tags

Categories (max 2): **Import & export** (primary) + **Design tools**

Tags: `pdf` `export` `fonts` `compress` `resume` `portfolio` `korean` `ats`

### Media

Stored in `docs/brand/`, all rendered from source so they can be regenerated:

| File | Use |
|---|---|
| `icon-128.png` | Plugin icon — document + feather, reads as "PDF export" at thumbnail size |
| `cover-1920x960.png` | Cover — 22.7MB → 4.0MB, the numbers do the selling |
| `media-1.png` | Editorial: "Real fonts. Smaller PDFs. Better documents." |
| `media-2.png` | Dark brand: "Keep text real. Keep files light." |
| `media-3/4/5.png` | UI: export tab, image presets, fonts tab |

Everything is rendered from source in `docs/brand/src/` (plain HTML + `tokens.css`),
so any of it can be regenerated or restyled:

```bash
# UI screenshots — all-ready state, English, no error banners
npm run ui:preview   # then capture ?bare=1&lang=en-US&fonts=ready&tab=export

# then render any src/*.html at 1920×960 with headless Chrome
```

Palette: orange `#F2622A` · ink `#141414` · cream `#FAF8F5`.
"Free forever · open source" is called out on the cover and the dark board — it is
a real differentiator against the paid/subscription plugins in this category.

## Release-note style

Match the existing version history — one line, leading with the change type:

- "Fix: the font path 'copy' button didn't respond to clicks at all."
- "Fix: logos and small images now pass through untouched. UI polish across all tabs."
- "Windows: correct font folder paths and shortcuts. Locale-aware number formatting."
