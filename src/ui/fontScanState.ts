// 폴더 스캔 결과를 화면 전환 뒤에도 남긴다. UI 스레드 전용.
//
// 폰트 화면은 다른 화면으로 가면 내려가는데, "1종 넣음 · 6종 찾았지만 저장 못 함" 과 행마다의
// 이유·다시 넣기는 사용자가 닫거나 다음 스캔을 시작할 때까지 있어야 한다. 토스트로 보내면 몇 초
// 뒤 사라지고 잘려서, 행에 남는 "파일 없음" 만 보고 만든 사람도 "못 찾네" 로 읽었다(2026-09-08).
//
// 저장하지 못한 압축본은 상한 안에서 잠시 들고 있는다 — 공간을 비운 뒤 다시 스캔하지 않고 넣으려고.
// 다음 스캔을 시작하거나 결과를 닫으면 놓는다.

import { useEffect, useState } from 'preact/hooks'

import { fontKey } from '../lib/fontInventory'
import { FontAvailability } from '../lib/fontStatus'
import { CLIENT_STORAGE_LIMIT, FontUsage } from '../lib/types'
import { ScanReason, ScanResult } from './fontFolder'
import { SaveOutcome, SaveRequest } from './fontScanSave'

export type RowOutcome =
  | {
      kind: 'unsaved'
      fileName: string
      /** 압축한 크기 — 모르면 undefined */
      bytes?: number
      error: string
      /** 공간 부족 — 저장 폰트를 지우면 들어간다 */
      storage: boolean
      /** 압축본을 들고 있어 다시 스캔 없이 넣을 수 있는가 */
      retry: boolean
    }
  | { kind: 'not-found'; reason: ScanReason }

export type ScanDisplay = {
  /** 이번 스캔(과 그 뒤의 다시 넣기)으로 저장된 수 */
  saved: number
  /** 맞는 파일이 여럿이었던 폰트 수 */
  alternatives: number
  /** 이유별 집계·검사 미완료 — 한 줄씩 */
  lines: string[]
  /** 스캔 때 없었던 폰트(fontKey) 중 아직 못 넣은 것 → 무슨 일이 있었나 */
  outcomes: Map<string, RowOutcome>
}

export type ScanState = {
  progress: { done: number; total: number } | null
  display: ScanDisplay | null
  /** 저장 못 한 것의 압축본 — 다시 넣기용 */
  pending: Map<string, SaveRequest>
}

/** 다시 넣기용으로 들고 있을 압축본의 합 상한 — 한도(5MB)의 몇 배면 충분하다 */
export const PENDING_BYTES_CAP = 32 * 1024 * 1024

/**
 * 스캔·저장 결과를 행별 결과로. 저장된 것은 목록(stored)이 말해 주므로 빼고, 찾았지만 못 넣은 것과
 * 못 찾은 것만 남긴다. 압축본은 한도 안에 들어갈 수 있는 것만 상한까지 들고 있는다.
 */
export function buildScanDisplay(
  result: ScanResult,
  outcome: SaveOutcome,
  missing: readonly FontUsage[],
  lines: string[],
  cap = PENDING_BYTES_CAP
): { display: ScanDisplay; pending: Map<string, SaveRequest> } {
  const outcomes = new Map<string, RowOutcome>()
  const pending = new Map<string, SaveRequest>()
  let retained = 0
  for (const font of missing) {
    const key = fontKey(font)
    if (outcome.savedKeys.includes(key)) continue
    const failure = outcome.failures.get(key)
    if (failure !== undefined) {
      const request = failure.request
      let retry = false
      if (
        request !== undefined &&
        request.bytes.length <= CLIENT_STORAGE_LIMIT &&
        retained + request.bytes.length <= cap
      ) {
        pending.set(key, request)
        retained += request.bytes.length
        retry = true
      }
      outcomes.set(key, {
        kind: 'unsaved',
        fileName: failure.fileName,
        ...(request === undefined ? {} : { bytes: request.bytes.length }),
        error: failure.error,
        storage: failure.storage,
        retry
      })
      continue
    }
    const reason = result.reasons.get(key)
    if (reason !== undefined) outcomes.set(key, { kind: 'not-found', reason })
  }
  return {
    display: { saved: outcome.saved, alternatives: outcome.alternatives, lines, outcomes },
    pending
  }
}

