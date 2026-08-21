// 시간 안에 안 끝나면 reject. Figma·DOM 의존 금지.
//
// exportAsync 가 응답을 안 주면 파이프라인 전체가 멈춘다. 프레임 하나를 버리고
// 나머지로 PDF 를 만드는 편이 낫다. (PRD §7.7)

import { t } from './i18n'

export type TimeoutError = Error & { timedOut: true }

export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof Error && (error as TimeoutError).timedOut === true
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(
        t('timeout.notFinished', { label, seconds: Math.round(ms / 1000) })
      ) as TimeoutError
      error.timedOut = true
      reject(error)
    }, ms)

    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}
