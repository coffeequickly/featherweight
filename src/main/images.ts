// 클론 안의 이미지 fill 을 줄인 이미지로 갈아끼운다. (PRD FR-3, §7.4-3)
//
// export 옵션으로는 이미지 품질을 못 건드리므로(C2) export 전에 fill 자체를 바꾼다.

import {
  ImagePlan,
  ImageUsage,
  KEEP_BYTES_FLOOR,
  planImageTargets,
  processFloor,
  transformScale
} from '../lib/imageTarget'
import { Reason } from '../lib/types'
import { Settings } from '../lib/types'
import { awaitResponse, nextRequestId } from './bridge'

export type ResizeResponse =
  | {
      reqId: string
      ok: true
      bytes: Uint8Array
      mime: string
      width: number
      height: number
      changed: boolean
    }
  | { reqId: string; ok: false; reason: string }

export type ImageStats = {
  processed: number
  bytesBefore: number
  bytesAfter: number
  warnings: Reason[]
}

export type ImageRequestSender = (payload: {
  reqId: string
  bytes: Uint8Array
  targetLongEdge: number
  quality: number
  reencodeOpaquePng: boolean
}) => void

type FillsNode = SceneNode & { fills: readonly Paint[] | typeof figma.mixed }

function hasFills(node: SceneNode): node is FillsNode {
  return 'fills' in node
}

/** 클론 전체에서 이미지 fill 을 쓰는 자리를 모은다. */
export function collectImageUsages(root: SceneNode): ImageUsage[] {
  const usages: ImageUsage[] = []

  const visit = (node: SceneNode): void => {
    if (node.visible === false) return

    if (hasFills(node) && Array.isArray(node.fills)) {
      for (const paint of node.fills) {
        if (paint.type !== 'IMAGE' || paint.visible === false) continue
        if (paint.imageHash === null) continue
        // 부모가 확대·축소돼 있으면 node.width 는 화면 크기가 아니다 — 배율을 곱한다
        const scale = transformScale(node.absoluteTransform)
        usages.push({
          nodeId: node.id,
          imageHash: paint.imageHash,
          width: node.width * scale.x,
          height: node.height * scale.y,
          scaleMode: paint.scaleMode
        })
      }
    }

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
  isCancelled: () => boolean
): Promise<ImageStats> {
  const stats: ImageStats = { processed: 0, bytesBefore: 0, bytesAfter: 0, warnings: [] }
  const usages = collectImageUsages(root)
  const plans = planImageTargets(usages, settings)
  if (plans.length === 0) return stats

  // 프레임 예산 안에 드는 이미지는 손대지 않는다 — 작은 로고까지 열화시킬 이유가 없다.
  // 프레임 자체가 스케일돼 있을 수 있으므로 여기서도 렌더 크기로 잰다.
  const rootScale = transformScale(root.absoluteTransform)
  const floor = processFloor(
    settings,
    Math.max(root.width * rootScale.x, root.height * rootScale.y)
  )

  const replacement = new Map<string, string>()

  for (let index = 0; index < plans.length; index += 1) {
    if (isCancelled()) break
    onProgress(index + 1, plans.length)

    const plan = plans[index]
    try {
      const newHash = await shrinkOne(plan, floor, settings, send, stats)
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

  if (replacement.size > 0) applyReplacements(root, replacement)
  return stats
}

async function shrinkOne(
  plan: ImagePlan,
  floor: number,
  settings: Settings,
  send: ImageRequestSender,
  stats: ImageStats
): Promise<string | null> {
  const image = figma.getImageByHash(plan.imageHash)
  if (image === null) {
    stats.warnings.push({ code: 'image.missing', params: { hash: plan.imageHash.slice(0, 8) } })
    return null
  }

  // 픽셀 수만 먼저 본다 — 기준선 이하면 바이트를 UI 로 보낼 필요조차 없다
  const size = await image.getSizeAsync()
  if (Math.max(size.width, size.height) <= floor) return null

  const original = await image.getBytesAsync()

  // 이미 가벼운 파일은 픽셀이 커도 그대로 둔다 — 절감의 본질은 바이트다
  if (original.length <= KEEP_BYTES_FLOOR) return null

  stats.bytesBefore += original.length

  const reqId = nextRequestId('img')
  const promise = awaitResponse<ResizeResponse>(reqId)
  send({
    reqId,
    bytes: original,
    targetLongEdge: plan.targetLongEdge,
    quality: settings.quality,
    reencodeOpaquePng: settings.reencodeOpaquePng
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

    // createImage 는 바이트를 받아들이고도 렌더링 불가능한 이미지를 만들 수 있다.
    // 그대로 fill 에 꽂으면 export 때 그림이 통째로 빠진다(빈 자리만 남는다) —
    // 크기를 물어봐서 실제로 읽히는지 확인하고, 아니면 원본을 지킨다.
    const size = await created.getSizeAsync()
    if (size.width === 0 || size.height === 0) {
      throw new Error('created image has no size')
    }

    stats.bytesAfter += result.bytes.length
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
