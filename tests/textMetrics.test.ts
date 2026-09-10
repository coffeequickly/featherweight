import { describe, expect, it } from 'vitest'

import { inkOffsets, inkWidthOf, widthMismatch } from '../src/lib/textMetrics'

const glyph = (minX: number, maxX: number) => ({ bbox: { minX, maxX } })
const at = (xAdvance: number, xOffset = 0) => ({ xAdvance, xOffset })

describe('inkWidthOf', () => {
  it('첫 글리프 왼쪽 가장자리부터 마지막 글리프 오른쪽 가장자리까지 — 전진폭이 아니라 잉크', () => {
    // upem 1000, 10pt: 글리프 1 은 50..450, 글리프 2 는 pen 500 에서 40..560
    const width = inkWidthOf(
      { glyphs: [glyph(50, 450), glyph(40, 560)], positions: [at(500), at(600)] },
      1000,
      10
    )
    expect(width).toBeCloseTo((500 + 560 - 50) / 100, 5)
  })

  it('잉크 없는 글리프(공백)는 가장자리에 넣지 않고 전진만 한다', () => {
    const width = inkWidthOf(
      {
        glyphs: [glyph(0, 400), glyph(0, 0), glyph(0, 400)],
        positions: [at(500), at(300), at(500)]
      },
      1000,
      10
    )
    expect(width).toBeCloseTo((500 + 300 + 400) / 100, 5)
  })

  it('자간은 글리프 사이에만 잉크로 잡힌다 — 마지막 글리프 뒤의 자간은 밖', () => {
    const plain = inkWidthOf(
      { glyphs: [glyph(0, 400), glyph(0, 400)], positions: [at(500), at(500)] },
      1000,
      10
    )
    const spaced = inkWidthOf(
      { glyphs: [glyph(0, 400), glyph(0, 400)], positions: [at(500), at(500)] },
      1000,
      10,
      2
    )
    expect((spaced ?? 0) - (plain ?? 0)).toBeCloseTo(2, 5)
  })

  it('무시 문자 자릿수는 글리프 수와 글자 수가 같을 때만 자간으로 더한다', () => {
    const layout = { glyphs: [glyph(0, 400), glyph(0, 400)], positions: [at(500), at(500)] }
    const withGap = inkWidthOf(layout, 1000, 10, 2, [0, 3, 0]) // 둘째 글자 앞에 묶음문자 3개
    const without = inkWidthOf(layout, 1000, 10, 2)
    expect((withGap ?? 0) - (without ?? 0)).toBeCloseTo(6, 5)
    expect(inkWidthOf(layout, 1000, 10, 2, [0, 3])).toBeCloseTo(without ?? 0, 5) // 길이가 안 맞으면 무시
  })

  it('공백뿐이면 null', () => {
    expect(inkWidthOf({ glyphs: [glyph(0, 0)], positions: [at(300)] }, 1000, 10)).toBeNull()
  })
})

describe('widthMismatch', () => {
  it('허용치(2.5% 또는 1.5pt) 안이면 같은 판', () => {
    expect(widthMismatch(100, 102)).toBeNull()
    expect(widthMismatch(30, 31.4)).toBeNull()
  })

  it('Inter 4.0 vs 3.19 의 "1st, 2nd, 3rd" (5.0% 차이) 는 다른 판', () => {
    expect(widthMismatch(65.23, 61.99)).toBe(5.0)
  })

  it('짧은 줄은 판단하지 않는다', () => {
    expect(widthMismatch(10, 20)).toBeNull()
  })
})

describe('inkOffsets — 마커를 펜 좌표로 옮기는 데 쓴다', () => {
  it('좌측 베어링만큼 펜보다 오른쪽에서 잉크가 시작한다', () => {
    // 1000upem 글리프: 베어링 100, 잉크 100~400, 진폭 500
    const layout = {
      glyphs: [{ bbox: { minX: 100, maxX: 400 } }],
      positions: [{ xAdvance: 500, xOffset: 0 }]
    }
    expect(inkOffsets(layout, 1000, 10)).toEqual({ left: 1, right: 4 })
  })

  it('두 글자면 두 번째 글리프까지 재고, 자간도 센다', () => {
    const layout = {
      glyphs: [{ bbox: { minX: 0, maxX: 500 } }, { bbox: { minX: 0, maxX: 500 } }],
      positions: [
        { xAdvance: 500, xOffset: 0 },
        { xAdvance: 500, xOffset: 0 }
      ]
    }
    expect(inkOffsets(layout, 1000, 10, 2)).toEqual({ left: 0, right: 12 })
  })

  it('잉크가 없으면 null', () => {
    expect(
      inkOffsets(
        { glyphs: [{ bbox: { minX: 0, maxX: 0 } }], positions: [{ xAdvance: 300, xOffset: 0 }] },
        1000,
        10
      )
    ).toBeNull()
  })
})
