// 목표 용량 탐색용 원본 이미지 캐시. (docs/FIT-TO-SIZE.md)
//
// 후보 프로필을 여러 개 재보려면 같은 원본을 여러 번 인코딩해야 한다. 그때마다 메인에서
// 바이트를 다시 받으면(structured clone) 그게 병목이 되므로, 기준 export 때 받은 원본을
// 해시로 들고 있는다. Figma 왕복 없이 캔버스 인코딩만 반복하면 되니 탐색이 싸진다.
//
// 큰 이미지 여러 장을 들고 있으면 iframe 메모리가 위험하다. 총량 상한을 두고 넘으면
// 오래 안 쓴 것부터 버린다. export 가 끝나면 즉시 비운다.

import { Encoded, ProbeTally, tallyProbe } from '../lib/imageProbe'
import { imageDimensions } from '../lib/imageHeader'
import { ByteCache, ImageWorkQueue } from '../lib/imageWork'
import { chooseCrop } from '../lib/imageCrop'
import { KEEP_BYTES_FLOOR, keepsOriginal } from '../lib/imageTarget'
import { CropRect, ImageProbeItem } from '../lib/types'
import {
  cloneBitmap,
  decodeImage,
  encodePiece,
  figmaSizeOf,
  isPng,
  resizeDecoded,
  resizeImage,
  resizeMany,
  ResizeRequest,
  ResizeResult,
  ResizeManyRequest,
  ResizeManyResult
} from './resize'

/** 캐시 총량 상한. 넘으면 오래된 것부터 버린다. */
const MAX_CACHE_BYTES = 200 * 1024 * 1024

type CachedImage = Extract<ResizeResult, { ok: true }>
const encodedImages = new ByteCache<CachedImage>(64 * 1024 * 1024)
const workQueue = new ImageWorkQueue(192 * 1024 * 1024, 4)
let generation = 0
let reuseHits = 0
export function imageCacheStats(): {
  originalBytes: number
  encodedBytes: number
  reuseHits: number
} {
  return { originalBytes: cachedBytes, encodedBytes: encodedImages.bytes, reuseHits }
}
function checkGeneration(expected: number): void {
  if (expected !== generation) throw new Error('Image work cancelled')
}
function workCost(bytes: Uint8Array): number {
  const size = imageDimensions(bytes)
  // Source + clone/crop + intermediate + canvas, at four bytes per pixel each.
  return size === null ? Infinity : size.width * size.height * 16 + bytes.byteLength
}
function encodedKey(
  hash: string,
  target: number,
  quality: number,
  png: boolean,
  crop?: CropRect
): string {
  return JSON.stringify([
    hash,
    target,
    quality,
    png,
    crop === undefined ? null : [crop.x0, crop.y0, crop.w, crop.h]
  ])
}
function retain(key: string, result: CachedImage, expected: number): void {
  checkGeneration(expected)
  if (result.changed) encodedImages.set(key, result)
}

/** Only probe output is retained. Ordinary exports do not acquire an original-image cache. */
export async function resizeImageCached(
  request: ResizeRequest & { imageHash?: string }
): Promise<ResizeResult> {
  const expected = generation
  try {
    const hit =
      request.imageHash === undefined
        ? undefined
        : encodedImages.get(
            encodedKey(
              request.imageHash,
              request.targetLongEdge,
              request.quality,
              request.reencodeOpaquePng
            )
          )
    if (hit !== undefined) {
      reuseHits += 1
      return hit
    }
    return await workQueue.run(workCost(request.bytes), async () => {
      checkGeneration(expected)
      const result = await resizeImage(request)
      checkGeneration(expected)
      if (result.ok && request.imageHash !== undefined) {
        retain(
          encodedKey(
            request.imageHash,
            request.targetLongEdge,
            request.quality,
            request.reencodeOpaquePng
          ),
          result,
          expected
        )
      }
      return result
    })
  } catch (error) {
    return { ok: false, reason: String(error) }
  }
}

