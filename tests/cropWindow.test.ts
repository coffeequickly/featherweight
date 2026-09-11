import { describe, expect, it } from 'vitest'

import {
  cropWindow,
  enclosingRect,
  fillWindow,
  isWhole,
  paintCoverage,
  PaintWindow,
  pieceTransform
} from '../src/lib/cropWindow'
import { Transform } from '../src/lib/imageTarget'

const source = { width: 3000, height: 4000 }

/** 노드 단위좌표 (u,v) 가 T 로 가는 원본 px */
const viaT = (t: Transform, u: number, v: number) => [
  (t[0][0] * u + t[0][1] * v + t[0][2]) * source.width,
  (t[1][0] * u + t[1][1] * v + t[1][2]) * source.height
]

/** T′ 가 T 와 같은 원본 픽셀을 가리키는가 — 모서리·안쪽 점 셋 */
function expectRoundTrip(paint: PaintWindow) {
  const rect = enclosingRect(paint.bbox, source)
  const prime = pieceTransform(paint, source, rect)
  for (const [u, v] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    [0.37, 0.91]
  ]) {
    const [ox, oy] = viaT(paint.transform, u, v)
    const px = (prime[0][0] * u + prime[0][1] * v + prime[0][2]) * rect.w + rect.x0
    const py = (prime[1][0] * u + prime[1][1] * v + prime[1][2]) * rect.h + rect.y0
    expect(px).toBeCloseTo(ox, 6)
    expect(py).toBeCloseTo(oy, 6)
    // 창이 조각 안에 든다 — Figma 가 받는 값은 0~1
    expect(prime[0][0] * u + prime[0][1] * v + prime[0][2]).toBeGreaterThanOrEqual(-1e-9)
    expect(prime[0][0] * u + prime[0][1] * v + prime[0][2]).toBeLessThanOrEqual(1 + 1e-9)
    expect(prime[1][0] * u + prime[1][1] * v + prime[1][2]).toBeGreaterThanOrEqual(-1e-9)
    expect(prime[1][0] * u + prime[1][1] * v + prime[1][2]).toBeLessThanOrEqual(1 + 1e-9)
  }
  return rect
}

const rotated = (fx: number, fy: number, tx: number, ty: number, degrees: number): Transform => {
  const th = (degrees * Math.PI) / 180
  return [
    [fx * Math.cos(th), -fy * Math.sin(th), tx],
    [fx * Math.sin(th), fy * Math.cos(th), ty]
  ]
}

describe('cropWindow', () => {
  it('축에 나란한 창: 대각·평행이동이 곧 감싸는 사각형이다', () => {
    const paint = cropWindow([
      [0.1, 0, 0.45],
      [0, 0.075, 0.4625]
    ]) as PaintWindow
    expect(paint.rotated).toBe(false)
    expect(paint.bbox.x).toBe(0.45)
    expect(paint.bbox.y).toBe(0.4625)
    expect(paint.bbox.width).toBeCloseTo(0.1, 12)
    expect(paint.bbox.height).toBeCloseTo(0.075, 12)
  })

  it('항등이면 통째로', () => {
    const paint = cropWindow([
      [1, 0, 0],
      [0, 1, 0]
    ]) as PaintWindow
    expect(isWhole(paint.bbox)).toBe(true)
  })

  it('상자 안에서 돌린 창(회전 성분)도 창이다 — 감싸는 사각형은 창보다 크고 T′ 는 그대로 맞는다', () => {
    const paint = cropWindow(rotated(0.3, 0.225, 0.4, 0.35, 20)) as PaintWindow
    expect(paint.rotated).toBe(true)
    // 20° 돌린 0.3×0.225 창의 감싸는 폭: 0.3cos + 0.225sin ≈ 0.359
    expect(paint.bbox.width).toBeCloseTo(0.3 * Math.cos(0.349) + 0.225 * Math.sin(0.349), 3)
    expectRoundTrip(paint)
  })

  it('뒤집힌 창(음의 행렬식)도 창이다', () => {
    const paint = cropWindow([
      [-0.25, 0, 0.6],
      [0, 0.1875, 0.4]
    ]) as PaintWindow
    expect(paint.bbox).toMatchObject({ x: 0.35, width: 0.25 })
    expectRoundTrip(paint)
  })

  it('원본 밖으로 나간 창은 구도를 바꾸지 않고 기존 경로로 보낸다 — 돌린 창의 꼭짓점도 본다', () => {
    expect(
      cropWindow([
        [0.5, 0, 0.7],
        [0, 0.5, 0]
      ])
    ).toBeNull()
    expect(
      cropWindow([
        [0.5, 0, 0],
        [0, 0.5, -0.1]
      ])
    ).toBeNull()
    // 0.9 폭 창을 10° 돌리면 꼭짓점이 밖으로 나간다
    expect(cropWindow(rotated(0.9, 0.9, 0.05, 0.05, 10))).toBeNull()
  })

  it('float32 부스러기만큼 끝을 넘은 창은 안으로 들인다 — 끝에 붙은 크롭이 새 나가지 않게', () => {
    const tx = Math.fround(0.001)
    const a = Math.fround(0.999)
    expect(tx + a).toBeGreaterThan(1)
    const paint = cropWindow([
      [a, 0, tx],
      [0, 0.5, 0.25]
    ]) as PaintWindow
    expect(paint).not.toBeNull()
    expect(paint.bbox.x + paint.bbox.width).toBe(1)
  })

  it.each([NaN, Infinity, -Infinity])('유한하지 않은 변환은 거절한다: %s', (value) => {
    expect(
      cropWindow([
        [value, 0, 0],
        [0, 0.5, 0]
      ])
    ).toBeNull()
    expect(
      cropWindow([
        [0.5, 0, value],
        [0, 0.5, 0]
      ])
    ).toBeNull()
  })

  it('넓이가 없는 변환은 거절한다', () => {
    expect(
      cropWindow([
        [0, 0, 0.2],
        [0, 0.5, 0.2]
      ])
    ).toBeNull()
  })
})

