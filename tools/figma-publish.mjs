// Figma Community 에 새 버전을 올린다 — 코드만 갱신하는 용도.
//
//   FIGMA_WEB_AUTHN_TOKEN=... node tools/figma-publish.mjs "릴리즈 노트"
//   node tools/figma-publish.mjs --dry-run          현재 스토어 상태만 확인
//
// ⚠ Figma 는 플러그인 퍼블리싱 공개 API 를 제공하지 않는다. 이 스크립트는 데스크톱 앱이
// 쓰는 내부 엔드포인트를 그대로 호출한다 — 언제든 바뀔 수 있고, 바뀌면 여기서 멈춘다.
// 그래서 실패는 항상 큰 소리로 내고(조용한 부분 성공 금지), 사람이 클릭으로 대신할 수
// 있게 안내한다. 이름·설명·이미지·태그·카테고리는 스토어에 있는 값을 그대로 재사용하므로
// 이 경로로는 리스팅 문구가 바뀌지 않는다 — 문구 변경은 데스크톱 앱에서 한다.
//
// 토큰 얻는 법: figma.com 로그인 → 개발자도구 → Application → Cookies →
// `__Host-figma.authn` 값. 계정 자격증명급이므로 CI 에서는 반드시 시크릿으로 넣는다.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const token = process.env.FIGMA_WEB_AUTHN_TOKEN ?? ''
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const releaseNotes = args.find((arg) => !arg.startsWith('--')) ?? ''

function fail(message) {
  console.error(`\n✖ ${message}`)
  console.error('  데스크톱 앱에서 직접 올리려면: Plugins → Manage plugins → Publish new version')
  process.exit(1)
}

/** 내부 API 는 인증 쿠키 + 세션 쿠키를 함께 요구한다. 세션 쿠키는 로그인 페이지가 준다. */
async function sessionCookie() {
  const response = await fetch('https://www.figma.com/login', {
    headers: { accept: 'application/json', 'x-csrf-bypass': 'yes', 'user-agent': UA }
  })
  return response.headers.get('set-cookie') ?? ''
}

function headers(cookie) {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    cookie: `__Host-figma.authn=${token}; ${cookie}`,
    'user-agent': UA,
    Referer: 'https://www.figma.com/'
  }
}

async function readJson(response, what) {
  const text = await response.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    fail(`${what}: 응답이 JSON 이 아니다 (HTTP ${response.status}). 내부 API 가 바뀌었을 수 있다.`)
  }
  if (!response.ok || json.error) {
    const detail = json.message ?? json.error ?? `HTTP ${response.status}`
    if (response.status === 401 || response.status === 403) {
      fail(`${what}: 인증 실패 (${detail}). FIGMA_WEB_AUTHN_TOKEN 이 만료됐을 수 있다.`)
    }
    fail(`${what}: ${detail}`)
  }
  return json.meta ?? json
}

/** 스토어에 등록된 현재 플러그인 정보 — 이름·설명·태그 등을 그대로 재사용한다 */
async function currentPlugin(manifest, cookie) {
  const response = await fetch('https://www.figma.com/api/plugins', {
    headers: headers(cookie)
  })
  const plugins = await readJson(response, '플러그인 목록 조회')
  const found = (Array.isArray(plugins) ? plugins : []).find((item) => item.id === manifest.id)
  if (found === undefined) {
    fail(`이 토큰으로 플러그인 ${manifest.id} 에 접근할 수 없다.`)
  }
  return found
}

/** 버전 슬롯을 만들고 업로드 URL 을 받는다 */
async function prepare(manifest, plugin, cookie) {
  const version = plugin.versions?.[plugin.current_plugin_version_id] ?? {}
  const response = await fetch(`https://www.figma.com/api/plugins/${manifest.id}/upload`, {
    method: 'POST',
    headers: headers(cookie),
    // 리스팅 값은 현재 스토어 것을 그대로 넘긴다 — 이 스크립트로 문구가 바뀌지 않게
    body: JSON.stringify({
      manifest,
      release_notes: releaseNotes,
      name: version.name ?? manifest.name,
      description: version.description ?? '',
      tagline: version.tagline ?? '',
      tags: version.tags ?? [],
      category_id: version.category_id ?? null,
      creator_policy: version.creator_policy ?? '',
      images_sha1: version.images_sha1 ?? []
    })
  })
  return await readJson(response, '버전 준비(prepare)')
}

