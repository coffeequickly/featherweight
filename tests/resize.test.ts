import { describe, expect, it } from 'vitest'

import { hasAlphaPixels } from '../src/ui/resize'

/** width×height RGBA, 전부 불투명 */
function opaque(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height * 4).fill(255)
}

function setAlpha(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  alpha: number
): void {
  data[(y * width + x) * 4 + 3] = alpha
}

describe('hasAlphaPixels', () => {
  it('전부 불투명이면 false', () => {
    expect(hasAlphaPixels(opaque(32, 32))).toBe(false)
  })

  it('16px 표본 사이에 낀 투명 픽셀 하나도 잡는다 — (1,1) 만 투명한 32×32', () => {
    const data = opaque(32, 32)
    setAlpha(data, 32, 1, 1, 0)
    expect(hasAlphaPixels(data)).toBe(true)
  })

  it('반투명(254)도 알파다', () => {
    const data = opaque(40, 24)
    setAlpha(data, 40, 39, 23, 254)
    expect(hasAlphaPixels(data)).toBe(true)
  })

  it('빈 데이터는 알파가 없다', () => {
    expect(hasAlphaPixels(new Uint8ClampedArray(0))).toBe(false)
  })
})
