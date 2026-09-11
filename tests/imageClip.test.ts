// 클립은 내려가면서 좁아진다 — 겹치는 데가 없으면 비어야지, 없어지면 안 된다.
//
// 부모 클립 밖으로 통째로 나간 클립 프레임(캐러셀의 다음 장, 화면 밖 슬라이드) 안의 그림이
// "다 보인다" 로 잡히던 버그를 못 박는다. 화면은 넘침을 못 말하고, 이 값을 크롭 판단에
// 물리면 안 보이는 그림을 통째로 싣게 된다.

import { describe, expect, it } from 'vitest'

import { EMPTY_CLIP } from '../src/lib/clipRect'
import { clipFor, collectImageUsages } from '../src/main/images'

const IDENTITY = [
  [1, 0, 0],
  [0, 1, 0]
]

function rect(x: number, y: number, width: number, height: number) {
  return { x, y, width, height }
}

function image(x: number, y: number, width: number, height: number): SceneNode {
  return {
    id: `img-${x}-${y}`,
    type: 'RECTANGLE',
    name: 'photo',
    visible: true,
    width,
    height,
    absoluteTransform: IDENTITY,
    absoluteBoundingBox: rect(x, y, width, height),
    fills: [{ type: 'IMAGE', visible: true, imageHash: 'h', scaleMode: 'FILL' }]
  } as unknown as SceneNode
}

function frame(
  x: number,
  y: number,
  width: number,
  height: number,
  clipsContent: boolean,
  children: SceneNode[]
): SceneNode {
  return {
    id: `frame-${x}-${y}`,
    type: 'FRAME',
    name: 'frame',
    visible: true,
    clipsContent,
    width,
    height,
    absoluteTransform: IDENTITY,
    absoluteBoundingBox: rect(x, y, width, height),
    fills: [],
    children
  } as unknown as SceneNode
}

const page = rect(0, 0, 400, 400)

describe('clipFor', () => {
  it('부모 클립과 안 겹치는 클립 프레임은 빈 클립이다 — null(클립 없음)이 아니다', () => {
    expect(clipFor(frame(1000, 0, 200, 200, true, []), page)).toBe(EMPTY_CLIP)
  })

  it('빈 클립 밑의 클립 프레임도 빈 클립이다', () => {
    expect(clipFor(frame(1000, 0, 50, 50, true, []), EMPTY_CLIP)).toBe(EMPTY_CLIP)
  })

  it('clipsContent 를 끈 프레임은 부모 클립을 그대로 물려준다', () => {
    expect(clipFor(frame(1000, 0, 200, 200, false, []), page)).toBe(page)
    expect(clipFor(frame(1000, 0, 200, 200, false, []), EMPTY_CLIP)).toBe(EMPTY_CLIP)
  })

  it('겹치면 겹친 만큼으로 좁힌다', () => {
    expect(clipFor(frame(300, 300, 200, 200, true, []), page)).toEqual(rect(300, 300, 100, 100))
  })
})

describe('collectImageUsages 의 visible', () => {
  it('부모 밖으로 통째로 나간 클립 프레임 안의 그림은 0 이다 (버그 재현)', () => {
    const root = frame(0, 0, 400, 400, true, [
      frame(1000, 0, 200, 200, true, [image(1000, 0, 100, 100)])
    ])
    expect(collectImageUsages(root).map((usage) => usage.visible)).toEqual([0])
  })

  it('그 밑으로 클립 프레임이 더 있어도 0 이다', () => {
    const root = frame(0, 0, 400, 400, true, [
      frame(1000, 0, 200, 200, true, [frame(1000, 0, 100, 100, true, [image(1000, 0, 50, 50)])])
    ])
    expect(collectImageUsages(root).map((usage) => usage.visible)).toEqual([0])
  })

  it('반쯤 걸친 클립 프레임 안의 그림은 걸친 만큼이다', () => {
    // 프레임은 (300,300)~(500,500) 이라 (300,300)~(400,400) 만 남고, 그림은 그 안에 다 든다
    const root = frame(0, 0, 400, 400, true, [
      frame(300, 300, 200, 200, true, [image(300, 300, 200, 100)])
    ])
    expect(collectImageUsages(root).map((usage) => usage.visible)).toEqual([0.5])
  })
})
