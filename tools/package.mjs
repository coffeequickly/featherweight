// 배포용 zip 을 만든다. 받는 쪽에 Node·npm·레포가 없어도 된다.
//
//   npm run package
//
// 안에 든 것
//   manifest.json      Figma 가 import 하는 파일
//   build/*.js         플러그인 본체
//   INSTALL.md         설치 방법
//
// 폰트는 넣지 않는다. 공개 폰트는 플러그인이 내보낼 때 CDN 에서 받고,
// 그 외 서체만 사용자가 UI 에서 넣는다. (src/lib/fontCatalog.ts)
//
// 압축은 tools/zip.mjs 로 직접 한다 — 윈도우에는 `zip` 명령이 없다.
// 만들어진 zip 은 어느 OS 에서도 풀어서 그대로 import 하면 된다.

import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { zipDirectory } from './zip.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const DIST = join(ROOT, 'dist')

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

const manifestPath = join(ROOT, 'manifest.json')
if (!(await exists(manifestPath)) || !(await exists(join(ROOT, 'build')))) {
  console.error('빌드 결과가 없다. `npm run build` 를 먼저 돌려라.')
  process.exit(1)
}

const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
const stem = `featherweight-${pkg.version}`
const stage = join(DIST, stem)

await rm(stage, { recursive: true, force: true })
await mkdir(stage, { recursive: true })
await cp(manifestPath, join(stage, 'manifest.json'))
await cp(join(ROOT, 'build'), join(stage, 'build'), { recursive: true })

await writeFile(
  join(stage, 'INSTALL.md'),
  `# Featherweight ${pkg.version}

Export Figma frames as light PDFs with real embedded fonts — text stays
selectable, searchable and ATS-readable, and the file gets much smaller.

Most people should install from the Figma Community instead:
https://www.figma.com/community/plugin/1672509720278498323

This zip is a development build, for trying an unreleased version.

## Install (once)

1. Put this folder somewhere permanent, e.g. \`~/figma-plugins/featherweight\`
   (Figma remembers the path you import from — moving the folder breaks it.)
2. Figma desktop app → menu → Plugins → Development → **Import plugin from manifest…**
3. Pick \`manifest.json\` in this folder

Run it from Plugins → Development → Featherweight, or hit \`Cmd + /\` and search
for "Featherweight".

## Using it

1. Select frames on the canvas
2. Run the plugin → drag rows to reorder, ✕ to exclude
3. **Export PDF**

## Fonts

The Fonts tab shows every font your document uses.

- **Open-license fonts** are downloaded automatically at export time — nothing
  to do. (Pretendard, Nanum Gothic/Myeongjo, Gothic A1, Gowun, IBM Plex Sans KR,
  Spoqa Han Sans Neo, Do Hyeon, Jua and more — all SIL OFL.)
- **Anything else**: add a TTF/OTF once and it is stored for next time.
- Text whose font can't be obtained **stays as outlines** — identical to the
  original, never substituted with a different font. You just don't get the size
  and search benefits for those parts.

## Images

Images larger than the frame's budget are downscaled to their displayed size.
Smaller images — logos, icons — pass through untouched, with no re-encoding.

## Good to know

- **Always proofread the exported PDF before submitting it anywhere.** Text is
  redrawn with real fonts and may differ subtly from Figma's rendering. You are
  responsible for the files you produce with this plugin.
- **Fonts you add yourself are embedded as-is.** Confirming that your font's
  license permits document embedding is your responsibility.
- Network access is used only to download open-license fonts
  (cdn.jsdelivr.net). Your document's content never leaves your machine.

MIT licensed · github.com/coffeequickly/featherweight
`,
  'utf8'
)

await mkdir(DIST, { recursive: true })
const zipPath = join(DIST, `${stem}.zip`)
await rm(zipPath, { force: true })
await zipDirectory(stage, zipPath, stem)

const size = (await stat(zipPath)).size
console.log(`${zipPath}  ${size.toLocaleString()} bytes`)
console.log('압축을 풀고 manifest.json 을 import 하면 됩니다')
