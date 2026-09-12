// 잘라 넣기 — 메인의 결정과 교체. 조각 합이 W₀ 보다 작을 때만 자리마다 조각을 꽂고, 아니면 W₀.
// 자리·수치는 2026-09-10 실측 프레임(사진 3000×4000, 균형 프리셋)과 같다.

import { beforeEach, describe, expect, it } from 'vitest'

import {
  cropWindow,
  enclosingRect,
  fillWindow,
  PaintWindow,
  pieceTransform
} from '../src/lib/cropWindow'
import { DEFAULT_SETTINGS, Settings } from '../src/lib/types'
import { settleResponse } from '../src/main/bridge'
import { forgetReplacements, ImageStats, imageUsagesOf, shrinkImages } from '../src/main/images'
import { windowOf } from '../src/lib/imageCrop'
import { rememberSize } from '../src/main/imageSize'

const SETTINGS: Settings = { ...DEFAULT_SETTINGS, multiplier: 1.5, maxEdge: 1920, minEdge: 640 }
const SOURCE = { width: 3000, height: 4000 }
const IDENTITY = [
  [1, 0, 0],
  [0, 1, 0]
]

type Paint = Record<string, unknown>
type FakeNode = {
  id: string
  type: string
  name: string
  visible: boolean
  width: number
  height: number
  absoluteTransform: number[][]
  fills: Paint[]
  children: FakeNode[]
}

const crop = (t: number[][]): Paint => ({
  type: 'IMAGE',
  visible: true,
  imageHash: 'photo',
  scaleMode: 'CROP',
  imageTransform: t,
  opacity: 1,
  blendMode: 'NORMAL'
})
const fill = (): Paint => ({
  type: 'IMAGE',
  visible: true,
  imageHash: 'photo',
  scaleMode: 'FILL',
  rotation: 0,
  opacity: 1,
  blendMode: 'NORMAL'
})

function rect(id: string, width: number, height: number, paint: Paint): FakeNode {
  return {
    id,
    type: 'RECTANGLE',
    name: id,
    visible: true,
    width,
    height,
    absoluteTransform: IDENTITY,
    fills: [paint],
    children: []
  }
}
const T_A = [
  [0.1, 0, 0.45],
  [0, 0.075, 0.4625]
]
const T_B = [
  [0.25, 0, 0.375],
  [0, 0.1875, 0.40625]
]
const T_D = [
  [0.05, 0, 0.2],
  [0, 0.0375, 0.70625]
]

function frameA(): FakeNode {
  return {
    id: 'frame',
    type: 'FRAME',
    name: 'frame',
    visible: true,
    width: 900,
    height: 460,
    absoluteTransform: IDENTITY,
    fills: [],
    children: [rect('A', 100, 100, crop(T_A))]
  }
}

function frame(withWhole: boolean): FakeNode {
  const children = [
    rect('A', 100, 100, crop(T_A)),
    rect('B', 300, 300, crop(T_B)),
    rect('D', 200, 200, crop(T_D)),
    rect('C', 300, 100, fill())
  ]
  if (withWhole) children.push(rect('E', 150, 200, fill()))
  return {
    id: 'frame',
    type: 'FRAME',
    name: 'frame',
    visible: true,
    width: 900,
    height: 460,
    absoluteTransform: IDENTITY,
    fills: [],
    children
  }
}

let created: string[] = []
let sent = 0
let sentMany = 0
let manyBytes = [30_000, 110_000, 7_000, 160_000] // A·B·D·C 조각 — 합 307,000 < W₀ 500,000
let manyOk = true
let failure: 'create' | 'read' | null = null

beforeEach(() => {
  created = []
  sent = 0
  sentMany = 0
  manyBytes = [30_000, 110_000, 7_000, 160_000]
  manyOk = true
  failure = null
  forgetReplacements()
  rememberSize('photo', SOURCE)
  Object.assign(globalThis, {
    figma: {
      mixed: Symbol('mixed'),
      getImageByHash: (hash: string) => ({
        hash,
        getBytesAsync: async () => new Uint8Array(3_000_000),
        getSizeAsync: async () => SOURCE
      }),
      createImage: (bytes: Uint8Array) => {
        const isPiece = created.length > 0
        if (isPiece && failure === 'create') throw new Error('piece creation failed')
        const hash = `new-${created.length + 1}`
        created.push(hash)
        return {
          hash,
          getBytesAsync: async () => {
            if (isPiece && failure === 'read') throw new Error('piece read failed')
            return bytes
          }
        }
      },
      clientStorage: { getAsync: async () => undefined, setAsync: async () => undefined }
    }
  })
})

