import { describe, expect, it } from 'vitest'

import { edgeTag, MAX_EDGES, nearest, snapSettings } from '../src/lib/settingsOptions'
import { DEFAULT_SETTINGS } from '../src/lib/types'

describe('edgeTag', () => {
  it('선택지는 해상도 이름으로', () => {
    expect(MAX_EDGES.map(edgeTag)).toEqual(['HD', 'FHD', 'QHD', '4K'])
  })

  it('이름 없는 값은 FHD 에 견준다', () => {
    expect(edgeTag(2048)).toBe('FHD 1.1×')
    expect(edgeTag(1024)).toBe('FHD 53%')
  })
})

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
