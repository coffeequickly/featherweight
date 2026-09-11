// 원본 하나를 쓰는 자리들을 조각으로 바꿀 수 있는가 — 계획만. Figma·DOM 의존 금지.
//
// 규칙(2026-09-10 합의): 기존 출력의 선명도가 바닥이다. 기존은 해시마다 전체본 하나(W₀, 목표 T₀)를
// 모든 자리가 나눠 쓰므로, 자리 i 의 창에는 창px × T₀/원본긴변 픽셀이 들어간다. 조각은 그 이상이어야
// 하고, 통째로 보는 자리가 하나라도 있으면 W₀ 가 그대로 남아야 하니 조각은 순수 추가 — 그 묶음은
// 기존 유지다. 바이트 비교(Σ조각 < W₀)는 인코딩한 뒤 메인이 한다. 여기서는 "만들 수 있는가" 와
// "얼마로 만들어야 하는가" 만 정한다.
//
// 실측(사진 3000×4000, 균형 프리셋): 자리 넷(창 10·25·5%·FILL 가로띠) 묶음은 573K → 302K(−47%)
// 이고 자리마다 픽셀이 기존 이상이었다. 전체가 보이는 자리를 하나 더 넣으면 +323K 라 기존 유지.

import {
  cropWindow,
  enclosingRect,
  fillWindow,
  isWhole,
  PaintWindow,
  pieceTransform
} from './cropWindow'
import { PixelSize } from './imageDensity'
import { ImagePlan, planImageTargets, scaledSize, Transform } from './imageTarget'
import { CropRect, ImageUsage, Settings } from './types'

/**
 * 채택 기준값 — 전부 여기. 실측으로 조정한다(2026-09-11 초기값).
 *
 * 품질은 계획 단계가 지킨다(자리마다 양축 밀도 ≥ 기존). 여기 값들은 그 위에서 "얼마나 줄어야
 * 굳이 조각을 만드나" 를 정한다 — 조각 하나가 이미지 한 장이고, 한 장은 준비 대기 300ms 다.
 */
export const CROP_RULES = {
  /** 밀도가 기존과 거의 같은 후보는 이만큼은 줄어야 채택 */
  minSavingSameDensity: 0.05,
  /** 밀도 이득이 이 배 이상이면 "크게 높아지는" 후보로 분리 — 절감이 작아도 검토한다 */
  sharperFrom: 1.5,
  /** 분리된 후보의 최소 절감. 0 이면 동률에도 조각을 만드니 조금은 줄어야 한다 */
  minSavingSharper: 0.01,
  /** 원본 하나에 조각이 이보다 많으면 인코딩을 시작하기 전에 기존 경로 */
  maxPiecesPerImage: 12,
  /** 조각 픽셀 합이 W₀ 픽셀의 이 배를 넘으면 시작 전에 기존 경로 — 이길 가망이 없고 인코딩만 는다 */
  maxPiecePixelRatio: 1
} as const

export type CropVerdict = {
  crop: boolean
  /** 1 − Σ조각/W₀. 음수면 커진 것 */
  saving: number
  /** 밀도가 크게 높아지는 후보인가 — 화면에 "화질 개선" 이라고 적지 않는다, 픽셀이 는 것뿐이다 */
  sharper: boolean
}

/**
 * W₀ 대신 조각을 쓸 것인가 — export 와 목표 용량 예측이 같은 함수로 정한다.
 * 밀도는 이미 기존 이상이라(planCrops), 여기서 보는 것은 바이트와 그 이득이 값어치가 있는가뿐이다.
 */
export function chooseCrop(
  wholeBytes: number,
  pieceBytes: number,
  densityGain: number
): CropVerdict {
  const saving = wholeBytes <= 0 ? 0 : 1 - pieceBytes / wholeBytes
  const sharper = densityGain >= CROP_RULES.sharperFrom
  const need = sharper ? CROP_RULES.minSavingSharper : CROP_RULES.minSavingSameDensity
  return { crop: saving >= need, saving, sharper }
}