export type OutcomeCounts = {
  /** 찾았지만 못 넣은 수 — 공간 부족 포함 */
  unsaved: number
  /** 그중 공간 부족 */
  noRoom: number
  notFound: number
  /** 공간 부족으로 못 넣은 것들의 압축 크기 합 */
  needBytes: number
}

export function countOutcomes(outcomes: ReadonlyMap<string, RowOutcome>): OutcomeCounts {
  const counts: OutcomeCounts = { unsaved: 0, noRoom: 0, notFound: 0, needBytes: 0 }
  for (const outcome of outcomes.values()) {
    if (outcome.kind === 'not-found') {
      counts.notFound += 1
      continue
    }
    counts.unsaved += 1
    if (outcome.storage) {
      counts.noRoom += 1
      counts.needBytes += outcome.bytes ?? 0
    }
  }
  return counts
}

/**
 * 이 행에 보여 줄 스캔 결과. 그 뒤에 파일이 생겼으면(다시 넣기·직접 올리기) 파일이 말하므로 아무것도
 * 보여 주지 않는다 — 이전 결과가 새 상태처럼 남으면 안 된다.
 */
export function rowOutcomeFor(
  display: ScanDisplay | null,
  font: FontUsage,
  state: FontAvailability
): RowOutcome | null {
  if (display === null || state.kind !== 'missing') return null
  return display.outcomes.get(fontKey(font)) ?? null
}

// ── 저장소 — 패널 바깥에 산다 ──────────────────────────────

type Listener = () => void

const empty = (): ScanState => ({ progress: null, display: null, pending: new Map() })
let state: ScanState = empty()
const listeners = new Set<Listener>()

function set(next: ScanState): void {
  state = next
  for (const listener of listeners) listener()
}

export function getScanState(): ScanState {
  return state
}

export function subscribeScanState(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 새 스캔 — 이전 결과와 압축본을 놓는다. 이전 폴더의 결과가 새 검사 결과처럼 남으면 안 된다 */
export function startScan(): void {
  set({ progress: { done: 0, total: 0 }, display: null, pending: new Map() })
}

export function setScanProgress(done: number, total: number): void {
  set({ ...state, progress: { done, total } })
}

export function finishScan(display: ScanDisplay, pending: Map<string, SaveRequest>): void {
  set({ progress: null, display, pending })
}

/** 스캔이 예외로 끝났다 — 진행 표시만 거둔다 */
export function abortScan(): void {
  set({ ...state, progress: null })
}

/** 사용자가 결과를 닫았다 */
export function clearScan(): void {
  set(empty())
}

/** 다시 넣기의 결과. null 이면 저장됐다 — 행 결과와 압축본을 지우고 넣은 수를 올린다 */
export function settleRetry(key: string, outcome: RowOutcome | null): void {
  if (state.display === null) return
  const outcomes = new Map(state.display.outcomes)
  const pending = new Map(state.pending)
  let saved = state.display.saved
  if (outcome === null) {
    outcomes.delete(key)
    pending.delete(key)
    saved += 1
  } else {
    outcomes.set(key, outcome)
    if (outcome.kind !== 'unsaved' || !outcome.retry) pending.delete(key)
  }
  set({ ...state, display: { ...state.display, saved, outcomes }, pending })
}

/** 구독하는 훅 — 패널이 내려갔다 올라와도 같은 상태를 본다 */
export function useFontScanState(): ScanState {
  const [snapshot, setSnapshot] = useState(state)
  useEffect(() => {
    setSnapshot(state)
    return subscribeScanState(() => setSnapshot(state))
  }, [])
  return snapshot
}
