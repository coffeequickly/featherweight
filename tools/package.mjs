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

Figma 프레임을 가벼운 PDF 로 내보냅니다. 텍스트가 아웃라인이 아니라 진짜 폰트로
들어가서 검색·복사가 되고 파일이 작아집니다.

## 설치 (한 번만)

1. 이 폴더를 옮기지 않을 자리에 두세요. 예: \`~/figma-plugins/featherweight\`
   (Figma 는 import 할 때의 경로를 기억합니다. 폴더를 옮기면 다시 import 해야 합니다.)
2. Figma 데스크톱 앱 → 메뉴 → Plugins → Development → **Import plugin from manifest…**
3. 이 폴더의 \`manifest.json\` 선택

이제 모든 Figma 파일에서 Plugins → Development → Featherweight 로 실행할 수 있습니다.
\`Cmd + /\` 로 "Featherweight" 를 검색해도 됩니다.

## 사용법

1. 캔버스에서 내보낼 프레임을 여러 개 선택합니다
2. 플러그인 실행 → ↑↓ 로 순서 조정, ✕ 로 제외
3. [PDF 내보내기]

## 폰트

문서가 쓰는 폰트를 "폰트" 패널에서 보여줍니다.

- **공개 폰트**는 내보낼 때 자동으로 받아 옵니다.
  (Pretendard, 나눔고딕·명조, Gothic A1, 고운돋움·바탕, IBM Plex Sans KR,
  Spoqa Han Sans Neo, 도현, 주아 등 — 전부 SIL OFL 오픈 폰트)
- **그 외 서체**는 [넣기] 로 TTF/OTF 파일을 한 번 넣으면 저장됩니다.
- 파일이 없는 폰트의 텍스트는 **아웃라인으로 남습니다** — 모양은 원본과 똑같고,
  다른 폰트로 대체되는 일은 없습니다. 다만 그만큼 파일이 줄지 않습니다.

## 이미지

화면에 보이는 크기의 1.5배를 넘는 픽셀은 버립니다(설정에서 조절).
문서보다 큰 원본이 그대로 들어가는 것을 막습니다. 원본이 더 작으면 건드리지 않습니다.

## 면책조건

- **결과 PDF 는 제출 전에 반드시 눈으로 확인해 주세요.** 텍스트를 폰트로 다시
  그리는 방식이라 원본과 미세하게 다를 수 있습니다. 결과물 사용의 책임은
  사용자에게 있습니다.
- **직접 넣은 폰트를 PDF 에 임베드하는 것이 그 폰트의 라이선스에서 허용되는지는
  사용자가 확인할 책임입니다.** 상용 폰트 상당수는 문서 임베드를 제한합니다.
- 네트워크는 폰트 다운로드(cdn.jsdelivr.net)에만 사용합니다. 문서 내용은 어디에도
  전송되지 않습니다.
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
