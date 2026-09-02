import { describe, expect, it } from 'vitest'

import { forecastImages, groupReasons, unifyMissingGlyphs, uniformSize } from '../src/lib/preflight'
import { DEFAULT_SETTINGS, FrameItem, ImageUsage, Preflight } from '../src/lib/types'

function usage(
  hash: string,
  width: number,
  height: number,
  scaleMode: ImageUsage['scaleMode'] = 'FILL'
): ImageUsage {
  return { nodeId: `node-${hash}`, imageHash: hash, width, height, scaleMode }
}

function frame(id: string, longEdge: number, images: ImageUsage[]): Preflight['frames'][number] {
  return { id, longEdge, images }
}

describe('forecastImages', () => {
  // A4(842pt) · 균형: 기준선 = max(min(2048, ceil(842×1.5)), 640) = 1263
  it('프레임 예산을 넘는 큰 원본만 줄인다 — 작은 로고는 그대로', () => {
    const preflight: Preflight = {
      frames: [frame('f1', 842, [usage('big', 595, 397), usage('logo', 120, 40)])],
      imageEdges: { big: 3000, logo: 400 },
      textRejects: []
    }
    expect(forecastImages(preflight, DEFAULT_SETTINGS)).toMatchObject({
      total: 2,
      shrink: 1,
      tiny: 1
    })
  })

  it('같은 이미지를 여러 프레임이 써도 하나로 센다', () => {
    const preflight: Preflight = {
      frames: [
        frame('f1', 842, [usage('big', 595, 397)]),
        frame('f2', 842, [usage('big', 300, 200)])
      ],
      imageEdges: { big: 3000 },
      textRejects: []
    }
    expect(forecastImages(preflight, DEFAULT_SETTINGS)).toMatchObject({
      total: 1,
      shrink: 1,
      tiny: 0
    })
  })

  it('크기를 모르는 이미지는 줄임으로 세지 않는다 — 셀 근거가 없다', () => {
    const preflight: Preflight = {
      frames: [frame('f1', 842, [usage('mystery', 595, 397)])],
      imageEdges: {},
      textRejects: []
    }
    expect(forecastImages(preflight, DEFAULT_SETTINGS)).toEqual({
      total: 1,
      shrink: 0,
      tiny: 0,
      unsized: 1
    })
  })

  it('TILE 은 줄이지 않지만 이미지로는 센다', () => {
    const preflight: Preflight = {
      frames: [frame('f1', 842, [usage('pattern', 595, 397, 'TILE')])],
      imageEdges: { pattern: 3000 },
      textRejects: []
    }
    expect(forecastImages(preflight, DEFAULT_SETTINGS)).toMatchObject({
      total: 1,
      shrink: 0,
      tiny: 0
    })
  })

  it('하한(minEdge)을 올리면 그 아래 이미지는 어떤 프레임에서도 그대로다', () => {
    // 작은 프레임(300pt)이라 예산은 450 — 하한 640 이 대신 기준이 된다
    const preflight: Preflight = {
      frames: [frame('f1', 300, [usage('photo', 300, 200)])],
      imageEdges: { photo: 1000 },
      textRejects: []
    }
    expect(forecastImages(preflight, DEFAULT_SETTINGS).shrink).toBe(1)
    expect(forecastImages(preflight, { ...DEFAULT_SETTINGS, minEdge: 1024 })).toEqual({
      total: 1,
      shrink: 0,
      tiny: 1,
      unsized: 0
    })
  })

  it('이미지가 없으면 전부 0', () => {
    const preflight: Preflight = { frames: [frame('f1', 842, [])], imageEdges: {}, textRejects: [] }
    expect(forecastImages(preflight, DEFAULT_SETTINGS)).toMatchObject({
      total: 0,
      shrink: 0,
      tiny: 0
    })
  })
})

describe('uniformSize', () => {
  const item = (id: string, width: number, height: number): FrameItem => ({
    id,
    name: id,
    width,
    height,
    x: 0,
    y: 0,
    imageCount: 0,
    textCount: 0
  })

  it('전부 같은 크기면 그 크기', () => {
    expect(uniformSize([item('a', 595, 842), item('b', 595, 842)])).toEqual({
      width: 595,
      height: 842
    })
  })

  it('하나라도 다르면 null', () => {
    expect(uniformSize([item('a', 595, 842), item('b', 1920, 1080)])).toBeNull()
  })

  it('비어 있으면 null', () => {
    expect(uniformSize([])).toBeNull()
  })
})

describe('unifyMissingGlyphs', () => {
  it('글자만 다른 "폰트에 없는 글자" 를 한 사유로 모은다', () => {
    const unified = unifyMissingGlyphs([
      { nodeId: 'a', reason: { code: 'font.missingGlyphs', params: { count: 1, sample: '–' } } },
      { nodeId: 'b', reason: { code: 'reject.stroked' } },
      { nodeId: 'c', reason: { code: 'font.missingGlyphs', params: { count: 1, sample: '—' } } }
    ])
    expect(unified[0].reason).toEqual({
      code: 'font.missingGlyphs',
      params: { count: 2, sample: '–—' }
    })
    expect(unified[2].reason).toBe(unified[0].reason)
    expect(unified[1].reason).toEqual({ code: 'reject.stroked' })
  })

  it('견본이 잘린 노드가 있으면 개수를 더해 어림한다', () => {
    const unified = unifyMissingGlyphs([
      {
        nodeId: 'a',
        reason: { code: 'font.missingGlyphs', params: { count: 9, sample: 'abcdef' } }
      },
      { nodeId: 'b', reason: { code: 'font.missingGlyphs', params: { count: 1, sample: 'g' } } }
    ])
    expect(unified[0].reason.params).toEqual({ count: 10, sample: 'abcdef' })
  })

  it('없으면 그대로', () => {
    const items = [{ nodeId: 'a', reason: { code: 'reject.stroked' as const } }]
    expect(unifyMissingGlyphs(items)).toEqual(items)
  })
})

describe('groupReasons', () => {
  it('같은 사유를 묶고 많은 것부터, 노드 id 를 모아 둔다', () => {
    const groups = groupReasons([
      { reason: 'stroke', id: 'a' },
      { reason: 'gradient', id: 'b' },
      { reason: 'stroke', id: 'c' }
    ])
    expect(groups).toEqual([
      { reason: 'stroke', count: 2, ids: ['a', 'c'] },
      { reason: 'gradient', count: 1, ids: ['b'] }
    ])
  })

  it('비어 있으면 비어 있다', () => {
    expect(groupReasons([])).toEqual([])
  })
})
