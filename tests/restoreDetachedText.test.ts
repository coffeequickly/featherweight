import { beforeEach, describe, expect, it, vi } from 'vitest'

import { restoreDetachedText } from '../src/main/text'

/** 변환 행렬의 앞 두 열 [[a, c], [b, d]] — 부모가 어느 쪽을 보고 있는지 */
type Axes = [[number, number], [number, number]]
type Point = { x: number; y: number }
type Size = { width: number; height: number }
type Box = Point & Size

type Fake = {
  type: string
  visible: boolean
  parent: Fake | null
  children?: Fake[]
  layoutMode?: string
  absoluteBoundingBox?: Box
}

type FakeText = Fake & {
  x: number
  y: number
  width: number
  height: number
  textAutoResize: string
  absoluteBoundingBox: Box
}

const turned = (degrees: number): Axes => {
  const angle = (degrees * Math.PI) / 180
  return [
    [Math.cos(angle), Math.sin(angle)],
    [-Math.sin(angle), Math.cos(angle)]
  ]
}
const STRAIGHT = turned(0)
const FLIPPED: Axes = [
  [-1, 0],
  [0, 1]
]

/** 루트 > 부모 프레임(axes 만큼 돌아감) > 텍스트. 텍스트의 x·y 는 부모 좌표계 값이다 */
function scene(
  rootAt: Point,
  axes: Axes,
  at: Point,
  size: Size,
  auto: string,
  natural: Size = size
): { root: Fake; text: FakeText } {
  const root: Fake = {
    type: 'FRAME',
    visible: true,
    parent: null,
    layoutMode: 'NONE',
    absoluteBoundingBox: { ...rootAt, width: 640, height: 420 }
  }
  const holder: Fake = { type: 'FRAME', visible: true, parent: root, layoutMode: 'NONE' }
  const origin = { x: rootAt.x + 200, y: rootAt.y + 150 }
  const [[a, c], [b, d]] = axes
  const place = (x: number, y: number): Point => ({
    x: origin.x + a * x + c * y,
    y: origin.y + b * x + d * y
  })

  let mode = auto
  const text = {
    type: 'TEXT',
    visible: true,
    parent: holder,
    characters: '라벨 텍스트',
    x: at.x,
    y: at.y,
    width: size.width,
    height: size.height,
    get textAutoResize() {
      return mode
    },
    // 글자에 맞춰 줄어드는 모드로 바꾸면 피그마가 크기를 다시 잡는다
    set textAutoResize(value: string) {
      mode = value
      if (value === 'WIDTH_AND_HEIGHT') {
        text.width = natural.width
        text.height = natural.height
      }
    },
    resize(width: number, height: number) {
      text.width = width
      text.height = height
    },
    getRangeAllFontNames: () => [{ family: 'Inter', style: 'Regular' }],
    get relativeTransform() {
      return [
        [1, 0, text.x],
        [0, 1, text.y]
      ]
    },
    get absoluteTransform() {
      const corner = place(text.x, text.y)
      return [
        [a, c, corner.x],
        [b, d, corner.y]
      ]
    },
    get absoluteBoundingBox(): Box {
      const corners = [
        place(text.x, text.y),
        place(text.x + text.width, text.y),
        place(text.x, text.y + text.height),
        place(text.x + text.width, text.y + text.height)
      ]
      const xs = corners.map((corner) => corner.x)
      const ys = corners.map((corner) => corner.y)
      const left = Math.min(...xs)
      const top = Math.min(...ys)
      return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }
    }
  }
  holder.children = [text]
  root.children = [holder]
  return { root, text }
}

/** 루트 기준 자리 — 원본과 클론은 서 있는 곳이 달라서 이걸로 견준다 */
function placeIn(root: Fake, text: FakeText): Box {
  const box = text.absoluteBoundingBox
  const base = root.absoluteBoundingBox as Box
  return { x: box.x - base.x, y: box.y - base.y, width: box.width, height: box.height }
}

function expectSamePlace(have: Box, want: Box): void {
  expect(have.x).toBeCloseTo(want.x, 6)
  expect(have.y).toBeCloseTo(want.y, 6)
  expect(have.width).toBeCloseTo(want.width, 6)
  expect(have.height).toBeCloseTo(want.height, 6)
}

