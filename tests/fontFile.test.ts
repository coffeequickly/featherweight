import { describe, expect, it } from 'vitest'

import { FontFacts, screenFontFile, weightMismatch } from '../src/lib/fontFile'

const TTF: FontFacts = { tables: ['glyf', 'loca', 'cmap', 'head', 'OS/2'], axes: [] }

describe('screenFontFile', () => {
  it('static TTF 는 통과한다', () => {
    expect(screenFontFile(TTF)).toEqual({ ok: true })
  })

  it('OTF(CFF) 는 막는다 — 임베드하면 텍스트 추출이 통째로 실패한다', () => {
    const otf: FontFacts = { tables: ['CFF ', 'cmap', 'head'], axes: [] }
    const verdict = screenFontFile(otf)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason.code).toBe('fontFile.cff')
  })

  it("CFF 테이블 이름의 뒤쪽 공백('CFF ')을 흘리지 않는다", () => {
    expect(screenFontFile({ tables: ['CFF2'], axes: [] }).ok).toBe(false)
    expect(screenFontFile({ tables: ['CFF '], axes: [] }).ok).toBe(false)
  })

  it('가변 폰트는 막는다 — 축을 못 골라 엉뚱한 굵기가 박힌다', () => {
    const variable: FontFacts = { ...TTF, axes: ['wght'] }
    const verdict = screenFontFile(variable)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason.code).toBe('fontFile.variable')
  })

  it('glyf 도 CFF 도 없으면 쓸 수 없다', () => {
    const verdict = screenFontFile({ tables: ['cmap', 'head'], axes: [] })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason.code).toBe('fontFile.noOutlines')
  })

  it('CFF 와 가변이 겹치면 CFF 를 먼저 말한다 — .ttf 로 바꾸면 둘 다 풀린다', () => {
    const verdict = screenFontFile({ tables: ['CFF2'], axes: ['wght'] })
    if (!verdict.ok) expect(verdict.reason.code).toBe('fontFile.cff')
  })
})

describe('weightMismatch', () => {
  const facts = (weightClass: number, italic: boolean): FontFacts => ({
    ...TTF,
    weightClass,
    italic
  })

  it('맞으면 조용하다', () => {
    expect(weightMismatch(facts(700, false), { weight: 700, italic: false })).toEqual({
      differs: false
    })
  })

  it('Regular 파일을 Bold 자리에 넣으면 알려준다', () => {
    const result = weightMismatch(facts(400, false), { weight: 700, italic: false })
    expect(result.differs).toBe(true)
    if (result.differs) expect(result.fileWeight).toBe(400)
  })

  it('기울기가 다르면 알려준다', () => {
    expect(weightMismatch(facts(400, true), { weight: 400, italic: false }).differs).toBe(true)
  })

  it('옛 GDI 관행(Thin 250, ExtraLight 250/275)은 같은 것으로 본다', () => {
    expect(weightMismatch(facts(250, false), { weight: 100, italic: false }).differs).toBe(false)
    expect(weightMismatch(facts(250, false), { weight: 200, italic: false }).differs).toBe(false)
    expect(weightMismatch(facts(275, false), { weight: 200, italic: false }).differs).toBe(false)
  })

  it('파일이 굵기를 안 밝히면 트집 잡지 않는다', () => {
    expect(weightMismatch(TTF, { weight: 700, italic: false })).toEqual({ differs: false })
  })
})
