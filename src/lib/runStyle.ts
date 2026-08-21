// SVG run 의 weight/italic → Figma 가 부르는 폰트 이름. Figma·DOM 의존 금지. (PRD FR-7)
//
// SVG 는 weight 숫자만 주고, Figma 는 "SemiBold" 같은 이름을 쓴다. 같은 노드의
// 세그먼트에서 weight 가 맞는 것을 찾아 잇는다. **검증(validateText)과 드로잉(textLayer)이
// 반드시 같은 규칙을 써야 한다** — 어긋나면 검증을 통과한 노드가 다른 폰트로 그려진다.

import { TextRunSource } from './types'

export function styleForRun(
  source: TextRunSource,
  weight: number,
  italic: boolean
): { family: string; style: string } {
  const candidates = source.segments.filter((segment) => {
    const guessed = weightOfStyle(segment.fontName.style)
    return guessed === weight && isItalicStyle(segment.fontName.style) === italic
  })

  const chosen = candidates[0] ?? source.segments[0]
  return chosen === undefined
    ? { family: '', style: '' }
    : { family: chosen.fontName.family, style: chosen.fontName.style }
}

export function isItalicStyle(style: string): boolean {
  const normalized = style.toLowerCase()
  return normalized.includes('italic') || normalized.includes('oblique')
}

export function weightOfStyle(style: string): number {
  const normalized = style.toLowerCase().replace(/[\s_-]/g, '')
  const table: Array<[string, number]> = [
    ['extrabold', 800],
    ['ultrabold', 800],
    ['extralight', 200],
    ['ultralight', 200],
    ['semibold', 600],
    ['demibold', 600],
    ['black', 900],
    ['heavy', 900],
    ['bold', 700],
    ['medium', 500],
    ['light', 300],
    ['thin', 100],
    ['regular', 400],
    ['normal', 400],
    ['book', 400]
  ]
  for (const [needle, value] of table) {
    if (normalized.includes(needle)) return value
  }
  return 400
}
