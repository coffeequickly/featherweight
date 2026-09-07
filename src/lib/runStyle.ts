// SVG run 의 weight/italic → Figma 가 부르는 폰트 이름. Figma·DOM 의존 금지. (PRD FR-7)
//
// SVG 는 weight 숫자만 주고, Figma 는 "SemiBold" 같은 이름을 쓴다. 같은 노드의
// 세그먼트에서 weight 가 맞는 것을 찾아 잇는다. **검증(validateText)과 드로잉(textLayer)이
// 반드시 같은 규칙을 써야 한다** — 어긋나면 검증을 통과한 노드가 다른 폰트로 그려진다.

import { guessWeight } from './fontInventory'
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

  // italic 이 맞는 것 중 굵기가 가장 가까운 것. SVG 의 weight 는 폰트가 말하는 값(350·950 도 온다)이고
  // 이름표를 숫자로 옮긴 값과 정확히 같지 않을 수 있다 — 딱 맞는 게 없다고 첫 세그먼트로 가면
  // Bold 와 DemiLight 가 섞인 노드에서 가는 글자가 굵게 나간다
  const sameItalic = pool.filter((segment) => isItalicStyle(segment.fontName.style) === italic)
  const candidates = sameItalic.length > 0 ? sameItalic : pool

  let chosen = candidates[0]
  let closest = Number.POSITIVE_INFINITY
  for (const segment of candidates) {
    const distance = Math.abs(weightOfStyle(segment.fontName.style) - weight)
    if (distance < closest) {
      closest = distance
      chosen = segment
    }
  }
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

/**
 * 스타일 이름표 → 굵기 숫자. 표는 하나여야 한다 — 인벤토리(fontInventory)와 여기가 다른 표를
 * 쓰면 같은 "SemiLight" 가 한쪽에선 350, 다른 쪽에선 300 이 돼 세그먼트 매칭이 어긋난다.
 */
export function weightOfStyle(style: string): number {
  return guessWeight(style)
}
