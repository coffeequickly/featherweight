// 이미지 탭 목록 — 어떤 그림이 몇 px 에서 몇 px 이 되는지.
//
// 이 목록이 설정 설명을 대신한다. 숫자가 틀리면 화면 전체가 거짓말이 되므로,
// 실제 export 와 같은 규칙(skipFloor · planImageTargets)을 쓰는지 여기서 못 박는다.

import { describe, expect, it } from 'vitest'

import { imageRoster } from '../src/lib/preflight'
import { DEFAULT_SETTINGS, ImageUsage, Preflight, Settings } from '../src/lib/types'

const SETTINGS: Settings = { ...DEFAULT_SETTINGS, multiplier: 1.5, maxEdge: 1920, minEdge: 640 }

function usage(hash: string, name: string, width: number, height = width): ImageUsage {
  return { nodeId: `node-${hash}`, imageHash: hash, name, width, height, scaleMode: 'FILL' }
}

/** A4 세로 한 장 — 긴 변 842pt. 균형(1.5×)이면 기준선 1263px */
function sheet(images: ImageUsage[], edges: Record<string, number>): Preflight {
  return {
    frames: [{ id: 'f1', longEdge: 842, images }],
    imageEdges: edges,
    textRejects: []
  }
}

describe('imageRoster', () => {
  it('원본과 목표를 함께 준다 — 표시 크기 × 배율', () => {
    const roster = imageRoster(sheet([usage('h', '표지 배경', 842)], { h: 3024 }), SETTINGS)
    expect(roster).toHaveLength(1)
    expect(roster[0]).toMatchObject({
      name: '표지 배경',
      original: 3024,
      target: 1263,
      kept: false
    })
  })

  it('기준선 이하는 그대로 나간다 — 로고·아이콘', () => {
    const roster = imageRoster(sheet([usage('logo', '로고', 60)], { logo: 512 }), SETTINGS)
    expect(roster[0]).toMatchObject({ name: '로고', original: 512, kept: true })
  })

  it('원본이 목표보다 작으면 확대하지 않는다 — 그대로', () => {
    const roster = imageRoster(sheet([usage('h', '작은 사진', 842)], { h: 900 }), SETTINGS)
    expect(roster[0]).toMatchObject({ target: 1263, kept: true })
  })

  it('같은 사진을 여러 자리에 쓰면 가장 크게 쓰는 자리에 맞춘다', () => {
    const roster = imageRoster(
      sheet([usage('h', '작게 쓴 자리', 100), usage('h', '크게 쓴 자리', 800)], { h: 4000 }),
      SETTINGS
    )
    expect(roster).toHaveLength(1)
    expect(roster[0]).toMatchObject({ name: '크게 쓴 자리', target: 1200 })
  })

  it('배율을 올리면 목표가 따라 오른다', () => {
    const doc = sheet([usage('h', '사진', 842)], { h: 4000 })
    expect(imageRoster(doc, { ...SETTINGS, multiplier: 1 })[0].target).toBe(842)
    expect(imageRoster(doc, { ...SETTINGS, multiplier: 4, maxEdge: 3840 })[0].target).toBe(3368)
  })

  it('한 장 상한이 배율을 이기면 그 사실을 표시한다', () => {
    const doc = sheet([usage('h', '사진', 1600)], { h: 6000 })
    // 1600 × 1.5 = 2400 인데 상한이 1920 이다
    const capped = imageRoster(doc, { ...SETTINGS, maxEdge: 1920 })[0]
    expect(capped).toMatchObject({ target: 1920, capped: true })

    const free = imageRoster(doc, { ...SETTINGS, maxEdge: 3840 })[0]
    expect(free).toMatchObject({ target: 2400, capped: false })
  })

  it('크기를 아직 못 읽었으면 원본이 null 이고 "그대로" 라고 단정하지 않는다', () => {
    const roster = imageRoster(sheet([usage('h', '읽는 중', 842)], {}), SETTINGS)
    expect(roster[0]).toMatchObject({ original: null, kept: false })
  })

  it('줄어드는 것이 먼저, 그 안에서 큰 것부터. 그대로 나가는 것은 뒤로', () => {
    const roster = imageRoster(
      sheet([usage('a', '작은 사진', 842), usage('b', '큰 사진', 842), usage('c', '로고', 60)], {
        a: 2000,
        b: 4000,
        c: 512
      }),
      SETTINGS
    )
    expect(roster.map((row) => row.name)).toEqual(['큰 사진', '작은 사진', '로고'])
  })
})
