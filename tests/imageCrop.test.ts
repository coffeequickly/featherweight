// 조각 계획 — 규칙: 기존 출력이 자리마다 준 픽셀이 바닥, 통째로 보는 자리가 있으면 기존 유지.
// 수치는 2026-09-10 실측(사진 3000×4000, 균형 프리셋)과 같다.

import { describe, expect, it } from 'vitest'

import { planCrops, pieceKey } from '../src/lib/imageCrop'
import { planImageTargets, scaledSize } from '../src/lib/imageTarget'
import { ImageUsage } from '../src/lib/types'

const SETTINGS = { multiplier: 1.5 as const, maxEdge: 1920 as const, minEdge: 640 as const }
const source = { width: 3000, height: 4000 }
const sizes = { photo: source }

function crop(
  nodeId: string,
  box: number,
  fx: number,
  fy: number,
  tx: number,
  ty: number
): ImageUsage {
  return {
    nodeId,
    imageHash: 'photo',
    name: nodeId,
    width: box,
    height: box,
    scaleMode: 'CROP',
    visible: 1,
    fillIndex: 0,
    crop: { x: fx, y: fy },
    cropTransform: [
      [fx, 0, tx],
      [0, fy, ty]
    ]
  }
}
function fill(nodeId: string, width: number, height: number): ImageUsage {
  return {
    nodeId,
    imageHash: 'photo',
    name: nodeId,
    width,
    height,
    localSize: { width, height },
    scaleMode: 'FILL',
    visible: 1,
    fillIndex: 0,
    paintRotation: 0
  }
}

const A = crop('A', 100, 0.1, 0.075, 0.45, 0.4625)
const B = crop('B', 300, 0.25, 0.1875, 0.375, 0.40625)
const D = crop('D', 200, 0.05, 0.0375, 0.2, 0.70625)
const C = fill('C', 300, 100)
const E = fill('E', 150, 200) // 비가 맞아 통째로

