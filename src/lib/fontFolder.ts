// 폰트 폴더의 파일들 중 Figma 가 부르는 이름에 맞는 것 고르기. Figma·DOM 의존 금지.
//
// 파일 안의 이름표(name 테이블)와 Figma 의 family/style 은 같은 것을 다르게 부른다:
//   · Figma "Pretendard Variable" / "SemiBold"  →  파일 "Pretendard" / "SemiBold" (static)
//   · Figma "SUIT" / "Heavy"                    →  옛 파일 "SUIT Heavy" / "Regular" (4-패밀리 이름)
//   · Figma "Open Sans" / "Condensed Bold"      →  파일 "Open Sans Condensed" / "Bold" (Google 의 폭 계열 static)
//   · Figma "Merriweather" / "Regular"          →  파일 "Merriweather 24pt" / "Regular" (opsz 축의 static 인스턴스)
// 그래서 정확 일치 → 이름표 전체가 같음 → 굵기·기울기 순으로 본다. 굵기로 고른 것도 파일 이름표가
// 틀린 경우일 뿐 다른 굵기를 대신 넣는 게 아니다 — 자리(style)는 Figma 것을 그대로 쓴다.
// 폭이 다른 것(Condensed ↔ 보통)은 굵기가 같아도 다른 서체다.

import { FontRef } from './types'

/** 파일 하나에서 읽은 것 */
export type FontFileNames = {
  fileName: string
  family: string
  subfamily: string
  weightClass?: number
  italic?: boolean
}

/**
 * 이름 비교용 키. 허용하는 표기 차이만 지운다 — 대소문자, 공백, 하이픈·밑줄, 호환 문자(NFKC).
 * 그 밖의 글자는 남긴다: 기호·일본어·키릴 이름이 서로 같은 키로 뭉치면 다른 폰트가 대신 들어간다
 * (옛 규칙은 영문·숫자·한글 밖을 전부 지워 "游ゴシック" 과 "ヒラギノ角ゴ" 가 같은 키였다).
 */
export function normalizeName(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
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
 * family 끝에 붙은 광학 크기 — Google Fonts 는 opsz 축 서체의 static 인스턴스를 "Inter 18pt",
 * "Merriweather 24pt" 로 부른다(옛 4-패밀리 이름이면 "Inter 18pt Black" / "Regular"). Figma 는 가변
 * 파일을 설치한 사용자에게 "Inter" 라고만 보여 주므로 떼고 본다. 크기는 어느 인스턴스를 고를지에 쓴다.
 */
export function opticalSize(family: string): { base: string; opsz?: number } {
  const match = /^(.*?)\s+(\d+(?:\.\d+)?)pt(\s+.*)?$/i.exec(family.trim())
  if (match === null) return { base: family }
  return { base: `${match[1]}${match[3] ?? ''}`.trim(), opsz: Number(match[2]) }
}

/** 같은 family 인가 — 가변 접미·광학 크기·표기 차이만 무시 */
export function sameFamily(a: string, b: string): boolean {
  return (
    normalizeName(opticalSize(staticFamily(a)).base) ===
    normalizeName(opticalSize(staticFamily(b)).base)
  )
}

/** 긴 것부터 — "semicondensed" 를 "condensed" 로 읽지 않으려고 */
const WIDTH_TERMS = [
  'ultracondensed',
  'extracondensed',
  'semicondensed',
  'condensed',
  'ultraexpanded',
  'extraexpanded',
  'semiexpanded',
  'expanded',
  'semiextended',
  'extended',
  'compressed',
  'narrow',
  'wide'
]

/** 정규화한 style 에 든 폭 이름. 없으면 '' */
export function widthTerm(normalizedStyle: string): string {
  return WIDTH_TERMS.find((term) => normalizedStyle.includes(term)) ?? ''
}

/**
 * 파일이 이 자리에 얼마나 잘 맞는가. 0 = family+style 정확 일치, 1 = 이름표 전체(family+subfamily)가 같음 —
 * 옛 4-패밀리 이름("SUIT Heavy"/"Regular"), 폭 계열("Open Sans Condensed"/"Bold"), 광학 크기("Inter 18pt"/"SemiBold"),
 * 2 = 같은 family 에서 굵기·기울기만 맞음(폭은 같아야 한다). 안 맞으면 null — 비슷한 걸 대신 넣지 않는다.
 * 등급은 후보를 고를 때 가장 먼저 본다: 이름이 정확히 맞는 Regular v1 이 굵기만 같은 Book v2 에 밀리면 안 된다.
 */
export type MatchTier = 0 | 1 | 2

export function matchTier(
  target: FontRef & { weight: number; italic: boolean },
  candidate: FontFileNames
): MatchTier | null {
  const family = normalizeName(staticFamily(target.family))
  const style = normalizeName(target.style)
  const candidateFamily = normalizeName(candidate.family)
  const candidateStyle = normalizeName(candidate.subfamily)

  if (candidateFamily === family && candidateStyle === style) return 0

  // 이름표 전체가 같은가 — "Regular" 는 이름의 일부가 아니다. 양쪽 다 이어 붙여 보므로
  // "Open Sans Condensed"/"Bold" 와 "Open Sans"/"Condensed Bold" 는 어느 쪽이 Figma 든 맞는다.
  const baseFamily = normalizeName(opticalSize(candidate.family).base)
  const whole = (f: string, s: string): string => f + (s === 'regular' ? '' : s)
  if (whole(baseFamily, candidateStyle) === whole(family, style)) return 1

  if (
    baseFamily === family &&
    candidate.weightClass !== undefined &&
    candidate.italic !== undefined &&
    weightMatches(candidate.weightClass, target.weight) &&
    candidate.italic === target.italic &&
    widthTerm(candidateStyle) === widthTerm(style)
  ) {
    return 2
  }
  return null
}

/**
 * 없는 폰트 하나에 맞는 파일들을 등급순으로. 같은 등급 안에서는 넘어온 순서를 지킨다 —
 * 어느 것을 고를지는 호출자가 사용 가능 여부·글리프·판으로 정한다.
 */
export function rankFontFiles<T extends FontFileNames>(
  target: FontRef & { weight: number; italic: boolean },
  candidates: readonly T[]
): T[] {
  const tiers: T[][] = [[], [], []]
  for (const candidate of candidates) {
    const tier = matchTier(target, candidate)
    if (tier !== null) tiers[tier].push(candidate)
  }
  return tiers.flat()
}

/** 가장 잘 맞는 파일 하나. 없으면 undefined */
export function pickFontFile<T extends FontFileNames>(
  target: FontRef & { weight: number; italic: boolean },
  candidates: readonly T[]
): T | undefined {
  return rankFontFiles(target, candidates)[0]
}
