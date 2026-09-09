// 잘려 나가는 부분을 재는 자리. Figma·DOM 의존 금지.
//
// 프레임 밖으로 넘치는 이미지는 넘친 만큼이 화면에 안 나오는데도 목표 픽셀은 노드 전체로
// 잡힌다. 1920pt 프레임에 4096pt 로 놓인 사진이 실제로 있었다(2026-09-09 실측) —
// 절반 넘게 보이지 않는데 3840px 을 싣는다.
//
// 지금 값이 틀린 것은 아니다. 이미지를 자르지 않고 통째로 줄이므로, 보이는 구간이 제 밀도를
// 유지하려면 원본 전체가 그만큼 커야 한다. 프레임 크기로 상한을 걸면 보이는 부분의
// 해상도가 같이 떨어진다. 그래서 먼저 하는 일은 "얼마나 버려지는가" 를 재서 말해 주는 것이다.

export type Rect = { x: number; y: number; width: number; height: number }

/** 겹치는 부분. 안 겹치면 null (맞닿기만 한 것도 겹친 것으로 치지 않는다) */
export function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  if (right <= x || bottom <= y) return null
  return { x, y, width: right - x, height: bottom - y }
}

/**
 * 노드에서 클립 안에 남는 넓이의 비. 1 이면 온전히 보이고, 0.47 이면 절반 넘게 잘린다.
 *
 * 클립이 없으면(프레임이 clipsContent 를 끈 경우) 잘리지 않으므로 1 이다.
 * 넓이가 0 인 노드도 1 로 둔다 — 잴 것이 없는데 "다 잘렸다" 고 말하면 거짓말이 된다.
 */
export function visibleFraction(node: Rect, clip: Rect | null): number {
  const area = node.width * node.height
  if (area <= 0) return 1
  if (clip === null) return 1
  const seen = intersect(node, clip)
  if (seen === null) return 0
  return Math.min(1, (seen.width * seen.height) / area)
}

/**
 * 이 비 아래로 내려가면 화면이 말한다.
 *
 * 0.9 로 잡은 이유: 가장자리를 한두 px 걸치는 것은 디자인에서 흔하고 버려지는 픽셀도
 * 얼마 안 된다. 10% 를 넘게 버리기 시작하면 그때부터는 눈에 보이는 낭비다.
 */
export const OVERFLOW_NOTICE = 0.9
