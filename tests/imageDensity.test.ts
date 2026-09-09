// 픽스처는 실물이다 — 2026-09-09 에 사용자 포트폴리오(이미지 fill 62개)를 진단 플러그인으로
// 읽은 값이다. 노드 크기·원본 크기·크롭 비가 전부 그 문서에서 나온 숫자다.

import { describe, expect, it } from 'vitest'

import { cropFractions, neededLongEdge, Placement } from '../src/lib/imageDensity'
import { targetFor } from '../src/lib/imageTarget'
import { ImageUsage } from '../src/lib/types'

const square = { width: 800, height: 800 }

describe('cropFractions', () => {
  it('단위 행렬이면 온전히 보인다', () => {
    expect(
      cropFractions([
        [1, 0, 0],
        [0, 1, 0]
      ])
    ).toEqual({ x: 1, y: 1 })
  })

  it('축마다 다른 배율을 따로 읽는다', () => {
    const got = cropFractions([
      [0.5, 0, 0.25],
      [0, 0.25, 0.1]
    ])
    expect(got.x).toBeCloseTo(0.5, 6)
    expect(got.y).toBeCloseTo(0.25, 6)
  })

  it('회전이 섞여도 열 벡터 길이가 배율이다', () => {
    const angle = Math.PI / 6
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)]
    const got = cropFractions([
      [0.5 * cos, -0.25 * sin, 0],
      [0.5 * sin, 0.25 * cos, 0]
    ])
    expect(got.x).toBeCloseTo(0.5, 6)
    expect(got.y).toBeCloseTo(0.25, 6)
  })

  it('1 을 넘는 값은 1 로 — 원본보다 많이 보일 수는 없다', () => {
    expect(
      cropFractions([
        [2, 0, 0],
        [0, 3, 0]
      ])
    ).toEqual({ x: 1, y: 1 })
  })

  it('0 이나 NaN 은 1 로 — 판단 못 할 값으로 목표를 흔들지 않는다', () => {
    expect(
      cropFractions([
        [0, 0, 0],
        [0, Number.NaN, 0]
      ])
    ).toEqual({ x: 1, y: 1 })
  })
})

describe('neededLongEdge — 손대지 않는 경우', () => {
  it('TILE 은 판단하지 않는다', () => {
    expect(neededLongEdge({ width: 400, height: 400, scaleMode: 'TILE' }, square)).toBeNull()
  })

  it('원본 크기를 모르면 판단하지 않는다', () => {
    expect(neededLongEdge({ width: 400, height: 400, scaleMode: 'FILL' }, null)).toBeNull()
  })

  it('크기가 0 이면 판단하지 않는다', () => {
    expect(neededLongEdge({ width: 0, height: 400, scaleMode: 'FILL' }, square)).toBeNull()
    expect(
      neededLongEdge({ width: 400, height: 400, scaleMode: 'FILL' }, { width: 0, height: 10 })
    ).toBeNull()
  })
})

describe('neededLongEdge — 비율이 맞으면 옛 계산과 같다', () => {
  it('정사각 상자에 정사각 원본', () => {
    expect(neededLongEdge({ width: 400, height: 400, scaleMode: 'FILL' }, square)).toBe(400)
  })

  it('16:9 상자에 16:9 원본', () => {
    const place: Placement = { width: 1920, height: 1080, scaleMode: 'FILL' }
    expect(neededLongEdge(place, { width: 3840, height: 2160 })).toBe(1920)
  })

  it('CROP 이지만 온전히 보이면 노드 긴 변', () => {
    // 실측: DSC00058_view 1 — 709×474 상자, 1616×1080 원본, 크롭 없음
    const place: Placement = { width: 709, height: 474, scaleMode: 'CROP', crop: { x: 1, y: 1 } }
    expect(neededLongEdge(place, { width: 1616, height: 1080 })).toBe(709)
  })
})

describe('neededLongEdge — FILL 비율 어긋남', () => {
  // 실측: 테스트 1 — 434×434 상자에 4:3 사진. 좌우가 잘리므로 그만큼 더 필요하다
  it('정사각 상자에 4:3 원본이면 4/3 배', () => {
    const place: Placement = { width: 434, height: 434, scaleMode: 'FILL' }
    expect(neededLongEdge(place, { width: 1200, height: 900 })).toBe(579)
  })

  // 실측: ep241-lounge-03 — 972×1106 세로 상자에 4:3 가로 사진
  it('세로 상자에 가로 원본', () => {
    const place: Placement = { width: 972, height: 1106, scaleMode: 'FILL' }
    expect(neededLongEdge(place, { width: 1920, height: 1440 })).toBeCloseTo(1475, -1)
  })

  it('FIT 은 상자 안에 드므로 오히려 덜 필요하다', () => {
    const place: Placement = { width: 434, height: 434, scaleMode: 'FIT' }
    // 4:3 을 434 안에 넣으면 가로가 434, 세로는 326 — 원본 긴 변은 434 면 된다
    expect(neededLongEdge(place, { width: 1200, height: 900 })).toBe(434)
  })
})

