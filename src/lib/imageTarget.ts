// 이미지 목표 크기 계산. Figma·DOM 의존 금지. (PRD FR-3)
//
// 핵심: 화면에 보이는 크기의 multiplier 배를 넘는 픽셀은 버린다.
// 3000px 스크린샷을 600pt 박스에 넣어도 Figma 는 3000px 그대로 임베드한다.

import { neededLongEdge, PixelSize } from './imageDensity'
import { ImageUsage, Settings } from './types'

// ImageUsage 는 메인↔UI 메시지에도 실리므로 types.ts 에 산다. 계산 쪽 이름은 그대로 둔다.
export type { ImageUsage } from './types'

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
 * 하한은 사용자가 정한다(설정의 minEdge, 이미지 탭의 "가장 작게 남길 크기" 바).
 * 예전에는 코드 상수(MIN_TARGET_LONG_EDGE)와 설정값이 따로 있어 그림과 결과가 어긋났다 —
 * 화면이 640 이라고 적어 놓고 1024 로 내보냈다. 값을 하나로 합쳤다.
 */

/**
 * 이 이미지를 손댈 것인가.
 *
 * 기준은 **그 이미지 자신의 목표**다. 예전에는 프레임 예산(skipFloor)으로 걸렀는데,
 * 그러면 300pt 자리에 놓인 1920px 썸네일이 "프레임 예산 안" 이라며 통과했다 —
 * 제 목표(640px)의 세 배인데도. 실측(2026-09-09, 2× 설정): 이미지 70장 중 68장이
 * 그 관문에서 통째로 건너뛰어졌고, 넘치는 픽셀만 2.4MB 였다.
 *
 * 절대 하한(minEdge)은 그대로다 — 로고·아이콘은 어떤 문서에서도 안 건드린다.
 * 이 뒤에도 가드가 셋 더 있다: 100KB 바이트 하한, 업스케일 금지(scaledSize),
 * 줄였는데 커지면 되돌리기(keepsOriginal).
 */
export function shouldShrink(originalLongEdge: number, targetLongEdge: number): boolean {
  return originalLongEdge > targetLongEdge
}

/**
 * 원본이 이 바이트 이하면 픽셀이 커도 손대지 않는다.
 * 용량 절감의 본질은 바이트다 — 40KB 를 1.5KB 로 만들자고 화질을 버릴 이유가 없다.
 */
export const KEEP_BYTES_FLOOR = 100_000

/**
 * 밀도 보정을 적용할 최소 배수.
 *
 * 실측(2026-09-09, 이미지 fill 62개)에서 필요/현재 비는 두 무리로 갈렸다 — 1.00~1.04 의
 * 반올림 오차와 1.16 이상의 진짜 부족분, 그 사이는 비어 있었다. 1.1 은 그 골짜기다.
 * 낮게 잡으면 멀쩡한 이미지까지 목표가 흔들려 다시 인코딩되고, 높게 잡으면 ×1.2 대를 놓친다.
 */
export const DENSITY_MARGIN = 1.1

export function targetFor(
  usage: ImageUsage,
  settings: Pick<Settings, 'multiplier' | 'maxEdge' | 'minEdge'>,
  source?: PixelSize | null
): number {
  const shown = Math.ceil(displayedLongEdge(usage) * settings.multiplier)
  let wanted = shown

  // 상자를 그대로 채우지 않는 자리(잘라 쓰거나 비율이 어긋난 FILL)는 보이는 구간이
  // 제 밀도를 가지려면 원본이 더 커야 한다. 원본 크기를 모르면 옛 계산 그대로다.
  const needed = neededLongEdge(
    {
      width: usage.width,
      height: usage.height,
      scaleMode: usage.scaleMode,
      crop: usage.crop
    },
    source ?? null
  )
  if (needed !== null) {
    const dense = Math.ceil(needed * settings.multiplier)
    if (dense > shown * DENSITY_MARGIN) wanted = dense
  }

  return Math.min(settings.maxEdge, Math.max(wanted, settings.minEdge))
}

/**
 * 같은 이미지를 여러 노드가 쓰면 가장 크게 쓰는 쪽에 맞춘다.
 * 작은 쪽에 맞추면 큰 노드가 뭉개진다.
 */
export function planImageTargets(
  usages: readonly ImageUsage[],
  settings: Pick<Settings, 'multiplier' | 'maxEdge' | 'minEdge'>,
  sizes?: Record<string, PixelSize>
): ImagePlan[] {
  const byHash = new Map<string, ImagePlan>()

  for (const usage of usages) {
    if (!isProcessable(usage)) continue

    const target = targetFor(usage, settings, sizes?.[usage.imageHash])
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
