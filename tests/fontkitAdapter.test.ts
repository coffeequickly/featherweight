import { describe, expect, it, vi } from 'vitest'

// fontkit 은 진짜 폰트 바이트가 있어야 한다 — 서브셋 encode 만 흉내 낸다
const { encode } = vi.hoisted(() => ({ encode: vi.fn<() => Uint8Array>() }))
vi.mock('fontkit', () => ({
  create: () => ({
    familyName: 'Fake',
    createSubset: () => ({ includeGlyph: () => 0, encode })
  })
}))

import { pdfLibFontkit } from '../src/ui/fontkitAdapter'

type Stream = { on: (event: string, callback: (payload: unknown) => void) => Stream }
type FontLike = { createSubset: () => { encodeStream: () => Stream } }

function encodeStream(): Stream {
  const adapter = pdfLibFontkit() as unknown as { create: (bytes: Uint8Array) => FontLike }
  return adapter
    .create(new Uint8Array([0]))
    .createSubset()
    .encodeStream()
}

/** pdf-lib 의 serializeFont 처럼 세 이벤트를 걸고 결과를 기다린다 */
function collect(
  stream: Stream
): Promise<{ chunks: Uint8Array[]; ended: boolean; error: unknown }> {
  return new Promise((resolve) => {
    const state = { chunks: [] as Uint8Array[], ended: false, error: undefined as unknown }
    stream
      .on('data', (chunk) => state.chunks.push(chunk as Uint8Array))
      .on('end', () => {
        state.ended = true
        resolve(state)
      })
      .on('error', (error) => {
        state.error = error
        resolve(state)
      })
  })
}

describe('pdfLibFontkit — encodeStream', () => {
  it('encode 결과를 data → end 순서로 흘린다', async () => {
    encode.mockReturnValueOnce(new Uint8Array([1, 2, 3]))

    const result = await collect(encodeStream())

    expect(result.chunks).toEqual([new Uint8Array([1, 2, 3])])
    expect(result.ended).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('encode 가 던지면 error 이벤트로 넘긴다 — 밖으로 새면 pdf-lib 의 save() 가 영원히 기다린다', async () => {
    encode.mockImplementationOnce(() => {
      throw new Error('loca offsets missing')
    })

    const result = await collect(encodeStream())

    expect(result.error).toBeInstanceOf(Error)
    expect((result.error as Error).message).toBe('loca offsets missing')
    expect(result.chunks).toEqual([])
    expect(result.ended).toBe(false)
  })
})
