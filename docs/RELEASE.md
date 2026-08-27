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

**Hard limit: 100 characters.** The form counts and truncates silently — check
the counter before saving.

> Name a size — say 5MB — and it hits it. Text stays selectable, searchable, ATS-ready.

85 characters. It deliberately does not repeat "compressed PDF export with real
fonts" — the plugin *name* already says that, so the tagline spends its budget
on what the name can't carry: the new target-size feature and a concrete number.

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

🪶 SMART IMAGE COMPRESSION
Images are downscaled to the size they are actually displayed at, then
re-encoded. Pick a preset — Sharp / Balanced / Smallest — or fine-tune quality,
scale and resolution caps. Logos and already-small images pass through
untouched, so nothing that was sharp gets muddy.

🪶 FIT TO A TARGET SIZE (new in 1.1)
Have a 5MB upload limit? Type the number. Featherweight exports once to measure,
then finds the best image quality that still fits and re-exports at that
setting. Quality never drops below a floor — if your target is out of reach it
gives you the smallest possible file and tells you what that floor is, instead
of quietly wrecking your images.

Together these make a real difference: a 12-page portfolio went from 22.7MB
to 4.0MB with the same pages and the same look.

HOW IT WORKS
1. Select frames and run Featherweight
2. Drag to reorder pages, exclude what you don't need
3. Pick an image preset — or Target, and type the size you need
4. Export — the save dialog is pre-filled with a timestamped file name

WHAT MAKES IT DIFFERENT
• 60 open-license font families are downloaded and embedded automatically —
  Inter, Roboto, Open Sans, Montserrat, Lato, Poppins and 37 more Latin faces,
  plus 17 Korean ones (Pretendard, Noto Sans KR, Nanum, Gothic A1, Spoqa…).
  Italics included. Add your own TTF/OTF once for anything else.
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

FONT SOURCES & CREDITS
Every auto-downloaded font is licensed under the SIL Open Font License 1.1,
which permits embedding in documents. The files are the upstream originals —
Featherweight does not modify, host or redistribute them; your machine fetches
them at export time over the jsDelivr CDN (cdn.jsdelivr.net).

• Google Fonts — github.com/google/fonts
• Expo Google Fonts — github.com/expo/google-fonts (static builds of families
  Google now ships variable-only, such as Inter and Noto Sans KR)
• Pretendard — github.com/orioncactus/pretendard
• Spoqa Han Sans Neo — github.com/spoqa/spoqa-han-sans

Every URL is pinned to a commit or a package version, and verified weekly
against the real files. Featherweight is not affiliated with, or endorsed by,
any of these projects. Font names are trademarks of their respective owners.

### Categories & tags

Categories (max 2): **Import & export** (primary) + **Design tools**

Tags: `pdf` `export` `fonts` `compress` `resume` `portfolio` `korean` `ats`

### Media

**Safe area.** The Community carousel crops the sides on mobile — a 1920×960
board loses roughly 8% off each edge. Keep every word inside the middle **80%
horizontally and 86% vertically** (that means ~200px side padding on the cover,
176px on the boards). Check by overlaying a dashed box at `left:10%;right:10%;
top:7%;bottom:7%` before shipping. This bit us once: the first dark cover had
96px padding and the logo, "22.7", and the footer URL were all clipped on phones.


Stored in `docs/brand/`, all rendered from source so they can be regenerated:

| File | Use |
|---|---|
| `icon-128.png` | Plugin icon — minimal two-tone feather (split barbs read as a feather, not a leaf) |
| `icon-128.png` | Plugin icon — the crystal feather, cropped from `src/feather-source.png` |
| `cover-1920x960.png` | Cover — 22.7MB → 4.0MB with the feather as hero, three feature lines |
| `media-1.png` | Editorial: "Real fonts. Smaller PDFs. Better documents." |
| `media-2.png` | Brand board: "Keep text real. Keep files light." |
| `media-3.png` | UI: export tab — "Reorder." |
| `media-4.png` | UI: image presets — "Name a size. It hits it." |
| `media-5.png` | UI: fonts tab |

Everything is rendered from source in `docs/brand/src/` (plain HTML + `tokens.css`),
so any of it can be regenerated or restyled:

```bash
# 1. UI screenshots → docs/brand/src/ui-{export,images,fonts}.png
npm run ui:preview
#    capture ?bare=1&w=400&h=480&lang=en-US&fonts=ready&theme=dark&tab=export  (etc.)
#    w=400 matters — the preview defaults to 380 and hides overflow
#    theme=dark matters — the boards are dark, a light capture glares

# 2. render each src/*.html at 1920×960 with headless Chrome
#    cover.html → cover-1920x960.png, m2…m6.html → media-1…5.png
#    icon.html at 128×128 → icon-128.png
```

When you replace the cover, bump the `?v=` on the README's image link
(`docs/brand/cover-1920x960.png?v=2`). GitHub proxies README images and caches
them by URL, so same-name replacements keep serving the old bytes — the file on
`raw.githubusercontent.com` updates immediately, the rendered README does not.

`m3.html` carries the version number, so it needs a bump every release. The UI
captures also carry the version in the corner — re-shoot them, don't reuse.

### The feather

`src/feather-source.png` is the master (a rendered crystal feather on near-black).
Two derivatives:

- **`src/feather.png`** — same feather with the background knocked out to alpha,
  for placing on the dark boards. Made by mapping luminance to alpha with an SVG
  `feColorMatrix`, then screenshotting with
  `--default-background-color=00000000`. It only works on dark backgrounds: the
  knockout eats the feather's own dark facets, so on cream it washes out.
- **`icon-128.png`** — cropped straight from the *source*, background and all.
  The alpha version loses those dark facets and goes thin at 128px.

**Gradient text.** `.warm` paints type through `background-clip: text`, which
only fills what sits inside the element's background box. `.num` carries a
negative `letter-spacing`, which trims the box short of the last glyph and
shears its right edge off — it ate the B in "4.0MB" once. `.warm` keeps a small
`padding-right` to cover that; don't remove it, and re-check the last character
whenever you change letter-spacing.

Palette (`src/tokens.css`): background `#0B0A0C` · warm gradient
gold `#FFB347` → orange `#F2622A` → magenta `#C2478A` · text `#F6F3EF`.
The gradient is sampled from the feather, and `.warm` applies it to type.

"Free forever · open source" is called out on the cover and the brand board — it
is a real differentiator against the paid/subscription plugins in this category.

## Release-note style

Match the existing version history — one line, leading with the change type:

- "Fix: the font path 'copy' button didn't respond to clicks at all."
- "Fix: logos and small images now pass through untouched. UI polish across all tabs."
- "Windows: correct font folder paths and shortcuts. Locale-aware number formatting."
- "Feature: Fit to Size — name a target file size and Featherweight finds the best image quality that fits."