const send = (payload: { reqId: string }): void => {
  sent += 1
  settleResponse(payload.reqId, {
    ok: true,
    bytes: new Uint8Array(500_000),
    mime: 'image/jpeg',
    width: 1440,
    height: 1920,
    changed: true
  })
}
const sendMany = (payload: { reqId: string; jobs: Array<{ targetLongEdge: number }> }): void => {
  sentMany += 1
  if (!manyOk) {
    settleResponse(payload.reqId, { ok: false, reason: 'nope' })
    return
  }
  settleResponse(payload.reqId, {
    ok: true,
    results: payload.jobs.map((job, at) => ({
      bytes: new Uint8Array(manyBytes[at]),
      mime: 'image/jpeg',
      width: job.targetLongEdge,
      height: job.targetLongEdge
    }))
  })
}
const run = (root: FakeNode) =>
  shrinkImages(
    root as unknown as SceneNode,
    SETTINGS,
    send,
    () => undefined,
    () => false,
    undefined,
    sendMany
  )

const fillOf = (root: FakeNode, id: string) =>
  (root.children.find((c) => c.id === id) as FakeNode).fills[0]

/** 손댄 원본은 해시로 쌓인다(쪽마다 세지 않으려고) — 단언은 개수로 본다 */
const counts = (stats: ImageStats) => ({
  ...stats,
  processed: stats.processed.length,
  cropped: stats.cropped.length,
  recovered: stats.recovered.length
})

