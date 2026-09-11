// 채택 규칙과 사전 관문 — 값은 CROP_RULES 한곳에 있고, 여기서는 그 값을 읽어 경계를 민다.

import { describe, expect, it } from 'vitest'

import { chooseCrop, CROP_RULES, frameImagePlan, planCrops } from '../src/lib/imageCrop'
import { planImageTargets, scaledSize } from '../src/lib/imageTarget'
import { ImageUsage } from '../src/lib/types'

const SETTINGS = { multiplier: 1.5 as const, maxEdge: 1920 as const, minEdge: 640 as const }
const source = { width: 3000, height: 4000 }
const sizes = { photo: source }
const crop = (
  nodeId: string,
  box: number,
  fx: number,
  fy: number,
  tx: number,
  ty: number,
  fillIndex = 0
): ImageUsage => ({
  nodeId,
  imageHash: 'photo',
  name: nodeId,
  width: box,
  height: box,
  scaleMode: 'CROP',
  visible: 1,
  fillIndex,
  crop: { x: fx, y: fy },
  cropTransform: [
    [fx, 0, tx],
    [0, fy, ty]
  ]
})

describe('chooseCrop', () => {
  it('밀도가 같은 후보는 최소 절감을 넘어야 한다', () => {
    const need = CROP_RULES.minSavingSameDensity
    expect(chooseCrop(100_000, 100_000 * (1 - need) + 1, 1).crop).toBe(false)
    expect(chooseCrop(100_000, 100_000 * (1 - need), 1).crop).toBe(true)
  })

  it('밀도가 크게 높아지는 후보는 따로 — 작은 절감으로도 채택하지만 동률·손해는 아니다', () => {
    const verdict = chooseCrop(100_000, 98_000, CROP_RULES.sharperFrom)
    expect(verdict).toMatchObject({ crop: true, sharper: true })
    expect(verdict.saving).toBeCloseTo(0.02, 10)
    expect(chooseCrop(100_000, 100_000, CROP_RULES.sharperFrom).crop).toBe(false)
    expect(chooseCrop(100_000, 120_000, 10).crop).toBe(false)
  })

  it('W₀ 가 0 이면 절감을 셈할 수 없다 — 안 자른다', () => {
    expect(chooseCrop(0, 0, 1).crop).toBe(false)
  })
})

describe('planCrops — 밀도 이득과 관문', () => {
  it('밀도 이득은 조각들 가운데 가장 작은 것, 양축 중 작은 쪽이다', () => {
    // A 100pt 창 10%: 기존 145px 에 조각 303px → 약 2.1배. C 가로띠는 1440 → 1440 이라 1.0 근처
    const A = crop('A', 100, 0.1, 0.075, 0.45, 0.4625)
    const C: ImageUsage = {
      nodeId: 'C',
      imageHash: 'photo',
      name: 'C',
      width: 300,
      height: 100,
      scaleMode: 'FILL',
      visible: 1,
      fillIndex: 0,
      paintRotation: 0,
      localSize: { width: 300, height: 100 }
    }
    const [aOnly] = planCrops([A], SETTINGS, sizes, planImageTargets([A], SETTINGS, sizes))
    expect(aOnly.densityGain).toBeGreaterThan(2)
    const [withC] = planCrops([A, C], SETTINGS, sizes, planImageTargets([A, C], SETTINGS, sizes))
    expect(withC.densityGain).toBeGreaterThanOrEqual(1)
    expect(withC.densityGain).toBeLessThan(1.05)
    const expected = withC.pieces
      .map((p) => scaledSize(p.rect.w, p.rect.h, p.targetLongEdge))
      .reduce((sum, s) => sum + s.width * s.height, 0)
    expect(withC.piecePixels).toBe(expected)
    expect(withC.pieces.map((p) => p.targetLongEdge).sort()).toEqual([1440, 640])
  })

  it('조각이 너무 많으면 인코딩 전에 기존 경로', () => {
    const many = Array.from({ length: CROP_RULES.maxPiecesPerImage + 1 }, (_, i) =>
      crop(`P${i}`, 100, 0.05, 0.0375, 0.02 * i, 0.02 * i)
    )
    expect(planCrops(many, SETTINGS, sizes, planImageTargets(many, SETTINGS, sizes))).toEqual([])
    const enough = many.slice(0, CROP_RULES.maxPiecesPerImage)
    expect(
      planCrops(enough, SETTINGS, sizes, planImageTargets(enough, SETTINGS, sizes))
    ).toHaveLength(1)
  })

  it('조각 픽셀 합이 W₀ 를 넘으면 인코딩 전에 기존 경로', () => {
    // 큰 창을 여러 자리에서 조금씩 다르게 — 합이 전체를 넘는다
    const wide = Array.from({ length: 4 }, (_, i) =>
      crop(`W${i}`, 900, 0.9, 0.675, 0.1 * (i % 2), 0.1 * Math.floor(i / 2))
    )
    expect(planCrops(wide, SETTINGS, sizes, planImageTargets(wide, SETTINGS, sizes))).toEqual([])
  })

  it('frameImagePlan 은 계획과 조각 계획을 함께 준다', () => {
    const A = crop('A', 100, 0.1, 0.075, 0.45, 0.4625)
    const frame = frameImagePlan([A], SETTINGS, sizes)
    expect(frame.plans).toHaveLength(1)
    expect(frame.crops.get('photo')?.pieces).toHaveLength(1)
  })
})
