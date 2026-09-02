import { describe, expect, it } from 'vitest'

import { FontFileNames, looksLikeFamily, pickFontFile, staticFamily } from '../src/lib/fontFolder'

const file = (
  fileName: string,
  family: string,
  subfamily: string,
  weightClass?: number,
  italic?: boolean
): FontFileNames => ({ fileName, family, subfamily, weightClass, italic })

const HEAVY = { family: 'SUIT', style: 'Heavy', weight: 900, italic: false }

describe('looksLikeFamily', () => {
  it('파일명에 family 가 들어 있으면 후보다 — 대소문자·구분자는 무시', () => {
    expect(looksLikeFamily('SUIT-Heavy.ttf', 'SUIT')).toBe(true)
    expect(looksLikeFamily('suit_heavy.TTF', 'SUIT')).toBe(true)
    expect(looksLikeFamily('Pretendard-Bold.ttf', 'SUIT')).toBe(false)
  })

  it('가변 패밀리 이름의 꼬리는 떼고 본다', () => {
    expect(staticFamily('Pretendard Variable')).toBe('Pretendard')
    expect(looksLikeFamily('Pretendard-SemiBold.ttf', 'Pretendard Variable')).toBe(true)
  })
})

describe('pickFontFile', () => {
  it('family 와 style 이 정확히 맞는 파일', () => {
    const pick = pickFontFile(HEAVY, [
      file('SUIT-Bold.ttf', 'SUIT', 'Bold', 700, false),
      file('SUIT-Heavy.ttf', 'SUIT', 'Heavy', 900, false)
    ])
    expect(pick?.fileName).toBe('SUIT-Heavy.ttf')
  })

  it('옛 4-패밀리 이름("SUIT Heavy" / "Regular")도 알아본다', () => {
    const pick = pickFontFile(HEAVY, [file('SUIT-Heavy.ttf', 'SUIT Heavy', 'Regular', 900, false)])
    expect(pick?.fileName).toBe('SUIT-Heavy.ttf')
  })

  it('style 이름이 달라도 굵기·기울기가 맞으면 고른다 — 정확 일치가 있으면 그쪽이 먼저', () => {
    const byWeight = pickFontFile(HEAVY, [file('SUIT-Black.ttf', 'SUIT', 'Black', 900, false)])
    expect(byWeight?.fileName).toBe('SUIT-Black.ttf')

    const exactLater = pickFontFile(HEAVY, [
      file('SUIT-Black.ttf', 'SUIT', 'Black', 900, false),
      file('SUIT-Heavy.ttf', 'SUIT', 'Heavy', 900, false)
    ])
    expect(exactLater?.fileName).toBe('SUIT-Heavy.ttf')
  })

  it('기울기가 다르면 굵기가 같아도 안 고른다', () => {
    const pick = pickFontFile(HEAVY, [
      file('SUIT-HeavyItalic.ttf', 'SUIT', 'Heavy Italic', 900, true)
    ])
    expect(pick).toBeUndefined()
  })

  it('가변 패밀리로 부른 폰트에 static 파일을 맞춘다', () => {
    const pick = pickFontFile(
      { family: 'Pretendard Variable', style: 'SemiBold', weight: 600, italic: false },
      [file('Pretendard-SemiBold.ttf', 'Pretendard', 'SemiBold', 600, false)]
    )
    expect(pick?.fileName).toBe('Pretendard-SemiBold.ttf')
  })

  it('다른 family 는 절대 대신 넣지 않는다', () => {
    expect(
      pickFontFile(HEAVY, [file('Nexa-Heavy.ttf', 'Nexa', 'Heavy', 900, false)])
    ).toBeUndefined()
  })
})