describe('shrinkImages — 보이는 창만 잘라 넣기', () => {
  it('가로만 확대된 FILL도 로컬 상자의 구도로 창을 계산한다', () => {
    const node = rect('scaled', 100, 100, fill())
    node.absoluteTransform = [
      [2, 0, 0],
      [0, 1, 0]
    ]
    const [usage] = imageUsagesOf(node as unknown as SceneNode)
    expect([usage.width, usage.height]).toEqual([200, 100])
    expect((windowOf(usage, { width: 1000, height: 1000 }) as PaintWindow).bbox).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1
    })
  })

  it.each(['create', 'read'] as const)(
    '조각 %s 예외에도 기존 축소본과 바이트 통계를 보존한다 — 경고가 아니라 복구로 센다',
    async (kind) => {
      failure = kind
      const root = frame(false)
      const stats = await run(root)
      expect(root.children.map((node) => node.fills[0].imageHash)).toEqual(Array(4).fill('new-1'))
      expect(fillOf(root, 'A').imageTransform).toEqual(T_A)
      expect(counts(stats)).toMatchObject({
        processed: 1,
        cropped: 0,
        recovered: 1,
        bytesAfter: 500_000
      })
      expect(stats.warnings).toHaveLength(0)
    }
  )

  it('조각 합이 W₀ 와 거의 같으면(최소 절감 미달) W₀ 다 — 이미지 한 장을 더 만들 값어치가 없다', async () => {
    // A·B·D·C 묶음의 밀도 이득은 C(1440→1440) 때문에 1 근처 → 5% 는 줄어야 한다
    manyBytes = [30_000, 110_000, 7_000, 333_000] // 480,000 = W₀ 의 96%
    const root = frame(false)
    const stats = await run(root)
    expect(created).toEqual(['new-1'])
    expect(fillOf(root, 'A')).toMatchObject({ imageHash: 'new-1', imageTransform: T_A })
    expect(counts(stats)).toMatchObject({ cropped: 0, recovered: 0, bytesAfter: 500_000 })
  })

  it('밀도가 크게 높아지는 후보는 작은 절감으로도 조각이다', async () => {
    // A 하나뿐이면 조각 303px 이 기존 145px 의 두 배 — 분리된 기준(1% 만 줄어도)
    const root = frameA()
    manyBytes = [490_000] // W₀ 의 98%
    const stats = await run(root)
    expect(fillOf(root, 'A')).toMatchObject({ scaleMode: 'CROP', imageHash: 'new-2' })
    expect(counts(stats)).toMatchObject({ cropped: 1, bytesAfter: 490_000 })
  })

  it('조각 합이 W₀ 보다 작으면 자리마다 조각을 CROP + T′ 로 꽂는다', async () => {
    const root = frame(false)
    const stats = await run(root)

    expect(sent).toBe(1) // W₀ 한 번
    expect(sentMany).toBe(1) // 조각 넷은 한 번에
    expect(created).toEqual(['new-1', 'new-2', 'new-3', 'new-4', 'new-5']) // W₀ + 조각 4
    expect(counts(stats)).toMatchObject({
      processed: 1,
      cropped: 1,
      bytesBefore: 3_000_000,
      bytesAfter: 307_000
    })

    const a = fillOf(root, 'A')
    expect(a.scaleMode).toBe('CROP')
    expect(a.imageHash).toBe('new-2')
    const window = cropWindow(T_A as never) as PaintWindow
    expect(a.imageTransform).toEqual(
      pieceTransform(window, SOURCE, enclosingRect(window.bbox, SOURCE)).map((row) => [...row])
    )
    // FILL 가로띠도 CROP 으로 바뀐다 — 가운데 창
    const c = fillOf(root, 'C')
    expect(c.scaleMode).toBe('CROP')
    expect(c.imageHash).toBe('new-5')
    const band = fillWindow({ width: 300, height: 100 }, SOURCE) as PaintWindow
    expect(c.imageTransform).toEqual(
      pieceTransform(band, SOURCE, enclosingRect(band.bbox, SOURCE)).map((row) => [...row])
    )
    expect((c as { opacity: number }).opacity).toBe(1)
  })

  it('다음 프레임의 같은 자리들은 UI 도 createImage 도 없이 같은 조각을 받는다', async () => {
    const first = frame(false)
    const second = frame(false)
    await run(first)
    const stats = await run(second)
    expect(sent).toBe(1)
    expect(sentMany).toBe(1)
    expect(created).toHaveLength(5)
    expect(fillOf(second, 'A').imageHash).toBe('new-2')
    expect(counts(stats)).toMatchObject({ processed: 1, cropped: 1, bytesAfter: 307_000 })
  })

  it('조각 합이 W₀ 이상이면 W₀ 다 — 조각은 만들지도 않는다', async () => {
    manyBytes = [200_000, 200_000, 50_000, 160_000] // 610,000 ≥ 500,000
    const root = frame(false)
    const stats = await run(root)
    expect(sentMany).toBe(1)
    expect(created).toEqual(['new-1'])
    expect(fillOf(root, 'A')).toMatchObject({
      scaleMode: 'CROP',
      imageHash: 'new-1',
      imageTransform: T_A
    })
    expect(fillOf(root, 'C')).toMatchObject({ scaleMode: 'FILL', imageHash: 'new-1' })
    expect(counts(stats)).toMatchObject({ processed: 1, cropped: 0, bytesAfter: 500_000 })
  })

  it('통째로 보는 자리가 있으면 조각을 묻지도 않는다 — W₀ 가 남아야 해서', async () => {
    const root = frame(true)
    const stats = await run(root)
    expect(sentMany).toBe(0)
    expect(created).toEqual(['new-1'])
    expect(fillOf(root, 'E')).toMatchObject({ scaleMode: 'FILL', imageHash: 'new-1' })
    expect(counts(stats)).toMatchObject({ processed: 1, cropped: 0 })
  })

  it('조각 인코딩이 실패하면 W₀ 로 물러서고 복구로 센다 — 절감 부족과 다르다', async () => {
    manyOk = false
    const root = frame(false)
    const stats = await run(root)
    expect(created).toEqual(['new-1'])
    expect(fillOf(root, 'B')).toMatchObject({ scaleMode: 'CROP', imageHash: 'new-1' })
    expect(counts(stats)).toMatchObject({
      processed: 1,
      cropped: 0,
      recovered: 1,
      bytesAfter: 500_000,
      warnings: []
    })
  })

  it('sendMany 가 없으면(옛 호출자) 오늘 그대로다', async () => {
    const root = frame(false)
    const stats = await shrinkImages(
      root as unknown as SceneNode,
      SETTINGS,
      send,
      () => undefined,
      () => false
    )
    expect(created).toEqual(['new-1'])
    expect(counts(stats)).toMatchObject({ processed: 1, cropped: 0 })
  })
})

describe('잘라 넣기 끄기', () => {
  it('cropToVisible 이 꺼지면 조각을 묻지 않고 W₀ 다', async () => {
    const root = frame(false)
    const stats = await shrinkImages(
      root as unknown as SceneNode,
      { ...SETTINGS, cropToVisible: false },
      send,
      () => undefined,
      () => false,
      undefined,
      sendMany
    )
    expect(sentMany).toBe(0)
    expect(created).toEqual(['new-1'])
    expect(fillOf(root, 'A')).toMatchObject({ scaleMode: 'CROP', imageHash: 'new-1' })
    expect(counts(stats)).toMatchObject({ processed: 1, cropped: 0 })
  })

  it('저장된 옛 설정에 항목이 없으면 기본은 켬', async () => {
    const { snapSettings } = await import('../src/lib/settingsOptions')
    expect(snapSettings({}).cropToVisible).toBe(true)
    expect(snapSettings({ cropToVisible: false }).cropToVisible).toBe(false)
  })
})
