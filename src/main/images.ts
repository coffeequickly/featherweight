// 클론 안의 이미지 fill 을 줄인 이미지로 갈아끼운다. (PRD FR-3, §7.4-3)
//
// export 옵션으로는 이미지 품질을 못 건드리므로(C2) export 전에 fill 자체를 바꾼다.

import {
  ImagePlan,
  KEEP_BYTES_FLOOR,
  planImageTargets,
  skipFloor,
  settleDelayMs,
  transformScale
} from '../lib/imageTarget'
import {
  ImageUsage,
  Reason,
  ResizeRequestPayload,
  ResizeResultPayload,
  Settings
} from '../lib/types'
import { withTimeout } from '../lib/withTimeout'
import { knownEdge, persistEdgeCache, readEdge, rememberEdge } from './imageSize'
import { awaitResponse, nextRequestId } from './bridge'

export type ImageStats = {
  processed: number
  bytesBefore: number
  bytesAfter: number
  /** bytesAfter 중 우리가 만든 JPEG — PDF 에 그대로 실린다 (목표 용량 예측의 보정 제외분) */
  bytesJpeg: number
  /** 손대지 않고 통과시킨 이미지의 바이트 합 — 목표 용량 예측용 */
  bytesUntouched: number
  warnings: Reason[]
  /** 이 프레임의 서로 다른 이미지 해시 — 결과 카드가 체크리스트와 같은 수를 말하려고 */
  seen: string[]
}

/** 원본 바이트를 UI 캐시로 흘려보내는 통로. Fit to Size 일 때만 준다. */
export type OriginalSink = (imageHash: string, bytes: Uint8Array) => void

/**
 * 이번 export 에서 실제로 본 이미지의 픽셀·바이트.
 *
 * 후보 프로필을 재보려면 "이 프로필의 기준선을 넘는가"(픽셀)와 "손대지 않으면 몇
 * 바이트인가"를 알아야 하는데, 둘 다 Figma 왕복이라 후보마다 다시 묻기엔 비싸다.
 * 기준 패스에서 한 번 본 값을 여기 남겨 두고 재사용한다. runExport 가 비운다.
 */
const seenImages = new Map<string, { longEdge: number; bytes: number }>()

export function seenImageInfo(): ReadonlyMap<string, { longEdge: number; bytes: number }> {
  return seenImages
}

export function forgetSeenImages(): void {
  seenImages.clear()
}

/** 리사이즈 요청을 UI 로 보내는 통로 — 메시지 모양은 types.ts 의 것 하나뿐이다 */
export type ImageRequestSender = (payload: ResizeRequestPayload) => void

type FillsNode = SceneNode & { fills: readonly Paint[] | typeof figma.mixed }

function hasFills(node: SceneNode): node is FillsNode {
  return 'fills' in node
}

/** 새로 만든 이미지가 그릴 수 있는 상태가 되기를 기다리는 한도 */
const READY_TIMEOUT_MS = 20_000

/**
 * 탐색용: 이 프로필로 처리한다면 각 이미지의 목표 크기가 얼마인지.
 * 실제 처리는 하지 않는다 — UI 가 바이트만 재보게 넘길 목록이다.
 */
export function planFor(
  root: SceneNode,
  profile: { multiplier: number; maxEdge: number }
): ImagePlan[] {
  const usages = collectImageUsages(root)
  return planImageTargets(usages, {
    multiplier: profile.multiplier as Settings['multiplier'],
    maxEdge: profile.maxEdge as Settings['maxEdge']
  })
}

/**
 * 이 노드 하나가 쓰는 이미지 fill 들. 선택 시점의 예고(selection.ts)와 export 가
 * 같은 눈으로 봐야 "줄임 예정" 과 실제 결과가 어긋나지 않는다.
 */
