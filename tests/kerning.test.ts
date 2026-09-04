import { describe, expect, it } from 'vitest'

import { kernAdjustments } from '../src/lib/kerning'

describe('kernAdjustments', () => {
  it('실제 전진폭이 글리프 폭보다 짧으면 그만큼 당기는 양수, 마지막 글리프 뒤에는 없다', () => {
    // upm 1000: "AV" 에서 A 의 폭 700, 커닝 뒤 전진 640 → 60 당김
    expect(kernAdjustments([700, 650], [640, 650], 1000)).toEqual([60])
  })

  it('폰트 단위를 1/1000 텍스트 공간으로 바꾼다 (upm 2048)', () => {
    expect(kernAdjustments([1024, 1024, 1024], [922, 1024, 1024], 2048)).toEqual([50, 0])
  })

  it('글리프 하나면 빈 배열', () => {
    expect(kernAdjustments([500], [500], 1000)).toEqual([])
  })
})
