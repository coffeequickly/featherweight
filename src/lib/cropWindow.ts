// 자리 하나가 원본의 어느 창을 보여 주는가, 그 창만 잘라 넣으면 변환을 어떻게 고쳐야 같은 자리에
// 오는가. Figma·DOM 의존 금지.
//
// Figma 는 CROP 이미지를 PDF 에 통째로 싣고 클립한다(2026-09-10 실측: 5% 창인 자리에도 4000×4000
// 전체가 들어 있었다). 창만 잘라 넣으려면 두 가지가 맞아야 한다 — 어느 픽셀을 자를지, 그리고
// 잘라 낸 조각을 어떤 변환으로 꽂아야 원래 창이 정확히 같은 자리에 오는지.
//
// imageTransform 은 노드 단위좌표 → 원본 단위좌표다(cropFractions 가 이 방향으로 읽어 62장에서
// 맞았고, 이 파일의 T′ 로 만든 PDF 가 원본과 0.04pt 안에서 겹쳤다). 조각은 창을 감싸는 정수
// 사각형 + 1px 여유고, T′ = C ∘ T 로 원본 단위좌표를 조각 단위좌표로 옮긴다. 단위좌표라 조각을
// 몇 배로 줄이든 그대로다.

import { PixelSize } from './imageDensity'
import { Transform } from './imageTarget'
import { CropRect } from './types'

/** 창을 감싸는 축 정렬 사각형 — 원본 단위좌표(0~1). 돌아간 창이면 실제 창보다 크다 */
export type Window = { x: number; y: number; width: number; height: number }

/**
 * 자리 하나가 보여 주는 창. `transform` 은 노드 단위좌표 → 원본 단위좌표(회전·뒤집기 포함),
 * `bbox` 는 그 창을 감싸는 축 정렬 사각형. 자를 것은 bbox 고, 꽂을 변환은 transform 에서 나온다.
 */
export type PaintWindow = { transform: Transform; bbox: Window; rotated: boolean }

/** 창을 감싸는 정수 사각형에 주는 여유(px). 리샘플러가 가장자리 밖을 읽어도 진짜 원본 픽셀을 읽게 */
export const WINDOW_PAD = 1

/** 이 비 이상 보이면 통째로 보는 자리다 — 자를 게 없다 */
const WHOLE_FRACTION = 0.999

/**
 * 창이 원본 가장자리를 넘어도 이만큼은 "닿았다" 로 본다(단위 정사각형 기준).
 * float32 부스러기(0.001 + 0.999 = 1.0000000116) 만이 아니다 — Figma 의 자르기 도구로 가장자리까지
 * 끌어 놓은 창은 실측 5.6e-5 ~ 3.4e-4 만큼 원본 밖으로 나가 있었다(2026-09-11, 포트폴리오 4-1 의
 * Background·image 22). 1e-6 이면 그런 자리가 전부 "원본 밖 창" 으로 빠져 통째로 실린다.
 * 넘친 부분은 원본에도 우리 조각에도 그릴 것이 없어 결과가 같다 — 상자보다 작게 놓은 이미지처럼
 * 크게 넘친 창(수 %)은 여전히 거절한다
 */
const EDGE_TOLERANCE = 2e-3

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/**
 * 노드 단위좌표 → 원본 단위좌표 변환이 보여 주는 창. 회전·기울임·뒤집기가 있어도 된다 —
 * 창은 원본 안의 기울어진 사각형이고, 자르는 것은 그것을 감싸는 축 정렬 사각형이다.
 * 정말로 원본 밖으로 나간 창(꼭짓점이 0~1 밖)은 경계로 제한하면 T′ 가 구도를 바꾸므로 null —
 * 그 자리는 잘라 넣지 않는다(기존 경로). 부스러기만큼 나간 것은 안으로 들인다.
 */
