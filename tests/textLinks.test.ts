import { describe, expect, it } from 'vitest'

import { linkSpansForRun } from '../src/lib/textLinks'
import { TextSegment } from '../src/lib/types'

function segment(start: number, end: number, url: string | null): TextSegment {
  return {
    start,
    end,
    fontName: { family: 'Inter', style: 'Regular' },
    fontSize: 12,
    fills: [{ r: 0, g: 0, b: 0, a: 1 }],
    letterSpacing: { unit: 'PERCENT', value: 0 },
    textDecoration: 'NONE',
    textCase: 'ORIGINAL',
    hyperlink: url === null ? null : { type: 'URL', value: url }
  }
}

describe('linkSpansForRun', () => {
  const characters = 'See our site for details'

  it('run 의 글자를 원문에서 찾아 그 구간에 걸린 링크만 run 기준으로 돌려준다', () => {
    const segments = [segment(0, 8, null), segment(8, 12, 'https://x.io'), segment(12, 24, null)]
    const { spans, next } = linkSpansForRun(characters, 0, 'See our site', segments)
    expect(spans).toEqual([{ start: 8, end: 12, url: 'https://x.io' }])
    expect(next).toBe(12)
  })

  it('커서 뒤에서 찾는다 — 같은 글자가 앞에 또 있어도 다음 run 은 이어진 자리', () => {
    const text = 'go go'
    const segments = [segment(0, 2, null), segment(3, 5, 'https://y.io')]
    const first = linkSpansForRun(text, 0, 'go', segments)
    const second = linkSpansForRun(text, first.next, 'go', segments)
    expect(first.spans).toEqual([])
    expect(second.spans).toEqual([{ start: 0, end: 2, url: 'https://y.io' }])
  })

  it('굵기 때문에 갈라진 같은 URL 세그먼트는 한 구간으로', () => {
    const segments = [segment(0, 4, 'https://z.io'), segment(4, 8, 'https://z.io')]
    expect(linkSpansForRun(characters, 0, 'See our ', segments).spans).toEqual([
      { start: 0, end: 8, url: 'https://z.io' }
    ])
  })

  it('원문에서 못 찾으면(대소문자 변환 등) 링크를 넣지 않고 커서도 그대로', () => {
    const segments = [segment(0, 24, 'https://x.io')]
    expect(linkSpansForRun(characters, 0, 'SEE OUR', segments)).toEqual({ spans: [], next: 0 })
  })

  it('빈 URL·링크 없는 세그먼트는 무시', () => {
    const segments = [segment(0, 24, '')]
    expect(linkSpansForRun(characters, 0, 'See', segments).spans).toEqual([])
  })
})