describe('neededLongEdge — CROP 실측 사례', () => {
  // 이 문서에서 가장 심했던 자리. 584px 을 넣고 있었는데 1075px 이 필요했다
  it('Background 560×584 · 4096×2731 · 좌우를 잘라 넣음', () => {
    const place: Placement = {
      width: 560,
      height: 584,
      scaleMode: 'CROP',
      crop: { x: 0.521, y: 0.815 }
    }
    expect(neededLongEdge(place, { width: 4096, height: 2731 })).toBeCloseTo(1075, -1)
  })

  it('image 22 560×584 · 1672×941', () => {
    const place: Placement = {
      width: 560,
      height: 584,
      scaleMode: 'CROP',
      crop: { x: 0.543, y: 1 }
    }
    expect(neededLongEdge(place, { width: 1672, height: 941 })).toBeCloseTo(1038, -1)
  })

  it('IMG_2762 1 604×1080 · 3024×4032', () => {
    const place: Placement = {
      width: 604,
      height: 1080,
      scaleMode: 'CROP',
      crop: { x: 0.564, y: 0.756 }
    }
    expect(neededLongEdge(place, { width: 3024, height: 4032 })).toBeCloseTo(1428, -1)
  })

  // 가로 띠 — 폭은 그대로, 높이만 27%. 잘렸어도 밀도는 모자라지 않는다.
  // 프로브 초판이 min(fx, fy) 만 보고 ×3.69 라고 했던 자리다. 두 축을 따로 풀어야 한다.
  it('Background 1920×293 띠 · 1920×1080 — 모자라지 않는다', () => {
    const place: Placement = {
      width: 1920,
      height: 293,
      scaleMode: 'CROP',
      crop: { x: 0.999, y: 0.271 }
    }
    const got = neededLongEdge(place, { width: 1920, height: 1080 })
    expect(got).not.toBeNull()
    expect(got as number).toBeLessThan(1930)
  })

  it('한 축만 맞추면 다른 축이 뭉개진다 — 큰 쪽을 따른다', () => {
    // x 는 넉넉하고 y 가 모자란 자리
    const place: Placement = {
      width: 100,
      height: 900,
      scaleMode: 'CROP',
      crop: { x: 1, y: 0.25 }
    }
    // shownY = 250px 이 900pt 에 얹힌다 → k = 3.6, 원본 긴 변 1000 → 3600
    expect(neededLongEdge(place, { width: 1000, height: 1000 })).toBe(3600)
  })
})

// ── targetFor 까지 이어지는지 ─────────────────────────────
// 계산이 맞아도 배관이 끊겨 있으면 아무 일도 안 일어난다. 실측 자리로 끝까지 확인한다.

describe('targetFor — 밀도 보정', () => {
  const settings = { multiplier: 1 as const, maxEdge: 3840 as const, minEdge: 1024 as const }

  function usage(over: Partial<ImageUsage>): ImageUsage {
    return {
      nodeId: 'n',
      imageHash: 'h',
      name: 'n',
      width: 100,
      height: 100,
      scaleMode: 'FILL',
      visible: 1,
      ...over
    }
  }

  it('비율이 맞으면 옛 값 그대로 — 멀쩡한 이미지를 흔들지 않는다', () => {
    const u = usage({ width: 1500, height: 1500 })
    expect(targetFor(u, settings, { width: 3000, height: 3000 })).toBe(1500)
  })

  it('원본 크기를 모르면 옛 값 그대로', () => {
    const u = usage({ width: 1500, height: 1500 })
    expect(targetFor(u, settings, null)).toBe(1500)
    expect(targetFor(u, settings)).toBe(1500)
  })

  it('작게 놓인 것은 하한이 먼저다 — 밀도 보정이 그 아래를 만들지 않는다', () => {
    const u = usage({ width: 100, height: 100, scaleMode: 'CROP', crop: { x: 0.5, y: 0.5 } })
    expect(targetFor(u, settings, { width: 400, height: 400 })).toBe(1024)
  })

  it('여유분 안이면 올리지 않는다 — image 7 은 ×1.04 라 그대로다', () => {
    const u = usage({ width: 1704, height: 1074, scaleMode: 'CROP', crop: { x: 0.995, y: 0.966 } })
    expect(targetFor(u, settings, { width: 3600, height: 2338 })).toBe(1704)
  })

  // 실측에서 가장 심했던 자리 — 584px 을 넣고 있었다
  it('Background 560×584 는 1000px 대로 올라간다', () => {
    const u = usage({ width: 560, height: 584, scaleMode: 'CROP', crop: { x: 0.521, y: 0.815 } })
    const got = targetFor(u, settings, { width: 4096, height: 2731 })
    expect(got).toBeGreaterThan(1000)
    expect(got).toBeLessThan(1120)
  })

  it('FILL 비율 어긋남도 올라간다 — 정사각 상자에 4:3 이면 4/3 배', () => {
    const u = usage({ width: 1000, height: 1000 })
    expect(targetFor(u, settings, { width: 1200, height: 900 })).toBe(1333)
  })

  it('한 장 상한을 넘지 않는다', () => {
    const u = usage({ width: 2000, height: 2000, scaleMode: 'CROP', crop: { x: 0.2, y: 0.2 } })
    expect(
      targetFor(u, { multiplier: 1, maxEdge: 1920, minEdge: 1024 }, { width: 4000, height: 4000 })
    ).toBe(1920)
  })

  it('배율이 곱해진다', () => {
    const u = usage({ width: 434, height: 434 })
    expect(
      targetFor(u, { multiplier: 2, maxEdge: 3840, minEdge: 1024 }, { width: 1200, height: 900 })
    ).toBe(1158)
  })

  it('TILE 은 손대지 않는다', () => {
    const u = usage({ width: 1500, height: 1500, scaleMode: 'TILE' })
    expect(targetFor(u, settings, { width: 1200, height: 900 })).toBe(1500)
  })
})
