// 이미지 목표 크기 계산. Figma·DOM 의존 금지. (PRD FR-3)
//
// 핵심: 화면에 보이는 크기의 multiplier 배를 넘는 픽셀은 버린다.
// 3000px 스크린샷을 600pt 박스에 넣어도 Figma 는 3000px 그대로 임베드한다.

import { Settings } from './types'

/** 이미지 fill 을 쓰는 노드 하나 */
export type ImageUsage = {
  nodeId: string
  imageHash: string
  /** 노드의 표시 크기 (px) */
  width: number
  height: number
  scaleMode: 'FILL' | 'FIT' | 'CROP' | 'TILE'
}

export type ImagePlan = {
  imageHash: string
  targetLongEdge: number
  nodeIds: string[]
}

/**
 * 교체한 이미지가 렌더러에 준비될 때까지 기다릴 시간.
 *
 * createImage 로 만든 이미지는 fill 에 꽂아도 렌더러가 곧바로 쓰지 못한다. 그 상태로
 * exportAsync 를 부르면 그 그림만 쏙 빠진 PDF 가 나온다 — 실측: 처리한 7장이 전부
 * 사라지고 처리를 건너뛴 4장만 남았다. Figma 에는 "이제 준비됐다" 를 알려주는 API 가
 * 없어서 기다리는 수밖에 없다. 장수에 비례하되 상한을 둔다.
 */
export function settleDelayMs(replacedCount: number): number {
  if (replacedCount === 0) return 0
  return Math.min(4000, 400 + replacedCount * 300)
}

/** Figma 의 absoluteTransform — [[a, b, tx], [c, d, ty]] */
export type Transform = readonly [
  readonly [number, number, number],
  readonly [number, number, number]
]

/**
 * 변환 행렬에서 실제 배율을 뽑는다.
 *
 * `node.width` 는 **로컬 좌표계** 크기다 — 부모 그룹·프레임이 확대·축소돼 있으면
 * 화면에 보이는 크기와 다르다. 이걸 놓치면 크게 보이는 이미지를 작은 크기로 오해해
 * 과하게 줄여버린다 (실측: 1334pt 로 깔리는 이미지를 556px 로 축소해 30ppi 가 됐다).
 *
 * 회전이 섞여 있어도 열 벡터의 길이가 곧 배율이므로 정확하다.
 */
export function transformScale(transform: Transform): { x: number; y: number } {
  const [[a, b], [c, d]] = transform
  return { x: Math.hypot(a, c), y: Math.hypot(b, d) }
}

export function displayedLongEdge(usage: ImageUsage): number {
  return Math.max(usage.width, usage.height)
}

/** TILE 은 표시 크기와 픽셀 수의 관계가 단순하지 않아 건드리지 않는다. (PRD §3) */
export function isProcessable(usage: ImageUsage): boolean {
  return usage.scaleMode !== 'TILE' && displayedLongEdge(usage) > 0
}

/**
 * 이 크기 이하의 이미지는 아예 건드리지 않는다 — 리사이즈도, 재인코딩도.
 * 기준은 "프레임 긴 변 × 배율": 프레임 예산 안에 드는 이미지(로고 등)를
 * 다시 인코딩해 봐야 몇 KB 아끼자고 화질만 상한다. 열화는 큰 원본에서만 값어치가 있다.
 */
export function processFloor(
  settings: Pick<Settings, 'multiplier' | 'maxEdge'>,
  frameLongEdge: number
): number {
  return Math.min(settings.maxEdge, Math.ceil(frameLongEdge * settings.multiplier))
}

/**
 * 아무리 작게 표시돼도 이 아래로는 줄이지 않는다.
 * 2383px 로고가 93pt 로 표시된다고 140px 로 뭉개면 줌·인쇄에서 바로 티가 난다 —
 * 640px 이면 로고·아이콘이 선명함을 유지하면서도 원본 대비 충분히 가볍다.
 */
export const MIN_TARGET_LONG_EDGE = 640

/**
 * 원본이 이 바이트 이하면 픽셀이 커도 손대지 않는다.
 * 용량 절감의 본질은 바이트다 — 40KB 를 1.5KB 로 만들자고 화질을 버릴 이유가 없다.
 */
export const KEEP_BYTES_FLOOR = 100_000

export function targetFor(
  usage: ImageUsage,
  settings: Pick<Settings, 'multiplier' | 'maxEdge'>
): number {
  const wanted = Math.ceil(displayedLongEdge(usage) * settings.multiplier)
  return Math.min(settings.maxEdge, Math.max(wanted, MIN_TARGET_LONG_EDGE))
}

/**
 * 같은 이미지를 여러 노드가 쓰면 가장 크게 쓰는 쪽에 맞춘다.
 * 작은 쪽에 맞추면 큰 노드가 뭉개진다.
 */
export function planImageTargets(
  usages: readonly ImageUsage[],
  settings: Pick<Settings, 'multiplier' | 'maxEdge'>
): ImagePlan[] {
  const byHash = new Map<string, ImagePlan>()

  for (const usage of usages) {
    if (!isProcessable(usage)) continue

    const target = targetFor(usage, settings)
    const found = byHash.get(usage.imageHash)

    if (found === undefined) {
      byHash.set(usage.imageHash, {
        imageHash: usage.imageHash,
        targetLongEdge: target,
        nodeIds: [usage.nodeId]
      })
      continue
    }

    found.targetLongEdge = Math.max(found.targetLongEdge, target)
    if (!found.nodeIds.includes(usage.nodeId)) found.nodeIds.push(usage.nodeId)
  }

  return [...byHash.values()]
}

/** 원본이 이미 목표보다 작으면 키우지 않는다. */
export function needsDownscale(originalLongEdge: number, targetLongEdge: number): boolean {
  return originalLongEdge > targetLongEdge
}

/**
 * 리사이즈 후 크기. 긴 변을 target 에 맞추고 짧은 변은 비율대로.
 * 최소 1px 은 남긴다.
 */
export function scaledSize(
  width: number,
  height: number,
  targetLongEdge: number
): { width: number; height: number } {
  const longEdge = Math.max(width, height)
  if (longEdge <= targetLongEdge) return { width, height }

  const scale = targetLongEdge / longEdge
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}

/** 처리 결과가 원본보다 크면 원본을 쓴다. 압축했는데 커지는 경우가 실제로 있다. */
export function keepsOriginal(originalBytes: number, processedBytes: number): boolean {
  return processedBytes >= originalBytes
}
