// 문서가 쓰는 폰트를 구할 수 있는가. Figma·DOM 의존 금지.
//
// 셋 중 하나다: 카탈로그(내보낼 때 받아온다) · 올린 파일 · 없음(아웃라인으로 나간다).
// 폰트 화면과 체크리스트가 같은 판정을 써야 두 화면이 다른 말을 하지 않는다.

import { catalogEntry } from './fontCatalog'
import { screenFontFile, weightMismatch } from './fontFile'
import { findStored } from './fontStore'
import { FontUsage, StoredFont, Reason } from './types'

export type FontAvailability =
  { kind: 'catalog' } | { kind: 'uploaded'; font: StoredFont } | { kind: 'missing' }

export function availabilityOf(font: FontUsage, stored: readonly StoredFont[]): FontAvailability {
  if (catalogEntry(font) !== undefined) return { kind: 'catalog' }
  const uploaded = findStored(stored, font)
  return uploaded === undefined ? { kind: 'missing' } : { kind: 'uploaded', font: uploaded }
}

/** 넣어 둔 파일이 그 자리에 맞지 않는 경우 — 내보내면 굵기가 틀리거나 글자가 깨진다 */
export type StoredFileProblem =
  | { kind: 'unusable'; reason: Reason }
  | { kind: 'mismatch'; fileWeight: number; fileItalic: boolean }

/**
 * 넣는 순간에만 검사하고 그 뒤로 믿으면, 옛 버전이 받아 준 가변 폰트가 "준비됨" 으로
 * 남는다 (실측: SUIT Regular 자리의 SUIT-Variable.ttf 가 본문을 Thin 으로 내보냈다).
 * 파일 사실이 아직 없으면(옛 항목, 읽는 중) 모른다 — null.
 */
export function storedFileProblem(font: StoredFont): StoredFileProblem | null {
  if (font.facts === undefined) return null
  const verdict = screenFontFile(font.facts)
  if (!verdict.ok) return { kind: 'unusable', reason: verdict.reason }
  const mismatch = weightMismatch(font.facts, { weight: font.weight, italic: font.italic })
  if (mismatch.differs) {
    return { kind: 'mismatch', fileWeight: mismatch.fileWeight, fileItalic: mismatch.fileItalic }
  }
  return null
}

/** 이 문서가 쓰는 폰트 중 넣어 둔 파일이 자리에 맞지 않는 것들 */
export function uploadedProblems(
  fonts: readonly FontUsage[],
  stored: readonly StoredFont[]
): Array<{ font: StoredFont; problem: StoredFileProblem }> {
  const out: Array<{ font: StoredFont; problem: StoredFileProblem }> = []
  for (const usage of fonts) {
    const availability = availabilityOf(usage, stored)
    if (availability.kind !== 'uploaded') continue
    const problem = storedFileProblem(availability.font)
    if (problem !== null) out.push({ font: availability.font, problem })
  }
  return out
}

/** 파일이 없어 아웃라인으로 나갈 폰트들 */
export function missingFonts(
  fonts: readonly FontUsage[],
  stored: readonly StoredFont[]
): FontUsage[] {
  return fonts.filter((font) => availabilityOf(font, stored).kind === 'missing')
}

export type FontReadiness = {
  total: number
  missing: FontUsage[]
  /** 없는 폰트가 쓰인 텍스트 노드 수 — 그만큼이 아웃라인 처리된다 */
  missingTexts: number
  /** 하나라도 올린 파일에서 오는가 — "전부 자동" 인지 아닌지 */
  anyUploaded: boolean
  /** 많이 쓴 순서의 서체 이름들(중복 제거) */
  families: string[]
}

export function fontReadiness(
  fonts: readonly FontUsage[],
  stored: readonly StoredFont[]
): FontReadiness {
  const missing: FontUsage[] = []
  let anyUploaded = false
  const families: string[] = []

  for (const font of fonts) {
    const state = availabilityOf(font, stored)
    if (state.kind === 'missing') missing.push(font)
    if (state.kind === 'uploaded') anyUploaded = true
    if (!families.includes(font.family)) families.push(font.family)
  }

  return {
    total: fonts.length,
    missing,
    // 한 노드가 없는 폰트 둘을 쓸 수 있다 — 합이 아니라 합집합
    missingTexts: new Set(missing.flatMap((font) => font.nodeIds)).size,
    anyUploaded,
    families
  }
}
