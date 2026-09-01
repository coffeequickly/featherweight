// 선택한 프레임이 쓰는 폰트 집계. Figma·DOM 의존 금지.
// 목적: Phase 2 진입 조건인 "어떤 폰트 파일이 필요한가"를 Phase 0에서 답한다. (PRD §13 오픈 질문 1)

import { FontRef, FontUsage, RawFontSegment } from './types'

/** style 문자열 → CSS weight 추정. 못 알아보면 400. */
export function guessWeight(style: string): number {
  const normalized = style.toLowerCase().replace(/[\s_-]/g, '')

  // "700 Italic" 처럼 숫자로 오는 경우
  const numeric = normalized.match(/\d{3}/)
  if (numeric !== null) {
    const value = Number(numeric[0])
    if (value >= 100 && value <= 900) return value
  }

  const table: Array<[string, number]> = [
    ['extrablack', 950],
    ['ultrablack', 950],
    ['extrabold', 800],
    ['ultrabold', 800],
    ['extralight', 200],
    ['ultralight', 200],
    ['semibold', 600],
    ['demibold', 600],
    ['semilight', 350],
    ['black', 900],
    ['heavy', 900],
    ['bold', 700],
    ['medium', 500],
    ['light', 300],
    ['thin', 100],
    ['book', 400],
    ['normal', 400],
    ['regular', 400]
  ]

  for (const [needle, weight] of table) {
    if (normalized.includes(needle)) return weight
  }

  return 400
}

/**
 * 폰트 식별 키. family 이름에 공백이 들어갈 수 있어(예: "Pretendard Variable")
 * 공백으로 이어 붙이면 ("Pretendard" + "Variable Bold") 과 충돌한다.
 */
export function fontKey(ref: FontRef): string {
  return `${ref.family}\u0000${ref.style}`
}

export function isItalic(style: string): boolean {
  const normalized = style.toLowerCase()
  return normalized.includes('italic') || normalized.includes('oblique')
}

/** family + style 이 같으면 한 줄로 합친다. 많이 쓴 폰트가 위로. */
export function aggregateFontUsage(segments: readonly RawFontSegment[]): FontUsage[] {
  const map = new Map<string, FontUsage & { nodeIds: Set<string> }>()

  for (const segment of segments) {
    const key = fontKey(segment)
    const found = map.get(key)
    if (found === undefined) {
      map.set(key, {
        family: segment.family,
        style: segment.style,
        weight: guessWeight(segment.style),
        italic: isItalic(segment.style),
        nodeCount: 1,
        charCount: segment.charCount,
        nodeIds: new Set([segment.nodeId])
      })
      continue
    }
    found.nodeIds.add(segment.nodeId)
    found.nodeCount = found.nodeIds.size
    found.charCount += segment.charCount
  }

  return [...map.values()]
    .map((entry) => ({
      family: entry.family,
      style: entry.style,
      weight: entry.weight,
      italic: entry.italic,
      nodeCount: entry.nodeCount,
      charCount: entry.charCount
    }))
    .sort(
      (a, b) =>
        b.charCount - a.charCount ||
        a.family.localeCompare(b.family) ||
        a.weight - b.weight ||
        a.style.localeCompare(b.style)
    )
}

/**
 * 파일명 추정: "Pretendard" + "SemiBold" → "Pretendard-SemiBold.ttf"
 *
 * family 끝의 "Variable"/"VF" 는 떼고 제안한다. PRD FR-7 이 variable 폰트를 금지(서브셋 불안정)하므로
 * "Pretendard Variable" 로 그린 텍스트도 실제로 넣을 파일은 static 인스턴스다.
 * fonts.json 의 `family` 는 Figma 가 보고하는 이름 그대로 둬야 매칭된다.
 */
export function suggestFileName(ref: FontRef): string {
  const staticFamily = ref.family.replace(/\s+(variable|vf)$/i, '')
  const clean = (value: string): string => value.replace(/[^A-Za-z0-9]+/g, '')
  return `${clean(staticFamily)}-${clean(ref.style)}.ttf`
}

/** fonts/fonts.json 초안. 사용자가 파일을 채워 넣을 때 그대로 쓴다. (PRD FR-7) */
export function fontsJsonDraft(usages: readonly FontUsage[]): string {
  const entries = usages.map((usage) => ({
    family: usage.family,
    style: usage.style,
    weight: usage.weight,
    italic: usage.italic,
    file: suggestFileName(usage)
  }))
  return JSON.stringify(entries, null, 2)
}

/**
 * 빠진 폰트를 배너 한 줄에 들어갈 이름으로 줄인다.
 *
 * 다 늘어놓으면 CSS 가 **줄 끝**을 잘라서 "· 폰트 탭에서 넣기" 라는 할 일이 먼저
 * 사라진다. 이름은 여러 개여도 하나만 대면 충분하고, 나머지는 개수로 말한다.
 * 이름 하나가 길어도 마찬가지라 거기서 한 번 더 자른다.
 */
export function summarizeMissing(
  names: readonly string[],
  maxChars = 22
): { first: string; rest: number } {
  const [head = '', ...tail] = names
  const first = head.length > maxChars ? `${head.slice(0, maxChars - 1).trimEnd()}…` : head
  return { first, rest: tail.length }
}
