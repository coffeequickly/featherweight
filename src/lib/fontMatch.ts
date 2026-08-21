// Figma 가 부르는 폰트 이름 → 보관 중인 폰트 파일. Figma·DOM 의존 금지. (PRD FR-7)
//
// **정확 일치만 한다.** weight 근사 매칭(Bold 를 SemiBold 로)은 성공처럼 보이면서
// 굵기를 바꿔버린다. "내가 쓴 그 폰트로 나와야 한다"는 요구에는 fallback 이 낫다.

import { FontRef, Reason, StoredFont } from './types'

export type MatchFailure = { kind: 'no-file' | 'style-missing'; reason: Reason }

export type MatchResult = { ok: true; font: StoredFont } | ({ ok: false } & MatchFailure)

export function matchFont(ref: FontRef, available: readonly StoredFont[]): MatchResult {
  const exact = available.find((font) => font.family === ref.family && font.style === ref.style)
  if (exact !== undefined) return { ok: true, font: exact }

  const sameFamily = available.filter((font) => font.family === ref.family)
  if (sameFamily.length > 0) {
    const styles = sameFamily.map((font) => font.style).join(', ')
    return {
      ok: false,
      kind: 'style-missing',
      reason: {
        code: 'font.styleMissing',
        params: { family: ref.family, style: ref.style, styles }
      }
    }
  }

  return {
    ok: false,
    kind: 'no-file',
    reason: { code: 'font.noFile', params: { family: ref.family, style: ref.style } }
  }
}

/** 문서가 쓰는 폰트 중 파일이 없는 것. 리포트와 "파일 없음" 표시에 쓴다. */
export function unmatchedRefs(
  refs: readonly FontRef[],
  available: readonly StoredFont[]
): FontRef[] {
  const seen = new Set<string>()
  const out: FontRef[] = []

  for (const ref of refs) {
    const key = `${ref.family}\u0000${ref.style}`
    if (seen.has(key)) continue
    seen.add(key)
    if (!matchFont(ref, available).ok) out.push(ref)
  }

  return out
}
