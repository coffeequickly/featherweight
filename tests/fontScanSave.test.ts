import { describe, expect, it } from 'vitest'

import { setLocale } from '../src/lib/i18n'
import { fontKey } from '../src/lib/fontInventory'
import { FontUsage, StoredFont } from '../src/lib/types'
import { FoundFont, ScanResult } from '../src/ui/fontFolder'
import { SaveDeps, saveFoundFonts, scanDetailLines, scanSummary } from '../src/ui/fontScanSave'

const usage = (family: string, style: string): FontUsage => ({
  family,
  style,
  weight: 400,
  italic: false,
  nodeCount: 1,
  charCount: 10,
  nodeIds: ['1:1']
})

const stored = (family: string, style: string): StoredFont => ({
  family,
  style,
  weight: 400,
  italic: false,
  byteLength: 100,
  numGlyphs: 10,
  codePoints: 10,
  fileName: `${family}-${style}.ttf`
})

function found(fileName: string, alternatives = 0): FoundFont {
  return {
    fileName,
    family: 'X',
    subfamily: 'Regular',
    bytes: new Uint8Array([1, 2, 3]),
    probe: { numGlyphs: 10, characterSet: [1, 2] } as unknown as FoundFont['probe'],
    facts: { tables: ['glyf'], axes: [] },
    tier: 0,
    alternatives,
    missingGlyphs: 0
  }
}

function scan(entries: Array<[FontUsage, FoundFont]>, extra: Partial<ScanResult> = {}): ScanResult {
  return {
    found: new Map(entries.map(([font, match]) => [fontKey(font), match])),
    reasons: new Map(),
    unreadable: 0,
    brokenFaces: 0,
    unread: 0,
    memoryCapped: false,
    ...extra
  }
}

/** 통과시키는 검사 + 기록하는 저장 */
function deps(overrides: Partial<SaveDeps> = {}): SaveDeps & { sent: string[] } {
  const sent: string[] = []
  return {
    sent,
    screen: async (match, font) => ({
      ok: true,
      save: { font: stored(font.family, font.style), bytes: match.bytes }
    }),
    save: async (request) => {
      sent.push(fontKey(request.font))
      return { ok: true }
    },
    upsert: (have, font) => [...have, font],
    ...overrides
  }
}