describe('fillWindow', () => {
  it('세로 사진을 가로띠 상자에 넣으면 가운데 띠만 보인다', () => {
    const paint = fillWindow({ width: 300, height: 100 }, source) as PaintWindow
    expect(paint.bbox.width).toBe(1)
    expect(paint.bbox.height).toBeCloseTo(0.25, 10)
    expect(paint.bbox.y).toBeCloseTo(0.375, 10)
    expect(paint.rotated).toBe(false)
    expect(isWhole(paint.bbox)).toBe(false)
  })

  it('비가 맞으면 통째로', () => {
    expect(isWhole((fillWindow({ width: 150, height: 200 }, source) as PaintWindow).bbox)).toBe(
      true
    )
  })

  it.each([90, 180, 270, -90, 450])(
    '채우기 회전 %s° — 돌린 이미지 위에서 가운데를 잡고 원본으로 되돌린다',
    (turn) => {
      const paint = fillWindow({ width: 300, height: 100 }, source, turn) as PaintWindow
      expect(paint).not.toBeNull()
      const sideways = ((turn % 360) + 360) % 360 === 90 || ((turn % 360) + 360) % 360 === 270
      if (sideways) {
        // 옆으로 눕힌 4000×3000 에 300×100 을 덮으면 눕힌 폭은 다 쓰고 높이는 4/9 만 — 원본 좌표로는 세로 전부, 가로 4/9
        expect(paint.rotated).toBe(true)
        expect(paint.bbox.width).toBeCloseTo(4 / 9, 10)
        expect(paint.bbox.height).toBe(1)
      } else {
        expect(paint.bbox.width).toBe(1)
        expect(paint.bbox.height).toBeCloseTo(0.25, 10)
      }
      expectRoundTrip(paint)
    }
  )

  it('90° 단위가 아닌 회전은 FILL 에 없다 — null', () => {
    expect(fillWindow({ width: 300, height: 100 }, source, 45)).toBeNull()
  })
})

describe('enclosingRect + pieceTransform', () => {
  it('창을 감싸는 정수 사각형 + 1px 여유, 원본 안으로', () => {
    expect(enclosingRect({ x: 0.45, y: 0.4625, width: 0.1, height: 0.075 }, source)).toEqual({
      x0: 1349,
      y0: 1849,
      w: 302,
      h: 302
    })
    expect(enclosingRect({ x: 0, y: 0.375, width: 1, height: 0.25 }, source)).toEqual({
      x0: 0,
      y0: 1499,
      w: 3000,
      h: 1002
    })
  })

  it.each([
    [
      [
        [0.1, 0, 0.45],
        [0, 0.075, 0.4625]
      ],
      '가운데 10%'
    ],
    [
      [
        [0.05, 0, 0.2],
        [0, 0.0375, 0.70625]
      ],
      '치우친 5%'
    ],
    [
      [
        [0.2504, 0, 0.3701],
        [0, 0.18777, 0.40611]
      ],
      '서브픽셀 창'
    ]
  ])('T′ 로 간 조각 px 이 T 로 간 원본 px 과 같다 — %s', (t) => {
    expectRoundTrip(cropWindow(t as unknown as Transform) as PaintWindow)
  })
})

describe('paintCoverage — 창이 원본과 겹치는 넓이의 비', () => {
  it('원본 안의 창은 창 넓이 그대로, 돌린 창도 |det| 와 같다', () => {
    expect(
      paintCoverage([
        [0.1, 0, 0.45],
        [0, 0.075, 0.4625]
      ])
    ).toBeCloseTo(0.0075, 9)
    const s = Math.SQRT1_2 * 0.2
    expect(
      paintCoverage([
        [s, -s, 0.5],
        [s, s, 0.3]
      ])
    ).toBeCloseTo(0.04, 9)
  })

  it('원본 밖까지 나간 창(이미지를 상자보다 작게 놓음)은 겹치는 만큼만 — 잘라 넣기는 거절해도 비는 안다', () => {
    // 상자가 원본의 두 배: 원본 전체가 보인다
    expect(
      cropWindow([
        [2, 0, -0.5],
        [0, 2, -0.5]
      ])
    ).toBeNull()
    expect(
      paintCoverage([
        [2, 0, -0.5],
        [0, 2, -0.5]
      ])
    ).toBe(1)
    // 오른쪽 아래로 절반 밀려 나감: 원본의 1/4 만 보인다
    expect(
      paintCoverage([
        [1, 0, 0.5],
        [0, 1, 0.5]
      ])
    ).toBeCloseTo(0.25, 9)
    // 완전히 밖: 0
    expect(
      paintCoverage([
        [1, 0, 1.5],
        [0, 1, 0]
      ])
    ).toBe(0)
  })

  it('셈할 수 없는 변환은 null', () => {
    expect(
      paintCoverage([
        [0, 0, 0],
        [0, 0, 0]
      ])
    ).toBeNull()
    expect(
      paintCoverage([
        [NaN, 0, 0],
        [0, 1, 0]
      ])
    ).toBeNull()
  })
})