export async function resizeManyCached(
  request: ResizeManyRequest & { imageHash?: string }
): Promise<ResizeManyResult> {
  const expected = generation
  try {
    const results = request.jobs.map((job) =>
      request.imageHash === undefined
        ? undefined
        : encodedImages.get(
            encodedKey(
              request.imageHash,
              job.targetLongEdge,
              request.quality,
              request.reencodeOpaquePng,
              job.crop
            )
          )
    )
    const missing = request.jobs
      .map((job, at) => ({ job, at }))
      .filter(({ at }) => results[at] === undefined)
    reuseHits += results.length - missing.length
    if (missing.length > 0) {
      const fresh = await workQueue.run(workCost(request.bytes), async () => {
        checkGeneration(expected)
        const result = await resizeMany({ ...request, jobs: missing.map(({ job }) => job) })
        checkGeneration(expected)
        return result
      })
      if (!fresh.ok) return fresh
      missing.forEach(({ at }, index) => {
        const result: CachedImage = { ...fresh.results[index], ok: true, changed: true }
        results[at] = result
        if (request.imageHash !== undefined) {
          const job = missing[index].job
          retain(
            encodedKey(
              request.imageHash,
              job.targetLongEdge,
              request.quality,
              request.reencodeOpaquePng,
              job.crop
            ),
            result,
            expected
          )
        }
      })
    }
    checkGeneration(expected)
    return {
      ok: true,
      results: results.map((result) => {
        if (result === undefined) throw new Error('Missing image result')
        return result
      })
    }
  } catch (error) {
    return { ok: false, reason: String(error) }
  }
}

const originals = new Map<string, Uint8Array>()
// 원본을 그대로 넣을 때 PDF 안에서 차지할 크기 — 한 번 재면 실행 내내 같다
const sizedOriginals = new Map<string, number>()
let cachedBytes = 0
// 이 실행에서 Figma 에 넣은(넣을 수 있는) 이미지의 치수 "WxH" — 머지된 PDF 안에서 우리 것을 알아보는 열쇠.
// 줄인 출력은 그 치수로, 원본 그대로 가는 것은 원본 치수(EXIF 방향 반영)로 들어간다
const ownSizes = new Set<string>()

export function imageCacheGeneration(): number {
  return generation
}

export function rememberOwnSize(width: number, height: number, expected = generation): void {
  if (expected !== generation) return
  ownSizes.add(`${width}x${height}`)
}

export function ownImageSizes(): ReadonlySet<string> {
  return ownSizes
}

export function rememberOriginal(imageHash: string, bytes: Uint8Array): void {
  if (originals.has(imageHash)) return
  // 원본 그대로 들어가더라도 PDF 안에서 알아봐야 한다 — 치수부터 적는다
  const size = imageDimensions(bytes)
  if (size !== null) rememberOwnSize(size.width, size.height)
  // 혼자서 상한을 넘는 원본은 들고 있어 봐야 다른 것을 다 밀어낸다 — 재보지 않고 원본 크기로 센다
  if (bytes.length > MAX_CACHE_BYTES) return

  originals.set(imageHash, bytes.buffer.byteLength === bytes.byteLength ? bytes : bytes.slice())
  cachedBytes += bytes.length

  // Map 은 삽입 순서를 지키므로 앞쪽이 가장 오래된 것이다
  while (cachedBytes > MAX_CACHE_BYTES && originals.size > 1) {
    const oldest = originals.keys().next()
    if (oldest.done === true) break
    const dropped = originals.get(oldest.value)
    originals.delete(oldest.value)
    sizedOriginals.delete(oldest.value)
    cachedBytes -= dropped === undefined ? 0 : dropped.length
  }
  // Originals take priority: cache reuse must not change which candidates can be measured.
  encodedImages.resize(Math.min(64 * 1024 * 1024, MAX_CACHE_BYTES - cachedBytes))
}

