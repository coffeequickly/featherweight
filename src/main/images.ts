// 클론 안의 이미지 fill 을 줄인 이미지로 갈아끼운다. (PRD FR-3, §7.4-3)
//
// export 옵션으로는 이미지 품질을 못 건드리므로(C2) export 전에 fill 자체를 바꾼다.

import { EMPTY_CLIP, intersect, Rect, visibleFraction } from '../lib/clipRect'
import { chooseCrop, CropPlan, frameImagePlan, pieceKey } from '../lib/imageCrop'
import { probeItemsFrom } from '../lib/imageProbe'
import { cropFractions, PixelSize } from '../lib/imageDensity'
import {
  ImagePlan,
  KEEP_BYTES_FLOOR,
  shouldShrink,
  settleDelayMs,
  Transform,
  transformScale
} from '../lib/imageTarget'
import {
  ImageProbeItem,
  ImageUsage,
  Reason,
  ResizeManyRequestPayload,
  ResizeManyResultPayload,
  ResizeRequestPayload,
  ResizeResultPayload,
  Settings
} from '../lib/types'
import { withTimeout } from '../lib/withTimeout'
import { knownEdge, knownSize, persistEdgeCache, readSize, rememberSize } from './imageSize'
import { awaitResponse, nextRequestId } from './bridge'

