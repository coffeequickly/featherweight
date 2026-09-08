// 폴더 스캔이 고른 파일들을 저장하고 결과를 요약한다. UI 스레드 전용.
//
// "추가 완료" 는 메인이 실제로 저장했다고 돌려준 뒤에만 센다 — 보내 놓고 세면 5MB 한도에
// 걸린 것도 성공으로 보인다. 저장하지 못한 것은 폰트마다 이유와 압축본을 남긴다 — 행이
// "찾았지만 저장 못 함" 이라고 말하고, 공간을 비운 뒤 다시 스캔 없이 넣을 수 있게.

import { t } from '../lib/i18n'
import { fontKey } from '../lib/fontInventory'
import { FontUsage, StoredFont } from '../lib/types'
import { FoundFont, isScanIncomplete, ScanReason, ScanResult } from './fontFolder'

export type SaveRequest = { font: StoredFont; bytes: Uint8Array }
export type SaveVerdict =
  | { ok: true; save: SaveRequest }
  | {
      ok: false
      message: string
      /** 공간 부족으로 막혔는가 — 지우면 들어간다 */
      storage?: boolean
      /** 막혔어도 압축본은 있다 — 다시 넣기용 */
      save?: SaveRequest
    }
export type SaveReply = { ok: boolean; error?: string } | undefined

export type SaveDeps = {
  /** 파일이 이 자리에 들어갈 수 있는가(형식·한도) — 압축한 뒤의 크기로 본다 */
  screen: (match: FoundFont, font: FontUsage, have: readonly StoredFont[]) => Promise<SaveVerdict>
  /** 메인에 저장을 요청하고 결과를 기다린다. 응답이 없으면 undefined */
  save: (request: SaveRequest) => Promise<SaveReply>
  /** 저장 뒤의 목록 갱신 — 다음 한도 계산에 방금 넣은 것을 포함하려고 */
  upsert: (have: readonly StoredFont[], font: StoredFont) => StoredFont[]
}

/** 찾았지만 저장하지 못한 폰트 하나 */
export type SaveFailure = {
  fileName: string
  error: string
  /** 공간 부족 — 저장 폰트를 지우면 다시 넣을 수 있다 */
  storage: boolean
  /** 압축본 — 있으면 다시 스캔 없이 재시도할 수 있다 */
  request?: SaveRequest
}

export type SaveOutcome = {
  saved: number
  failed: number
  /** 맞는 파일이 여럿이었던 폰트 수 */
  alternatives: number
  /** 마지막 실패 사유 — 한 줄 요약에 하나만 보여 준다 */
  lastError: string
  /** 이번에 저장된 폰트(fontKey) */
  savedKeys: string[]
  /** 찾았지만 저장하지 못한 폰트(fontKey) → 사유 */
  failures: Map<string, SaveFailure>
}

export async function saveFoundFonts(
  result: ScanResult,
  missing: readonly FontUsage[],
  stored: readonly StoredFont[],
  deps: SaveDeps
): Promise<SaveOutcome> {
  const outcome: SaveOutcome = {
    saved: 0,
    failed: 0,
    alternatives: 0,
    lastError: '',
    savedKeys: [],
    failures: new Map()
  }
  let have = stored
  for (const font of missing) {
    const key = fontKey(font)
    const match = result.found.get(key)
    if (match === undefined) continue
    const verdict = await deps.screen(match, font, have)
    if (!verdict.ok) {
      outcome.failed += 1
      outcome.lastError = verdict.message
      outcome.failures.set(key, {
        fileName: match.fileName,
        error: verdict.message,
        storage: verdict.storage === true,
        request: verdict.save
      })
      continue
    }
    const reply = await deps.save(verdict.save)
    if (reply?.ok === true) {
      outcome.saved += 1
      outcome.savedKeys.push(key)
      have = deps.upsert(have, verdict.save.font)
      if (match.alternatives > 0) outcome.alternatives += 1
    } else {
      outcome.failed += 1
      outcome.lastError = reply?.error ?? t('fonts.saveNoReply')
      outcome.failures.set(key, {
        fileName: match.fileName,
        error: outcome.lastError,
        storage: false,
        request: verdict.save
      })
    }
  }
  return outcome
}

/**
 * 못 찾은 이유별 집계와 검사 미완료 — 한 줄씩. 읽지 못한 파일·face·상한이 있었으면 "폴더에 없음" 대신
 * "검사 미완료" 로 말한다 — 없다고 단정할 근거가 없다.
 */
export function scanDetailLines(result: ScanResult, outcome: SaveOutcome): string[] {
  const counts: Record<ScanReason, number> = {
    'family-missing': 0,
    'style-missing': 0,
    'variable-only': 0,
    unusable: 0,
    unchecked: 0
  }
  for (const reason of result.reasons.values()) counts[reason] += 1

  const lines: string[] = []
  if (outcome.alternatives > 0) {
    lines.push(t('fonts.scanAlternatives', { count: outcome.alternatives }))
  }
  if (counts['style-missing'] > 0) {
    lines.push(t('fonts.scanStyleMissing', { count: counts['style-missing'] }))
  }
  if (counts['variable-only'] > 0) {
    lines.push(t('fonts.scanVariableOnly', { count: counts['variable-only'] }))
  }
  if (counts.unusable > 0) lines.push(t('fonts.scanUnusable', { count: counts.unusable }))
  if (counts['family-missing'] > 0) {
    lines.push(t('fonts.scanRest', { count: counts['family-missing'] }))
  }
  if (counts.unchecked > 0) lines.push(t('fonts.scanUnchecked', { count: counts.unchecked }))

  const incomplete = scanIncompleteLine(result)
  if (incomplete !== null) lines.push(incomplete)
  return lines
}

/** 읽지 못한 파일·face·상한 — 있으면 한 줄, 없으면 null. 결과 상자는 집계 대신 이것만 덧붙인다 */
export function scanIncompleteLine(result: ScanResult): string | null {
  if (!isScanIncomplete(result)) return null
  const detail: string[] = []
  if (result.unreadable > 0) detail.push(t('fonts.scanUnreadable', { count: result.unreadable }))
  if (result.brokenFaces > 0) {
    detail.push(t('fonts.scanBrokenFaces', { count: result.brokenFaces }))
  }
  if (result.unread > 0) detail.push(t('fonts.scanCapFiles', { count: result.unread }))
  if (result.memoryCapped) detail.push(t('fonts.scanCapMemory'))
  return t('fonts.scanIncomplete', { detail: detail.join(', ') })
}

/** 스캔 결과 한 줄 — 넣은 수를 먼저, 못 넣은 것은 이유별로 */
export function scanSummary(result: ScanResult, outcome: SaveOutcome): string {
  const parts = [t('fonts.scanResult', { found: outcome.saved })]
  if (outcome.failed > 0) {
    parts.push(t('fonts.scanSaveFailed', { count: outcome.failed, error: outcome.lastError }))
  }
  return [...parts, ...scanDetailLines(result, outcome)].join(' · ')
}
