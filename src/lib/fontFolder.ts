// 폰트 폴더의 파일들 중 Figma 가 부르는 이름에 맞는 것 고르기. Figma·DOM 의존 금지.
//
// 파일 안의 이름표(name 테이블)와 Figma 의 family/style 은 같은 것을 다르게 부른다:
//   · Figma "Pretendard Variable" / "SemiBold"  →  파일 "Pretendard" / "SemiBold" (static)
//   · Figma "SUIT" / "Heavy"                    →  옛 파일 "SUIT Heavy" / "Regular" (4-패밀리 이름)
// 그래서 정확 일치 → 옛 이름 → 굵기·기울기 순으로 본다. 굵기로 고른 것도 파일 이름표가
// 틀린 경우일 뿐 다른 굵기를 대신 넣는 게 아니다 — 자리(style)는 Figma 것을 그대로 쓴다.

import { FontRef } from './types'

/** 파일 하나에서 읽은 것 */
export type FontFileNames = {
  fileName: string
  family: string
  subfamily: string
  weightClass?: number
  italic?: boolean
}

export function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9가-힣]/g, '')
}

/** family 끝의 "Variable"/"VF" 를 뗀다 — Figma 는 가변 패밀리로 부르고 파일은 static 이다 */
export function staticFamily(family: string): string {
  return family.replace(/\s+(variable|vf)$/i, '')
}

/** 파일명에 family 가 들어 있는가 — 폴더 전체를 읽기 전에 거르는 값싼 첫 관문 */
export function looksLikeFamily(fileName: string, family: string): boolean {
  const token = normalizeName(staticFamily(family))
  return token.length > 0 && normalizeName(fileName).includes(token)
}

/** 250/275 는 옛 GDI 가 250 미만을 못 다뤄 눌러 적던 관행이다 (fontFile.ts 와 같은 표) */
const WEIGHT_TOLERANCE: Record<number, number[]> = { 100: [100, 250], 200: [200, 250, 275] }

function weightMatches(fileWeight: number, wanted: number): boolean {
  return (WEIGHT_TOLERANCE[wanted] ?? [wanted]).includes(fileWeight)
}

/**
 * 없는 폰트 하나에 맞는 파일. 정확 일치가 있으면 그것, 없으면 굵기·기울기가 맞는 첫 파일.
 * 아무것도 안 맞으면 undefined — 비슷한 걸 대신 넣지 않는다.
 */
export function pickFontFile(
  target: FontRef & { weight: number; italic: boolean },
  candidates: readonly FontFileNames[]
): FontFileNames | undefined {
  const family = normalizeName(staticFamily(target.family))
  const style = normalizeName(target.style)
  const legacyFamily = family + style

  let byWeight: FontFileNames | undefined

  for (const candidate of candidates) {
    const candidateFamily = normalizeName(candidate.family)
    const candidateStyle = normalizeName(candidate.subfamily)

    if (candidateFamily === family && candidateStyle === style) return candidate
    if (
      candidateFamily === legacyFamily &&
      (candidateStyle === 'regular' || candidateStyle === '')
    ) {
      return candidate
    }

    if (
      byWeight === undefined &&
      candidateFamily === family &&
      candidate.weightClass !== undefined &&
      candidate.italic !== undefined &&
      weightMatches(candidate.weightClass, target.weight) &&
      candidate.italic === target.italic
    ) {
      byWeight = candidate
    }
  }

  return byWeight
}