describe('saveFoundFonts', () => {
  it('저장 응답이 ok 일 때만 센다 — 응답 순서대로 한도 목록에 넣는다', async () => {
    const a = usage('A', 'Regular')
    const b = usage('B', 'Regular')
    const d = deps()
    const outcome = await saveFoundFonts(
      scan([
        [a, found('a.ttf')],
        [b, found('b.ttf', 2)]
      ]),
      [a, b],
      [],
      d
    )
    expect(outcome).toMatchObject({ saved: 2, failed: 0, alternatives: 1, lastError: '' })
    expect(outcome.savedKeys).toEqual([fontKey(a), fontKey(b)])
    expect(outcome.failures.size).toBe(0)
    expect(d.sent).toEqual([fontKey(a), fontKey(b)])
  })

  it('메인이 실패를 돌려주면 실패로 세고 사유를 남긴다', async () => {
    const a = usage('A', 'Regular')
    const d = deps({ save: async () => ({ ok: false, error: 'quota exceeded' }) })
    const outcome = await saveFoundFonts(scan([[a, found('a.ttf')]]), [a], [], d)
    expect(outcome).toMatchObject({
      saved: 0,
      failed: 1,
      alternatives: 0,
      lastError: 'quota exceeded'
    })
    // 압축본은 남긴다 — 공간을 비운 뒤 다시 스캔 없이 넣으려고
    expect(outcome.failures.get(fontKey(a))).toMatchObject({
      fileName: 'a.ttf',
      error: 'quota exceeded',
      storage: false
    })
    expect(outcome.failures.get(fontKey(a))?.request?.bytes).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('응답이 없으면(타임아웃) 성공으로 세지 않는다', async () => {
    setLocale('en')
    const a = usage('A', 'Regular')
    const d = deps({ save: async () => undefined })
    const outcome = await saveFoundFonts(scan([[a, found('a.ttf')]]), [a], [], d)
    expect(outcome.saved).toBe(0)
    expect(outcome.failed).toBe(1)
    expect(outcome.lastError).toBe('no reply from the plugin')
    expect(outcome.failures.get(fontKey(a))?.request).toBeDefined()
  })

  it('검사에서 막힌 파일(한도·형식)은 저장을 보내지 않고, 공간 부족은 압축본과 함께 남긴다', async () => {
    const a = usage('A', 'Regular')
    const b = usage('B', 'Regular')
    const d = deps({
      screen: async (match, font) =>
        font.family === 'A'
          ? {
              ok: false,
              message: 'storage full',
              storage: true,
              save: { font: stored(font.family, font.style), bytes: match.bytes }
            }
          : { ok: true, save: { font: stored(font.family, font.style), bytes: match.bytes } }
    })
    const outcome = await saveFoundFonts(
      scan([
        [a, found('a.ttf')],
        [b, found('b.ttf')]
      ]),
      [a, b],
      [],
      d
    )
    expect(outcome).toMatchObject({
      saved: 1,
      failed: 1,
      alternatives: 0,
      lastError: 'storage full'
    })
    expect(outcome.savedKeys).toEqual([fontKey(b)])
    expect(outcome.failures.get(fontKey(a))).toMatchObject({ storage: true })
    expect(outcome.failures.get(fontKey(a))?.request).toBeDefined()
    expect(d.sent).toEqual([fontKey(b)])
  })

  it('못 찾은 폰트는 건너뛴다', async () => {
    const a = usage('A', 'Regular')
    const d = deps()
    const outcome = await saveFoundFonts(scan([]), [a], [], d)
    expect(outcome.saved).toBe(0)
    expect(d.sent).toEqual([])
  })
})

describe('scanDetailLines', () => {
  it('이유별 집계를 구분자 없이 한 줄씩 — 결과 상자가 줄로 보여 준다', () => {
    setLocale('en')
    const result = scan([], {
      reasons: new Map([
        [fontKey(usage('A', 'Bold')), 'style-missing'],
        [fontKey(usage('C', 'Regular')), 'family-missing']
      ]),
      unread: 3
    })
    const lines = scanDetailLines(result, {
      saved: 0,
      failed: 0,
      alternatives: 1,
      lastError: '',
      savedKeys: [],
      failures: new Map()
    })
    expect(lines).toHaveLength(4)
    expect(lines[0]).toMatch(/^1 had several matching files/)
    expect(lines[1]).toBe('1 found, but not in the needed weight or style')
    expect(lines[2]).toBe('1 not in this folder')
    expect(lines[3]).toBe('scan incomplete: 3 file(s) not checked (limit)')
    for (const line of lines) expect(line.startsWith(' · ')).toBe(false)
  })
})

describe('scanSummary', () => {
  it('넣은 수를 먼저, 못 넣은 것은 이유별로', () => {
    setLocale('en')
    const result = scan([], {
      reasons: new Map([
        [fontKey(usage('A', 'Bold')), 'style-missing'],
        [fontKey(usage('B', 'Regular')), 'variable-only'],
        [fontKey(usage('C', 'Regular')), 'family-missing']
      ])
    })
    const text = scanSummary(result, {
      saved: 2,
      failed: 1,
      alternatives: 1,
      lastError: 'quota exceeded',
      savedKeys: [],
      failures: new Map()
    })
    expect(text).toContain('Added 2 fonts')
    expect(text).toContain('1 had several matching files')
    expect(text).toContain('1 could not be saved (quota exceeded)')
    expect(text).toContain('1 found, but not in the needed weight')
    expect(text).toContain('1 only as variable files')
    expect(text).toContain('1 not in this folder')
    expect(text).not.toContain('incomplete')
  })

  it('읽지 못한 파일·face·상한이 있으면 "없음" 대신 검사 미완료로 말한다', () => {
    setLocale('en')
    const result = scan([], {
      reasons: new Map([[fontKey(usage('C', 'Regular')), 'unchecked']]),
      unreadable: 2,
      brokenFaces: 1,
      unread: 30
    })
    const text = scanSummary(result, {
      saved: 0,
      failed: 0,
      alternatives: 0,
      lastError: '',
      savedKeys: [],
      failures: new Map()
    })
    expect(text).toContain('1 not found (scan incomplete)')
    expect(text).toContain(
      'scan incomplete: 2 file(s) could not be read, 1 face(s) inside collections could not be read, 30 file(s) not checked (limit)'
    )
    expect(text).not.toContain('not in this folder')
  })
})
