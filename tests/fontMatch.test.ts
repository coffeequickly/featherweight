import { formatReason } from '../src/lib/i18n'
import { describe, expect, it } from 'vitest'

import { matchFont, unmatchedRefs } from '../src/lib/fontMatch'
import { StoredFont } from '../src/lib/types'

function stored(family: string, style: string, weight: number): StoredFont {
  return {
    family,
    style,
    weight,
    italic: false,
    byteLength: 600_000,
    numGlyphs: 3555,
    codePoints: 2913,
    fileName: `${family}-${style}.ttf`
  }
}

const AVAILABLE = [
  stored('Pretendard Variable', 'Regular', 400),
  stored('Pretendard Variable', 'Bold', 700)
]

describe('matchFont', () => {
  it('family + style 이 정확히 맞으면 통과', () => {
    const result = matchFont({ family: 'Pretendard Variable', style: 'Bold' }, AVAILABLE)
    expect(result.ok).toBe(true)
  })

  it('weight 를 근사 매칭하지 않는다 — Bold 를 SemiBold 로 그리면 안 된다', () => {
    const result = matchFont({ family: 'Pretendard Variable', style: 'SemiBold' }, AVAILABLE)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.kind).toBe('style-missing')
      expect(formatReason(result.reason)).toContain('Regular')
    }
  })

  it('family 가 없으면 no-file', () => {
    const result = matchFont({ family: 'Noto Sans KR', style: 'Regular' }, AVAILABLE)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.kind).toBe('no-file')
  })

  it('보관된 폰트가 없으면 실패', () => {
    expect(matchFont({ family: 'Any', style: 'Regular' }, []).ok).toBe(false)
  })
})

describe('unmatchedRefs', () => {
  it('파일이 없는 것만, 중복 없이 돌려준다', () => {
    const missing = unmatchedRefs(
      [
        { family: 'Pretendard Variable', style: 'Regular' },
        { family: 'Pretendard Variable', style: 'SemiBold' },
        { family: 'Pretendard Variable', style: 'SemiBold' }
      ],
      AVAILABLE
    )
    expect(missing).toEqual([{ family: 'Pretendard Variable', style: 'SemiBold' }])
  })

  it('전부 있으면 빈 배열', () => {
    expect(unmatchedRefs([{ family: 'Pretendard Variable', style: 'Bold' }], AVAILABLE)).toEqual([])
  })
})
