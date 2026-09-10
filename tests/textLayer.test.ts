import { formatReason } from '../src/lib/i18n'
import { JSDOM } from 'jsdom'
import { PDFDocument, PDFFont, StandardFonts } from 'pdf-lib'
import { describe, expect, it, vi } from 'vitest'

import { TextRunSource, TextSegment } from '../src/lib/types'
import { FontProbe } from '../src/ui/fontkitAdapter'
import { drawTextLayer, FontProvider } from '../src/ui/textLayer'

const parseXml = (svg: string): Document =>
  new JSDOM(svg, { contentType: 'image/svg+xml' }).window.document

function segment(family: string, style: string, start: number, end: number): TextSegment {
  return {
    start,
    end,
    fontName: { family, style },
    fontSize: 12,
    fills: [{ r: 0, g: 0, b: 0, a: 1 }],
    letterSpacing: { unit: 'PIXELS', value: 0 },
    textDecoration: 'NONE',
    textCase: 'ORIGINAL',
    features: {},
    hyperlink: null,
    listType: 'NONE',
    indentation: 0
  }
}

/** 한 노드 안에 Bold "AB" + Regular "cd" 가 섞인 SVG — Figma 는 text 를 나눠서 내보낸다 */
const MIXED_SVG = `<svg xmlns="http://www.w3.org/2000/svg">
<text font-family="Test" font-size="12" font-weight="700"><tspan x="0" y="10">AB</tspan></text>
<text font-family="Test" font-size="12" font-weight="400"><tspan x="20" y="10">cd</tspan></text>
</svg>`

function mixedSource(): TextRunSource {
  return {
    nodeId: '1:1',
    characters: 'ABcd',
    svg: MIXED_SVG,
    offset: { x: 0, y: 0 },
    segments: [segment('Test', 'Bold', 0, 2), segment('Test', 'Regular', 2, 4)]
  }
}

type ProviderEntry = { font: PDFFont; missing?: number[] }

/** FontCache 대역 — 어떤 (family, style) 을 요청했는지 기록한다 */
function providerWith(entries: Record<string, ProviderEntry>, requested: string[]): FontProvider {
  return {
    get: async (family: string, style: string) => {
      const key = `${family} ${style}`
      requested.push(key)
      const entry = entries[key]
      if (entry === undefined)
        return { ok: false, reason: { code: 'font.noFile', params: { family, style } } as const }
      // 표준 폰트에는 fontkit 프로브가 없다 — layout 이 빈 배열을 주면 커닝 없이 통째로 그린다
      const probe = {
        layout: () => ({ glyphs: [], positions: [] }),
        unitsPerEm: 1000
      } as unknown as FontProbe
      return { ok: true, font: entry.font, probe, covers: () => entry.missing ?? [] }
    }
  }
}

async function pageWithFonts(): Promise<{
  page: import('pdf-lib').PDFPage
  bold: PDFFont
  regular: PDFFont
}> {
  const document = await PDFDocument.create()
  const page = document.addPage([595, 842])
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  const regular = await document.embedFont(StandardFonts.Helvetica)
  return { page, bold, regular }
}

