// 메인 → UI 요청/응답. reqId 로 짝을 맞추고 타임아웃을 건다. (PRD §7.3)
//
// 메인 스레드에는 Canvas 가 없어서 리사이즈·글리프 검사를 UI 에 맡겨야 한다.
// UI 가 답을 안 주면 파이프라인이 영영 멈추므로 타임아웃이 필수다.

import { t } from '../lib/i18n'

const DEFAULT_TIMEOUT_MS = 30_000

type Pending = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const pending = new Map<string, Pending>()
let counter = 0

export function nextRequestId(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}`
}

/** 응답이 올 때까지 기다린다. reqId 는 호출자가 요청 메시지에 실어 보낸다. */
export function awaitResponse<T>(reqId: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(reqId)
      reject(new Error(t('bridge.timeout', { seconds: Math.round(timeoutMs / 1000), reqId })))
    }, timeoutMs)

    pending.set(reqId, {
      resolve: resolve as (value: unknown) => void,
      reject,
      timer
    })
  })
}

/** UI 응답 도착. 모르는 reqId(타임아웃 뒤 늦게 온 응답)는 조용히 버린다. */
export function settleResponse(reqId: string, value: unknown): void {
  const found = pending.get(reqId)
  if (found === undefined) return
  clearTimeout(found.timer)
  pending.delete(reqId)
  found.resolve(value)
}

/** 취소·창 닫힘 등으로 남은 요청을 전부 끊는다. */
export function rejectAllPending(reason: string): void {
  for (const [reqId, found] of pending) {
    clearTimeout(found.timer)
    found.reject(new Error(`${reason} (${reqId})`))
  }
  pending.clear()
}