export type PieceFill = { nodeId: string; fillIndex: number; imageTransform: Transform }

export type PiecePlan = {
  rect: CropRect
  targetLongEdge: number
  /** 이 조각을 쓰는 자리들 — 창이 서브픽셀만큼 달라도 감싸는 사각형이 같으면 조각을 나눠 쓴다 */
  fills: PieceFill[]
}

export type CropPlan = {
  imageHash: string
  pieces: PiecePlan[]
  /** 조각들 가운데 가장 작은 밀도 이득(기존 대비 배, 양축 중 작은 쪽). 계획상 1 이상이다 */
  densityGain: number
  /** 조각들의 저장 픽셀 합 — 인코딩 전에 가망을 보는 데 쓴다 */
  piecePixels: number
}

/** 한 프레임의 이미지 계획 — export 와 목표 용량 예측이 같은 것을 본다 */
export type FrameImagePlan = { plans: ImagePlan[]; crops: Map<string, CropPlan> }

export function frameImagePlan(
  usages: readonly ImageUsage[],
  settings: Pick<Settings, 'multiplier' | 'maxEdge' | 'minEdge'>,
  sizes: Record<string, PixelSize>
): FrameImagePlan {
  const plans = planImageTargets(usages, settings, sizes)
  const crops = new Map(
    planCrops(usages, settings, sizes, plans).map((plan) => [plan.imageHash, plan])
  )
  return { plans, crops }
}

/**
 * 이 자리가 보여 주는 창. 잘라 넣을 수 없으면(원본 밖 창·FIT·TILE·fill 색인 없음) null.
 * 상자 안에서 이미지를 돌린 것(CROP 의 회전, FILL 의 90° 회전)은 창이 기울어질 뿐이라 잘라 넣는다.
 * 통째로 보는 자리는 창을 돌려주되 isWhole 이 참이다 — 부르는 쪽이 가른다.
 */
export function windowOf(usage: ImageUsage, source: PixelSize): PaintWindow | null {
  if (usage.scaleMode === 'CROP') {
    return usage.cropTransform === undefined ? null : cropWindow(usage.cropTransform)
  }
  if (usage.scaleMode === 'FILL') {
    const box = usage.localSize
    if (box === undefined) return null
    if (
      !Number.isFinite(box.width) ||
      !Number.isFinite(box.height) ||
      box.width <= 0 ||
      box.height <= 0
    )
      return null
    return fillWindow(box, source, usage.paintRotation ?? 0)
  }
  return null
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value))

/**
 * 여백을 포함한 조각의 실제 출력 양변이 W₀의 원본 픽셀당 밀도를 밑돌지 않는 최소 목표.
 * 긴 변 하나의 비율만 쓰면 padding과 짧은 변의 반올림 때문에 한 축이 모자랄 수 있다.
 * scaledSize는 목표에 대해 단조 증가하므로 정수 목표를 이분 탐색한다.
 */
function pieceTarget(
  rect: CropRect,
  source: PixelSize,
  whole: PixelSize,
  own: number,
  maxEdge: number
): number | null {
  const long = Math.max(rect.w, rect.h)
  let low = Math.min(long, own)
  let high = Math.min(long, maxEdge)
  // 조각 변은 정수라 필요한 값에 반 픽셀 못 미치는 것은 반올림이지 밀도 손실이 아니다 — 그만큼만
  // 봐준다. 안 봐주면 목표가 최대치에 걸린 자리(T₀ = maxEdge)가 641 vs 641.28 로 탈락한다(실측).
  const enough = (target: number): boolean => {
    const size = scaledSize(rect.w, rect.h, target)
    return (
      (size.width + 0.5) * source.width >= whole.width * rect.w &&
      (size.height + 0.5) * source.height >= whole.height * rect.h
    )
  }
  if (!enough(high)) return null
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (enough(mid)) high = mid
    else low = mid + 1
  }
  return Math.max(own, low) // 원본보다 큰 목표여도 scaledSize가 업스케일을 막는다.
}

