import { JSDOM } from 'jsdom'
import { describe, expect, it, vi } from 'vitest'

// 폰트 파일·브리지 없이 — 배치 결과만 흉내 낸다
const { probes } = vi.hoisted(() => ({ probes: new Map<string, unknown>() }))
vi.mock('../src/ui/fontSource', () => ({
  checkCoverage: async () => ({ ok: true }),
  missingCodePoints: () => [],
  probeFont: async (ref: { family: string; style: string }) =>
    probes.get(`${ref.family} ${ref.style}`)
}))

import { TextRunSource, TextSegment } from '../src/lib/types'
import { validateSources } from '../src/ui/validateText'

const parseXml = (svg: string): Document =>
  new JSDOM(svg, { contentType: 'image/svg+xml' }).window.document

/** 글자마다 전진폭 advance, 잉크 0..advance 인 단순 폰트 (upem 1000) */
function fakeProbe(advance: number) {
  return {
    unitsPerEm: 1000,
    layout: (text: string) => {
      const chars = [...text]
      return {
        glyphs: chars.map(() => ({ bbox: { minX: 0, maxX: advance } })),
        positions: chars.map(() => ({ xAdvance: advance, xOffset: 0 }))
      }
    }
  }
}

function segment(family: string, style: string): TextSegment {
  return {
    start: 0,
    end: 5,
    fontName: { family, style },
    fontSize: 10,
    fills: [{ r: 0, g: 0, b: 0, a: 1 }],
    letterSpacing: { unit: 'PIXELS', value: 0 },
    textDecoration: 'NONE',
    textCase: 'ORIGINAL',
    features: {},
    hyperlink: null
  }
}

const svg = (family: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg"><text font-family="${family}" font-size="10" font-weight="400"><tspan x="0" y="10">ABCDE</tspan></text></svg>`

function source(nodeId: string, family: string, inkWidth?: number): TextRunSource {
  return {
    nodeId,
    characters: 'ABCDE',
    svg: svg(family),
    offset: { x: 0, y: 0 },
    segments: [segment(family, 'Regular')],
    ...(inkWidth === undefined ? {} : { inkWidth })
  }
}

describe('validateSources — 폰트 판 대조', () => {
  it('Figma 가 그린 폭과 우리 폰트의 폭이 같으면 통과', async () => {
    probes.set('Same Regular', fakeProbe(600)) // 5글자 × 6pt = 30pt
    const outcome = await validateSources([source('a', 'Same', 30)], [], undefined, parseXml)
    expect(outcome.eligible).toEqual(['a'])
  })

  it('폭이 허용치를 넘게 다르면 그 폰트를 쓰는 노드는 전부 아웃라인 — 사유에 차이(%)', async () => {
    probes.set('Other Regular', fakeProbe(600))
    const outcome = await validateSources(
      [source('a', 'Other', 33), source('b', 'Other'), source('c', 'Same', 30)],
      [],
      undefined,
      parseXml
    )
    expect(outcome.eligible).toEqual(['c'])
    expect(outcome.rejected.map((item) => item.nodeId)).toEqual(['a', 'b'])
    expect(outcome.rejected[0].reason).toEqual({
      code: 'font.metricsDiffer',
      params: { family: 'Other', style: 'Regular', percent: 9.1 }
    })
  })

  it('폭을 모르는 노드뿐이면 검사하지 않는다', async () => {
    probes.set('Unknown Regular', fakeProbe(600))
    const outcome = await validateSources([source('a', 'Unknown')], [], undefined, parseXml)
    expect(outcome.eligible).toEqual(['a'])
  })
})
