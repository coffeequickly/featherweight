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

> See what changes before you export. Real fonts, images sized to what you see, one checklist.

91 characters (2.0). The 1.x line was "Name a size — say 5MB — and it hits it.
Text stays selectable, searchable, ATS-ready." (85). Neither repeats
"compressed PDF export with real fonts" — the plugin *name* already says that,
so the tagline spends its budget on what the name can't carry.

### Description

Figma's built-in PDF export turns every letter into vector outlines. Your text
can't be selected, searched, or read by résumé scanners (ATS) — and text-heavy
documents balloon to 10–20MB that no compressor can shrink, because there are no
images to compress.

Featherweight fixes the text itself, gets the file down to the size you need —
and tells you what will happen before you export:

🪶 REAL FONTS, NOT OUTLINES
Text is re-embedded as real subset fonts — italics included. It stays
selectable, searchable, copy-pasteable, and ATS-parseable. Inter (Figma's own
default), Roboto, Pretendard and 57 more are fetched and embedded for you.
A text-heavy résumé drops from ~10MB to under 1MB.

🪶 SMART IMAGE COMPRESSION
Images are downscaled to the size they are actually displayed at, then
re-encoded. Pick a preset — Sharp / Balanced / Smallest — and see the exact
numbers it sets, or open Advanced settings for scale, an HD-to-4K cap and
quality. Logos and already-small images pass through untouched, so nothing
that was sharp gets muddy.

🪶 FIT TO A TARGET SIZE
Have a 5MB upload limit? Type the number. Featherweight exports once to measure,
then finds the best image quality that still fits and re-exports at that
setting. Quality never drops below a floor — if your target is out of reach it
gives you the smallest possible file and tells you what that floor is, instead
of quietly wrecking your images.

🪶 KNOW BEFORE YOU EXPORT
One checklist on the main screen: how many images will shrink, which fonts are
ready, and exactly which text layers would stay as outlines and why — with a
link to the layer. Fix it, or export anyway. No surprises after the fact.

🪶 FIGMA SLIDES TOO
Run it in a deck and every slide becomes a page, in deck order — with real
fonts and downscaled images, where Slides' own PDF export outlines the text
and keeps every image at full size.

Together these make a real difference: a 12-page portfolio went from 22.7MB
to 4.0MB with the same pages and the same look.

HOW IT WORKS

1. Select frames and run Featherweight — in Figma Slides, run it with nothing
   selected to export the whole deck
2. Pick a preset — or Target, and type the size you need
3. Read the checklist; follow a warning to arrange pages, add a font, or find
   the layer
4. Export — the save dialog is pre-filled with a timestamped file name

WHAT MAKES IT DIFFERENT

1. 60 open-license font families embed automatically, starting with Inter —
   Figma's own default — then Roboto, Open Sans, Montserrat, Lato, Poppins and
   37 more Latin faces, plus 17 Korean ones (Pretendard, Noto Sans KR, Nanum,
   Gothic A1, Spoqa…). Every weight, roman and italic. For anything else,
   point it at your font folder once — the matching TTFs are picked out for
   you.
2. Never substitutes fonts. Anything it can't embed keeps its original
   outlines — identical look, honestly reported with a reason you can click
   to locate the exact layer on canvas.
3. 100% local. Your document never leaves your machine — network access is
   used only to download open-license fonts (cdn.jsdelivr.net). No telemetry,
   no account, no upload.
4. Free and open source (MIT): github.com/coffeequickly/featherweight

GOOD TO KNOW

1. Always proofread the exported PDF before submitting it anywhere. Text is
   redrawn with real fonts and may differ subtly from Figma's rendering. You
   are responsible for the files you produce.
2. Fonts you add yourself are embedded as-is — static TTF only, one file per
   weight (no variable fonts, no OTF). Confirming that your font's license
   permits document embedding is your responsibility. All auto-downloaded
   fonts are SIL OFL and permit embedding.
3. Rotated text, gradient/stroke/effect text and underlines keep their
   original outlines (by design — never silently altered). The checklist
   names them before you export.
4. Text is embedded in an extractable form, but no specific ATS parsing
   result is guaranteed. Not affiliated with Figma, Inc.

FONT SOURCES & CREDITS

1. Every auto-downloaded font is licensed under the SIL Open Font License 1.1,
   which permits embedding in documents. The files are the upstream originals —
   Featherweight does not modify, host or redistribute them; your machine
   fetches them at export time over the jsDelivr CDN (cdn.jsdelivr.net).
