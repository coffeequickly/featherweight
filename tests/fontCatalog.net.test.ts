// 카탈로그의 모든 주소를 실제로 받아서 확인한다 — 네트워크를 쓰므로 기본으로는 돌지 않는다.
//
//   npm run verify:catalog
//
// 확인하는 것: 받아지는가 / TTF(glyf)인가 / static 인가 / 한글이 있는가 / weight 가 맞는가.
// 카탈로그에 항목을 추가·변경하면 반드시 한 번 돌린다.

import * as fontkit from 'fontkit'
import { describe, expect, it } from 'vitest'

import { CATALOG, CATALOG_HOSTS, CatalogEntry } from '../src/lib/fontCatalog'

const enabled = process.env.CATALOG_NET === '1'

// 별칭 family 는 같은 파일을 가리킨다 — 파일당 한 번만 받는다
const byUrl = new Map<string, CatalogEntry>()
for (const entry of CATALOG) {
  if (!byUrl.has(entry.url)) byUrl.set(entry.url, entry)
}

// 흔한 음절로만 본다 — 완성형 서브셋 폰트(도현·주아)는 희귀 음절이 원래 없다
const HANGUL = ['가', '한', '글', '고'].map((char) => char.codePointAt(0) ?? 0)
const LATIN = ['A', 'z', '0'].map((char) => char.codePointAt(0) ?? 0)

describe.runIf(enabled)('카탈로그 실검증', () => {
  for (const [url, entry] of byUrl) {
    it.concurrent(
      `${entry.family} ${entry.style} — ${url.split('/').pop()}`,
      { timeout: 120_000 },
      async () => {
        expect(CATALOG_HOSTS.some((host) => url.startsWith(host))).toBe(true)

        const response = await fetch(url)
        expect(response.status).toBe(200)

        const bytes = Buffer.from(await response.arrayBuffer())
        const font = fontkit.create(bytes) as fontkit.Font

        const tables = Object.keys(
          (font as unknown as { directory: { tables: Record<string, unknown> } }).directory.tables
        )
        expect(tables).toContain('glyf') // CFF 는 pdf-lib 이 잘못 선언한다
        expect(Object.keys(font.variationAxes)).toEqual([]) // variable 금지

        // 스타일↔파일 연결 실수를 잡는다. 예전 GDI 버그를 피하려고 Thin 을 250,
        // ExtraLight 를 275 로 적어 둔 파일이 있다 (Gothic A1) — 그 관행만 허용한다.
        const weightClass = (font['OS/2'] as { usWeightClass?: number } | null)?.usWeightClass
        const tolerated =
          entry.weight === 100 ? [100, 250] : entry.weight === 200 ? [200, 275] : [entry.weight]
        expect(tolerated).toContain(weightClass)

        for (const point of [...HANGUL, ...LATIN]) {
          expect(font.hasGlyphForCodePoint(point)).toBe(true)
        }
      }
    )
  }
})

describe.runIf(!enabled)('카탈로그 실검증 (건너뜀)', () => {
  it('CATALOG_NET=1 로 실행해야 실제 검증이 돈다', () => {
    expect(byUrl.size).toBeGreaterThan(0)
  })
})