describe('drawTextLayer', () => {
  it('스타일이 섞인 노드는 run 마다 제 폰트로 그린다', async () => {
    const { page, bold, regular } = await pageWithFonts()
    const requested: string[] = []
    const provider = providerWith(
      { 'Test Bold': { font: bold }, 'Test Regular': { font: regular } },
      requested
    )
    // drawText 대신 연산자를 직접 쓴다(커닝) — 페이지에 등록되는 폰트의 순서와 run 마다 한 번씩
    // 밀어 넣는 연산자 묶음으로 본다
    const registered = vi.spyOn(page.node, 'newFontDictionary')
    const pushed = vi.spyOn(page, 'pushOperators')

    const result = await drawTextLayer(page, [mixedSource()], provider, parseXml)

    expect(result.drawn).toBe(1)
    expect(result.fallbacks).toEqual([])
    expect(requested).toEqual(['Test Bold', 'Test Regular'])
    expect(registered.mock.calls.map((call) => call[1])).toEqual([bold.ref, regular.ref])
    expect(pushed).toHaveBeenCalledTimes(2) // run 2개 = 연산자 묶음 2개
  })

  it('run 하나라도 폰트를 못 구하면 노드 전체를 그리지 않는다', async () => {
    const { page, bold } = await pageWithFonts()
    const requested: string[] = []
    // Regular 가 없다 — Bold 만 있는 상황
    const provider = providerWith({ 'Test Bold': { font: bold } }, requested)
    const draw = vi.spyOn(page, 'pushOperators')

    const result = await drawTextLayer(page, [mixedSource()], provider, parseXml)

    expect(result.drawn).toBe(0)
    expect(result.fallbacks).toHaveLength(1)
    expect(formatReason(result.fallbacks[0].reason)).toContain('Test Regular')
    expect(draw).not.toHaveBeenCalled() // 반쯤 그린 노드를 남기지 않는다
  })

  it('run 하나의 글리프가 모자라도 노드 전체를 그리지 않는다', async () => {
    const { page, bold, regular } = await pageWithFonts()
    const provider = providerWith(
      {
        'Test Bold': { font: bold },
        'Test Regular': { font: regular, missing: ['c'.codePointAt(0) ?? 0] }
      },
      []
    )
    const draw = vi.spyOn(page, 'pushOperators')

    const result = await drawTextLayer(page, [mixedSource()], provider, parseXml)

    expect(result.drawn).toBe(0)
    expect(result.fallbacks[0].reason.code).toBe('font.missingGlyphs')
    expect(draw).not.toHaveBeenCalled()
  })

  it('기준선은 Figma 처럼 정수 픽셀에 스냅한다 — SVG 의 소수 y 를 그대로 쓰면 0.5pt 까지 뜬다', async () => {
    const { page, bold, regular } = await pageWithFonts()
    const provider = providerWith(
      { 'Test Bold': { font: bold }, 'Test Regular': { font: regular } },
      []
    )
    const pushed = vi.spyOn(page, 'pushOperators')
    // 노드 상자 top 69.7955 + tspan y 38.75 = 108.5455 → Figma PDF 는 109 에 그린다 (Inter 40pt 실측)
    const source: TextRunSource = {
      ...mixedSource(),
      offset: { x: 0, y: 69.7955 },
      svg: MIXED_SVG.replace(/y="10"/g, 'y="38.75"')
    }

    await drawTextLayer(page, [source], provider, parseXml)

    const matrices = pushed.mock.calls
      .flat()
      .map((op) => String(op))
      .filter((text) => text.endsWith(' Tm'))
    expect(matrices.length).toBeGreaterThan(0)
    for (const matrix of matrices) {
      const y = Number(matrix.split(' ')[5])
      expect(y).toBe(842 - 109)
    }
  })

  it('실패한 노드가 있어도 다음 노드는 계속 그린다', async () => {
    const { page, bold, regular } = await pageWithFonts()
    const provider = providerWith(
      { 'Test Bold': { font: bold }, 'Test Regular': { font: regular } },
      []
    )
    const broken: TextRunSource = { ...mixedSource(), nodeId: '9:9', svg: '<svg/>' }

    const result = await drawTextLayer(page, [broken, mixedSource()], provider, parseXml)

    expect(result.drawn).toBe(1)
    expect(result.fallbacks).toHaveLength(1)
    expect(result.fallbacks[0].nodeId).toBe('9:9')
  })
})

