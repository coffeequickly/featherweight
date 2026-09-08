import { describe, expect, it } from 'vitest'

import {
  FontFileNames,
  looksLikeFamily,
  normalizeName,
  pickFontFile,
  rankFontFiles,
  staticFamily
} from '../src/lib/fontFolder'

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

describe('normalizeName — 허용한 표기 차이만 지운다', () => {
  it('대소문자·공백·하이픈·밑줄만 무시한다', () => {
    expect(normalizeName('Semi Bold')).toBe(normalizeName('SemiBold'))
    expect(normalizeName('semi-bold')).toBe(normalizeName('Semi_Bold'))
    expect(normalizeName('Nanum Gothic')).toBe(normalizeName('NanumGothic'))
  })

  it('그 밖의 글자는 남긴다 — 다른 이름이 같은 키로 뭉치면 안 된다', () => {
    expect(normalizeName('游ゴシック')).not.toBe(normalizeName('ヒラギノ角ゴ'))
    expect(normalizeName('游ゴシック')).not.toBe('')
    expect(normalizeName('A.B')).not.toBe(normalizeName('AB'))
    expect(normalizeName('Inter')).not.toBe(normalizeName('Inter Display'))
  })
})

describe('rankFontFiles', () => {
  const target = { family: 'Helvetica Neue', style: 'Bold', weight: 700, italic: false }

  it('정확 일치 → 옛 이름 → 굵기·기울기 순으로 늘어놓고, 같은 등급은 넘어온 순서', () => {
    const exactA = file('a.ttf', 'Helvetica Neue', 'Bold', 700)
    const legacy = file('b.ttf', 'Helvetica Neue Bold', 'Regular', 700)
    const byWeight = file('c.ttf', 'Helvetica Neue', 'Heavy', 700, false)
    const exactB = file('d.ttf', 'Helvetica Neue', 'Bold', 700)
    const other = file('e.ttf', 'Helvetica', 'Bold', 700)
    expect(
      rankFontFiles(target, [byWeight, legacy, exactA, other, exactB]).map((f) => f.fileName)
    ).toEqual(['a.ttf', 'd.ttf', 'b.ttf', 'c.ttf'])
  })

  it('아무것도 안 맞으면 빈 배열', () => {
    expect(rankFontFiles(target, [file('e.ttf', 'Helvetica', 'Bold', 700)])).toEqual([])
  })
})
