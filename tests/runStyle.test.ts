import { describe, expect, it } from 'vitest'

import { isItalicStyle, styleForRun, weightOfStyle } from '../src/lib/runStyle'
import { TextRunSource, TextSegment } from '../src/lib/types'

function segment(family: string, style: string, start: number, end: number): TextSegment {
  return {
    start,
    end,
    fontName: { family, style },
    fontSize: 14,
    fills: [{ r: 0, g: 0, b: 0, a: 1 }],
    letterSpacing: { unit: 'PIXELS', value: 0 },
    textDecoration: 'NONE',
    textCase: 'ORIGINAL',
    hyperlink: null
  }
}

function sourceWith(segments: TextSegment[]): TextRunSource {
  return { nodeId: '1:1', characters: '테스트', svg: '<svg/>', offset: { x: 0, y: 0 }, segments }
}

describe('styleForRun', () => {
  it('run 의 weight 와 맞는 세그먼트의 폰트를 고른다', () => {
    const source = sourceWith([
      segment('Pretendard', 'Bold', 0, 2),
      segment('Pretendard', 'Regular', 2, 6)
    ])

    expect(styleForRun(source, 700, false)).toEqual({ family: 'Pretendard', style: 'Bold' })
    expect(styleForRun(source, 400, false)).toEqual({ family: 'Pretendard', style: 'Regular' })
  })

  it('italic 이 일치하는 세그먼트를 우선한다', () => {
    const source = sourceWith([
      segment('Inter', 'Bold Italic', 0, 2),
      segment('Inter', 'Bold', 2, 4)
    ])

    expect(styleForRun(source, 700, true)).toEqual({ family: 'Inter', style: 'Bold Italic' })
    expect(styleForRun(source, 700, false)).toEqual({ family: 'Inter', style: 'Bold' })
  })

  it('맞는 weight 가 없으면 첫 세그먼트로 넘어간다', () => {
    const source = sourceWith([segment('Pretendard', 'Medium', 0, 6)])

    expect(styleForRun(source, 900, false)).toEqual({ family: 'Pretendard', style: 'Medium' })
  })

  it('세그먼트가 없으면 빈 이름을 돌려준다', () => {
    expect(styleForRun(sourceWith([]), 400, false)).toEqual({ family: '', style: '' })
  })
})

describe('weightOfStyle', () => {
  it('이름표를 weight 숫자로 바꾼다', () => {
    expect(weightOfStyle('Thin')).toBe(100)
    expect(weightOfStyle('ExtraLight')).toBe(200)
    expect(weightOfStyle('Regular')).toBe(400)
    expect(weightOfStyle('Medium')).toBe(500)
    expect(weightOfStyle('SemiBold')).toBe(600)
    expect(weightOfStyle('Bold')).toBe(700)
    expect(weightOfStyle('Extra Bold')).toBe(800)
    expect(weightOfStyle('Black')).toBe(900)
  })

  it('복합 이름에서 더 구체적인 쪽을 먼저 잡는다 — ExtraBold 는 Bold 가 아니다', () => {
    expect(weightOfStyle('ExtraBold Italic')).toBe(800)
    expect(weightOfStyle('Semi-Bold')).toBe(600)
  })

  it('모르는 이름은 400', () => {
    expect(weightOfStyle('Display')).toBe(400)
  })
})

describe('isItalicStyle', () => {
  it('italic·oblique 만 참', () => {
    expect(isItalicStyle('Bold Italic')).toBe(true)
    expect(isItalicStyle('Oblique')).toBe(true)
    expect(isItalicStyle('Bold')).toBe(false)
  })
})
