// SVG run 의 weight/italic → Figma 가 부르는 폰트 이름. Figma·DOM 의존 금지. (PRD FR-7)
//
// SVG 는 weight 숫자만 주고, Figma 는 "SemiBold" 같은 이름을 쓴다. 같은 노드의
// 세그먼트에서 weight 가 맞는 것을 찾아 잇는다. **검증(validateText)과 드로잉(textLayer)이
// 반드시 같은 규칙을 써야 한다** — 어긋나면 검증을 통과한 노드가 다른 폰트로 그려진다.

import { TextRunSource } from './types'

/**
 * run 이 어느 세그먼트의 폰트인지. SVG run 은 font-family·weight·italic 만 갖고 글자 범위가 없다.
 *
 * family 를 먼저 본다 — 한 노드에 서체가 섞여 있을 수 있다. 실측: 이력서 푸터 "1 → 5" 의
 * 화살표만 다른 서체였는데 weight 만 보고 SUIT 를 골라 SUIT 의 화살표(꺾쇠 모양)로 나갔다.
 * SVG 의 이름과 Figma 의 이름은 표기가 다를 수 있어 느슨하게 비교한다.
 */
export function styleForRun(
  source: TextRunSource,
  weight: number,
  italic: boolean,
  family = ''
): { family: string; style: string; features: Record<string, boolean> } {
  const wanted = normalizeFamily(family)
  const sameFamily =
    wanted === ''
      ? []
      : source.segments.filter((segment) => normalizeFamily(segment.fontName.family) === wanted)
  const pool = sameFamily.length > 0 ? sameFamily : source.segments

  const candidates = pool.filter((segment) => {
    const guessed = weightOfStyle(segment.fontName.style)
    return guessed === weight && isItalicStyle(segment.fontName.style) === italic
  })

  const chosen = candidates[0] ?? pool[0]
  return chosen === undefined
    ? { family: '', style: '', features: {} }
    : { family: chosen.fontName.family, style: chosen.fontName.style, features: chosen.features }
}

/** "Pretendard Variable" · 'Pretendard-Variable' · "pretendardvariable" 을 같은 것으로 */
function normalizeFamily(value: string): string {
  return value
    .replace(/["']/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, '')
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