export type ImageStats = {
  /**
   * 손댄 원본의 해시. 쪽마다 세면 여러 쪽에 깔린 같은 사진이 쪽 수만큼 세어져
   * "이미지 1장 중 31장 축소" 가 된다 — 결과 카드는 이 해시를 합쳐 서로 다른 장수를 말한다
   */
  processed: string[]
  /** processed 중 보이는 창만 잘라 넣은 원본 — 품질을 지키고도 바이트가 줄 때만 (lib/imageCrop.ts) */
  cropped: string[]
  /** 조각을 만들다 실패해 W₀ 로 물러선 원본 — 출력은 정상이다. 경고가 아니라 안내 */
  recovered: string[]
  bytesBefore: number
  bytesAfter: number
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

/**
 * 이번 export 에서 이미 만든 교체 이미지. 같은 원본을 같은 목표·설정으로 다시 쓰는 프레임은
 * UI 왕복·재인코딩·createImage 없이 그 해시를 다시 꽂는다 — 31장에 깔린 배경은 한 번만 만든다.
 * 값은 문자열·숫자뿐이라 상한이 필요 없다. runExport 가 비운다.
 */
type Replacement = {
  /** null 이면 "줄여도 안 작아져 그대로 두기로 했다" — 그 판단도 재사용한다 */
  hash: string | null
  bytes: number
  mime: string
  originalBytes: number
}
const replacements = new Map<string, Replacement>()

/**
 * 이번 export 에서 이미 만든 조각. 키는 pieceKey — 같은 원본·사각형·목표·설정이면 다음 프레임도
 * 그 해시를 꽂는다. 값은 문자열·숫자뿐이라 상한이 필요 없다. runExport 가 비운다.
 */
type Piece = { hash: string; bytes: number; mime: string }
const pieces = new Map<string, Piece>()

export function forgetReplacements(): void {
  replacements.clear()
  pieces.clear()
}

function replacementKey(plan: ImagePlan, settings: Settings): string {
  return `${plan.imageHash}|${plan.targetLongEdge}|${settings.quality}|${settings.reencodeOpaquePng ? 1 : 0}`
}

/** 리사이즈 요청을 UI 로 보내는 통로 — 메시지 모양은 types.ts 의 것 하나뿐이다 */
export type ImageRequestSender = (payload: ResizeRequestPayload) => void
/** 조각 여럿을 한 번에 — 없으면(옛 호출자·테스트) 잘라 넣기를 하지 않는다 */
export type ImageManySender = (payload: ResizeManyRequestPayload) => void

type FillsNode = SceneNode & { fills: readonly Paint[] | typeof figma.mixed }

function hasFills(node: SceneNode): node is FillsNode {
  return 'fills' in node
}

/** 새로 만든 이미지가 그릴 수 있는 상태가 되기를 기다리는 한도 */
const READY_TIMEOUT_MS = 20_000
/** 원본 바이트 읽기 한도 — 응답 없는 이미지 하나가 프레임을 영영 잡아 두지 않게 */
const BYTES_TIMEOUT_MS = 20_000

function bytesOf(image: Image, hash: string): Promise<Uint8Array> {
  return withTimeout(image.getBytesAsync(), BYTES_TIMEOUT_MS, hash.slice(0, 8))
}

/**
 * 지금까지 읽어 둔 원본 크기. 선택 시점의 예고(selection.ts 의 imageEdges)가 채워 두므로
 * 내보낼 때는 대개 다 알고 있다. 모르는 것은 빠지고, targetFor 가 옛 계산으로 물러선다.
 */
function knownSizes(usages: readonly ImageUsage[]): Record<string, PixelSize> {
  const out: Record<string, PixelSize> = {}
  for (const usage of usages) {
    if (out[usage.imageHash] !== undefined) continue
    const size = knownSize(usage.imageHash)
    if (size !== undefined) out[usage.imageHash] = size
  }
  return out
}

/**
 * 탐색용: 이 프로필로 처리한다면 이 프레임의 이미지들을 무엇으로 셀지 — export 와 같은
 * 계획(frameImagePlan)에서 나온 쪽 단위 항목. 실제 처리는 하지 않는다.
 */
export function probeItemsOf(
  root: SceneNode,
  profile: { multiplier: number; maxEdge: number; minEdge: number },
  cropToVisible = true
): ImageProbeItem[] {
  const usages = collectImageUsages(root)
  return probeItemsFrom(
    usages,
    {
      multiplier: profile.multiplier as Settings['multiplier'],
      maxEdge: profile.maxEdge as Settings['maxEdge'],
      minEdge: profile.minEdge as Settings['minEdge']
    },
    knownSizes(usages),
    seenImages,
    cropToVisible
  )
}

/**
 * 이 노드 하나가 쓰는 이미지 fill 들. 선택 시점의 예고(selection.ts)와 export 가
 * 같은 눈으로 봐야 "줄임 예정" 과 실제 결과가 어긋나지 않는다.
 */
export function imageUsagesOf(node: SceneNode, clip: Rect | null = null): ImageUsage[] {
  if (!hasFills(node) || !Array.isArray(node.fills)) return []

  const usages: ImageUsage[] = []
  let scale: { x: number; y: number } | null = null

  for (let index = 0; index < node.fills.length; index += 1) {
    const paint = node.fills[index]
    if (paint.type !== 'IMAGE' || paint.visible === false) continue
    if (paint.imageHash === null) continue
    // 부모가 확대·축소돼 있으면 node.width 는 화면 크기가 아니다 — 배율을 곱한다
    scale ??= transformScale(node.absoluteTransform)
    const cropped = paint.scaleMode === 'CROP' && paint.imageTransform !== undefined
    usages.push({
      nodeId: node.id,
      imageHash: paint.imageHash,
      name: node.name,
      width: node.width * scale.x,
      height: node.height * scale.y,
      localSize: { width: node.width, height: node.height },
      scaleMode: paint.scaleMode,
      // 잘라 쓰면 원본의 일부만 이 자리에 들어온다 — 목표를 셈하려면 그 비가 필요하다
      crop: cropped ? cropFractions(paint.imageTransform as Transform) : undefined,
      // 창만 잘라 넣으려면 비뿐 아니라 원점까지, 그리고 어느 fill 인지
      fillIndex: index,
      cropTransform: cropped ? (paint.imageTransform as Transform) : undefined,
      paintRotation: paint.scaleMode === 'CROP' ? undefined : paint.rotation,
      visible: visibleIn(node, clip)
    })
  }

  return usages
}

/**
 * 이 노드가 클립 안에 얼마나 남는가. 경계를 못 읽으면 1 로 둔다 —
 * 재지 못한 것을 "잘렸다" 고 말하면 없는 낭비를 지어내는 셈이다.
 */
function visibleIn(node: SceneNode, clip: Rect | null): number {
  if (clip === null) return 1
  const box = node.absoluteBoundingBox
  if (box === null) return 1
  return visibleFraction(box, clip)
}

/**
 * 프레임이 clipsContent 를 켜 두면 그 상자가 새 클립이다 — 조상들의 클립과 겹쳐 좁힌다.
 *
 * 겹치는 데가 없으면 빈 클립이다. intersect 의 null 을 그대로 돌려주면 그 밑에서 "클립 없음"
 * 이 돼, 부모 밖으로 통째로 나간 프레임 안의 그림이 visible 1 로 잡혔다(2026-09-10 재현).
 */
export function clipFor(node: SceneNode, parentClip: Rect | null): Rect | null {
  if (!('clipsContent' in node) || node.clipsContent !== true) return parentClip
  const box = node.absoluteBoundingBox
  if (box === null) return parentClip
  return parentClip === null ? box : (intersect(box, parentClip) ?? EMPTY_CLIP)
}

/** 클론 전체에서 이미지 fill 을 쓰는 자리를 모은다. 클립은 내려가면서 좁아진다. */
export function collectImageUsages(root: SceneNode): ImageUsage[] {
  const usages: ImageUsage[] = []

  const visit = (node: SceneNode, clip: Rect | null): void => {
    if (node.visible === false) return
    usages.push(...imageUsagesOf(node, clip))
    if ('children' in node) {
      const inner = clipFor(node, clip)
      for (const child of node.children) visit(child, inner)
    }
  }

  visit(root, clipFor(root, null))
  return usages
}

/** 조각을 꽂을 자리 — 노드·fill 색인으로 집는다 */
type FillSwap = { hash: string; transform: Transform }

const fillKey = (nodeId: string, fillIndex: number): string => `${nodeId}|${fillIndex}`

/**
 * 해시별로 한 번씩 처리하고 fill 을 교체한다.
 * 이미지 하나가 실패해도 원본을 유지하고 계속한다. (PRD §7.7)
 *
 * 잘라 넣기(sendMany 가 있을 때): 전체본 W₀ 를 만든 뒤, 조각 계획이 있는 해시는 조각도 인코딩해
 * 바이트를 견준다. 조각 합이 W₀ 보다 작을 때만 자리마다 조각을 꽂고, 아니면 W₀ 다 — 품질은
 * 계획 단계가 이미 기존 이상으로 못 박았으니 여기서 보는 것은 바이트뿐이다.
 */
export async function shrinkImages(
  root: SceneNode,
  settings: Settings,
  send: ImageRequestSender,
  onProgress: (current: number, total: number) => void,
  isCancelled: () => boolean,
  keepOriginal?: OriginalSink,
  sendMany?: ImageManySender
): Promise<ImageStats> {
  const usages = collectImageUsages(root)
  const stats: ImageStats = {
    processed: [],
    cropped: [],
    recovered: [],
    bytesBefore: 0,
    bytesAfter: 0,
    bytesUntouched: 0,
    warnings: [],
    seen: [...new Set(usages.map((usage) => usage.imageHash))]
  }
  // 손댈지는 이미지마다 제 목표로 정한다(shouldShrink) — 프레임 예산으로 재면
  // 작은 자리에 놓인 큰 그림이 통째로 빠져나간다.
  // 계획은 목표 용량 예측(probeItemsOf)과 같은 함수에서 나온다 — 예측과 결과가 같은 것을 본다.
  // 조각 계획은 원본 크기를 아는 해시만, 통째로 보는 자리가 있으면 없다(기존 유지).
  const { plans, crops } = frameImagePlan(usages, settings, knownSizes(usages))
  if (plans.length === 0) return stats

  const byHash = new Map<string, string>()
  const byFill = new Map<string, FillSwap>()
  // 이번 프레임에서 실제로 createImage 한 수. 앞 프레임에서 준비·export까지 끝난 해시는
  // 새 클론에 다시 꽂아도 데이터 준비를 기다릴 필요가 없다.
  let freshApplied = 0

  for (let index = 0; index < plans.length; index += 1) {
    if (isCancelled()) break
    onProgress(index + 1, plans.length)

    const plan = plans[index]
    try {
      const whole = await shrinkOne(plan, settings, send, stats, keepOriginal)
      if (whole === null) continue

      const crop = crops.get(plan.imageHash)
      let chosen: ReadyPiece[] | null = null
      // 설정이 꺼져 있으면 통로가 있어도 묻지 않는다 — exporter 가 통로를 안 주지만 여기서도 막는다
      if (crop !== undefined && sendMany !== undefined && settings.cropToVisible) {
        try {
          const attempt = await cropOne(crop, whole, settings, sendMany)
          if (attempt.kind === 'pieces') chosen = attempt.pieces
          else if (attempt.kind === 'failed') stats.recovered.push(plan.imageHash)
        } catch {
          // 취소로 끊긴 것이면 복구할 것도 없다 — 바로 나간다
          if (isCancelled()) break
          // 조각 생성·되읽기·브리지 예외는 W₀ 로 합류한다. 원본으로 돌아가면 이미 만든
          // 축소본과 바이트 통계가 사라지고 기존보다 큰 PDF 가 나간다. 출력은 정상이니 안내로만
          stats.recovered.push(plan.imageHash)
        }
      }

      stats.processed.push(plan.imageHash)
      if (chosen === null || crop === undefined) {
        byHash.set(plan.imageHash, whole.hash)
        if (whole.fresh) freshApplied += 1
        stats.bytesAfter += whole.bytes
        continue
      }

      stats.cropped.push(plan.imageHash)
      for (let at = 0; at < crop.pieces.length; at += 1) {
        const piece = chosen[at]
        if (piece.fresh) freshApplied += 1
        stats.bytesAfter += piece.bytes
        for (const fill of crop.pieces[at].fills) {
          byFill.set(fillKey(fill.nodeId, fill.fillIndex), {
            hash: piece.hash,
            transform: fill.imageTransform
          })
        }
      }
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

  if (byHash.size > 0 || byFill.size > 0) {
    applyReplacements(root, byHash, byFill)
    // 방금 만든 이미지에만 필요하다. 캐시 해시는 앞 프레임의 대기와 export를 이미 통과했다.
    const delay = settleDelayMs(freshApplied)
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
  }
  void persistEdgeCache() // 선택 때 못 읽은 크기를 여기서 새로 읽었을 수 있다
  return stats
}

/** shrinkOne 이 만든(또는 캐시에서 찾은) 전체본 W₀. original 은 캐시에서 왔으면 없다 */
type Whole = {
  hash: string
  bytes: number
  mime: string
  original: Uint8Array | null
  image: Image
  /** 이 프레임에서 createImage 한 해시인가. false면 앞 프레임에서 이미 렌더 준비가 끝났다. */
  fresh: boolean
}

/**
 * 조각을 인코딩해 W₀ 와 견준다. 이기면 조각마다 createImage 해서 돌려주고, 아니면 null.
 * 캐시에 있는 조각은 다시 만들지 않는다. 어느 단계든 실패하면 null — W₀ 로 물러선다.
 */
async function cropOne(
  crop: CropPlan,
  whole: Whole,
  settings: Settings,
  sendMany: ImageManySender
): Promise<CropAttempt> {
  const keys = crop.pieces.map((piece) => pieceKey(crop.imageHash, piece, settings))
  const encoded: Array<ReadyPiece | { bytes: Uint8Array; mime: string } | null> = keys.map(
    (key) => {
      const cached = pieces.get(key)
      return cached === undefined ? null : { ...cached, fresh: false }
    }
  )

  const missing = crop.pieces
    .map((piece, at) => ({ piece, at }))
    .filter(({ at }) => encoded[at] === null)
  if (missing.length > 0) {
    const original = whole.original ?? (await bytesOf(whole.image, crop.imageHash))
    const reqId = nextRequestId('imgs')
    const promise = awaitResponse<ResizeManyResultPayload>(reqId)
    sendMany({
      reqId,
      bytes: original,
      imageHash: crop.imageHash,
      quality: settings.quality,
      reencodeOpaquePng: settings.reencodeOpaquePng,
      jobs: missing.map(({ piece }) => ({ targetLongEdge: piece.targetLongEdge, crop: piece.rect }))
    })
    const result = await promise
    // UI 가 정상 회신으로 실패를 알린 것 — 예외와 같은 복구 경로다(검토: 예전엔 '절감 부족' 과 섞여 복구 0 으로 셌다)
    if (!result.ok || result.results.length !== missing.length) return { kind: 'failed' }
    missing.forEach(({ at }, order) => {
      encoded[at] = { bytes: result.results[order].bytes, mime: result.results[order].mime }
    })
  }

  // 바이트를 먼저 견준다 — createImage 는 이긴 뒤에만. 품질은 계획이 이미 기존 이상으로 못 박았고,
  // 채택은 목표 용량 예측과 같은 함수(chooseCrop)가 정한다
  let total = 0
  for (const item of encoded) {
    if (item === null) return { kind: 'failed' }
    total += item.bytes instanceof Uint8Array ? item.bytes.length : item.bytes
  }
  if (!chooseCrop(whole.bytes, total, crop.densityGain).crop) return { kind: 'declined' }

  const out: ReadyPiece[] = []
  for (let at = 0; at < encoded.length; at += 1) {
    const item = encoded[at] as ReadyPiece | { bytes: Uint8Array; mime: string }
    if (!(item.bytes instanceof Uint8Array)) {
      out.push(item as ReadyPiece)
      continue
    }
    // createImage 는 형식·크기 제한에 걸리면 throw 한다 — 조각 하나가 안 되면 통째로 W₀ 다
    const created = figma.createImage(item.bytes)
    await withTimeout(created.getBytesAsync(), READY_TIMEOUT_MS, crop.imageHash.slice(0, 8))
    const piece: Piece = { hash: created.hash, bytes: item.bytes.length, mime: item.mime }
    pieces.set(keys[at], piece)
    out.push({ ...piece, fresh: true })
  }
  return { kind: 'pieces', pieces: out }
}

/** 조각 시도의 결말 — 채택 / 절감 부족으로 W₀ / 인코딩 실패로 W₀(복구로 센다) */
type ReadyPiece = Piece & { fresh: boolean }
type CropAttempt =
  { kind: 'pieces'; pieces: ReadyPiece[] } | { kind: 'declined' } | { kind: 'failed' }

/**
 * 전체본 W₀ 하나를 만든다(또는 캐시에서 찾는다). 손대지 않기로 했거나 실패하면 null — 그 사유의
 * 통계(bytesUntouched·경고·원본 유지 바이트)는 여기서 적고, 처리한 결과의 통계는 부르는 쪽이
 * 조각과 견준 뒤에 적는다.
 */
async function shrinkOne(
  plan: ImagePlan,
  settings: Settings,
  send: ImageRequestSender,
  stats: ImageStats,
  keepOriginal?: OriginalSink
): Promise<Whole | null> {
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
    original = await bytesOf(image, plan.imageHash)
    const read = await readSize(image, original)
    if (read === null) throw new Error('cannot read image size')
    rememberSize(plan.imageHash, read)
    longEdge = Math.max(read.width, read.height)
  }
  const belowFloor = !shouldShrink(longEdge, plan.targetLongEdge)
  if (belowFloor && keepOriginal === undefined) return null

  // 앞 프레임에서 같은 목표·설정으로 만든 결과가 있으면 그대로 — 바이트도 안 읽고 UI 도 안 부른다
  const key = replacementKey(plan, settings)
  const known = replacements.get(key)
  if (known !== undefined && !belowFloor) {
    seenImages.set(plan.imageHash, { longEdge, bytes: known.originalBytes })
    stats.bytesBefore += known.originalBytes
    if (known.hash === null) {
      stats.bytesAfter += known.bytes
      return null
    }
    return {
      hash: known.hash,
      bytes: known.bytes,
      mime: known.mime,
      original: null,
      image,
      fresh: false
    }
  }

  original ??= await bytesOf(image, plan.imageHash)
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
    imageHash: plan.imageHash,
    keepOriginal: keepOriginal !== undefined
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
    replacements.set(key, {
      hash: null,
      bytes: original.length,
      mime: result.mime,
      originalBytes: original.length
    })
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

    replacements.set(key, {
      hash: created.hash,
      bytes: result.bytes.length,
      mime: result.mime,
      originalBytes: original.length
    })
    return {
      hash: created.hash,
      bytes: result.bytes.length,
      mime: result.mime,
      original,
      image,
      fresh: true
    }
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

/** Figma 에 넘길 변환 — 우리 것은 읽기 전용 튜플이라 복사한다 */
function toFigmaTransform(
  transform: Transform
): [[number, number, number], [number, number, number]] {
  return [
    [transform[0][0], transform[0][1], transform[0][2]],
    [transform[1][0], transform[1][1], transform[1][2]]
  ]
}

function applyReplacements(
  root: SceneNode,
  byHash: Map<string, string>,
  byFill: Map<string, FillSwap>
): void {
  const visit = (node: SceneNode): void => {
    if (hasFills(node) && Array.isArray(node.fills)) {
      let touched = false
      const next = node.fills.map((paint, index): Paint => {
        if (paint.type !== 'IMAGE' || paint.imageHash === null) return paint
        // 조각은 그 자리만 — 같은 원본을 통째로 쓰는 다른 자리는 해시 교체로 간다
        const piece = byFill.get(fillKey(node.id, index))
        if (piece !== undefined) {
          touched = true
          const swapped: ImagePaint = {
            type: 'IMAGE',
            scaleMode: 'CROP',
            imageHash: piece.hash,
            imageTransform: toFigmaTransform(piece.transform),
            visible: paint.visible,
            opacity: paint.opacity,
            blendMode: paint.blendMode
          }
          return paint.filters === undefined ? swapped : { ...swapped, filters: paint.filters }
        }
        const swap = byHash.get(paint.imageHash)
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