export function imageUsagesOf(node: SceneNode): ImageUsage[] {
  if (!hasFills(node) || !Array.isArray(node.fills)) return []

  const usages: ImageUsage[] = []
  let scale: { x: number; y: number } | null = null

  for (const paint of node.fills) {
    if (paint.type !== 'IMAGE' || paint.visible === false) continue
    if (paint.imageHash === null) continue
    // 부모가 확대·축소돼 있으면 node.width 는 화면 크기가 아니다 — 배율을 곱한다
    scale ??= transformScale(node.absoluteTransform)
    usages.push({
      nodeId: node.id,
      imageHash: paint.imageHash,
      width: node.width * scale.x,
      height: node.height * scale.y,
      scaleMode: paint.scaleMode
    })
  }

  return usages
}

/** 클론 전체에서 이미지 fill 을 쓰는 자리를 모은다. */
export function collectImageUsages(root: SceneNode): ImageUsage[] {
  const usages: ImageUsage[] = []

  const visit = (node: SceneNode): void => {
    if (node.visible === false) return
    usages.push(...imageUsagesOf(node))
    if ('children' in node) {
      for (const child of node.children) visit(child)
    }
  }

  visit(root)
  return usages
}

/**
 * 해시별로 한 번씩 처리하고 fill 을 교체한다.
 * 이미지 하나가 실패해도 원본을 유지하고 계속한다. (PRD §7.7)
 */
export async function shrinkImages(
  root: SceneNode,
  settings: Settings,
  send: ImageRequestSender,
  onProgress: (current: number, total: number) => void,
  isCancelled: () => boolean,
  keepOriginal?: OriginalSink
): Promise<ImageStats> {
  const usages = collectImageUsages(root)
  const stats: ImageStats = {
    processed: 0,
    bytesBefore: 0,
    bytesAfter: 0,
    bytesJpeg: 0,
    bytesUntouched: 0,
    warnings: [],
    seen: [...new Set(usages.map((usage) => usage.imageHash))]
  }
  const plans = planImageTargets(usages, settings)
  if (plans.length === 0) return stats

  // 프레임 예산 안에 드는 이미지는 손대지 않는다 — 작은 로고까지 열화시킬 이유가 없다.
  // 프레임 자체가 스케일돼 있을 수 있으므로 여기서도 렌더 크기로 잰다.
  const rootScale = transformScale(root.absoluteTransform)
  const floor = skipFloor(settings, Math.max(root.width * rootScale.x, root.height * rootScale.y))

  const replacement = new Map<string, string>()

  for (let index = 0; index < plans.length; index += 1) {
    if (isCancelled()) break
    onProgress(index + 1, plans.length)

    const plan = plans[index]
    try {
      const newHash = await shrinkOne(plan, floor, settings, send, stats, keepOriginal)
      if (newHash !== null) replacement.set(plan.imageHash, newHash)
    } catch (error) {
      stats.warnings.push({
        code: 'image.warn',
        params: {
          hash: plan.imageHash.slice(0, 8),
          detail: error instanceof Error ? error.message : String(error)
        }
      })
    }
  }

  if (replacement.size > 0) {
    applyReplacements(root, replacement)
    // 여기서 안 기다리면 방금 꽂은 이미지가 export 에서 통째로 빠진다 (settleDelayMs 참고)
    await new Promise((resolve) => setTimeout(resolve, settleDelayMs(replacement.size)))
  }
  void persistEdgeCache() // 선택 때 못 읽은 크기를 여기서 새로 읽었을 수 있다
  return stats
}

