import { describe, expect, it } from 'vitest'

import {
  aggregateFontUsage,
  fontsJsonDraft,
  guessWeight,
  isItalic,
  suggestFileName,
  summarizeMissing
} from '../src/lib/fontInventory'
import { RawFontSegment } from '../src/lib/types'

function seg(family: string, style: string, nodeId: string, charCount: number): RawFontSegment {
  return { family, style, nodeId, charCount }
}

describe('guessWeight', () => {
  it('흔한 style 이름을 weight 로 바꾼다', () => {
    expect(guessWeight('Regular')).toBe(400)
    expect(guessWeight('Bold')).toBe(700)
    expect(guessWeight('SemiBold')).toBe(600)
    expect(guessWeight('Medium')).toBe(500)
    expect(guessWeight('Light')).toBe(300)
    expect(guessWeight('Black')).toBe(900)
  })

  it('띄어쓰기·하이픈·대소문자를 무시한다', () => {
    expect(guessWeight('Extra Bold')).toBe(800)
    expect(guessWeight('extra-light')).toBe(200)
    expect(guessWeight('DemiBold Italic')).toBe(600)
  })

  it('semibold 를 bold 로 잘못 읽지 않는다', () => {
    expect(guessWeight('SemiBold')).not.toBe(700)
    expect(guessWeight('ExtraBold')).toBe(800)
  })

  it('숫자로 오는 style 을 그대로 쓴다', () => {
    expect(guessWeight('700')).toBe(700)
    expect(guessWeight('300 Italic')).toBe(300)
  })

  it('모르는 style 은 400', () => {
    expect(guessWeight('Condensed')).toBe(400)
  })
})

describe('isItalic', () => {
  it('italic / oblique 를 잡는다', () => {
    expect(isItalic('Bold Italic')).toBe(true)
    expect(isItalic('Oblique')).toBe(true)
    expect(isItalic('Bold')).toBe(false)
  })
})

describe('aggregateFontUsage', () => {
  it('family+style 이 같으면 합치고 노드 수는 중복 없이 센다', () => {
    const out = aggregateFontUsage([
      seg('Pretendard', 'Bold', 'n1', 10),
      seg('Pretendard', 'Bold', 'n1', 5), // 같은 노드 안 두 번째 세그먼트
      seg('Pretendard', 'Bold', 'n2', 3)
    ])
    expect(out).toHaveLength(1)
    expect(out[0].nodeCount).toBe(2)
    expect(out[0].charCount).toBe(18)
  })

  it('style 이 다르면 다른 줄', () => {
    const out = aggregateFontUsage([
      seg('Pretendard', 'Bold', 'n1', 1),
      seg('Pretendard', 'Regular', 'n2', 1)
    ])
    expect(out).toHaveLength(2)
  })

  it('많이 쓴 폰트가 위로 온다', () => {
    const out = aggregateFontUsage([
      seg('Pretendard', 'Bold', 'n1', 10),
      seg('Pretendard', 'Regular', 'n2', 100)
    ])
    expect(out.map((f) => f.style)).toEqual(['Regular', 'Bold'])
  })

  it('family 의 공백 때문에 다른 폰트가 합쳐지지 않는다', () => {
    const out = aggregateFontUsage([
      seg('Pretendard Variable', 'Bold', 'n1', 1),
      seg('Pretendard', 'Variable Bold', 'n2', 1)
    ])
    expect(out).toHaveLength(2)
  })

  it('빈 입력은 빈 배열', () => {
    expect(aggregateFontUsage([])).toEqual([])
  })

  it('노드 id 를 중복 없이 들고 나간다 — 체크리스트가 아웃라인될 노드를 합쳐 센다', () => {
    const out = aggregateFontUsage([
      seg('Pretendard', 'Bold', 'n1', 1),
      seg('Pretendard', 'Bold', 'n1', 1),
      seg('Pretendard', 'Bold', 'n2', 1)
    ])
    expect(out[0].nodeIds).toEqual(['n1', 'n2'])
  })
})

describe('suggestFileName', () => {
  it('공백을 없애고 확장자를 붙인다', () => {
    expect(suggestFileName({ family: 'Pretendard', style: 'SemiBold' })).toBe(
      'Pretendard-SemiBold.ttf'
    )
    expect(suggestFileName({ family: 'Noto Sans KR', style: 'Bold Italic' })).toBe(
      'NotoSansKR-BoldItalic.ttf'
    )
  })

  it('family 끝의 Variable / VF 는 떼고 static 파일명을 제안한다 (PRD FR-7: static만)', () => {
    expect(suggestFileName({ family: 'Pretendard Variable', style: 'SemiBold' })).toBe(
      'Pretendard-SemiBold.ttf'
    )
    expect(suggestFileName({ family: 'Noto Sans KR VF', style: 'Bold' })).toBe(
      'NotoSansKR-Bold.ttf'
    )
  })

  it('이름 가운데의 Variable 은 건드리지 않는다', () => {
    expect(suggestFileName({ family: 'Variable Sans', style: 'Bold' })).toBe(
      'VariableSans-Bold.ttf'
    )
  })
})

describe('fontsJsonDraft', () => {
  it('FR-7 의 fonts.json 스키마로 뽑는다', () => {
    const draft = fontsJsonDraft(
      aggregateFontUsage([
        seg('Pretendard', 'Bold', 'n1', 3),
        seg('Pretendard', 'Regular', 'n2', 9)
      ])
    )
    expect(JSON.parse(draft)).toEqual([
      {
        family: 'Pretendard',
        style: 'Regular',
        weight: 400,
        italic: false,
        file: 'Pretendard-Regular.ttf'
      },
      {
        family: 'Pretendard',
        style: 'Bold',
        weight: 700,
        italic: false,
        file: 'Pretendard-Bold.ttf'
      }
    ])
  })
})

describe('summarizeMissing', () => {
  it('하나면 이름만', () => {
    expect(summarizeMissing(['Nexa Heavy'])).toEqual({ first: 'Nexa Heavy', rest: 0 })
  })

  it('여러 개면 첫 이름과 나머지 개수', () => {
    expect(summarizeMissing(['Nexa Heavy', 'Suit Thin', 'Gilroy Bold'])).toEqual({
      first: 'Nexa Heavy',
      rest: 2
    })
  })

  it('이름 하나가 길면 거기서 자른다 — 뒤에 붙는 안내가 살아야 한다', () => {
    const long = 'Helvetica Neue Condensed Black Oblique'
    const result = summarizeMissing([long, 'B'])
    expect(result.first.length).toBeLessThanOrEqual(22)
    expect(result.first.endsWith('…')).toBe(true)
    expect(result.rest).toBe(1)
  })

  it('빈 목록에도 죽지 않는다', () => {
    expect(summarizeMissing([])).toEqual({ first: '', rest: 0 })
  })

  it('자른 자리에 공백을 남기지 않는다', () => {
    // 자르는 자리가 공백이면 그 공백까지 떼고 … 를 붙인다
    expect(summarizeMissing(['Some Very Long Name Here'], 11).first).toBe('Some Very…')
  })
})
