import { describe, expect, it } from 'vitest'

import { atMost, MAX_EDGES, MIN_EDGES, nearest, snapSettings } from '../src/lib/settingsOptions'
import { DEFAULT_SETTINGS } from '../src/lib/types'

describe('nearest', () => {
  it('가장 가까운 선택지, 같은 거리면 작은 쪽', () => {
    expect(nearest(MAX_EDGES, 2048)).toBe(1920)
    expect(nearest(MAX_EDGES, 4096)).toBe(3840)
    expect(nearest(MAX_EDGES, 1600)).toBe(1280)
    expect(nearest([1, 1.5, 2] as const, 1.25)).toBe(1)
  })
})

describe('snapSettings', () => {
  it('1.4 에 저장된 상한(2048·4096·1600)을 지금 버튼으로 옮긴다', () => {
    expect(snapSettings({ ...DEFAULT_SETTINGS, maxEdge: 2048 as never }).maxEdge).toBe(1920)
    expect(snapSettings({ ...DEFAULT_SETTINGS, maxEdge: 4096 as never }).maxEdge).toBe(3840)
    expect(snapSettings({ ...DEFAULT_SETTINGS, maxEdge: 1600 as never }).maxEdge).toBe(1280)
  })

  it('빠진 항목은 기본값으로 채우고 나머지는 그대로 둔다', () => {
    const snapped = snapSettings({ version: 2, fitTargetMb: 3.5 })
    expect(snapped.fitTargetMb).toBe(3.5)
    expect(snapped.maxEdge).toBe(DEFAULT_SETTINGS.maxEdge)
    expect(snapped.embedText).toBe(true)
  })

  it('지금 선택지의 값은 손대지 않는다', () => {
    expect(snapSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS)
  })
})

describe('atMost', () => {
  it('사다리에서 그 값을 넘지 않는 가장 큰 칸', () => {
    expect(atMost(MIN_EDGES, 1280)).toBe(1280)
    expect(atMost(MIN_EDGES, 1500)).toBe(1280)
  })

  it('사다리가 전부 그 값보다 크면 첫 칸', () => {
    expect(atMost(MIN_EDGES, 1)).toBe(480)
  })

  it('엇갈릴 수 있던 세 조합을 전부 푼다', () => {
    // 최소>최대가 가능한 조합: 1600/1280 · 2048/1280 · 2048/1920
    for (const [, max] of [
      [1600, 1280],
      [2048, 1280],
      [2048, 1920]
    ]) {
      expect(atMost(MIN_EDGES, max)).toBeLessThanOrEqual(max)
    }
  })
})

describe('snapSettings — 두 사다리가 엇갈린 저장값', () => {
  it('최소가 최대보다 크면 최소를 내려 맞춘다', () => {
    // 옛 최소 용량 프리셋(maxEdge 1280) + 옛 minEdge 1600 은 실제로 도달 가능한 상태였다
    const snapped = snapSettings({ minEdge: 1600, maxEdge: 1280 } as never)
    expect(snapped.minEdge).toBeLessThanOrEqual(snapped.maxEdge)
    expect(snapped.minEdge).toBe(1280)
  })

  it('엇갈리지 않으면 그대로 둔다', () => {
    const snapped = snapSettings({ minEdge: 640, maxEdge: 1920 } as never)
    expect(snapped.minEdge).toBe(640)
    expect(snapped.maxEdge).toBe(1920)
  })
})
