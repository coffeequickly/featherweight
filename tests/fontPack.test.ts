import { describe, expect, it } from 'vitest'

import { packFont, unpackFont } from '../src/ui/fontPack'

/** 폰트 파일 흉내 — 테이블처럼 반복이 있는 바이트라 압축이 된다. 시스템 폰트를 읽지 않는다(CI 는 리눅스) */
function fakeFont(size: number): Uint8Array {
  const out = new Uint8Array(size)
  for (let i = 0; i < size; i += 1) out[i] = (i * 7 + (i >> 5)) & 0xff
  return out
}

describe('fontPack', () => {
  it('압축했다 풀면 같은 바이트, 압축본은 표식으로 시작하고 훨씬 작다', async () => {
    const raw = fakeFont(200_000)
    const packed = await packFont(raw)
    expect(Array.from(packed.subarray(0, 4))).toEqual([0x53, 0x46, 0x5a, 0x31])
    expect(packed.length).toBeLessThan(raw.length * 0.5)
    expect(await unpackFont(packed)).toEqual(raw)
  })

  it('표식이 없는 옛 저장본은 그대로 돌려준다', async () => {
    const raw = new Uint8Array([0, 1, 0, 0, 5, 6, 7])
    expect(await unpackFont(raw)).toBe(raw)
  })

  it('이미 압축된 것을 또 압축하지 않는다', async () => {
    const packed = await packFont(fakeFont(1000))
    expect(await packFont(packed)).toBe(packed)
  })
})