export function forgetOriginals(): void {
  generation += 1
  workQueue.cancelPending()
  encodedImages.clear()
  encodedImages.resize(64 * 1024 * 1024)
  reuseHits = 0
  originals.clear()
  sizedOriginals.clear()
  ownSizes.clear()
  cachedBytes = 0
}

export type ProbeItem = ImageProbeItem

export type DirectImageSource = {
  key: string
  bytes: Uint8Array
  mime: 'image/jpeg' | 'image/png'
  width: number
  height: number
}

export type DirectImageSelection = {
  imageHash: string
  images: Array<{ slot: string; source: DirectImageSource }>
}

/** 조각 캐시 키 — 같은 원본·같은 사각형·같은 목표면 같은 조각 (품질·PNG 설정은 호출마다 하나) */
const pieceKeyOf = (crop: CropRect, targetLongEdge: number): string =>
  `${crop.x0},${crop.y0},${crop.w},${crop.h}|${targetLongEdge}`

function originalSource(imageHash: string): DirectImageSource {
  const bytes = originals.get(imageHash)
  if (bytes === undefined) throw new Error(`direct: missing original ${imageHash.slice(0, 8)}`)
  const size = imageDimensions(bytes)
  if (size === null) throw new Error(`direct: unknown image size ${imageHash.slice(0, 8)}`)
  return {
    key: `original:${imageHash}`,
    bytes,
    mime: isPng(bytes) ? 'image/png' : 'image/jpeg',
    width: size.width,
    height: size.height
  }
}

/**
 * probeItems를 실제 export와 같은 규칙으로 원본/W0/조각에 귀결시킨다.
 * 기준 패스와 후보 probe가 만들어 둔 바이트만 쓴다. 하나라도 빠지면 직접 교체 전체를 거절한다.
 */
export function directImageSelections(
  items: readonly ImageProbeItem[],
  quality: number,
  reencodeOpaquePng: boolean
): DirectImageSelection[] {
  const out: DirectImageSelection[] = []

  for (const item of items) {
    const original = (): DirectImageSelection => ({
      imageHash: item.imageHash,
      images: [{ slot: 'whole', source: originalSource(item.imageHash) }]
    })
    if (item.originalBytes <= KEEP_BYTES_FLOOR || item.skip) {
      out.push(original())
      continue
    }

    const wholeKey = encodedKey(item.imageHash, item.targetLongEdge, quality, reencodeOpaquePng)
    const whole = encodedImages.get(wholeKey)
    if (whole === undefined) {
      throw new Error(`direct: missing baseline/candidate ${item.imageHash.slice(0, 8)}`)
    }
    if (!whole.changed || keepsOriginal(item.originalBytes, whole.bytes.length)) {
      out.push(original())
      continue
    }

    let selected: DirectImageSelection['images'] = [
      {
        slot: 'whole',
        source: {
          key: wholeKey,
          bytes: whole.bytes,
          mime: whole.mime,
          width: whole.width,
          height: whole.height
        }
      }
    ]
    if (item.pieces !== undefined && item.pieces.length > 0) {
      const candidates = item.pieces.map((piece) => {
        const key = encodedKey(
          item.imageHash,
          piece.targetLongEdge,
          quality,
          reencodeOpaquePng,
          piece.crop
        )
        const found = encodedImages.get(key)
        if (found === undefined) return null
        return {
          slot: `${piece.crop.x0},${piece.crop.y0},${piece.crop.w},${piece.crop.h}`,
          source: {
            key,
            bytes: found.bytes,
            mime: found.mime,
            width: found.width,
            height: found.height
          }
        }
      })
      if (candidates.some((candidate) => candidate === null)) {
        throw new Error(`direct: missing crop candidate ${item.imageHash.slice(0, 8)}`)
      }
      const pieces = candidates as DirectImageSelection['images']
      const pieceBytes = pieces.reduce((sum, piece) => sum + piece.source.bytes.length, 0)
      if (chooseCrop(whole.bytes.length, pieceBytes, item.densityGain ?? 1).crop) selected = pieces
    }
    out.push({ imageHash: item.imageHash, images: selected })
  }

  return out
}