export function paintWindow(transform: Transform): PaintWindow | null {
  const [[a, b, tx], [c, d, ty]] = transform
  if (![a, b, tx, c, d, ty].every(Number.isFinite)) return null
  if (Math.abs(a * d - b * c) < 1e-9) return null
  const corners = [
    [tx, ty],
    [tx + a, ty + c],
    [tx + b, ty + d],
    [tx + a + b, ty + c + d]
  ]
  for (const [x, y] of corners) {
    if (x < -EDGE_TOLERANCE || x > 1 + EDGE_TOLERANCE) return null
    if (y < -EDGE_TOLERANCE || y > 1 + EDGE_TOLERANCE) return null
  }
  const xs = corners.map(([x]) => clamp01(x))
  const ys = corners.map(([, y]) => clamp01(y))
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return {
    transform,
    bbox: { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y },
    rotated: b !== 0 || c !== 0
  }
}

/** CROP 의 imageTransform 이 보여 주는 창 */
export function cropWindow(transform: Transform): PaintWindow | null {
  return paintWindow(transform)
}

/**
 * 채우기 패널의 회전(90° 단위) — 돌린 이미지의 단위좌표 → 원본 단위좌표.
 * 90 이 시계 방향인지는 기존 출력과 겹쳐 실측으로 정한다(cropprobe rotate R2).
 */
const FILL_ROTATIONS: Record<number, Transform> = {
  0: [
    [1, 0, 0],
    [0, 1, 0]
  ],
  90: [
    [0, 1, 0],
    [-1, 0, 1]
  ],
  180: [
    [-1, 0, 1],
    [0, -1, 1]
  ],
  270: [
    [0, -1, 1],
    [1, 0, 0]
  ]
}

/** 두 변환의 합성 — first 를 먼저, then 을 다음에 */
function compose(then: Transform, first: Transform): Transform {
  const [[p, q, r], [s, t, u]] = then
  const [[a, b, tx], [c, d, ty]] = first
  return [
    [p * a + q * c, p * b + q * d, p * tx + q * ty + r],
    [s * a + t * c, s * b + t * d, s * tx + t * ty + u]
  ]
}

/**
 * 비율이 어긋난 FILL 이 보여 주는 창 — Figma 는 가운데를 잘라 쓴다
 * (실측: 이 가정으로 만든 조각이 Figma 의 FILL 렌더와 0.07pt 안에서 겹쳤다).
 * 회전(90° 단위)이 있으면 돌린 이미지 위에서 가운데를 잡고 원본 좌표로 되돌린다. 90 배수가
 * 아닌 각도(90.4° 같은)는 반올림하지 않고 null — 임의 각도는 기존 경로(통째)다. 부동소수점
 * 부스러기만 FILL_ANGLE_TOLERANCE 안에서 받는다.
 */
export const FILL_ANGLE_TOLERANCE = 1e-3

export function fillWindow(
  box: { width: number; height: number },
  source: PixelSize,
  rotation = 0
): PaintWindow | null {
  if (!Number.isFinite(rotation)) return null
  const normalized = ((rotation % 360) + 360) % 360
  const nearest = Math.round(normalized / 90) * 90
  if (Math.abs(normalized - nearest) > FILL_ANGLE_TOLERANCE) return null
  const turn = nearest % 360
  const rotate = FILL_ROTATIONS[turn]
  if (rotate === undefined) return null
  const sideways = turn === 90 || turn === 270
  const rw = sideways ? source.height : source.width
  const rh = sideways ? source.width : source.height
  const scale = Math.max(box.width / rw, box.height / rh)
  const width = box.width / scale / rw
  const height = box.height / scale / rh
  const cover: Transform = [
    [width, 0, (1 - width) / 2],
    [0, height, (1 - height) / 2]
  ]
  return paintWindow(compose(rotate, cover))
}

