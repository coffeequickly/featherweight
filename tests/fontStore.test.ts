import { describe, expect, it } from 'vitest'

import {
  findStored,
  fitsWithin,
  fontStorageKey,
  formatBytes,
  remainingBytes,
  removeFont,
  upsertFont,
  usedBytes
} from '../src/lib/fontStore'
import { CLIENT_STORAGE_LIMIT, StoredFont } from '../src/lib/types'

function stored(family: string, style: string, weight: number, byteLength: number): StoredFont {
  return {
    family,
    style,
    weight,
    italic: false,
    byteLength,
    numGlyphs: 3555,
    codePoints: 2913,
    fileName: `${family}-${style}.ttf`
  }
}

const MB = 1024 * 1024

describe('fontStorageKey', () => {
  it('공백·기호를 지운 키를 만든다', () => {
    expect(fontStorageKey({ family: 'Pretendard Variable', style: 'SemiBold' })).toBe(
      'sheaf.font.PretendardVariable.SemiBold'
    )
  })

  it('family 와 style 이 다르면 키가 다르다', () => {
    const a = fontStorageKey({ family: 'Pretendard Variable', style: 'Bold' })
    const b = fontStorageKey({ family: 'Pretendard', style: 'Variable Bold' })
    expect(a).not.toBe(b)
  })
})

describe('upsertFont', () => {
  it('같은 family+style 은 덮어쓴다', () => {
    const before = [stored('Pretendard Variable', 'Bold', 700, 100)]
    const after = upsertFont(before, stored('Pretendard Variable', 'Bold', 700, 200))
    expect(after).toHaveLength(1)
    expect(after[0].byteLength).toBe(200)
  })

  it('다른 style 은 추가하고 weight 순으로 정렬한다', () => {
    const after = upsertFont(
      [stored('Pretendard Variable', 'Bold', 700, 1)],
      stored('Pretendard Variable', 'Regular', 400, 1)
    )
    expect(after.map((f) => f.weight)).toEqual([400, 700])
  })
})

describe('removeFont / findStored', () => {
  it('지운 폰트는 못 찾는다', () => {
    const before = [stored('Pretendard Variable', 'Bold', 700, 1)]
    const ref = { family: 'Pretendard Variable', style: 'Bold' }
    expect(findStored(before, ref)).toBeDefined()
    expect(findStored(removeFont(before, ref), ref)).toBeUndefined()
  })
})

describe('usedBytes / remainingBytes', () => {
  it('바이트를 합산한다', () => {
    const fonts = [stored('P', 'Regular', 400, 600_000), stored('P', 'Bold', 700, 610_000)]
    expect(usedBytes(fonts)).toBe(1_210_000)
    expect(remainingBytes(fonts)).toBe(CLIENT_STORAGE_LIMIT - 1_210_000)
  })

  it('한도를 넘겨도 남은 용량은 음수가 되지 않는다', () => {
    expect(remainingBytes([stored('P', 'Regular', 400, 6 * MB)])).toBe(0)
  })
})

describe('fitsWithin', () => {
  it('5MB 안이면 들어간다 — 서브셋한 4종(각 610KB)은 여유가 있다', () => {
    const fonts = [
      stored('P', 'Regular', 400, 606_536),
      stored('P', 'SemiBold', 600, 607_400),
      stored('P', 'Bold', 700, 610_020)
    ]
    expect(fitsWithin(fonts, { family: 'P', style: 'ExtraBold' }, 618_740)).toBe(true)
  })

  it('서브셋 안 한 원본 4종(각 3.1MB)은 안 들어간다', () => {
    const fonts = [stored('P', 'Regular', 400, 3_122_100)]
    expect(fitsWithin(fonts, { family: 'P', style: 'Bold' }, 3_147_588)).toBe(false)
  })

  it('같은 자리를 덮어쓸 때는 기존 바이트를 빼고 계산한다', () => {
    const fonts = [stored('P', 'Regular', 400, 4 * MB)]
    expect(fitsWithin(fonts, { family: 'P', style: 'Regular' }, 4 * MB)).toBe(true)
    expect(fitsWithin(fonts, { family: 'P', style: 'Bold' }, 4 * MB)).toBe(false)
  })
})

describe('formatBytes', () => {
  it('단위를 바꿔 읽는다', () => {
    expect(formatBytes(512)).toBe('512B')
    expect(formatBytes(606_536)).toBe('592KB')
    expect(formatBytes(2_442_696)).toBe('2.3MB')
    expect(formatBytes(CLIENT_STORAGE_LIMIT)).toBe('5.0MB')
  })
})
