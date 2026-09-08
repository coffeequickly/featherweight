// 폴더 스캔 결과가 행별로 남고, 닫거나 다음 스캔까지 유지되는가. 찾았지만 못 넣은 것은 "파일 없음" 이 아니다.
import { describe, expect, it } from 'vitest'

import { fontKey } from '../src/lib/fontInventory'
import { CLIENT_STORAGE_LIMIT, FontUsage, StoredFont } from '../src/lib/types'
import { ScanResult } from '../src/ui/fontFolder'
import { SaveOutcome, SaveRequest } from '../src/ui/fontScanSave'
import {
  buildScanDisplay,
  clearScan,
  countOutcomes,
  finishScan,
  getScanState,
  rowOutcomeFor,
  setScanProgress,
  settleRetry,
  startScan,
  subscribeScanState
} from '../src/ui/fontScanState'

const usage = (family: string): FontUsage => ({
  family,
  style: 'Regular',
  weight: 400,
  italic: false,
  nodeCount: 1,
  charCount: 10,
  nodeIds: ['1:1']
})
const stored = (family: string): StoredFont => ({
  family,
  style: 'Regular',
  weight: 400,
  italic: false,
  byteLength: 100,
  numGlyphs: 10,
  codePoints: 10,
  fileName: `${family}.ttf`
})
const request = (family: string, size: number): SaveRequest => ({
  font: stored(family),
  bytes: new Uint8Array(size)
})
const result = (
  reasons: Array<[string, ScanResult['reasons'] extends Map<string, infer R> ? R : never]>
): ScanResult => ({
  found: new Map(),
  reasons: new Map(reasons),
  unreadable: 0,
  brokenFaces: 0,
  unread: 0,
  memoryCapped: false
})
const outcome = (partial: Partial<SaveOutcome>): SaveOutcome => ({
  saved: 0,
  failed: 0,
  alternatives: 0,
  lastError: '',
  savedKeys: [],
  failures: new Map(),
  ...partial
})

const A = usage('A')
const B = usage('B')
const C = usage('C')
const D = usage('D')
const E = usage('E')

describe('buildScanDisplay', () => {
  it('저장된 것은 빼고, 찾았지만 못 넣은 것과 못 찾은 것을 행별로 남긴다', () => {
    const built = buildScanDisplay(
      result([[fontKey(C), 'family-missing']]),
      outcome({
        saved: 1,
        failed: 3,
        savedKeys: [fontKey(A)],
        failures: new Map([
          [
            fontKey(B),
            { fileName: 'b.ttf', error: 'full', storage: true, request: request('B', 100) }
          ],
          [
            fontKey(D),
            { fileName: 'd.ttf', error: 'main died', storage: false, request: request('D', 100) }
          ],
          [fontKey(E), { fileName: 'e.ttf', error: 'bad', storage: false }]
        ])
      }),
      [A, B, C, D, E],
      ['detail line']
    )
    const { outcomes } = built.display
    expect(outcomes.has(fontKey(A))).toBe(false)
    expect(outcomes.get(fontKey(B))).toEqual({
      kind: 'unsaved',
      fileName: 'b.ttf',
      bytes: 100,
      error: 'full',
      storage: true,
      retry: true
    })
    expect(outcomes.get(fontKey(C))).toEqual({ kind: 'not-found', reason: 'family-missing' })
    expect(outcomes.get(fontKey(D))).toMatchObject({ kind: 'unsaved', storage: false, retry: true })
    expect(outcomes.get(fontKey(E))).toMatchObject({ kind: 'unsaved', retry: false })
    expect(outcomes.get(fontKey(E))).not.toHaveProperty('bytes')
    expect([...built.pending.keys()]).toEqual([fontKey(B), fontKey(D)])
    expect(countOutcomes(outcomes)).toEqual({ unsaved: 3, noRoom: 1, notFound: 1, needBytes: 100 })
    expect(built.display.saved).toBe(1)
    expect(built.display.lines).toEqual(['detail line'])
  })

  it('압축본은 상한까지만 들고 있고, 한도(5MB)보다 큰 것은 다시 넣을 수 없다', () => {
    const built = buildScanDisplay(
      result([]),
      outcome({
        failed: 3,
        failures: new Map([
          [
            fontKey(B),
            { fileName: 'b.ttf', error: 'full', storage: true, request: request('B', 100) }
          ],
          [
            fontKey(D),
            { fileName: 'd.ttf', error: 'full', storage: true, request: request('D', 100) }
          ],
          [
            fontKey(E),
            {
              fileName: 'e.ttf',
              error: 'full',
              storage: true,
              request: request('E', CLIENT_STORAGE_LIMIT + 1)
            }
          ]
        ])
      }),
      [B, D, E],
      [],
      150
    )
    expect(built.display.outcomes.get(fontKey(B))).toMatchObject({ retry: true })
    expect(built.display.outcomes.get(fontKey(D))).toMatchObject({ retry: false })
    expect(built.display.outcomes.get(fontKey(E))).toMatchObject({
      retry: false,
      bytes: CLIENT_STORAGE_LIMIT + 1
    })
    expect([...built.pending.keys()]).toEqual([fontKey(B)])
  })
})