describe('drawTextLayer — 목록 마커', () => {
  /** 한 문단이 두 줄로 접히고, 그 뒤에 새 문단이 오는 목록 */
  const LIST_SVG = `<svg xmlns="http://www.w3.org/2000/svg">
<text font-family="Test" font-size="12"><tspan x="18" y="10">AB</tspan><tspan x="18" y="24">cd</tspan><tspan x="18" y="38">EF</tspan></text>
</svg>`

  function listSource(listType: 'UNORDERED' | 'ORDERED'): TextRunSource {
    return {
      nodeId: '1:2',
      characters: 'ABcd\nEF',
      svg: LIST_SVG,
      offset: { x: 0, y: 0 },
      segments: [{ ...segment('Test', 'Regular', 0, 7), listType, indentation: 1 }]
    }
  }

  it('문단마다 마커를 하나씩 더 그린다 — 접힌 줄에는 안 붙는다', async () => {
    const { page, regular } = await pageWithFonts()
    const provider = providerWith({ 'Test Regular': { font: regular } }, [])
    const pushed = vi.spyOn(page, 'pushOperators')

    const result = await drawTextLayer(page, [listSource('UNORDERED')], provider, parseXml, {
      links: false,
      glyphFallback: false
    })

    expect(result.drawn).toBe(1)
    expect(result.fallbacks).toEqual([])
    // 줄 3개 + 마커 2개 (문단이 둘)
    expect(pushed).toHaveBeenCalledTimes(5)
  })

  it('접힌 줄은 건너뛰고, 번호는 문단마다 올라간다', async () => {
    // 연산자 덤프에서 보이는 글자(TJ 의 hex)와 가로 자리를 읽는다
    async function dump(listType: 'UNORDERED' | 'ORDERED'): Promise<string[]> {
      const { page, regular } = await pageWithFonts()
      const provider = providerWith({ 'Test Regular': { font: regular } }, [])
      const groups: string[] = []
      vi.spyOn(page, 'pushOperators').mockImplementation(function (this: unknown, ...ops) {
        groups.push(ops.map(String).join(' '))
        return undefined as never
      })
      await drawTextLayer(page, [listSource(listType)], provider, parseXml, {
        links: false,
        glyphFallback: false
      })
      return groups
    }

    const hex = (group: string): string => (group.match(/<([0-9A-Fa-f]+)>/) ?? ['', ''])[1]
    const x = (group: string): number => Number((group.match(/1 0 0 1 ([-\d.]+) /) ?? ['', '0'])[1])

    const ordered = await dump('ORDERED')
    // 마커·줄·줄(접힘)·마커·줄
    expect(ordered).toHaveLength(5)
    expect(hex(ordered[0])).toBe('312E') // "1."
    expect(hex(ordered[3])).toBe('322E') // "2."
    expect(hex(ordered[1])).toBe('4142') // "AB" — 첫 줄
    expect(hex(ordered[2])).toBe('6364') // "cd" — 접힌 줄, 앞에 마커가 없다
    // 번호는 우측 정렬: 텍스트 18 에서 0.40 × 12 = 4.8 만큼 왼쪽
    expect(x(ordered[0])).toBeCloseTo(13.2, 2)
    expect(x(ordered[1])).toBe(18)

    const bullets = await dump('UNORDERED')
    expect(hex(bullets[0])).toBe(hex(bullets[3])) // 글머리는 항목마다 같은 글자
  })

  it('마커가 대체 폰트로 떨어져도 잉크는 그 폰트로 잰다', async () => {
    // 실기: SUIT 에 가운뎃점(U+2022)이 없어 Inter 로 대체됐는데 잉크를 SUIT 로 재는 바람에
    // 글리프가 없어 보정이 건너뛰어졌고, 마커가 Inter 의 좌측 베어링만큼 오른쪽으로 밀렸다.
    const { page, regular, bold } = await pageWithFonts()
    // 주 폰트는 마커 글자를 못 덮는다(covers 가 U+2022 를 못 찾았다고 한다)
    const main = {
      layout: () => ({ glyphs: [], positions: [] }),
      unitsPerEm: 1000
    } as unknown as FontProbe
    // 대체 폰트에는 있고, 좌측 베어링이 100/1000 em 이다 → 12pt 에서 1.2pt
    const spare = {
      layout: () => ({
        glyphs: [{ bbox: { minX: 100, maxX: 400 } }],
        positions: [{ xAdvance: 500, xOffset: 0 }]
      }),
      unitsPerEm: 1000
    } as unknown as FontProbe
    const provider: FontProvider = {
      get: async (family: string) =>
        family === 'Test'
          ? { ok: true, font: regular, probe: main, covers: () => [0x2022] }
          : { ok: true, font: bold, probe: spare, covers: () => [] }
    }
    const groups: string[] = []
    vi.spyOn(page, 'pushOperators').mockImplementation(function (this: unknown, ...ops) {
      groups.push(ops.map(String).join(' '))
      return undefined as never
    })

    await drawTextLayer(page, [listSource('UNORDERED')], provider, parseXml, {
      links: false,
      glyphFallback: true
    })

    const x = Number((groups[0].match(/1 0 0 1 ([-\d.]+) /) ?? ['', '0'])[1])
    // 잉크 중심이 앉을 자리 = 거터 18 의 절반 = 9
    // 대체 폰트의 잉크는 펜에서 1.2~4.8pt 구간(100~400/1000em × 12)이라 중심이 3.0
    expect(x).toBeCloseTo(9 - 3.0, 2)
  })

  it('오른쪽에서 왼쪽으로 쓰는 글의 목록은 통째로 아웃라인으로 물러선다', async () => {
    // 마커가 반대쪽에 붙는데 자리를 아직 재지 못했다(SVG 가 주는 텍스트 시작이 0 으로 나온다).
    // 잘못 그리느니 예전 동작으로 돌아간다 — 조용히 다른 모양을 내보내지 않는다.
    const { page, regular } = await pageWithFonts()
    const provider = providerWith({ 'Test Regular': { font: regular } }, [])
    const pushed = vi.spyOn(page, 'pushOperators')

    const rtl = { ...listSource('UNORDERED'), characters: 'مرحبا\nبالعالم' }
    const result = await drawTextLayer(page, [rtl], provider, parseXml, {
      links: false,
      glyphFallback: false
    })

    expect(result.drawn).toBe(0)
    expect(result.fallbacks).toEqual([{ nodeId: '1:2', reason: { code: 'reject.list' } }])
    expect(pushed).not.toHaveBeenCalled()
  })

  it('목록이 아니면 아무것도 더 그리지 않는다', async () => {
    const { page, regular } = await pageWithFonts()
    const provider = providerWith({ 'Test Regular': { font: regular } }, [])
    const pushed = vi.spyOn(page, 'pushOperators')

    await drawTextLayer(
      page,
      [{ ...listSource('UNORDERED'), segments: [segment('Test', 'Regular', 0, 7)] }],
      provider,
      parseXml,
      { links: false, glyphFallback: false }
    )

    expect(pushed).toHaveBeenCalledTimes(3)
  })
})
