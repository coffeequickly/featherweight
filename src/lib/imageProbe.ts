// 목표 용량 예측 — export 와 같은 눈으로. Figma·DOM 의존 금지. (docs/FIT-TO-SIZE.md)
//
// 예측이 크롭을 모르면 W₀ 바이트로만 세어 실제보다 크게 나오고, 목표 안에 들 수 있던 더 선명한
// 프로필을 놓친다. 그래서 항목을 쪽마다 만들고(창·목표가 쪽마다 다르다), 인코딩된 바이트를 받아
// export 와 같은 규칙(chooseCrop)으로 W₀ 와 조각 중 하나를 고른다. 인코딩은 UI 가 하고, 여기는
// 계획(어떤 항목)과 집계(무엇을 더하나)만 — 둘 다 순수라 테스트로 못 박는다.

import { chooseCrop, frameImagePlan } from './imageCrop'
import { PixelSize } from './imageDensity'
import { KEEP_BYTES_FLOOR, keepsOriginal, shouldShrink } from './imageTarget'
import { CropRect, ImageProbeItem, ImageUsage, Settings } from './types'

/** 기준 패스에서 본 이미지 — 원본 긴 변과 바이트 (main/images.ts seenImageInfo) */
export type SeenImage = { longEdge: number; bytes: number }

/**
 * 한 쪽(프레임)의 예측 항목. export 의 shrinkImages 와 같은 계획(frameImagePlan)에서 나온다.
 * 기준 패스에서 못 본 이미지는 셀 근거가 없어 뺀다.
 */
export function probeItemsFrom(
  usages: readonly ImageUsage[],
  settings: Pick<Settings, 'multiplier' | 'maxEdge' | 'minEdge'>,
  sizes: Record<string, PixelSize>,
  seen: ReadonlyMap<string, SeenImage>,
  cropToVisible = true
): ImageProbeItem[] {
  const { plans, crops } = frameImagePlan(usages, settings, sizes)
  // 잘라 넣기를 끄면 예측도 W₀ 로만 센다 — 내보내기와 같은 눈
  if (!cropToVisible) crops.clear()
  const items: ImageProbeItem[] = []
  for (const plan of plans) {
    const info = seen.get(plan.imageHash)
    if (info === undefined) continue
    const crop = crops.get(plan.imageHash)
    const item: ImageProbeItem = {
      imageHash: plan.imageHash,
      targetLongEdge: plan.targetLongEdge,
      // 탐색도 실제 export 와 같은 기준을 써야 예측이 맞는다
      skip: !shouldShrink(info.longEdge, plan.targetLongEdge),
      originalBytes: info.bytes
    }
    if (crop !== undefined) {
      item.pieces = crop.pieces.map((piece) => ({
        targetLongEdge: piece.targetLongEdge,
        crop: piece.rect
      }))
      item.densityGain = crop.densityGain
    }
    items.push(item)
  }
  return items
}

/**
 * 인코딩 결과 하나. `bytes` 는 우리가 만든 파일 크기 — 원본을 그대로 둘지, 조각을 쓸지는 export 가
 * 이걸로 정하므로 예측도 같은 값으로 정한다. `sized` 는 그 파일이 PDF 안에서 차지할 크기(Figma 가
 * 다시 인코딩한 뒤, resize.figmaSizeOf) — 더할 때는 이걸 쓴다. 없으면 bytes 그대로
 */
export type Encoded = { bytes: number; mime: string; sized?: number }

/** UI 가 인코딩해 둔 것을 찾아 주는 창구. 없으면(캐시에 없거나 실패) null */
export type EncodedLookup = {
  whole: (imageHash: string, targetLongEdge: number) => Encoded | null
  piece: (imageHash: string, crop: CropRect, targetLongEdge: number) => Encoded | null
  /** 원본을 그대로 둘 때 PDF 안에서 차지할 크기. 못 쟀으면 null — 원본 파일 크기로 센다 */
  original: (imageHash: string) => number | null
}

export type ProbeTally = {
  totalBytes: number
  /** 캐시에 없어 재보지 못한 항목 — 원본 크기로 셌다 */
  failed: number
  /** 조각으로 센 항목 */
  cropped: number
  /** 조각을 재보려 했으나 인코딩이 빠져 W₀ 로 센 항목 — export 의 복구와 같은 규칙 */
  recovered: number
}

/**
 * 항목마다 export 가 할 일을 그대로 흉내 내어 더한다.
 *   손 안 댐 → 원본 · W₀ 가 원본보다 안 작음 → 원본(조각도 안 봄) · 조각이 하나라도 없음 → W₀
 *   그 외 → chooseCrop 이 고른 쪽
 */
export function tallyProbe(items: readonly ImageProbeItem[], lookup: EncodedLookup): ProbeTally {
  const tally: ProbeTally = { totalBytes: 0, failed: 0, cropped: 0, recovered: 0 }

  for (const item of items) {
    if (item.originalBytes <= KEEP_BYTES_FLOOR) {
      tally.totalBytes += item.originalBytes
      continue
    }
    // 줄일 필요가 없어 원본 그대로 가는 자리 — Figma 는 그것도 다시 인코딩하므로 그 크기로
    if (item.skip) {
      tally.totalBytes += lookup.original(item.imageHash) ?? item.originalBytes
      continue
    }
    const whole = lookup.whole(item.imageHash, item.targetLongEdge)
    if (whole === null) {
      tally.totalBytes += item.originalBytes
      tally.failed += 1
      continue
    }
    // 줄여도 안 작아지면 export 는 원본을 그대로 넣는다 — Figma 는 그것도 다시 인코딩하므로 그 크기로
    if (keepsOriginal(item.originalBytes, whole.bytes)) {
      tally.totalBytes += lookup.original(item.imageHash) ?? item.originalBytes
      continue
    }

    let chosen: Encoded[] = [whole]
    if (item.pieces !== undefined && item.pieces.length > 0) {
      const encoded = item.pieces.map((piece) =>
        lookup.piece(item.imageHash, piece.crop, piece.targetLongEdge)
      )
      if (encoded.some((piece) => piece === null)) {
        tally.recovered += 1
      } else {
        const pieces = encoded as Encoded[]
        const sum = pieces.reduce((total, piece) => total + piece.bytes, 0)
        if (chooseCrop(whole.bytes, sum, item.densityGain ?? 1).crop) {
          chosen = pieces
          tally.cropped += 1
        }
      }
    }
    for (const piece of chosen) {
      tally.totalBytes += piece.sized ?? piece.bytes
    }
  }

  return tally
}
