// 보이는 구간이 제 밀도를 갖게 하는 목표 크기. Figma·DOM 의존 금지.
//
// targetFor 는 노드 상자만 보고 목표를 잡는다. 이미지가 상자를 그대로 채울 때는 맞지만,
// Figma 에서 잘라 쓰거나(scaleMode CROP) 비율이 어긋난 채 FILL 하면 원본의 일부만 상자에
// 들어온다 — 그 일부가 제 밀도를 가지려면 원본 전체는 그만큼 더 커야 한다.
//
// 실측(2026-09-09, 사용자 포트폴리오 62개): CROP 26 개 중 12 개, FILL 4 개가 모자랐다.
// 가장 심한 것은 560×584 상자에 좌우를 잘라 넣은 4096×2731 사진으로, 584px 을 넣고 있는데
// 1075px 이 필요했다 — 의도한 밀도의 54%. 2×(144 DPI) 로 뽑아도 그 장은 78 DPI 로 나간다.
//
// 흔한 모양은 하나다: 세로로 긴 상자에 가로 사진을 넣고 좌우를 자른 것. 목표는 긴 변인
// 세로로 잡히는데 밀도를 정하는 것은 잘린 가로축이다.

import { Transform } from './imageTarget'

export type PixelSize = { width: number; height: number }

/**
 * CROP 의 imageTransform 에서 원본의 몇 분의 몇이 보이는지.
 * 열 벡터의 길이가 각 축의 배율이다 — 회전이 섞여 있어도 정확하다(transformScale 과 같은 규칙).
 */
export function cropFractions(transform: Transform): { x: number; y: number } {
  const [[a, b], [c, d]] = transform
  return { x: clampFraction(Math.hypot(a, c)), y: clampFraction(Math.hypot(b, d)) }
}

function clampFraction(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  return Math.min(1, value)
}

export type Placement = {
  /** 렌더 기준 노드 크기 (pt) */
  width: number
  height: number
  scaleMode: 'FILL' | 'FIT' | 'CROP' | 'TILE'
  /** CROP 일 때 보이는 비. 없으면 온전히 보이는 것으로 본다 */
  crop?: { x: number; y: number }
}

/**
 * 이 자리가 1pt 당 1px 을 가지려면 원본 긴 변이 몇 px 이어야 하는가.
 *
 * 원본을 균일하게 k 배 하면 보이는 구간의 밀도도 k 배가 된다. 두 축 모두 1 이상이 되는
 * 가장 작은 k 를 찾아 원본 긴 변에 곱한다 — 한 축만 맞추면 다른 축이 뭉개진다.
 *
 * TILE 은 표시 크기와 픽셀 수의 관계가 단순하지 않아 건드리지 않는다(PRD §3) — null.
 * 원본 크기를 모르면 판단할 근거가 없으므로 역시 null 이고, 부르는 쪽이 옛 계산을 쓴다.
 */
export function neededLongEdge(place: Placement, source: PixelSize | null): number | null {
  if (place.scaleMode === 'TILE') return null
  if (source === null || source.width <= 0 || source.height <= 0) return null
  if (place.width <= 0 || place.height <= 0) return null

  const long = Math.max(source.width, source.height)

  if (place.scaleMode === 'CROP') {
    const crop = place.crop ?? { x: 1, y: 1 }
    const shownX = source.width * clampFraction(crop.x)
    const shownY = source.height * clampFraction(crop.y)
    if (shownX <= 0 || shownY <= 0) return null
    const k = Math.max(place.width / shownX, place.height / shownY)
    // 올림이 아니라 반올림이다 — 비율이 딱 맞는 이미지까지 1px 커져 다시 인코딩되면 안 된다
    return Math.round(long * k)
  }

  // FILL 은 상자를 덮고(넘치는 쪽이 잘린다), FIT 은 상자 안에 든다(남는 쪽이 빈다).
  // 어느 쪽이든 원본은 s 배로 그려지고, 그 자리의 밀도는 1/s 다.
  const sx = place.width / source.width
  const sy = place.height / source.height
  const s = place.scaleMode === 'FILL' ? Math.max(sx, sy) : Math.min(sx, sy)
  return Math.round(long * s)
}
