import { describe, expect, it } from 'vitest'

import {
  embeddingForbidden,
  FontFacts,
  parseFontVersion,
  screenFontFile,
  weightMismatch
} from '../src/lib/fontFile'

const TTF: FontFacts = { tables: ['glyf', 'loca', 'cmap', 'head', 'OS/2'], axes: [] }

describe('screenFontFile', () => {
  it('static TTF 는 통과한다', () => {
    expect(screenFontFile(TTF)).toEqual({ ok: true })
  })

  it('OTF(CFF) 도 통과한다 — 어댑터가 CFF 라벨로 쓰게 된 2.3 부터', () => {
    const otf: FontFacts = { tables: ['CFF ', 'cmap', 'head'], axes: [] }
    expect(screenFontFile(otf).ok).toBe(true)
  })

  it("CFF 테이블 이름의 뒤쪽 공백('CFF ')을 흘리지 않는다", () => {
    expect(screenFontFile({ tables: ['CFF2'], axes: [] }).ok).toBe(true)
    expect(screenFontFile({ tables: ['CFF '], axes: [] }).ok).toBe(true)
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

  it('CFF 라도 가변이면 막는다', () => {
    const verdict = screenFontFile({ tables: ['CFF2'], axes: ['wght'] })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason.code).toBe('fontFile.variable')
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

describe('parseFontVersion', () => {
  it('name 테이블의 버전 문자열에서 숫자만 남긴다', () => {
    expect(parseFontVersion('Version 3.019;git-0a5106e0b')).toBe('3.019')
    expect(parseFontVersion('4.001;git-66647c0bb')).toBe('4.001')
    expect(parseFontVersion('Version 1.3.9')).toBe('1.3.9')
  })

  it('숫자가 없거나 비어 있으면 undefined', () => {
    expect(parseFontVersion('Version')).toBeUndefined()
    expect(parseFontVersion(undefined)).toBeUndefined()
  })
})

describe('screenFontFile — 임베드 허용 플래그(OS/2 fsType)', () => {
  it('Restricted 만 있는 파일과 비트맵 전용은 거절한다 — Acrobat·브라우저와 같은 규칙', () => {
    const restricted = screenFontFile({ ...TTF, embedding: 'restricted' })
    expect(restricted.ok).toBe(false)
    if (!restricted.ok) expect(restricted.reason.code).toBe('fontFile.restricted')
    const bitmap = screenFontFile({ ...TTF, embedding: 'bitmap-only' })
    expect(bitmap.ok).toBe(false)
    if (!bitmap.ok) expect(bitmap.reason.code).toBe('fontFile.bitmapOnly')
  })

  it('Preview & Print·Editable·Installable 은 통과 — PDF 로 보고 인쇄하라는 허용이 바로 그것이다', () => {
    for (const embedding of ['preview', 'editable', 'installable'] as const) {
      expect(screenFontFile({ ...TTF, embedding })).toEqual({ ok: true })
    }
  })

  it('플래그를 모르면(옛 항목) 막지 않는다', () => {
    expect(screenFontFile(TTF)).toEqual({ ok: true })
    expect(embeddingForbidden(TTF)).toBeNull()
  })

  it('가변 폰트 검사가 먼저다 — 둘 다면 가변으로 말한다', () => {
    const verdict = screenFontFile({ ...TTF, axes: ['wght'], embedding: 'restricted' })
    if (!verdict.ok) expect(verdict.reason.code).toBe('fontFile.variable')
  })
})
