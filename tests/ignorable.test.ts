import { describe, expect, it } from 'vitest'

import { isIgnorable, splitIgnorable, stripIgnorable } from '../src/lib/ignorable'
import { codePointsOf, normalizeText } from '../src/lib/svgText'

describe('ignorable — 폭 0 서식 문자', () => {
  it('묶음문자·폭 0 공백·소프트 하이픈·BOM·변형 선택자는 무시하고, 보통 글자는 아니다', () => {
    for (const code of [0x2060, 0x200b, 0x200d, 0x00ad, 0xfeff, 0xfe0f]) {
      expect(isIgnorable(code)).toBe(true)
    }
    for (const code of ['가'.codePointAt(0) ?? 0, 0x20, 0x2013, 0x2028]) {
      expect(isIgnorable(code)).toBe(false)
    }
  })

  it('한글 줄바꿈용 묶음문자를 뺀다 — 보이는 결과는 같다', () => {
    expect(stripIgnorable('10\u2060년\u2060차 엔\u2060지\u2060니\u2060어')).toBe('10년차 엔지니어')
  })

  it('run 텍스트와 커버리지 검사 둘 다 묶음문자를 안 본다', () => {
    expect(normalizeText('경\u2060력\u2060의')).toBe('경력의')
    const points = codePointsOf([
      {
        text: '경\u2060력',
        x: 0,
        y: 0,
        fontFamily: 'SUIT',
        fontWeight: 400,
        italic: false,
        fontSize: 10,
        letterSpacing: 0,
        fill: { r: 0, g: 0, b: 0 },
        opacity: 1
      }
    ])
    expect(points).not.toContain(0x2060)
  })
})

describe('splitIgnorable — 자릿수는 남긴다', () => {
  it('글자 앞의 묶음문자 수를 센다, 마지막 칸은 끝에 붙은 수', () => {
    expect(splitIgnorable('스\u2060타\u2060\u2060트')).toEqual({
      text: '스타트',
      gaps: [0, 1, 2, 0]
    })
    expect(splitIgnorable('\u2060가\u2060')).toEqual({ text: '가', gaps: [1, 1] })
    expect(splitIgnorable('abc')).toEqual({ text: 'abc', gaps: [0, 0, 0, 0] })
  })
})
