import { describe, expect, it } from 'vitest'

import { needsShaping } from '../src/lib/shaping'

describe('needsShaping', () => {
  it('아랍·히브리·태국·데바나가리는 통째로 배치해야 한다', () => {
    for (const s of ['مرحبا', 'שלום', 'สวัสดี', 'नमस्ते']) expect(needsShaping(s)).toBe(true)
  })

  it('라틴·한글·가나·한자·키릴은 글자 단위로 그려도 된다', () => {
    for (const s of ['Hello', '안녕', 'こんにちは', '漢字', 'Привет', '1 → 5']) {
      expect(needsShaping(s)).toBe(false)
    }
  })
})