describe('rowOutcomeFor — 갱신 규칙', () => {
  const display = buildScanDisplay(
    result([[fontKey(C), 'style-missing']]),
    outcome({
      failures: new Map([
        [fontKey(B), { fileName: 'b.ttf', error: 'full', storage: true, request: request('B', 10) }]
      ])
    }),
    [B, C],
    []
  ).display

  it('스캔이 알아낸 것을 행에 준다', () => {
    expect(rowOutcomeFor(display, B, { kind: 'missing' })).toMatchObject({ kind: 'unsaved' })
    expect(rowOutcomeFor(display, C, { kind: 'missing' })).toEqual({
      kind: 'not-found',
      reason: 'style-missing'
    })
  })

  it('그 뒤 파일이 생긴 행에는 이전 결과를 보여 주지 않는다', () => {
    expect(rowOutcomeFor(display, B, { kind: 'uploaded', font: stored('B') })).toBeNull()
    expect(rowOutcomeFor(display, B, { kind: 'catalog' })).toBeNull()
  })

  it('스캔에 없던 폰트·결과가 없을 때는 null', () => {
    expect(rowOutcomeFor(display, A, { kind: 'missing' })).toBeNull()
    expect(rowOutcomeFor(null, B, { kind: 'missing' })).toBeNull()
  })
})

describe('스캔 상태 저장소 — 닫거나 다음 스캔까지 남는다', () => {
  const built = (): ReturnType<typeof buildScanDisplay> =>
    buildScanDisplay(
      result([[fontKey(C), 'family-missing']]),
      outcome({
        saved: 1,
        savedKeys: [fontKey(A)],
        failures: new Map([
          [
            fontKey(B),
            { fileName: 'b.ttf', error: 'full', storage: true, request: request('B', 10) }
          ]
        ])
      }),
      [A, B, C],
      []
    )

  it('새 스캔은 이전 결과와 압축본을 놓고 진행을 알린다', () => {
    const first = built()
    finishScan(first.display, first.pending)
    expect(getScanState().display).toBe(first.display)
    startScan()
    expect(getScanState()).toMatchObject({ progress: { done: 0, total: 0 }, display: null })
    expect(getScanState().pending.size).toBe(0)
    setScanProgress(3, 9)
    expect(getScanState().progress).toEqual({ done: 3, total: 9 })
    clearScan()
  })

  it('다시 넣기가 되면 행 결과와 압축본을 지우고 넣은 수를 올린다', () => {
    const first = built()
    finishScan(first.display, first.pending)
    settleRetry(fontKey(B), null)
    const state = getScanState()
    expect(state.display?.saved).toBe(2)
    expect(state.display?.outcomes.has(fontKey(B))).toBe(false)
    expect(state.pending.has(fontKey(B))).toBe(false)
    expect(state.display?.outcomes.get(fontKey(C))).toEqual({
      kind: 'not-found',
      reason: 'family-missing'
    })
    clearScan()
  })

  it('다시 넣기가 또 실패하면 행 결과를 바꾸고, 재시도가 불가능해지면 압축본을 놓는다', () => {
    const first = built()
    finishScan(first.display, first.pending)
    settleRetry(fontKey(B), {
      kind: 'unsaved',
      fileName: 'b.ttf',
      bytes: 10,
      error: 'still full',
      storage: true,
      retry: true
    })
    expect(getScanState().display?.outcomes.get(fontKey(B))).toMatchObject({ error: 'still full' })
    expect(getScanState().pending.has(fontKey(B))).toBe(true)
    settleRetry(fontKey(B), {
      kind: 'unsaved',
      fileName: 'b.ttf',
      error: 'gone',
      storage: false,
      retry: false
    })
    expect(getScanState().pending.has(fontKey(B))).toBe(false)
    clearScan()
    expect(getScanState().display).toBeNull()
  })

  it('구독자는 바뀔 때마다 듣는다', () => {
    let calls = 0
    const off = subscribeScanState(() => {
      calls += 1
    })
    startScan()
    clearScan()
    off()
    startScan()
    clearScan()
    expect(calls).toBe(2)
  })
})
