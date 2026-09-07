import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS } from '../src/lib/types'
import { settleResponse } from '../src/main/bridge'
import { forgetReplacements, shrinkImages } from '../src/main/images'

/** 4000×3000 PNG 머리 — 크기는 파일 머리에서 읽고 나머지는 부피만 채운다 */
function fakePng(width: number, height: number, length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

type Paint = { type: string; visible: boolean; imageHash: string | null; scaleMode: string }
type FakeNode = {
  type: string
  visible: boolean
  width: number
  height: number
  absoluteTransform: number[][]
  fills: Paint[]
  children: FakeNode[]
}

function frameWithImage(hash: string): FakeNode {
  return {
    type: 'FRAME',
    visible: true,
    width: 800,
    height: 600,
    absoluteTransform: [
      [1, 0, 0],
      [0, 1, 0]
    ],
    fills: [{ type: 'IMAGE', visible: true, imageHash: hash, scaleMode: 'FILL' }],
    children: []
  }
}

let created: string[] = []
let sent = 0

beforeEach(() => {
  created = []
  sent = 0
  forgetReplacements()
  Object.assign(globalThis, {
    figma: {
      mixed: Symbol('mixed'),
      getImageByHash: (hash: string) => ({
        hash,
        getBytesAsync: async () => fakePng(4000, 3000, 200_000),
        getSizeAsync: async () => ({ width: 4000, height: 3000 })
      }),
      createImage: (bytes: Uint8Array) => {
        const hash = `new-${created.length + 1}`
        created.push(hash)
        return { hash, getBytesAsync: async () => bytes }
      },
      clientStorage: { getAsync: async () => undefined, setAsync: async () => undefined }
    }
  })
})

const send = (payload: { reqId: string }): void => {
  sent += 1
  settleResponse(payload.reqId, {
    ok: true,
    bytes: new Uint8Array(50_000),
    mime: 'image/jpeg',
    width: 1200,
    height: 900,
    changed: true
  })
}

describe('shrinkImages — 프레임 간 교체 이미지 재사용', () => {
  it('같은 원본을 같은 설정으로 쓰는 다음 프레임은 인코딩 없이 같은 교체 해시를 받는다', async () => {
    const first = frameWithImage('bg')
    const second = frameWithImage('bg')
    const run = (root: FakeNode) =>
      shrinkImages(
        root as unknown as SceneNode,
        DEFAULT_SETTINGS,
        send,
        () => undefined,
        () => false
      )

    const statsA = await run(first)
    const statsB = await run(second)

    expect(sent).toBe(1) // UI 인코딩은 한 번
    expect(created).toEqual(['new-1']) // createImage 도 한 번
    expect(first.fills[0].imageHash).toBe('new-1')
    expect(second.fills[0].imageHash).toBe('new-1')
    // 통계는 프레임마다 그 쪽에 실리는 만큼 — 기준 측정과 같은 단위
    expect(statsA).toMatchObject({
      processed: 1,
      bytesBefore: 200_000,
      bytesAfter: 50_000,
      bytesJpeg: 50_000
    })
    expect(statsB).toMatchObject({
      processed: 1,
      bytesBefore: 200_000,
      bytesAfter: 50_000,
      bytesJpeg: 50_000
    })
  }, 10_000)
})
