import { describe, expect, it } from 'vitest'

import { availabilityOf, fontReadiness, missingFonts } from '../src/lib/fontStatus'
import { FontUsage, StoredFont } from '../src/lib/types'

function usage(family: string, style: string, nodeCount = 1): FontUsage {
  const nodeIds = Array.from({ length: nodeCount }, (_, i) => `${family}-${style}-${i}`)
  return {
    family,
    style,
    weight: 400,
    italic: false,
    nodeCount,
    charCount: nodeCount * 10,
    nodeIds
  }
}

function stored(family: string, style: string): StoredFont {
  return {
    family,
    style,
    weight: 400,
    italic: false,
    byteLength: 1000,
    numGlyphs: 10,
    codePoints: 10,
    fileName: `${family}-${style}.ttf`
  }
}

const CATALOG = usage('Pretendard Variable', 'SemiBold', 21)
const NEXA = usage('Nexa', 'Heavy', 3)

describe('availabilityOf', () => {
  it('카탈로그에 있으면 받아온다 — 올린 파일이 있어도 카탈로그가 먼저', () => {
    expect(availabilityOf(CATALOG, []).kind).toBe('catalog')
    expect(availabilityOf(CATALOG, [stored('Pretendard Variable', 'SemiBold')]).kind).toBe(
      'catalog'
    )
  })

  it('카탈로그 밖이면 올린 파일이 있어야 한다', () => {
    expect(availabilityOf(NEXA, []).kind).toBe('missing')
    const state = availabilityOf(NEXA, [stored('Nexa', 'Heavy')])
    expect(state.kind).toBe('uploaded')
    if (state.kind === 'uploaded') expect(state.font.fileName).toBe('Nexa-Heavy.ttf')
  })
})

describe('missingFonts', () => {
  it('구할 수 없는 것만 남긴다', () => {
    expect(missingFonts([CATALOG, NEXA], []).map((font) => font.family)).toEqual(['Nexa'])
    expect(missingFonts([CATALOG, NEXA], [stored('Nexa', 'Heavy')])).toEqual([])
  })
})

describe('fontReadiness', () => {
  it('없는 폰트가 쓰인 텍스트 수를 센다 — 그만큼 아웃라인이 된다', () => {
    const readiness = fontReadiness([CATALOG, NEXA], [])
    expect(readiness.total).toBe(2)
    expect(readiness.missing.map((font) => font.style)).toEqual(['Heavy'])
    expect(readiness.missingTexts).toBe(3)
    expect(readiness.anyUploaded).toBe(false)
  })

  it('올린 파일이 하나라도 있으면 "전부 자동" 이 아니다', () => {
    expect(fontReadiness([CATALOG, NEXA], [stored('Nexa', 'Heavy')]).anyUploaded).toBe(true)
  })

  it('서체 이름은 쓰인 순서로 중복 없이', () => {
    const readiness = fontReadiness(
      [CATALOG, usage('Pretendard Variable', 'Bold'), NEXA],
      [stored('Nexa', 'Heavy')]
    )
    expect(readiness.families).toEqual(['Pretendard Variable', 'Nexa'])
  })

  it('폰트가 없으면 전부 비어 있다', () => {
    expect(fontReadiness([], [])).toEqual({
      total: 0,
      missing: [],
      missingTexts: 0,
      anyUploaded: false,
      families: []
    })
  })
})
