// 사전 검증(checkCoverage)이 그리는 쪽과 같은 문을 지나는가.
//
// 통과시켜 놓고 임베드에서 거절하면 글자를 숨긴 뒤 그릴 수 없어, 내용 누락 방지 장치가 PDF 저장을
// 통째로 막는다 — 정상적인 아웃라인 대체가 되어야 한다 (2026-09-08 재현).
import { describe, expect, it, vi } from 'vitest'

type FakeFont = {
  /** 이 폰트가 가진 글자 */
  glyphs: string
  embedding?: 'installable' | 'editable' | 'preview' | 'restricted' | 'bitmap-only'
}

const { registry } = vi.hoisted(() => ({ registry: new Map<string, FakeFont>() }))

vi.mock('../src/ui/fontkitAdapter', () => ({
  createProbe: (bytes: Uint8Array) => {
    const name = new TextDecoder().decode(bytes)
    const font = registry.get(name)
    if (font === undefined) throw new Error('not a font')
    return {
      _name: name,
      numGlyphs: 10,
      characterSet: [...font.glyphs].map((c) => c.codePointAt(0) ?? 0),
      hasGlyphForCodePoint: (point: number) =>
        [...font.glyphs].some((c) => c.codePointAt(0) === point)
    }
  },
  factsOf: (probe: { _name: string }) => ({
    tables: ['glyf'],
    axes: [],
    embedding: registry.get(probe._name)?.embedding
  })
}))

vi.mock('@create-figma-plugin/utilities', () => ({ emit: () => undefined }))

vi.mock('../src/ui/bridge', () => ({
  nextRequestId: () => 'req-1',
  awaitResponse: async () => ({ bytes: lastRequested })
}))

vi.mock('../src/ui/fontPack', () => ({ unpackFont: async (bytes: Uint8Array) => bytes }))

let lastRequested: Uint8Array | null = null

import { StoredFont } from '../src/lib/types'
import { checkCoverage, resetFontCache } from '../src/ui/fontSource'

const stored = (family: string): StoredFont => ({
  family,
  style: 'Regular',
  weight: 400,
  italic: false,
  byteLength: 10,
  numGlyphs: 10,
  codePoints: 10,
  fileName: `${family}.ttf`
})

function install(family: string, font: FakeFont): StoredFont {
  registry.set(family, font)
  lastRequested = new TextEncoder().encode(family)
  return stored(family)
}

const points = [...'Hi'].map((c) => c.codePointAt(0) ?? 0)

describe('checkCoverage — 임베드 허용 플래그', () => {
  it('임베드를 금지한 폰트는 검증에서 막는다 — 그리는 쪽과 같은 규칙', async () => {
    resetFontCache()
    const font = install('Corp', { glyphs: 'Hi', embedding: 'restricted' })
    const result = await checkCoverage({ family: 'Corp', style: 'Regular' }, points, [font])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason.code).toBe('fontFile.restricted')
  })

  it('비트맵 전용도 막는다', async () => {
    resetFontCache()
    const font = install('Bitmap', { glyphs: 'Hi', embedding: 'bitmap-only' })
    const result = await checkCoverage({ family: 'Bitmap', style: 'Regular' }, points, [font])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason.code).toBe('fontFile.bitmapOnly')
  })

  it('Preview & Print·Editable·Installable·플래그 없음은 통과한다', async () => {
    for (const embedding of ['preview', 'editable', 'installable', undefined] as const) {
      resetFontCache()
      const font = install(`Ok-${embedding ?? 'none'}`, { glyphs: 'Hi', embedding })
      const result = await checkCoverage({ family: font.family, style: 'Regular' }, points, [font])
      expect([font.family, result.ok]).toEqual([font.family, true])
    }
  })
})
