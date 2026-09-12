import { describe, expect, it } from 'vitest'

import { EMPTY_CLIP, intersect, visibleFraction } from '../src/lib/clipRect'

const frame = { x: 0, y: 0, width: 1920, height: 1080 }

describe('intersect', () => {
  it('겹치는 사각형', () => {
    expect(intersect(frame, { x: 960, y: 540, width: 1920, height: 1080 })).toEqual({
      x: 960,
      y: 540,
      width: 960,
      height: 540
    })
  })

  it('맞닿기만 하면 겹친 것이 아니다', () => {
    expect(intersect(frame, { x: 1920, y: 0, width: 100, height: 100 })).toBeNull()
  })

  it('떨어져 있으면 null', () => {
    expect(intersect(frame, { x: 3000, y: 0, width: 100, height: 100 })).toBeNull()
  })

  it('완전히 안에 들면 그 자체', () => {
    const inner = { x: 100, y: 100, width: 200, height: 200 }
    expect(intersect(frame, inner)).toEqual(inner)
  })
})

describe('visibleFraction', () => {
  it('온전히 보이면 1', () => {
    expect(visibleFraction({ x: 10, y: 10, width: 100, height: 100 }, frame)).toBe(1)
  })

  it('클립이 없으면 잘리지 않는다', () => {
    expect(visibleFraction({ x: -5000, y: 0, width: 100, height: 100 }, null)).toBe(1)
  })

  it('클립이 비었으면 아무것도 안 보인다 — 클립 없음(null)과 반대다', () => {
    expect(visibleFraction({ x: -5000, y: 0, width: 100, height: 100 }, EMPTY_CLIP)).toBe(0)
    expect(visibleFraction({ x: 0, y: 0, width: 100, height: 100 }, EMPTY_CLIP)).toBe(0)
  })

  it('완전히 밖이면 0', () => {
    expect(visibleFraction({ x: 4000, y: 0, width: 100, height: 100 }, frame)).toBe(0)
  })

  // 실측(2026-09-09): 1920×1080 페이지에 3:2 사진이 4096pt 로 놓여 절반 넘게 잘렸다
  it('프레임보다 넓게 놓인 사진 — 가로로 잘린 만큼만 남는다', () => {
    const wide = { x: -1088, y: 0, width: 4096, height: 1080 }
    expect(visibleFraction(wide, frame)).toBeCloseTo(1920 / 4096, 5)
  })

  it('가로세로 둘 다 넘치면 넓이 비로 준다', () => {
    const big = { x: -960, y: -540, width: 3840, height: 2160 }
    expect(visibleFraction(big, frame)).toBeCloseTo((1920 * 1080) / (3840 * 2160), 5)
  })

  it('넓이가 0 이면 잴 것이 없으니 1', () => {
    expect(visibleFraction({ x: 0, y: 0, width: 0, height: 100 }, frame)).toBe(1)
  })

  it('클립보다 큰 노드가 클립을 덮으면 클립 넓이만 남는다', () => {
    const covering = { x: -100, y: -100, width: 4000, height: 2000 }
    expect(visibleFraction(covering, frame)).toBeCloseTo((1920 * 1080) / (4000 * 2000), 5)
  })
})