const restore = (clone: Fake, original: Fake): Promise<void> =>
  restoreDetachedText(clone as unknown as SceneNode, original as unknown as SceneNode)

const HOME = { x: 0, y: 0 }
/** exporter 의 parkOffscreen 이 클론을 세워 두는 곳 */
const PARKED = { x: 100_000, y: 0 }
const LABEL = { width: 60, height: 12 }
const STRETCHED = { width: 60, height: 18 }

let loadFontAsync = vi.fn(async () => {})

beforeEach(() => {
  loadFontAsync = vi.fn(async () => {})
  Object.assign(globalThis, { figma: { loadFontAsync } })
})

/** detach 가 덮어쓰기를 잃은 상태 — 글자에 맞던 텍스트가 고정 크기로 돌아가 왼쪽 위로 붙었다 */
function detached(axes: Axes): { original: Fake; source: FakeText; clone: Fake; text: FakeText } {
  const before = scene(HOME, axes, { x: 30, y: 43 }, LABEL, 'WIDTH_AND_HEIGHT')
  const after = scene(PARKED, axes, { x: 28, y: 40 }, STRETCHED, 'NONE', LABEL)
  return { original: before.root, source: before.text, clone: after.root, text: after.text }
}

describe('restoreDetachedText', () => {
  it('detach 로 잃은 크기 모드와 자리를 원본대로 되돌린다', async () => {
    const { original, source, clone, text } = detached(STRAIGHT)
    await restore(clone, original)
    expect(text.textAutoResize).toBe('WIDTH_AND_HEIGHT')
    expectSamePlace(placeIn(clone, text), placeIn(original, source))
  })

  it('부모가 90° 돌아가 있어도 제자리 — 절대 좌표 차이를 그대로 더하면 3pt 가 4.2pt 로 커지던 버그', async () => {
    const { original, source, clone, text } = detached(turned(90))
    await restore(clone, original)
    expectSamePlace(placeIn(clone, text), placeIn(original, source))
  })

  it('부모가 비스듬히(20°) 돌아가 있어도 제자리', async () => {
    const { original, source, clone, text } = detached(turned(20))
    await restore(clone, original)
    expectSamePlace(placeIn(clone, text), placeIn(original, source))
  })

  it('부모가 좌우로 뒤집혀 있어도 제자리', async () => {
    const { original, source, clone, text } = detached(FLIPPED)
    await restore(clone, original)
    expectSamePlace(placeIn(clone, text), placeIn(original, source))
  })

  it('먼 좌표의 실수 오차는 움직인 것으로 보지 않는다 — x=400,000 에서 0.02pt', async () => {
    const before = scene(HOME, STRAIGHT, { x: 30, y: 40 }, LABEL, 'NONE')
    const after = scene({ x: 400_000, y: 0 }, STRAIGHT, { x: 30.02, y: 40 }, LABEL, 'NONE')
    await restore(after.root, before.root)
    expect(loadFontAsync).not.toHaveBeenCalled()
    expect(after.text.x).toBe(30.02)
  })

  it('먼 좌표에서도 실제로 움직인 텍스트는 되돌린다', async () => {
    const before = scene(HOME, STRAIGHT, { x: 30, y: 43 }, LABEL, 'WIDTH_AND_HEIGHT')
    const after = scene({ x: 400_000, y: 0 }, STRAIGHT, { x: 30, y: 40 }, STRETCHED, 'NONE', LABEL)
    await restore(after.root, before.root)
    expectSamePlace(placeIn(after.root, after.text), placeIn(before.root, before.text))
  })

  it('폰트를 못 불러오면 그 텍스트는 건드리지 않는다', async () => {
    loadFontAsync.mockRejectedValue(new Error('font missing'))
    const { original, clone, text } = detached(STRAIGHT)
    await restore(clone, original)
    expect(text.textAutoResize).toBe('NONE')
    expect(text.y).toBe(40)
  })

  it('텍스트 수가 원본과 다르면 짝을 믿을 수 없으니 아무것도 안 한다', async () => {
    const { original, clone, text } = detached(STRAIGHT)
    original.children = []
    await restore(clone, original)
    expect(loadFontAsync).not.toHaveBeenCalled()
    expect(text.y).toBe(40)
  })
})
