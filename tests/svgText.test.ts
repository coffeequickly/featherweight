import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

import {
  codePointsOf,
  parseColor,
  parseLetterSpacing,
  parseSvgText,
  normalizeText,
  parseWeight,
  stripLineBreaks
} from '../src/lib/svgText'

import {
  BOLD_HEADING,
  EXTRABOLD_HEADING,
  MULTI_LINE_WITH_BREAKS,
  SINGLE_LINE as REAL_SINGLE_LINE
} from './fixtures/figmaSvgText'

const parseXml = (svg: string): Document =>
  new JSDOM(svg, { contentType: 'image/svg+xml' }).window.document

const SINGLE_LINE = `<svg width="200" height="30" xmlns="http://www.w3.org/2000/svg">
<text fill="#1A1A1A" xml:space="preserve" style="white-space: pre" font-family="Pretendard Variable" font-size="14" font-weight="600" letter-spacing="0em"><tspan x="0" y="13.5">김철수</tspan></text>
</svg>`

const MULTI_LINE = `<svg width="400" height="60" xmlns="http://www.w3.org/2000/svg">
<text fill="black" font-family="Pretendard Variable" font-size="12" font-weight="400" letter-spacing="0em"><tspan x="0" y="11.5">첫 줄</tspan><tspan x="0" y="31.5">둘째 줄</tspan></text>
</svg>`

const MIXED_STYLE = `<svg width="400" height="30" xmlns="http://www.w3.org/2000/svg">
<text fill="#000000" font-family="Pretendard Variable" font-size="12" font-weight="700"><tspan x="0" y="11.5">굵게</tspan></text>
<text fill="#888888" font-family="Pretendard Variable" font-size="12" font-weight="400"><tspan x="40" y="11.5">보통</tspan></text>
</svg>`

const LETTER_SPACING = `<svg width="400" height="30" xmlns="http://www.w3.org/2000/svg">
<text fill="#000" font-family="Pretendard Variable" font-size="20" font-weight="400" letter-spacing="-0.02em"><tspan x="12.5" y="19">가운데</tspan></text>
</svg>`

describe('parseSvgText', () => {
  it('한 줄을 run 하나로 만든다', () => {
    const runs = parseSvgText(SINGLE_LINE, parseXml)
    expect(runs).toHaveLength(1)
    expect(runs[0].text).toBe('김철수')
    expect(runs[0].x).toBe(0)
    expect(runs[0].y).toBe(13.5)
    expect(runs[0].fontSize).toBe(14)
    expect(runs[0].fontWeight).toBe(600)
    expect(runs[0].fontFamily).toBe('Pretendard Variable')
  })

  it('줄마다 run 을 만들고 baseline y 를 그대로 쓴다', () => {
    const runs = parseSvgText(MULTI_LINE, parseXml)
    expect(runs.map((run) => run.text)).toEqual(['첫 줄', '둘째 줄'])
    expect(runs.map((run) => run.y)).toEqual([11.5, 31.5])
  })

  it('text 가 여러 개면 스타일이 각각 유지된다', () => {
    const runs = parseSvgText(MIXED_STYLE, parseXml)
    expect(runs).toHaveLength(2)
    expect(runs[0].fontWeight).toBe(700)
    expect(runs[1].fontWeight).toBe(400)
    expect(runs[1].x).toBe(40)
    expect(runs[1].fill.r).toBeCloseTo(0x88 / 255, 5)
  })

  it('자간을 px 로 환산한다', () => {
    const runs = parseSvgText(LETTER_SPACING, parseXml)
    expect(runs[0].letterSpacing).toBeCloseTo(-0.4, 5) // -0.02em × 20px
    expect(runs[0].x).toBe(12.5)
  })

  it('tspan 이 없으면 text 자체를 읽는다', () => {
    const runs = parseSvgText(
      '<svg xmlns="http://www.w3.org/2000/svg"><text x="3" y="10" font-size="11">직접</text></svg>',
      parseXml
    )
    expect(runs).toHaveLength(1)
    expect(runs[0].text).toBe('직접')
    expect(runs[0].y).toBe(10)
  })

  it('tspan 에 x 가 없으면 text 의 x 를 물려받는다', () => {
    const runs = parseSvgText(
      '<svg xmlns="http://www.w3.org/2000/svg"><text x="7" font-size="11"><tspan y="10">이어짐</tspan></text></svg>',
      parseXml
    )
    expect(runs[0].x).toBe(7)
  })

  it('빈 tspan 은 버린다', () => {
    const runs = parseSvgText(
      '<svg xmlns="http://www.w3.org/2000/svg"><text><tspan x="0" y="1"></tspan><tspan x="0" y="2">있음</tspan></text></svg>',
      parseXml
    )
    expect(runs).toHaveLength(1)
  })

  it('텍스트가 없는 SVG 는 빈 배열', () => {
    const runs = parseSvgText('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>', parseXml)
    expect(runs).toEqual([])
  })

  it('구조가 예상과 다르면 빈 배열 — 그 노드는 아웃라인으로 남는다', () => {
    expect(
      parseSvgText('not xml at all', () => {
        throw new Error('parse error')
      })
    ).toEqual([])
  })
})