2. Google Fonts — github.com/google/fonts
3. Expo Google Fonts — github.com/expo/google-fonts (static builds of families
   Google now ships variable-only, such as Inter and Noto Sans KR)
4. Pretendard — github.com/orioncactus/pretendard
5. Spoqa Han Sans Neo — github.com/spoqa/spoqa-han-sans

Every URL is pinned to a commit or a package version, and verified weekly
against the real files. Featherweight is not affiliated with, or endorsed by,
any of these projects. Font names are trademarks of their respective owners.

─────
한국어 안내
Figma 기본 PDF 내보내기는 글자를 아웃라인으로 바꿔 선택·검색이 안 되고, 글 위주
문서는 10~20MB로 불어납니다. Featherweight는 텍스트를 진짜 폰트로 다시 넣고
(Pretendard·Noto Sans KR·나눔 등 한글 17종 포함 60종 자동), 이미지는 보이는 크기에
맞춰 줄이고, 목표 용량(예: 5MB)에 맞춰 줍니다. 내보내기 전 체크리스트가 무엇이
바뀌고 어떤 텍스트가 아웃라인으로 남는지 먼저 알려 줍니다. 문서는 컴퓨터 밖으로
나가지 않습니다. 무료·오픈소스. 플러그인 화면은 Figma 언어 설정에 따라 한국어로
나옵니다. 자세한 한국어 안내: github.com/coffeequickly/featherweight#한국어-안내

The Community listing takes one language; this footer is what makes Korean
searches ("이력서 PDF 용량") hit the page. The full Korean write-up lives in
README.md under "한국어 안내".

### Categories & tags

Categories (max 2): **Import & export** (primary) + **Design tools**

Tags: `pdf` `export` `fonts` `compress` `slides` `resume` `portfolio` `korean` `ats`

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
| `icon-128.png` | Plugin icon — the crystal feather, cropped from `src/feather-source.png` |
| `cover-1920x960.png` | Cover — 22.7MB → 4.0MB with the feather as hero, three feature lines |
| `media-1.png` | BEFORE YOU EXPORT — "Know before you export." (board-checklist.html, ui-main.png) — first, because it is what changed in 2.0 |
| `media-2.png` | REAL FONTS — "Real fonts, not outlines." (board-fonts.html, ui-fonts.png) |
| `media-3.png` | TARGET SIZE — "Name a size. It hits it." (board-target.html, ui-target.png) |
| `media-4.png` | IMAGE SIZE — "See what your images become." (board-chart.html, ui-settings.png) |

All four boards share one grid: brand row, warm-gradient eyebrow, two-line
headline, gradient bar, one paragraph — and a 470×599 card on the right holding
a UI capture taken at exactly 400×510 (2×). Keep every capture at that size or
the cards stop lining up across the carousel.

The 1.x brand board ("Keep text real. Keep files light.") and the editorial
board with the mock résumé were dropped in 2.0 — they repeated the cover
without showing the product.

Everything is rendered from source in `docs/brand/src/` (plain HTML + `tokens.css`),
so any of it can be regenerated or restyled:

```bash
# 1. UI screenshots → docs/brand/src/ui-{main,target,settings,fonts}.png
npm run ui:preview
#    all four at w=400&h=510, 2× device scale, lang=en-US&theme=dark:
#    ui-main:     &fonts=ready
#    ui-fonts:    &screen=fonts
#    ui-target:   &fit=1&fonts=ready&text=clean
#    ui-settings: &screen=settings&wide=1&edge=3840
#    w=400 matters — the preview defaults to 380 and hides overflow
#    theme=dark matters — the boards are dark, a light capture glares

# 2. render each src/*.html at 1920×960 with headless Chrome
#    cover.html → cover-1920x960.png, board-*.html → media-1…4.png (order above)
#    icon.html at 128×128 → icon-128.png
```

When you replace the cover, bump the `?v=` on the README's image link
(`docs/brand/cover-1920x960.png?v=2`). GitHub proxies README images and caches
them by URL, so same-name replacements keep serving the old bytes — the file on
`raw.githubusercontent.com` updates immediately, the rendered README does not.

No board carries the version number any more (the 1.x brand board did), so a
release only needs new UI captures when the UI changed.

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
- 2.0: "New: one-screen redesign with a pre-flight checklist — see what shrinks, what's ready and what would be outlined before you export. Find missing fonts in a folder. Presets as tiles; HD/FHD/QHD/4K caps."
- 2.1: "New: works in Figma Slides — every slide a page, with real fonts and smaller images. Selecting a section exports its frames. Selecting many frames no longer freezes the canvas; image-heavy exports are faster."
