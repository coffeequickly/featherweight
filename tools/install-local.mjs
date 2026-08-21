// 빌드 결과물을 레포 밖 고정 위치로 복사한다. "설치"에 해당한다.
//
//   npm run install:local
//
// 왜 필요한가: Figma 는 import 할 때의 manifest 경로를 기억한다. 레포에서 바로 import 하면
// 레포를 옮기거나 지우는 순간 플러그인이 깨지고, `build/` 가 없으면 실행도 안 된다.
// 고정 위치에 복사해 두면 레포와 무관하게 계속 쓸 수 있다.
//
// 개인 계정에는 비공개 게시가 없다(Organization·Enterprise 전용). 개발 플러그인으로 두는 편이
// 오히려 낫다 — clientStorage 가 유지되고, localhost 폰트 서버(devAllowedDomains)도 계속 된다.
//
// 처음 한 번만 Figma 에서 아래 경로의 manifest.json 을 import 하면,
// 그 뒤로는 `npm run install:local` 만 다시 돌리면 갱신된다 (재import 불필요).

import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const TARGET = process.env.SHEAF_INSTALL_DIR ?? join(homedir(), 'figma-plugins', 'sheaf')

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

const manifest = join(ROOT, 'manifest.json')
const build = join(ROOT, 'build')

if (!(await exists(manifest)) || !(await exists(build))) {
  console.error('빌드 결과가 없다. 먼저 `npm run build` 를 돌려라.')
  process.exit(1)
}

const firstInstall = !(await exists(join(TARGET, 'manifest.json')))

await mkdir(TARGET, { recursive: true })
await rm(join(TARGET, 'build'), { recursive: true, force: true })
await cp(build, join(TARGET, 'build'), { recursive: true })
await cp(manifest, join(TARGET, 'manifest.json'))

const { name } = JSON.parse(await readFile(manifest, 'utf8'))
console.log(`${name} 설치: ${TARGET}`)

if (firstInstall) {
  console.log('')
  console.log('Figma 데스크톱에서 한 번만:')
  console.log('  Plugins → Development → Import plugin from manifest…')
  console.log(`  → ${join(TARGET, 'manifest.json')}`)
  console.log('')
  console.log('그 뒤로는 이 명령만 다시 돌리면 갱신된다. 재import 필요 없다.')
} else {
  console.log('갱신 완료. Figma 에서 플러그인을 다시 실행하면 반영된다.')
}