/**
 * 주어진 설정으로 인코딩했을 때의 이미지 바이트 합계를 잰다. 실제 교체는 하지 않는다.
 *
 * 항목은 쪽마다 하나다. 같은 원본을 여러 쪽이 같은 목표·같은 창으로 쓰면 인코딩은 한 번이고
 * 합계에는 쪽마다 더해진다 — PDF 에는 쪽마다 한 벌씩 실린다. 창·목표가 다르면 따로 인코딩한다.
 * 원본은 한 번만 디코드해 W₀ 와 조각을 전부 만든다(resize.ts encodePiece).
 *
 * 재는 값은 우리 인코딩 바이트가 아니라 그것을 Figma 품질로 다시 인코딩한 크기(figmaSizeOf)다 — Figma 가
 * PDF 에 넣을 때 하는 일이라, 후보 품질에 따른 편향이 없다.
 * 채택(W₀ 인가 조각인가)은 export 와 같은 규칙으로 tallyProbe 가 정한다. 캐시에 없는 이미지는
 * 재볼 수 없으므로 원본 크기로 세고 failed 로 알린다 — 예측이 실제보다 크게 나오는 쪽이라,
 * 결과가 목표를 넘기는 것보다는 안전하다. 조각 인코딩이 빠지면 W₀ 로 센다(export 의 복구와 같다).
 */