/**
 * 창이 원본과 겹치는 넓이의 비(0~1) — 창이 원본 밖까지 나가도(이미지를 상자보다 작게 놓은 CROP) 센다.
 * 잘라 넣기(paintWindow)는 그런 창을 거절하지만, "쓰는 영역" 은 말할 수 있어야 한다.
 * 창(평행사변형)을 단위 정사각형으로 자르고(Sutherland–Hodgman) 넓이를 잰다. 못 셈하면 null
 */
export function paintCoverage(transform: Transform): number | null {
  const [[a, b, tx], [c, d, ty]] = transform
  if (![a, b, tx, c, d, ty].every(Number.isFinite)) return null
  if (Math.abs(a * d - b * c) < 1e-9) return null
  let polygon: Array<[number, number]> = [
    [tx, ty],
    [tx + a, ty + c],
    [tx + a + b, ty + c + d],
    [tx + b, ty + d]
  ]
  // 네 변으로 차례로 자른다: x ≥ 0, x ≤ 1, y ≥ 0, y ≤ 1
  const edges: Array<(p: [number, number]) => number> = [
    ([x]) => x,
    ([x]) => 1 - x,
    ([, y]) => y,
    ([, y]) => 1 - y
  ]
  for (const inside of edges) {
    const clipped: Array<[number, number]> = []
    for (let i = 0; i < polygon.length; i += 1) {
      const current = polygon[i]
      const previous = polygon[(i + polygon.length - 1) % polygon.length]
      const cIn = inside(current) >= 0
      const pIn = inside(previous) >= 0
      if (cIn !== pIn) {
        const t = inside(previous) / (inside(previous) - inside(current))
        clipped.push([
          previous[0] + (current[0] - previous[0]) * t,
          previous[1] + (current[1] - previous[1]) * t
        ])
      }
      if (cIn) clipped.push(current)
    }
    polygon = clipped
    if (polygon.length === 0) return 0
  }
  let area = 0
  for (let i = 0; i < polygon.length; i += 1) {
    const [x0, y0] = polygon[i]
    const [x1, y1] = polygon[(i + 1) % polygon.length]
    area += x0 * y1 - x1 * y0
  }
  return clamp01(Math.abs(area) / 2)
}

export function isWhole(window: Window): boolean {
  return window.width >= WHOLE_FRACTION && window.height >= WHOLE_FRACTION
}

/** 부동소수점 부스러기(0.45×3000 = 1350.0000000000002)가 픽셀 하나를 더 먹지 않게 */
const SNAP = 1e-6

/** 창(감싸는 사각형)을 담는 정수 사각형(+여유), 원본 안으로 */
export function enclosingRect(window: Window, source: PixelSize): CropRect {
  const x0 = Math.max(0, Math.floor(window.x * source.width + SNAP) - WINDOW_PAD)
  const y0 = Math.max(0, Math.floor(window.y * source.height + SNAP) - WINDOW_PAD)
  const x1 = Math.min(
    source.width,
    Math.ceil((window.x + window.width) * source.width - SNAP) + WINDOW_PAD
  )
  const y1 = Math.min(
    source.height,
    Math.ceil((window.y + window.height) * source.height - SNAP) + WINDOW_PAD
  )
  return { x0, y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) }
}

/**
 * 조각을 꽂을 변환 T′ = C ∘ T. C 는 원본 단위좌표 → 조각 단위좌표(축 정렬 자르기).
 * T 에 회전·뒤집기가 있어도 그대로 — 노드 모서리가 T 로 간 원본 픽셀과 T′ 로 간 조각 픽셀(+rect 원점)이 같다.
 */
export function pieceTransform(paint: PaintWindow, source: PixelSize, rect: CropRect): Transform {
  const [[a, b, tx], [c, d, ty]] = paint.transform
  return [
    [
      (a * source.width) / rect.w,
      (b * source.width) / rect.w,
      (tx * source.width - rect.x0) / rect.w
    ],
    [
      (c * source.height) / rect.h,
      (d * source.height) / rect.h,
      (ty * source.height - rect.y0) / rect.h
    ]
  ]
}