async function shrinkOne(
  plan: ImagePlan,
  floor: number,
  settings: Settings,
  send: ImageRequestSender,
  stats: ImageStats,
  keepOriginal?: OriginalSink
): Promise<string | null> {
  const image = figma.getImageByHash(plan.imageHash)
  if (image === null) {
    stats.warnings.push({ code: 'image.missing', params: { hash: plan.imageHash.slice(0, 8) } })
    return null
  }

  // 픽셀 수만 먼저 본다 — 기준선 이하면 바이트를 UI 로 보낼 필요조차 없다.
  // 크기는 선택 때 읽어 둔 것이 거의 다 있다. 없으면 바이트 머리에서 읽는다 — 그 바이트는
  // 어차피 곧 필요하니 두 번 받지 않는다. 통째로 디코드하는 getSizeAsync 는 마지막 수단.
  // 단 목표 용량 탐색 중이면 통과시킨 이미지의 바이트도 알아야 예측이 맞는다.
  let original: Uint8Array | null = null
  let longEdge = knownEdge(plan.imageHash)
  if (longEdge === undefined) {
    original = await image.getBytesAsync()
    const read = await readEdge(image, original)
    if (read === null) throw new Error('cannot read image size')
    rememberEdge(plan.imageHash, read)
    longEdge = read
  }
  const belowFloor = longEdge <= floor
  if (belowFloor && keepOriginal === undefined) return null

  original ??= await image.getBytesAsync()
  seenImages.set(plan.imageHash, { longEdge, bytes: original.length })

  // 이미 가벼운 파일은 픽셀이 커도 그대로 둔다 — 절감의 본질은 바이트다
  if (belowFloor || original.length <= KEEP_BYTES_FLOOR) {
    stats.bytesUntouched += original.length
    // 더 센 프로필에서는 이 이미지도 처리 대상이 될 수 있다 — 그때 재보게 넘겨둔다.
    // (처리하는 이미지는 리사이즈 요청이 원본을 같이 실어 보내므로 여기서는 뺀다)
    keepOriginal?.(plan.imageHash, original)
    return null
  }

  stats.bytesBefore += original.length

  const reqId = nextRequestId('img')
  const promise = awaitResponse<ResizeResultPayload>(reqId)
  send({
    reqId,
    bytes: original,
    targetLongEdge: plan.targetLongEdge,
    quality: settings.quality,
    reencodeOpaquePng: settings.reencodeOpaquePng,
    imageHash: plan.imageHash // UI 가 탐색용으로 원본을 들고 있는다
  })
  const result = await promise

  if (!result.ok) {
    stats.bytesAfter += original.length
    stats.warnings.push({
      code: 'image.warn',
      params: { hash: plan.imageHash.slice(0, 8), detail: result.reason }
    })
    return null
  }

  if (!result.changed) {
    stats.bytesAfter += original.length
    return null
  }

  try {
    const created = figma.createImage(result.bytes)

    // ⚠ 여기서 기다리지 않으면 큰 이미지가 통째로 사라진다.
    //
    // createImage 는 즉시 해시를 주지만 이미지 데이터는 뒤늦게 준비된다. 준비되기 전에
    // exportAsync 를 부르면 Figma 가 그 fill 을 그리지 못하고 빈 자리로 남긴다 —
    // 실측: 100KB 넘는 이미지(2500~4032px)만 골라서 사라졌고, 처리를 건너뛴 작은
    // 이미지는 멀쩡했다. 커질수록 준비가 늦으니 정확히 큰 것만 빠진 것이다.
    //
    // getSizeAsync 는 메타데이터라 준비 전에도 답해서 이 상황을 못 거른다.
    // 실제 바이트를 되읽어야 "그릴 수 있는 상태" 임이 보장된다.
    await withTimeout(created.getBytesAsync(), READY_TIMEOUT_MS, plan.imageHash.slice(0, 8))

    stats.bytesAfter += result.bytes.length
    if (result.mime === 'image/jpeg') stats.bytesJpeg += result.bytes.length
    stats.processed += 1
    return created.hash
  } catch (error) {
    // createImage 는 형식·크기 제한(4096)에 걸리면 throw 한다 (C4)
    stats.bytesAfter += original.length
    stats.warnings.push({
      code: 'image.replaceFailed',
      params: {
        hash: plan.imageHash.slice(0, 8),
        error: error instanceof Error ? error.message : String(error)
      }
    })
    return null
  }
}

function applyReplacements(root: SceneNode, replacement: Map<string, string>): void {
  const visit = (node: SceneNode): void => {
    if (hasFills(node) && Array.isArray(node.fills)) {
      let touched = false
      const next = node.fills.map((paint) => {
        if (paint.type !== 'IMAGE' || paint.imageHash === null) return paint
        const swap = replacement.get(paint.imageHash)
        if (swap === undefined) return paint
        touched = true
        return { ...paint, imageHash: swap }
      })
      if (touched) node.fills = next
    }

    if ('children' in node) {
      for (const child of node.children) visit(child)
    }
  }

  visit(root)
}