export async function probeImageBytes(
  items: readonly ProbeItem[],
  quality: number,
  reencodeOpaquePng: boolean
): Promise<ProbeTally> {
  const expected = generation
  // 1) 원본마다 무엇을 만들어야 하는지 모은다
  type Want = { targets: Set<number>; pieces: Map<string, { crop: CropRect; target: number }> }
  const wants = new Map<string, Want>()
  // 줄이지 않고 원본 그대로 가는 것 — 인코딩은 없지만 PDF 안에서 차지할 크기는 재야 한다
  const kept = new Set<string>()
  for (const item of items) {
    if (item.originalBytes <= KEEP_BYTES_FLOOR) continue
    if (item.skip) {
      kept.add(item.imageHash)
      continue
    }
    const want = wants.get(item.imageHash) ?? { targets: new Set(), pieces: new Map() }
    want.targets.add(item.targetLongEdge)
    for (const piece of item.pieces ?? []) {
      want.pieces.set(pieceKeyOf(piece.crop, piece.targetLongEdge), {
        crop: piece.crop,
        target: piece.targetLongEdge
      })
    }
    wants.set(item.imageHash, want)
  }

  // 2) 원본 그대로 가는 것은 그 크기만 잰다 — 한 번 재면 실행 내내 같다(sizedOriginals)
  for (const imageHash of kept) {
    if (sizedOriginals.has(imageHash)) continue
    const original = originals.get(imageHash)
    if (original === undefined) continue // 캐시에 없다 — lookup 이 null 을 주고 원본 크기로 센다
    const size = await workQueue.run(workCost(original), async () => {
      checkGeneration(expected)
      return await figmaSizeOf(original)
    })
    checkGeneration(expected)
    sizedOriginals.set(imageHash, size)
  }

  // 3) 원본마다 한 번 디코드해 전부 인코딩한다. 실패는 항목 단위로 null — 집계가 알아서 물러선다
  const wholes = new Map<string, Encoded | null>()
  const pieces = new Map<string, Encoded | null>()
  const one = async (imageHash: string, want: Want): Promise<void> => {
    checkGeneration(expected)
    const original = originals.get(imageHash)
    if (original === undefined) return // 캐시에 없다 — lookup 이 null 을 주고 failed 로 센다

    let decoded: ImageBitmap
    try {
      decoded = await decodeImage(original)
    } catch {
      return
    }
    const sourcePng = isPng(original)
    // 마지막 W₀ 인코딩이 원본 비트맵을 가져가 닫는다 — 그러면 finally 가 다시 닫지 않는다
    let consumed = false
    try {
      checkGeneration(expected)
      for (const [key, job] of want.pieces) {
        checkGeneration(expected)
        try {
          const out = await encodePiece(
            decoded,
            job.crop,
            job.target,
            sourcePng,
            reencodeOpaquePng,
            quality
          )
          retain(
            encodedKey(imageHash, job.target, quality, reencodeOpaquePng, job.crop),
            { ...out, ok: true, changed: true },
            expected
          )
          // 더하는 값은 우리 바이트가 아니라 Figma 가 다시 인코딩한 뒤의 크기(sized)
          pieces.set(`${imageHash}|${key}`, {
            bytes: out.bytes.length,
            mime: out.mime,
            sized: await figmaSizeOf(out.bytes)
          })
        } catch {
          pieces.set(`${imageHash}|${key}`, null)
        }
      }
      // W₀ — 마지막 목표는 원본 비트맵을 그대로 쓴다(인코딩이 닫는다), 그 앞은 복사본으로
      const targets = [...want.targets]
      for (let at = 0; at < targets.length; at += 1) {
        checkGeneration(expected)
        const last = at === targets.length - 1
        const key = `${imageHash}|${targets[at]}`
        try {
          const bitmap = last ? decoded : await cloneBitmap(decoded)
          if (last) consumed = true
          const result = await resizeDecoded(
            bitmap,
            original,
            targets[at],
            quality,
            reencodeOpaquePng
          )
          if (!result.ok) {
            wholes.set(key, null)
            continue
          }
          retain(encodedKey(imageHash, targets[at], quality, reencodeOpaquePng), result, expected)
          // 원본을 그대로 넣게 되는 자리(안 줄였거나, 줄여도 안 작아졌다)는 원본이 PDF 안에서
          // 차지할 크기가 필요하다 — Figma 는 손대지 않은 원본도 다시 인코딩한다
          const keeps = !result.changed || keepsOriginal(original.length, result.bytes.length)
          if (keeps && !sizedOriginals.has(imageHash)) {
            const size = await figmaSizeOf(original)
            checkGeneration(expected)
            sizedOriginals.set(imageHash, size)
          }
          wholes.set(key, {
            bytes: result.bytes.length,
            mime: result.mime,
            sized: keeps ? sizedOriginals.get(imageHash) : await figmaSizeOf(result.bytes)
          })
        } catch {
          wholes.set(key, null)
        }
      }
    } finally {
      if (!consumed) decoded.close()
    }
  }

  await Promise.all(
    [...wants].map(([hash, want]) =>
      workQueue.run(workCost(originals.get(hash) ?? new Uint8Array()), () => one(hash, want))
    )
  )
  checkGeneration(expected)

  // 4) export 와 같은 규칙으로 더한다
  const tally = tallyProbe(items, {
    whole: (imageHash, targetLongEdge) => wholes.get(`${imageHash}|${targetLongEdge}`) ?? null,
    piece: (imageHash, crop, targetLongEdge) =>
      pieces.get(`${imageHash}|${pieceKeyOf(crop, targetLongEdge)}`) ?? null,
    original: (imageHash) => sizedOriginals.get(imageHash) ?? null
  })
  // 후보 하나가 어떻게 더해졌는지는 여기서만 볼 수 있다(플러그인 콘솔)
  console.log(
    `[probe] q${quality} items ${items.length} (originals ${wants.size}) → ${tally.totalBytes} B` +
      ` cropped ${tally.cropped} failed ${tally.failed} recovered ${tally.recovered}`
  )
  return tally
}
