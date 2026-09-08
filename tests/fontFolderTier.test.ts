import { describe, expect, it } from 'vitest'

import {
  FontFileNames,
  matchTier,
  opticalSize,
  rankFontFiles,
  widthTerm
} from '../src/lib/fontFolder'

const file = (
  family: string,
  subfamily: string,
  weightClass?: number,
  italic?: boolean
): FontFileNames => ({
  fileName: `${family}-${subfamily}.ttf`,
  family,
  subfamily,
  weightClass,
  italic
})

const target = { family: 'Example', style: 'Regular', weight: 400, italic: false }

describe('matchTier', () => {
  it('0: family+style 정확 일치 (표기 차이만 무시)', () => {
    expect(matchTier(target, file('Example', 'Regular'))).toBe(0)
    expect(matchTier(target, file('example', 'regular'))).toBe(0)
    expect(matchTier({ ...target, family: 'Example Variable' }, file('Example', 'Regular'))).toBe(0)
  })

  it('1: 옛 4-패밀리 이름', () => {
    expect(
      matchTier({ ...target, style: 'Heavy', weight: 900 }, file('Example Heavy', 'Regular'))
    ).toBe(1)
  })

  it('2: 같은 family 에서 굵기·기울기만 맞음 — 다른 스타일 이름', () => {
    expect(matchTier(target, file('Example', 'Book', 400, false))).toBe(2)
    expect(matchTier(target, file('Example', 'Book', 700, false))).toBeNull()
    expect(matchTier(target, file('Example', 'Italic', 400, true))).toBeNull()
    expect(matchTier(target, file('Example', 'Book'))).toBeNull() // 굵기를 모르면 못 맞춘다
    expect(matchTier(target, file('Example', 'Condensed', 400, false))).toBeNull() // 폭이 다르면 다른 서체
  })

  it('다른 family 는 절대 아니다', () => {
    expect(matchTier(target, file('Examples', 'Regular', 400, false))).toBeNull()
  })
})

// 아래 이름표는 Google Fonts 다운로드의 static 파일에서 실제로 읽은 값이다 (2026-09-08):
//   · 폭 계열: OpenSans_Condensed-Bold.ttf  → ID16 "Open Sans Condensed" / ID17 "Bold"
//   · 광학 크기: Inter_18pt-SemiBold.ttf    → ID16 "Inter 18pt" / ID17 "SemiBold",
//                Inter_18pt-Black.ttf       → ID1 "Inter 18pt Black" / ID2 "Regular" (ID16 "Inter 18pt")
//   · Merriweather·Newsreader·Fraunces·Bodoni Moda·Inter 는 접미 없는 static 이 아예 없다
describe('opticalSize', () => {
  it('family 끝의 "18pt" 를 떼고 크기를 돌려준다', () => {
    expect(opticalSize('Inter 18pt')).toEqual({ base: 'Inter', opsz: 18 })
    expect(opticalSize('Merriweather 24pt')).toEqual({ base: 'Merriweather', opsz: 24 })
    expect(opticalSize('Inter 18pt Black')).toEqual({ base: 'Inter Black', opsz: 18 })
    expect(opticalSize('Newsreader 9pt')).toEqual({ base: 'Newsreader', opsz: 9 })
  })

  it('광학 크기가 아닌 이름은 그대로', () => {
    expect(opticalSize('DM Sans')).toEqual({ base: 'DM Sans' })
    expect(opticalSize('Source Serif 4')).toEqual({ base: 'Source Serif 4' })
    expect(opticalSize('Font2pt')).toEqual({ base: 'Font2pt' })
  })
})

describe('widthTerm', () => {
  it('폭 이름을 찾고, 긴 이름을 짧은 이름으로 오인하지 않는다', () => {
    expect(widthTerm('condensedbold')).toBe('condensed')
    expect(widthTerm('semicondensedlightitalic')).toBe('semicondensed')
    expect(widthTerm('bold')).toBe('')
  })
})