/**
 * 해시마다 조각 계획. 계획이 없는 해시는 기존 경로 그대로다.
 *
 * `plans` 는 planImageTargets 의 결과(T₀). 원본 크기를 모르면 창을 픽셀로 못 옮기니 건너뛴다.
 * T₀ 가 원본 이상이면 기존 경로가 손을 안 대므로 여기서도 안 댄다 — 손 안 댄 원본을 조각으로
 * 다시 인코딩하면 그건 품질 변화다.
 */
export function planCrops(
  usages: readonly ImageUsage[],
  settings: Pick<Settings, 'multiplier' | 'maxEdge' | 'minEdge'>,
  sizes: Record<string, PixelSize>,
  plans: readonly ImagePlan[]
): CropPlan[] {
  const out: CropPlan[] = []

  for (const plan of plans) {
    const source = sizes[plan.imageHash]
    if (source === undefined) continue
    const long = Math.max(source.width, source.height)
    const T0 = plan.targetLongEdge
    if (T0 >= long) continue
    const whole = scaledSize(source.width, source.height, T0)

    const mine = usages.filter((usage) => usage.imageHash === plan.imageHash)
    const pieces = new Map<string, PiecePlan>()
    let possible = mine.length > 0

    for (const usage of mine) {
      if (usage.fillIndex === undefined) {
        possible = false
        break
      }
      const window = windowOf(usage, source)
      // 통째로 보는 자리가 있으면 W₀ 가 남아야 한다 — 조각은 그 위에 얹는 순수 추가
      if (window === null || isWhole(window.bbox)) {
        possible = false
        break
      }

      const own = clamp(
        Math.ceil(Math.max(usage.width, usage.height) * settings.multiplier),
        settings.minEdge,
        settings.maxEdge
      )
      const rect = enclosingRect(window.bbox, source)
      const targetLongEdge = pieceTarget(rect, source, whole, own, settings.maxEdge)
      if (targetLongEdge === null) {
        possible = false
        break
      }
      const key = `${rect.x0},${rect.y0},${rect.w},${rect.h}|${targetLongEdge}`
      const piece = pieces.get(key) ?? { rect, targetLongEdge, fills: [] }
      piece.fills.push({
        nodeId: usage.nodeId,
        fillIndex: usage.fillIndex,
        imageTransform: pieceTransform(window, source, rect)
      })
      pieces.set(key, piece)
    }

    if (!possible || pieces.size === 0) continue
    // 시작 전 관문 — 조각이 너무 많거나 픽셀 합이 W₀ 를 넘으면 인코딩해 봐야 소용없다
    if (pieces.size > CROP_RULES.maxPiecesPerImage) continue
    let densityGain = Infinity
    let piecePixels = 0
    for (const piece of pieces.values()) {
      const size = scaledSize(piece.rect.w, piece.rect.h, piece.targetLongEdge)
      piecePixels += size.width * size.height
      // 기존이 이 사각형에 준 픽셀 대비 — 양축 중 작은 쪽
      const gainX = (size.width * source.width) / (whole.width * piece.rect.w)
      const gainY = (size.height * source.height) / (whole.height * piece.rect.h)
      densityGain = Math.min(densityGain, gainX, gainY)
    }
    if (piecePixels > whole.width * whole.height * CROP_RULES.maxPiecePixelRatio) continue
    out.push({ imageHash: plan.imageHash, pieces: [...pieces.values()], densityGain, piecePixels })
  }

  return out
}

/** 프레임 간 재사용 키 — 같은 원본·같은 사각형·같은 목표·같은 인코딩 설정이면 같은 조각 */
export function pieceKey(
  imageHash: string,
  piece: Pick<PiecePlan, 'rect' | 'targetLongEdge'>,
  settings: Pick<Settings, 'quality' | 'reencodeOpaquePng'>
): string {
  const { rect } = piece
  return `${imageHash}|${rect.x0},${rect.y0},${rect.w},${rect.h}|${piece.targetLongEdge}|${settings.quality}|${settings.reencodeOpaquePng ? 1 : 0}`
}