describe('planCrops', () => {
  it('여백과 출력 반올림 뒤에도 양쪽 축의 픽셀 밀도가 기존 이상이다', () => {
    const square = { photo: { width: 4000, height: 4000 } }
    const usages = [
      crop('half', 100, 0.5, 0.5, 0.25, 0.25),
      crop('zoom', 200, 0.05, 0.05, 0.1, 0.1)
    ]
    const plans = planImageTargets(usages, SETTINGS, square)
    const [result] = planCrops(usages, SETTINGS, square, plans)
    const before = scaledSize(4000, 4000, plans[0].targetLongEdge)
    for (const piece of result.pieces) {
      const after = scaledSize(piece.rect.w, piece.rect.h, piece.targetLongEdge)
      expect(after.width * 4000).toBeGreaterThanOrEqual(before.width * piece.rect.w)
      expect(after.height * 4000).toBeGreaterThanOrEqual(before.height * piece.rect.h)
    }
  })

  it('잘라 쓴 자리만 있으면 조각 넷 — 목표는 max(제 목표, 기존이 준 픽셀)', () => {
    const usages = [A, B, D, C]
    const plans = planImageTargets(usages, SETTINGS, sizes)
    expect(plans[0].targetLongEdge).toBe(1920) // A·B·D 의 밀도 보정이 T₀ 를 상한에 붙인다
    const [plan] = planCrops(usages, SETTINGS, sizes, plans)
    const byNode = Object.fromEntries(plan.pieces.map((p) => [p.fills[0].nodeId, p]))
    // 기존이 준 px: A 300×0.48=144 → 제 목표 640 · B 360 → 640 · D 72 → 640 · C 창 3000px×0.48=1440 → 1440
    expect(byNode.A.targetLongEdge).toBe(640)
    expect(byNode.B.targetLongEdge).toBe(640)
    expect(byNode.D.targetLongEdge).toBe(640)
    expect(byNode.C.targetLongEdge).toBe(1440)
    expect(byNode.C.rect).toEqual({ x0: 0, y0: 1499, w: 3000, h: 1002 })
    expect(byNode.D.rect).toEqual({ x0: 599, y0: 2824, w: 152, h: 152 })
  })

  it('통째로 보는 자리가 하나라도 있으면 그 원본은 계획이 없다 — W₀ 가 남아야 해서', () => {
    const usages = [A, B, D, C, E]
    const plans = planImageTargets(usages, SETTINGS, sizes)
    expect(planCrops(usages, SETTINGS, sizes, plans)).toEqual([])
  })

  it('상자 안에서 돌린 것(CROP 회전 · FILL 90°)은 잘라 넣는다 — 감싸는 사각형을 자르고 T′ 가 회전을 품는다', () => {
    const rotated: ImageUsage = {
      ...A,
      nodeId: 'R',
      cropTransform: [
        [0.07, -0.05, 0.4],
        [0.07, 0.05, 0.4]
      ]
    }
    const turned: ImageUsage = { ...C, nodeId: 'T', paintRotation: 90 }
    for (const extra of [rotated, turned]) {
      const usages = [A, extra]
      const [plan] = planCrops(usages, SETTINGS, sizes, planImageTargets(usages, SETTINGS, sizes))
      expect(plan.pieces).toHaveLength(2)
      const piece = plan.pieces.find((p) => p.fills[0].nodeId === extra.nodeId)
      expect(piece).toBeDefined()
      const t = (piece as NonNullable<typeof piece>).fills[0].imageTransform
      expect(t[0][1] !== 0 || t[1][0] !== 0).toBe(true) // 회전 성분이 살아 있다
    }
  })

  it('FIT · TILE · 원본 밖 창이 섞이면 계획이 없다', () => {
    const fit: ImageUsage = { ...C, nodeId: 'F', scaleMode: 'FIT' }
    const outside: ImageUsage = {
      ...A,
      nodeId: 'O',
      cropTransform: [
        [0.5, 0, 0.7],
        [0, 0.5, 0.4]
      ]
    }
    for (const extra of [fit, outside]) {
      const usages = [A, extra]
      expect(planCrops(usages, SETTINGS, sizes, planImageTargets(usages, SETTINGS, sizes))).toEqual(
        []
      )
    }
  })

  it('같은 창을 쓰는 자리들은 조각 하나를 나눠 쓴다 — 각자 제 T′ 를 갖고', () => {
    const usages = [A, { ...A, nodeId: 'A2', fillIndex: 2 }]
    const [plan] = planCrops(usages, SETTINGS, sizes, planImageTargets(usages, SETTINGS, sizes))
    expect(plan.pieces).toHaveLength(1)
    expect(plan.pieces[0].fills.map((f) => [f.nodeId, f.fillIndex])).toEqual([
      ['A', 0],
      ['A2', 2]
    ])
  })

  it('원본 크기를 모르거나 기존 경로가 손 안 대는(T₀ ≥ 원본) 해시는 건너뛴다', () => {
    const usages = [A]
    const plans = planImageTargets(usages, SETTINGS, sizes)
    expect(planCrops(usages, SETTINGS, {}, plans)).toEqual([])
    const tiny = { photo: { width: 600, height: 800 } }
    expect(planCrops(usages, SETTINGS, tiny, planImageTargets(usages, SETTINGS, tiny))).toEqual([])
  })

  it('fillIndex 가 없는 자리(옛 예고)는 잘라 넣지 않는다', () => {
    const usages = [{ ...A, fillIndex: undefined }]
    expect(planCrops(usages, SETTINGS, sizes, planImageTargets(usages, SETTINGS, sizes))).toEqual(
      []
    )
  })

  it('pieceKey 는 원본·사각형·목표·인코딩 설정을 다 담는다', () => {
    const piece = { rect: { x0: 1, y0: 2, w: 3, h: 4 }, targetLongEdge: 640 }
    expect(pieceKey('h', piece, { quality: 0.8, reencodeOpaquePng: false })).toBe(
      'h|1,2,3,4|640|0.8|0'
    )
  })
})
