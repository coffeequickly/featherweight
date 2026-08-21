// UI → 메인 요청/응답. clientStorage 가 메인에만 있어서 폰트 바이트를 물어봐야 한다. (PRD C3)

const DEFAULT_TIMEOUT_MS = 15_000

type Pending = {
  resolve: (value: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

const pending = new Map<string, Pending>()
let counter = 0

export function nextRequestId(prefix: string): string {
  counter += 1
  return `${prefix}-ui-${counter}`
}

/** 타임아웃이면 undefined 로 끝낸다 — 폰트 하나가 없다고 내보내기가 죽으면 안 된다. */
export function awaitResponse<T>(
  reqId: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(reqId)
      resolve(undefined)
    }, timeoutMs)

    pending.set(reqId, { resolve: resolve as (value: unknown) => void, timer })
  })
}

export function settleResponse(reqId: string, value: unknown): void {
  const found = pending.get(reqId)
  if (found === undefined) return
  clearTimeout(found.timer)
  pending.delete(reqId)
  found.resolve(value)
}
