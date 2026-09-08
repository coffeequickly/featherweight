import { describe, expect, it, vi } from 'vitest'

// fontkit 은 진짜 폰트 바이트가 있어야 한다 — 서브셋 encode 만 흉내 낸다
const { encode } = vi.hoisted(() => ({ encode: vi.fn<() => Uint8Array>() }))
vi.mock('fontkit', () => ({
  create: () => ({
    familyName: 'Fake',
    createSubset: () => ({ includeGlyph: () => 0, encode })
  })
}))

import { FACTS_VERSION } from '../src/lib/types'
import { factsOf, pdfLibFontkit } from '../src/ui/fontkitAdapter'

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

describe('factsOf — 기울임 판정', () => {
  const facts = (font: Record<string, unknown>): boolean | undefined =>
    factsOf(font as unknown as Parameters<typeof factsOf>[0]).italic
  const base = {
    directory: { tables: {} },
    'OS/2': { usWeightClass: 500, fsSelection: { italic: false } }
  }

  it('비트가 다 꺼져 있어도 이름이 Italic 이면 기울임이다 — macOS Helvetica Neue Medium Italic', () => {
    expect(
      facts({
        ...base,
        head: { macStyle: { italic: false } },
        post: { italicAngle: 0 },
        subfamilyName: 'Medium Italic'
      })
    ).toBe(true)
  })

  it('head 비트만 켜진 face(Thin Italic), italicAngle 만 있는 face 도 기울임이다', () => {
    expect(facts({ ...base, head: { macStyle: { italic: true } }, subfamilyName: 'Thin' })).toBe(
      true
    )
    expect(facts({ ...base, post: { italicAngle: -12 }, subfamilyName: 'Book' })).toBe(true)
  })

  it('아무 신호도 없으면 정자, 정보 자체가 없으면 모른다', () => {
    expect(
      facts({
        ...base,
        head: { macStyle: { italic: false } },
        post: { italicAngle: 0 },
        subfamilyName: 'Medium'
      })
    ).toBe(false)
    expect(facts({ directory: { tables: {} } })).toBeUndefined()
  })
})

describe('factsOf — 임베드 플래그(OS/2 fsType)', () => {
  const facts = (fsType: unknown): ReturnType<typeof factsOf> =>
    factsOf({
      directory: { tables: {} },
      'OS/2': { usWeightClass: 400, fsType }
    } as unknown as Parameters<typeof factsOf>[0])

  it('여러 비트가 켜지면 덜 제한적인 쪽 — Futura Medium(Restricted+Preview) 은 Preview', () => {
    expect(facts({ noEmbedding: true, viewOnly: true }).embedding).toBe('preview')
    expect(facts({ noEmbedding: true }).embedding).toBe('restricted')
    expect(facts({ editable: true }).embedding).toBe('editable')
    expect(facts({}).embedding).toBe('installable')
    expect(facts({ bitmapOnly: true, editable: true }).embedding).toBe('bitmap-only')
  })

  it('숫자로 와도 읽는다 — 0x0002 Restricted, 0x0006 Preview, 0x0108 Editable + No subsetting', () => {
    expect(facts(0x0002).embedding).toBe('restricted')
    expect(facts(0x0006).embedding).toBe('preview')
    expect(facts(0x0108)).toMatchObject({ embedding: 'editable', noSubsetting: true })
    expect(facts(0).noSubsetting).toBe(false)
  })

  it('OS/2 가 없으면 모른다', () => {
    const none = factsOf({ directory: { tables: {} } } as unknown as Parameters<typeof factsOf>[0])
    expect(none.embedding).toBeUndefined()
    expect(none.noSubsetting).toBeUndefined()
  })
})

describe('factsOf — 사실의 판(read)', () => {
  it('읽을 때마다 지금 판을 적는다 — "값이 있다" 가 아니라 "검사를 마쳤다" 로 판단하려고', () => {
    const bare = factsOf({ directory: { tables: {} } } as unknown as Parameters<typeof factsOf>[0])
    expect(bare.read).toBe(FACTS_VERSION)
    expect(bare.embedding).toBeUndefined() // OS/2 가 없는 정상 파일도 있다
    expect(bare.version).toBeUndefined()
  })
})
