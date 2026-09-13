# Export performance and PDF direct fit

> Shipping design and benchmark record · 2026-09-13

Fit to Size normally needs a baseline PDF and a final PDF. Featherweight now keeps the baseline
PDF parts and, where the PDF structure is independently verifiable, replaces only their image
streams with the selected candidate. Unsupported or uncertain documents still use Figma's normal
second export. This is a fast path, not a second PDF renderer.

## Measured result

The benchmark is a private 31-page portfolio in Figma Design with a 10 MiB target. Times are
single observed runs on the same machine and document, so they are evidence for this workload,
not a universal promise.

| State | Time | Change from 84.1 s |
|---|---:|---:|
| Before cross-pass reuse | 84.1 s | — |
| Reuse candidate encodings and text plans | 77.0 s | −8.4% |
| Direct final PDF image replacement | 56.0 s | −33.4% |
| Reuse ready Figma hashes and the selected probe | **53.5 s** | **−36.4%** |

The final file was 9,374,000 bytes over 31 pages. The 53.5 s output and the preceding 56.0 s
direct-path control rendered pixel-identically on every page at 72 dpi; extracted text, 20 font
objects and 138 image objects also matched. Against the old full second-export control, 23 pages
were pixel-identical and the whole-document mean absolute channel error was 0.126/255. Representative
pages were inspected visually.

After adding conservative ICC and partial-result fallback guards, a release-candidate rerun completed
in 54.2 s with the same 9,374,000 bytes. All 31 rendered pages, extracted text and object counts were
identical to the 53.5 s run; the 0.7 s timing difference is ordinary run-to-run variance.

The final release-candidate smoke widened the selection to 38 pages (54 distinct source images,
673 text layers) and used a 10 MiB target. It completed in 64.0 s at 9,181,369 bytes. The direct path
replaced 38 verified image bindings and retained one baseline binding; its 9,189,291-byte prediction
was −0.09% from the finished file. The PDF contained 38 pages, 69 image objects plus their alpha
masks, and 117,503 bytes of extractable text. Pages 1, 19 and 38 were rendered and inspected.

### Large transparent PNG safety smoke

A separate one-page fixture combines two masked photographs with a transparent PNG enlarged to
5,000×5,000 before import (Figma stores it at its 4,096px limit). With a deliberately unreachable
1 MiB target, repeated full Figma exports exposed a renderer race: the third candidate produced a
structurally valid 6,965-byte PDF with zero image objects.

Two release guards came from that fixture:

- a measured PDF is rejected when the export reports processed images but the PDF contains no image
  objects; Figma gets one delayed retry, and a second failure stops without saving the broken file;
- when a retry candidate is identical to the already measured baseline profile, Featherweight reuses
  that verified PDF instead of asking Figma to render the same profile again.

The fixed smoke completed in 10.6 s at 3,135,526 bytes and correctly reported that 1 MiB was not
reachable. `pdfimages -list` found all three images and their three alpha masks; the rendered page
preserved both masks and the transparent artwork.

## Pipeline

1. Export the Balanced baseline through Figma and merge it with embedded text.
2. Cache original images and candidate encodings under bounded memory budgets.
3. Measure candidate profiles in the iframe, using the same final JPEG conversion Figma applies.
4. For the chosen profile, map baseline PDF images by page, dimensions and a 16×16 RGB signature.
5. Replace only verified streams, merge, and decide from the finished PDF byte count.
6. Fall back to the existing full Figma export whenever the fast path cannot prove its assumptions.
7. Reject a measured PDF that lost every processed image; retry Figma once, then fail closed rather
   than download a visually incomplete file.

The direct path never edits the user's document. Each attempt starts again from the retained
baseline parts, not from a previously patched candidate.

## Guardrails

An image stream is patched only when all of the following hold:

- the source is an independently embedded 8-bit JPEG;
- its PDF dimensions and JPEG header agree;
- its alpha mask is present, dimensionally identical and fully opaque;
- it has no unsupported decode, mask or colour-space settings;
- its visual signature has a unique compatible target;
- the target is a valid JPEG with the expected dimensions;
- an ICC-based source uses the observed Figma `sRGB2014` profile.

The decoded `sRGB2014` profile observed in the benchmark is 3,024 bytes with SHA-256
`384b832de3412066743b52a75ee906b6fb9fb8d9e09e936fc2c43223815c6e0a`. Runtime recognition uses
two small compatibility checksums because `crypto.subtle` is unavailable in the Figma iframe;
the input is a PDF just produced by Figma, not an arbitrary uploaded PDF. Any other RGB ICC profile
falls back rather than being interpreted as sRGB.

Transparent PNG candidates and whole↔crop topology changes stay at their baseline representation.
A partial direct result is safe to save when its measured PDF is already within the target: the
unchanged images are the higher-quality baseline versions. If a partial result exceeds the target,
Featherweight runs the full Figma path so an omitted candidate cannot cause a false “unreachable”
result.

The verified baseline is also a render cache, not only a sizing sample. If the final retry plan comes
back to that exact profile, its already-inspected PDF is used directly. This removes a redundant
full-document export and avoids stressing Figma's asynchronous image renderer for no visual gain.

## Source and release boundaries

The repository intentionally includes the investigation that led to the shipping path:

- `docs/PDF-DIRECT.md` — first feasibility experiment;
- `docs/PDF-DIRECT-SECOND.md` — controlled iframe and lossless-JPEG experiments;
- `tools/pdf-direct-probe/` — isolated development plugin and analysis utilities;
- `tests/pdfDirectProbe.test.ts` — preservation and rejection tests for that probe;
- `src/ui/pdfDirect.ts` and `tests/pdfDirect.test.ts` — the guarded product implementation.

Private captures and generated PDFs belong under ignored `samples/` paths and must not be committed.
The normal build and distribution ZIP contain only `build/main.js`, `build/ui.js` and the product
manifest. Probe source remains reproducible in Git without becoming part of the shipped plugin.

## Reproduction

Automated release checks:

```bash
npm ci
npm run lint
npm test
npm run verify:catalog
npm run package
unzip -l dist/featherweight-*.zip
```

The ZIP listing must contain only `manifest.json`, `INSTALL.md`, `build/main.js` and `build/ui.js`
under its versioned root. The font-catalog check requires network access.

For the isolated PDF investigation, follow `tools/pdf-direct-probe/README.md`. For a product
benchmark, use the same selected frames and target for both builds, record the Result time and bytes,
then compare page count, `pdftotext`, `pdffonts`, `pdfimages -list`, full-page renders and representative
pages by eye. Do not call two runs equivalent from file size alone.
