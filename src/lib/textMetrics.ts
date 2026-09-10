// 폰트 판 대조 — "같은 이름의 다른 판" 을 폭으로 잡는다. Figma·DOM 의존 금지.
//
// Figma 가 내장한 Inter 는 3.19, Google Fonts 의 Inter 는 4.0 이다. 이름이 같아 카탈로그가
// 4.0 을 임베드했더니 "1" 이 14% 좁고 세로획이 5% 굵어 본문이 화면과 달라 보였다(2026-09 실측).
// 판을 이름으로는 알 수 없지만 폭으로는 알 수 있다: Figma 가 그린 한 줄의 잉크 폭
// (absoluteRenderBounds)과 우리 폰트로 같은 줄을 놓은 잉크 폭이 같아야 같은 판이다.

export type GlyphLike = { bbox: { minX: number; maxX: number } }
export type PositionLike = { xAdvance: number; xOffset: number }
export type LayoutLike = { glyphs: readonly GlyphLike[]; positions: readonly PositionLike[] }

/**
 * 한 줄을 이 폰트로 놓았을 때의 잉크 폭(pt) — 첫 글리프의 왼쪽 가장자리부터 마지막 글리프의
 * 오른쪽 가장자리까지. 자간은 글리프마다 뒤에 붙고(마지막 것 뒤는 잉크 밖), 무시 문자
 * 자릿수(gaps)는 글리프 수와 글자 수가 같을 때만 반영한다. 잉크가 없으면(공백뿐) null.
 */
export function inkWidthOf(
  layout: LayoutLike,
  unitsPerEm: number,
  size: number,
  letterSpacing = 0,
  gaps: readonly number[] = []
): number | null {
  const scale = size / unitsPerEm
  const useGaps = gaps.length === layout.glyphs.length + 1
  let pen = 0
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY

  layout.glyphs.forEach((glyph, index) => {
    const position = layout.positions[index]
    if (position === undefined) return
    if (useGaps) pen += letterSpacing * (gaps[index] ?? 0)
    if (glyph.bbox.maxX > glyph.bbox.minX) {
      minX = Math.min(minX, pen + (position.xOffset + glyph.bbox.minX) * scale)
      maxX = Math.max(maxX, pen + (position.xOffset + glyph.bbox.maxX) * scale)
    }
    pen += position.xAdvance * scale + letterSpacing
  })

  return maxX > minX ? maxX - minX : null
}

/**
 * 펜 시작점에서 잉크의 좌우 끝까지의 거리(pt).
 *
 * 목록 마커를 놓는 데 쓴다. 실측으로 얻은 마커 자리는 **잉크** 기준인데(픽셀을 훑어 잰
 * 값이라 그럴 수밖에 없다) 그리는 쪽은 펜 시작점을 받는다 — 그 사이를 글리프의 좌측
 * 베어링이 메운다. 잉크가 없으면(공백뿐) null.
 */
export function inkOffsets(
  layout: LayoutLike,
  unitsPerEm: number,
  size: number,
  letterSpacing = 0
): { left: number; right: number } | null {
  const scale = size / unitsPerEm
  let pen = 0
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY

  layout.glyphs.forEach((glyph, index) => {
    const position = layout.positions[index]
    if (position === undefined) return
    if (glyph.bbox.maxX > glyph.bbox.minX) {
      minX = Math.min(minX, pen + (position.xOffset + glyph.bbox.minX) * scale)
      maxX = Math.max(maxX, pen + (position.xOffset + glyph.bbox.maxX) * scale)
    }
    pen += position.xAdvance * scale + letterSpacing
  })

  return maxX > minX ? { left: minX, right: maxX } : null
}

/** 폭 대조 허용치 — 이 안이면 같은 판으로 본다. 렌더 경계의 반올림·힌팅 차이를 덮을 만큼만 */
export const WIDTH_TOLERANCE = { ratio: 0.025, absolute: 1.5 }
/** 이보다 짧은 줄은 오차가 커서 근거로 삼지 않는다 (pt) */
export const WIDTH_CHECK_MIN = 20

/**
 * Figma 폭과 우리 폭이 허용치를 넘게 다르면 차이(%)를, 아니면 null 을 돌려준다.
 * 짧은 줄은 판단하지 않는다.
 */
export function widthMismatch(figmaWidth: number, ourWidth: number): number | null {
  if (!(figmaWidth >= WIDTH_CHECK_MIN) || !(ourWidth > 0)) return null
  const diff = Math.abs(figmaWidth - ourWidth)
  const allowed = Math.max(WIDTH_TOLERANCE.absolute, figmaWidth * WIDTH_TOLERANCE.ratio)
  if (diff <= allowed) return null
  return Math.round((diff / figmaWidth) * 1000) / 10
}