describe('matchTier — 이름표 전체가 같은 경우 (1)', () => {
  it('Google 의 폭 계열 static: Figma "Open Sans"/"Condensed Bold" ↔ 파일 "Open Sans Condensed"/"Bold"', () => {
    const wanted = { family: 'Open Sans', style: 'Condensed Bold', weight: 700, italic: false }
    expect(matchTier(wanted, file('Open Sans Condensed', 'Bold', 700, false))).toBe(1)
    expect(matchTier(wanted, file('Open Sans Condensed', 'Regular', 400, false))).toBeNull()
    // static 을 설치해 Figma 가 "Open Sans Condensed" 라고 부르는 쪽도 맞는다
    const installed = { family: 'Open Sans Condensed', style: 'Bold', weight: 700, italic: false }
    expect(matchTier(installed, file('Open Sans Condensed', 'Bold', 700, false))).toBe(0)
    expect(matchTier(installed, file('Open Sans', 'Condensed Bold', 700, false))).toBe(1)
  })

  it('광학 크기 static: Figma "Inter"/"SemiBold" ↔ 파일 "Inter 18pt"/"SemiBold"', () => {
    const wanted = { family: 'Inter', style: 'SemiBold', weight: 600, italic: false }
    expect(matchTier(wanted, file('Inter 18pt', 'SemiBold', 600, false))).toBe(1)
    expect(matchTier(wanted, file('Inter 28pt', 'SemiBold', 600, false))).toBe(1)
    // 옛 4-패밀리 이름표(ID1/ID2)로 읽혀도
    expect(
      matchTier(
        { ...wanted, style: 'Black', weight: 900 },
        file('Inter 18pt Black', 'Regular', 900, false)
      )
    ).toBe(1)
    expect(
      matchTier(
        { ...wanted, style: 'Regular', weight: 400 },
        file('Merriweather 24pt', 'Regular', 400, false)
      )
    ).toBeNull() // 다른 family
    expect(
      matchTier(
        { family: 'Merriweather', style: 'Regular', weight: 400, italic: false },
        file('Merriweather 24pt', 'Regular', 400, false)
      )
    ).toBe(1)
  })

  it('static 을 설치해 Figma 가 "Inter 18pt" 라고 부르면 그 파일이 정확 일치다', () => {
    const installed = { family: 'Inter 18pt', style: 'SemiBold', weight: 600, italic: false }
    expect(matchTier(installed, file('Inter 18pt', 'SemiBold', 600, false))).toBe(0)
    expect(matchTier(installed, file('Inter 24pt', 'SemiBold', 600, false))).toBeNull()
  })
})

describe('matchTier — 굵기만 같은 경우 (2) 는 폭이 같아야 한다', () => {
  it('"Condensed Bold" 자리에 보통 폭 Bold 를 넣지 않는다 — 반대도', () => {
    const condensed = { family: 'Open Sans', style: 'Condensed Bold', weight: 700, italic: false }
    expect(matchTier(condensed, file('Open Sans', 'Bold', 700, false))).toBeNull()
    const normal = { family: 'Open Sans', style: 'Bold', weight: 700, italic: false }
    expect(matchTier(normal, file('Open Sans', 'Condensed Bold', 700, false))).toBeNull()
    expect(matchTier(normal, file('Open Sans', 'Book', 700, false))).toBe(2) // 이름표만 다른 파일
  })

  it('폭 계열 파일이 있으면 그것이 보통 폭 Bold 보다 앞선다', () => {
    const wanted = { family: 'Roboto', style: 'Condensed Bold', weight: 700, italic: false }
    const ranked = rankFontFiles(wanted, [
      file('Roboto', 'Bold', 700, false),
      file('Roboto Condensed', 'Bold', 700, false)
    ]).map((f) => f.fileName)
    expect(ranked).toEqual(['Roboto Condensed-Bold.ttf'])
  })

  it('접미 없는 static 이 있으면 광학 크기 인스턴스보다 앞선다', () => {
    const wanted = { family: 'DM Sans', style: 'SemiBold', weight: 600, italic: false }
    const ranked = rankFontFiles(wanted, [
      file('DM Sans 18pt', 'SemiBold', 600, false),
      file('DM Sans', 'SemiBold', 600, false)
    ]).map((f) => f.fileName)
    expect(ranked).toEqual(['DM Sans-SemiBold.ttf', 'DM Sans 18pt-SemiBold.ttf'])
  })
})