describe('parseWeight', () => {
  it('숫자와 키워드를 모두 읽는다', () => {
    expect(parseWeight('600')).toBe(600)
    expect(parseWeight('bold')).toBe(700)
    expect(parseWeight('normal')).toBe(400)
    expect(parseWeight('weird')).toBe(400)
  })
})

describe('parseLetterSpacing', () => {
  it('em 은 폰트 크기를 곱한다', () => {
    expect(parseLetterSpacing('0.05em', 20, 0)).toBeCloseTo(1, 5)
  })

  it('px 은 그대로', () => {
    expect(parseLetterSpacing('2px', 20, 0)).toBe(2)
    expect(parseLetterSpacing('2', 20, 0)).toBe(2)
  })

  it('없으면 물려받은 값', () => {
    expect(parseLetterSpacing(null, 20, 3)).toBe(3)
  })
})

describe('parseColor', () => {
  it('#rrggbb', () => {
    expect(parseColor('#FF8000')).toEqual({ r: 1, g: 128 / 255, b: 0 })
  })

  it('#rgb 축약형', () => {
    expect(parseColor('#f80')).toEqual({ r: 1, g: 136 / 255, b: 0 })
  })

  it('rgb()', () => {
    expect(parseColor('rgb(255, 0, 0)')).toEqual({ r: 1, g: 0, b: 0 })
  })

  it('none 은 null', () => {
    expect(parseColor('none')).toBeNull()
  })

  it('모르는 값은 null', () => {
    expect(parseColor('hotpink')).toBeNull()
  })
})

describe('codePointsOf', () => {
  it('중복 없이 코드포인트를 모은다', () => {
    const runs = parseSvgText(MULTI_LINE, parseXml)
    const points = codePointsOf(runs)
    expect(points).toContain('첫'.codePointAt(0))
    expect(new Set(points).size).toBe(points.length)
  })
})

// ── 스파이크 S3: Figma 가 실제로 내보낸 구조 ──────────────────────────────
describe('실물 SVG (S3 픽스처)', () => {
  it('한 줄 — 좌표와 자간을 그대로 읽는다', () => {
    const runs = parseSvgText(REAL_SINGLE_LINE, parseXml)
    expect(runs).toHaveLength(1)
    expect(runs[0].text).toBe('1  /  5')
    expect(runs[0].x).toBeCloseTo(0.121718, 6)
    expect(runs[0].y).toBeCloseTo(7.13281, 5)
    expect(runs[0].fontSize).toBe(6)
    expect(runs[0].letterSpacing).toBeCloseTo(-0.06, 5) // -0.01em × 6px
  })

  it('fill="black" 을 검정으로 읽는다', () => {
    const runs = parseSvgText(REAL_SINGLE_LINE, parseXml)
    expect(runs[0].fill).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('font-weight="bold" → 700', () => {
    expect(parseSvgText(BOLD_HEADING, parseXml)[0].fontWeight).toBe(700)
  })

  it('font-weight="800" → 800', () => {
    expect(parseSvgText(EXTRABOLD_HEADING, parseXml)[0].fontWeight).toBe(800)
  })

  it('font-weight 가 없으면 400', () => {
    expect(parseSvgText(REAL_SINGLE_LINE, parseXml)[0].fontWeight).toBe(400)
  })

  it('tspan 안의 줄바꿈 찌꺼기를 지운다 — 이게 첫 내보내기를 망가뜨렸다', () => {
    const runs = parseSvgText(MULTI_LINE_WITH_BREAKS, parseXml)
    for (const run of runs) {
      expect(run.text).not.toMatch(/[\r\n\u2028\u2029]/)
    }
  })

  it('줄바꿈만 있던 tspan 은 사라진다', () => {
    const runs = parseSvgText(MULTI_LINE_WITH_BREAKS, parseXml)
    // 5개 tspan 중 LF 하나뿐인 줄(y=37.4883)은 빠진다
    expect(runs).toHaveLength(4)
    expect(runs.map((run) => run.y)).toEqual([7.48828, 17.4883, 27.4883, 47.4883])
  })

  it('줄마다 baseline y 가 다르다 — 우리가 조판하지 않는다', () => {
    const runs = parseSvgText(MULTI_LINE_WITH_BREAKS, parseXml)
    expect(new Set(runs.map((run) => run.y)).size).toBe(runs.length)
    expect(runs.every((run) => run.x === 0)).toBe(true)
  })
})

describe('normalizeText', () => {
  it('분해형 한글을 완성형으로 합친다 — 폰트에 자모 글리프가 없다', () => {
    const decomposed = '개발'.normalize('NFD')
    expect(decomposed.length).toBe(5) // ᄀ ᅢ ᄇ ᅡ ᆯ
    expect(normalizeText(decomposed)).toBe('개발')
    expect(normalizeText(decomposed).length).toBe(2)
  })

  it('줄바꿈도 같이 지운다', () => {
    expect(normalizeText('개발\n'.normalize('NFD'))).toBe('개발')
  })

  it('이미 완성형이면 그대로', () => {
    expect(normalizeText('개발')).toBe('개발')
  })
})

describe('stripLineBreaks', () => {
  it('LF·CR·U+2028·U+2029 를 지운다', () => {
    expect(stripLineBreaks('가\n나\r다\u2028라\u2029마')).toBe('가나다라마')
  })

  it('일반 공백은 남긴다', () => {
    expect(stripLineBreaks('1  /  5')).toBe('1  /  5')
  })
})
