import { describe, expect, it } from 'vitest'

import {
  processFloor,
  ImageUsage,
  isProcessable,
  keepsOriginal,
  needsDownscale,
  planImageTargets,
  scaledSize,
  targetFor
} from '../src/lib/imageTarget'

const SETTINGS = { multiplier: 1.5 as const, maxEdge: 2048 as const }

function usage(
  nodeId: string,
  imageHash: string,
  width: number,
  height: number,
  scaleMode: ImageUsage['scaleMode'] = 'FILL'
): ImageUsage {
  return { nodeId, imageHash, width, height, scaleMode }
}

describe('targetFor', () => {
  it('표시 크기의 multiplier 배', () => {
    expect(targetFor(usage('n', 'h', 600, 400), SETTINGS)).toBe(900)
  })

  it('긴 변 기준이다', () => {
    expect(targetFor(usage('n', 'h', 400, 600), SETTINGS)).toBe(900)
  })

  it('maxEdge 를 넘지 않는다', () => {
    expect(targetFor(usage('n', 'h', 4000, 4000), SETTINGS)).toBe(2048)
  })

  it('소수점은 올린다', () => {
    expect(targetFor(usage('n', 'h', 101, 10), SETTINGS)).toBe(152)
  })

  it('multiplier 1 이면 표시 크기 그대로', () => {
    expect(targetFor(usage('n', 'h', 600, 400), { multiplier: 1, maxEdge: 4096 })).toBe(600)
  })
})

describe('isProcessable', () => {
  it('TILE 은 건드리지 않는다', () => {
    expect(isProcessable(usage('n', 'h', 600, 400, 'TILE'))).toBe(false)
    expect(isProcessable(usage('n', 'h', 600, 400, 'CROP'))).toBe(true)
    expect(isProcessable(usage('n', 'h', 600, 400, 'FIT'))).toBe(true)
  })

  it('크기가 0 이면 건너뛴다', () => {
    expect(isProcessable(usage('n', 'h', 0, 0))).toBe(false)
  })
})

describe('planImageTargets', () => {
  it('해시별로 묶는다', () => {
    const plans = planImageTargets(
      [usage('n1', 'hashA', 600, 400), usage('n2', 'hashB', 300, 200)],
      SETTINGS
    )
    expect(plans).toHaveLength(2)
  })

  it('같은 해시를 여러 노드가 쓰면 가장 큰 쪽에 맞춘다', () => {
    const plans = planImageTargets(
      [usage('small', 'hashA', 200, 100), usage('big', 'hashA', 1000, 500)],
      SETTINGS
    )
    expect(plans).toHaveLength(1)
    expect(plans[0].targetLongEdge).toBe(1500)
    expect(plans[0].nodeIds.sort()).toEqual(['big', 'small'])
  })

  it('같은 노드가 같은 이미지를 두 번 써도 nodeId 는 한 번만', () => {
    const plans = planImageTargets(
      [usage('n1', 'hashA', 100, 100), usage('n1', 'hashA', 100, 100)],
      SETTINGS
    )
    expect(plans[0].nodeIds).toEqual(['n1'])
  })

  it('TILE 만 있으면 계획이 없다', () => {
    expect(planImageTargets([usage('n', 'h', 600, 400, 'TILE')], SETTINGS)).toEqual([])
  })

  it('상한이 걸린 뒤에도 max 로 합쳐진다', () => {
    const plans = planImageTargets(
      [usage('a', 'h', 5000, 5000), usage('b', 'h', 100, 100)],
      SETTINGS
    )
    expect(plans[0].targetLongEdge).toBe(2048)
  })
})

describe('needsDownscale', () => {
  it('원본이 목표보다 크면 줄인다', () => {
    expect(needsDownscale(3000, 900)).toBe(true)
  })

  it('원본이 목표 이하면 그대로 둔다 — 키우지 않는다', () => {
    expect(needsDownscale(900, 900)).toBe(false)
    expect(needsDownscale(500, 900)).toBe(false)
  })
})

describe('scaledSize', () => {
  it('비율을 지킨다', () => {
    expect(scaledSize(3000, 2000, 900)).toEqual({ width: 900, height: 600 })
  })

  it('세로가 긴 이미지도 긴 변 기준', () => {
    expect(scaledSize(2000, 3000, 900)).toEqual({ width: 600, height: 900 })
  })

  it('목표보다 작으면 그대로', () => {
    expect(scaledSize(400, 300, 900)).toEqual({ width: 400, height: 300 })
  })

  it('아주 납작한 이미지도 최소 1px', () => {
    expect(scaledSize(10000, 3, 100).height).toBe(1)
  })
})

describe('keepsOriginal', () => {
  it('처리 결과가 더 크면 원본을 쓴다', () => {
    expect(keepsOriginal(1000, 1200)).toBe(true)
    expect(keepsOriginal(1000, 1000)).toBe(true)
    expect(keepsOriginal(1000, 800)).toBe(false)
  })
})

describe('processFloor', () => {
  it('프레임 긴 변 × 배율 — A4 프레임이면 그 예산 아래 이미지는 안 건드린다', () => {
    expect(processFloor({ multiplier: 1.5, maxEdge: 2048 }, 842)).toBe(1263)
  })

  it('16:9 1920 프레임, 1x 면 1920 이 기준선이다', () => {
    expect(processFloor({ multiplier: 1, maxEdge: 4096 }, 1920)).toBe(1920)
  })

  it('maxEdge 를 넘지 않는다', () => {
    expect(processFloor({ multiplier: 2, maxEdge: 2048 }, 4000)).toBe(2048)
  })
})
