import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { packFont, unpackFont } from '../src/ui/fontPack'

describe('fontPack', () => {
  it('압축했다 풀면 같은 바이트, 압축본은 표식으로 시작하고 훨씬 작다', async () => {
    const raw = new Uint8Array(
      readFileSync('/System/Library/Fonts/Supplemental/STIXGeneralBol.otf')
    )
    const packed = await packFont(raw)
    expect(Array.from(packed.subarray(0, 4))).toEqual([0x53, 0x46, 0x5a, 0x31])
    expect(packed.length).toBeLessThan(raw.length * 0.8)
    expect(await unpackFont(packed)).toEqual(raw)
  })

  it('표식이 없는 옛 저장본은 그대로 돌려준다', async () => {
    const raw = new Uint8Array([0, 1, 0, 0, 5, 6, 7])
    expect(await unpackFont(raw)).toBe(raw)
  })

  it('이미 압축된 것을 또 압축하지 않는다', async () => {
    const packed = await packFont(new Uint8Array(1000).fill(7))
    expect(await packFont(packed)).toBe(packed)
  })
})
