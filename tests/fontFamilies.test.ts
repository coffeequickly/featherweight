// 폰트 목록을 패밀리로 묶는 규칙.
//
// 이 그룹이 틀리면 아홉 줄이 세 줄이 되는 이득이 없어지거나, 더 나쁘게는 손봐야 할
// 스타일이 "외 N개" 뒤로 숨는다. 접는 순서와 정렬을 여기서 못 박는다.

import { describe, expect, it } from 'vitest'

import { fontFamilies, visibleStyles } from '../src/lib/fontFamilies'
import { FontUsage, StoredFont } from '../src/lib/types'

function usage(family: string, style: string, weight = 400): FontUsage {
  return {
    family,
    style,
    weight,
    italic: false,
    nodeCount: 1,
    charCount: 10,
    nodeIds: [`${family}-${style}`]
  }
}

function stored(family: string, style: string, byteLength = 1000): StoredFont {
  return {
    family,
    style,
    weight: 400,
    italic: false,
    byteLength,
    numGlyphs: 10,
    codePoints: 10,
    fileName: `${family}-${style}.ttf`
  }
}

/** 카탈로그에 있는 서체 — 저장본 없이도 내보낼 때 받아온다 */
const CATALOG = 'Pretendard'
/** 카탈로그에 없는 서체 */
const OUTSIDE = 'Nexa'

describe('fontFamilies', () => {
  it('한 서체의 여러 스타일을 한 줄로 묶는다', () => {
    const rows = fontFamilies(
      [usage(CATALOG, 'Regular'), usage(CATALOG, 'Bold'), usage(CATALOG, 'SemiBold')],
      []
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].family).toBe(CATALOG)
    expect(rows[0].styles).toHaveLength(3)
    expect(rows[0].allCatalog).toBe(true)
    expect(rows[0].problems).toBe(0)
  })

  it('문서의 이름 그대로 나눈다 — Variable 은 별도 줄', () => {
    const rows = fontFamilies(
      [usage(CATALOG, 'Regular'), usage(`${CATALOG} Variable`, 'Regular')],
      []
    )
    expect(rows.map((row) => row.family).sort()).toEqual([CATALOG, `${CATALOG} Variable`])
  })

  it('못 구한 자리를 문제로 센다', () => {
    const rows = fontFamilies([usage(OUTSIDE, 'Heavy'), usage(OUTSIDE, 'Bold')], [])
    expect(rows[0].problems).toBe(2)
    expect(rows[0].styles.every((style) => style.problem)).toBe(true)
  })

  it('넣은 파일이 자리에 맞으면 문제가 아니고 바이트를 센다', () => {
    const rows = fontFamilies([usage(OUTSIDE, 'Heavy')], [stored(OUTSIDE, 'Heavy', 1_600_000)])
    expect(rows[0].problems).toBe(0)
    expect(rows[0].storedBytes).toBe(1_600_000)
    expect(rows[0].allCatalog).toBe(false)
  })

  it('넣은 파일의 굵기가 자리와 다르면 문제다', () => {
    const bad: StoredFont = {
      ...stored(OUTSIDE, 'Heavy'),
      weight: 900,
      facts: { tables: ['glyf'], axes: [], weightClass: 400, italic: false }
    }
    const rows = fontFamilies([usage(OUTSIDE, 'Heavy', 900)], [bad])
    expect(rows[0].problems).toBe(1)
  })

  it('문제 있는 스타일이 그 줄 안에서 앞으로 온다', () => {
    const rows = fontFamilies(
      [usage(OUTSIDE, 'Regular'), usage(OUTSIDE, 'Bold')],
      [stored(OUTSIDE, 'Regular')]
    )
    expect(rows[0].styles.map((style) => style.usage.style)).toEqual(['Bold', 'Regular'])
  })

  it('손볼 것이 있는 패밀리가 위로. 같으면 이름순', () => {
    const rows = fontFamilies(
      [usage(CATALOG, 'Regular'), usage(OUTSIDE, 'Heavy'), usage('Arial', 'Regular')],
      []
    )
    // Nexa 와 Arial 은 카탈로그 밖이라 둘 다 문제 하나씩 — 이름순
    expect(rows.map((row) => row.family)).toEqual(['Arial', OUTSIDE, CATALOG])
  })
})

describe('visibleStyles', () => {
  const many = fontFamilies(
    ['Regular', 'Medium', 'SemiBold', 'Bold', 'Black', 'Light'].map((style) =>
      usage(CATALOG, style)
    ),
    []
  )[0]

  it('한도 안이면 그대로 다 보여준다', () => {
    expect(visibleStyles(many, 10)).toEqual({ shown: many.styles, rest: 0 })
  })

  it('넘치면 뒤에서부터 접는다', () => {
    const { shown, rest } = visibleStyles(many, 4)
    expect(shown).toHaveLength(4)
    expect(rest).toBe(2)
  })

  it('문제 있는 뱃지는 접지 않는다 — 그게 이 줄을 보는 이유다', () => {
    const row = fontFamilies(
      ['A', 'B', 'C', 'D', 'E'].map((style) => usage(OUTSIDE, style)),
      [stored(OUTSIDE, 'A'), stored(OUTSIDE, 'B')]
    )[0]
    expect(row.problems).toBe(3)

    const { shown, rest } = visibleStyles(row, 2)
    expect(shown.filter((style) => style.problem)).toHaveLength(3)
    expect(shown).toHaveLength(3)
    expect(rest).toBe(2)
  })
})
