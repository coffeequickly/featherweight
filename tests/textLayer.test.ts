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
    hyperlink: null
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
    // drawText 대신 연산자를 직접 쓴다(커닝) — 페이지에 등록되는 폰트의 순서로 본다
    const registered = vi.spyOn(page.node, 'newFontDictionary')

    const result = await drawTextLayer(page, [mixedSource()], provider, parseXml)

    expect(result.drawn).toBe(1)
    expect(result.fallbacks).toEqual([])
    expect(requested).toEqual(['Test Bold', 'Test Regular'])
    expect(registered.mock.calls.map((call) => call[1])).toEqual([bold.ref, regular.ref])
  })

  it('run 하나라도 폰트를 못 구하면 노드 전체를 그리지 않는다', async () => {
    const { page, bold } = await pageWithFonts()
    const requested: string[] = []
    // Regular 가 없다 — Bold 만 있는 상황
    const provider = providerWith({ 'Test Bold': { font: bold } }, requested)
    const draw = vi.spyOn(page, 'drawText')

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
    const draw = vi.spyOn(page, 'drawText')

    const result = await drawTextLayer(page, [mixedSource()], provider, parseXml)

    expect(result.drawn).toBe(0)
    expect(result.fallbacks[0].reason.code).toBe('font.missingGlyphs')
    expect(draw).not.toHaveBeenCalled()
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