/** main.js + ui.js 를 Figma 가 기대하는 단일 번들로 합친다 (데스크톱 앱과 같은 형식) */
async function buildBundle(manifest) {
  const main = await readFile(join(ROOT, manifest.main), 'utf8')
  const ui = await readFile(join(ROOT, manifest.ui), 'utf8')
  // `<!--`, `-->`, `import` 는 인라인 스크립트를 깨뜨리므로 문자열 결합으로 쪼갠다
  const escape = (value) =>
    JSON.stringify(value)
      .split(/(<!--|-->|\bimport)/g)
      .map((part, index) => (index & 1 ? `${part.slice(0, 2)}"+"${part.slice(2)}` : part))
      .join('')
  return `const __html__ = ${escape(ui)};${main}`
}

async function uploadCode(bundle, upload) {
  const form = new FormData()
  for (const [name, value] of Object.entries(upload.fields ?? {})) form.append(name, value)
  form.set('Content-Type', 'text/javascript')
  form.append('file', new Blob([bundle], { type: 'text/javascript' }))

  const response = await fetch(upload.code_path, { method: 'POST', body: form })
  if (!response.ok) fail(`코드 번들 업로드 실패 (HTTP ${response.status})`)
}

/** 준비된 버전을 확정한다 — 이 호출이 성공해야 스토어에 반영된다 */
async function publish(manifest, prepared, plugin, cookie) {
  const version = plugin.versions?.[plugin.current_plugin_version_id] ?? {}
  const response = await fetch(
    `https://www.figma.com/api/plugins/${manifest.id}/versions/${prepared.version_id}`,
    {
      method: 'PUT',
      headers: headers(cookie),
      body: JSON.stringify({
        agreed_to_tos: true,
        code_uploaded: true,
        comments_setting: version.comments_setting ?? 'enabled',
        // 이미지는 이번에 올리지 않는다 — 스토어의 기존 것이 유지된다
        cover_image_uploaded: false,
        icon_uploaded: false,
        snapshot_uploaded: false,
        carousel_media: version.carousel_media ?? [],
        carousel_videos: version.carousel_videos ?? [],
        playground_file_publish_type: 'noop',
        signature: prepared.signature
      })
    }
  )
  return await readJson(response, '버전 확정(publish)')
}

// ── 실행 ────────────────────────────────────────────────
const manifest = JSON.parse(await readFile(join(ROOT, 'manifest.json'), 'utf8'))
const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))

if (token === '') {
  fail('FIGMA_WEB_AUTHN_TOKEN 이 없다. figma.com 쿠키의 `__Host-figma.authn` 값을 넣어라.')
}

const cookie = await sessionCookie()
const plugin = await currentPlugin(manifest, cookie)
const currentVersion = plugin.versions?.[plugin.current_plugin_version_id]?.version ?? '?'

console.log(`플러그인: ${plugin.name ?? manifest.name} (${manifest.id})`)
console.log(`스토어 현재 버전: ${currentVersion}  ·  올릴 빌드: v${pkg.version}`)

if (dryRun) {
  console.log('\n--dry-run 이라 여기서 멈춘다. 실제로 올리려면 플래그 없이 실행해라.')
  process.exit(0)
}

if (releaseNotes === '')
  fail('릴리즈 노트를 인자로 넘겨라. 예: node tools/figma-publish.mjs "Fix: ..."')

const prepared = await prepare(manifest, plugin, cookie)
console.log(`버전 슬롯 생성됨 (${prepared.version_id})`)

await uploadCode(await buildBundle(manifest), prepared)
console.log('코드 번들 업로드 완료')

const published = await publish(manifest, prepared, plugin, cookie)
const number = published.plugin?.versions?.[prepared.version_id]?.version ?? prepared.version_id
console.log(`\n✔ 버전 ${number} 퍼블리시 완료 — 스토어에 반영되기까지 잠시 걸릴 수 있다.`)
