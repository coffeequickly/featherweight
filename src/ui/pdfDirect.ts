// Fit to Size fast path: 기준 PDF의 확실히 식별한 불투명 JPEG만 후보 결과로 바꾼다.
// 매칭되지 않는 이미지는 기준 상태로 두고, 구조가 안전하지 않으면 전체를 기존 Figma export로 물린다.

import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream
} from 'pdf-lib'

import { imageDimensions } from '../lib/imageHeader'
import { DirectFitPage, DirectFitProfile, PdfPart } from '../lib/types'
import { directImageSelections, DirectImageSource, rememberOwnSize } from './imageCache'
import { figmaJpegOf } from './resize'

const name = (value: string): PDFName => PDFName.of(value)
const SIGNATURE_EDGE = 16
const MAX_SIGNATURE_DISTANCE = 6
const MIN_SIGNATURE_MARGIN = 0.75

export type PixelSignature = Uint8Array
export type SignatureReader = (bytes: Uint8Array) => Promise<PixelSignature>

export type DirectImageMapping = {
  from: DirectImageSource
  to: DirectImageSource
}

export type DirectPatchResult = {
  bytes: Uint8Array
  matched: number
  skipped: number
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false
  return true
}

export function signatureDistance(a: PixelSignature, b: PixelSignature): number {
  if (a.length !== b.length || a.length === 0) return Infinity
  let sum = 0
  for (let index = 0; index < a.length; index += 1) sum += Math.abs(a[index] - b[index])
  return sum / a.length
}

/** 압축 방식이 달라도 같은 사진이면 가까운 16×16 RGB 지문. */
export async function visualSignature(bytes: Uint8Array): Promise<PixelSignature> {
  let bitmap: ImageBitmap | undefined
  try {
    bitmap = await createImageBitmap(new Blob([bytes as BlobPart]), {
      imageOrientation: 'from-image'
    })
    const canvas = new OffscreenCanvas(SIGNATURE_EDGE, SIGNATURE_EDGE)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (context === null) throw new Error('direct: cannot read image pixels')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, SIGNATURE_EDGE, SIGNATURE_EDGE)
    const rgba = context.getImageData(0, 0, SIGNATURE_EDGE, SIGNATURE_EDGE).data
    const rgb = new Uint8Array(SIGNATURE_EDGE * SIGNATURE_EDGE * 3)
    for (let source = 0, target = 0; source < rgba.length; source += 4) {
      rgb[target++] = rgba[source]
      rgb[target++] = rgba[source + 1]
      rgb[target++] = rgba[source + 2]
    }
    return rgb
  } finally {
    bitmap?.close()
  }
}

function sourceBySlot(
  images: Array<{ slot: string; source: DirectImageSource }>
): Map<string, DirectImageSource> {
  return new Map(images.map((image) => [image.slot, image.source]))
}

async function mappingsForPage(
  page: DirectFitPage,
  baselineProfile: DirectFitProfile,
  profile: DirectFitProfile
): Promise<{ mappings: DirectImageMapping[]; complete: boolean }> {
  const baseline = directImageSelections(
    page.baseline,
    baselineProfile.quality,
    baselineProfile.reencodeOpaquePng
  )
  const target = directImageSelections(page.target, profile.quality, profile.reencodeOpaquePng)
  const targetByHash = new Map(target.map((selection) => [selection.imageHash, selection]))
  const mappings = new Map<string, DirectImageMapping>()
  const baselineHashes = new Set(baseline.map((selection) => selection.imageHash))
  let complete = target.every((selection) => baselineHashes.has(selection.imageHash))

  for (const before of baseline) {
    const after = targetByHash.get(before.imageHash)
    if (after === undefined) {
      complete = false
      continue
    }
    const beforeSlots = sourceBySlot(before.images)
    const afterSlots = sourceBySlot(after.images)
    if (
      beforeSlots.size !== afterSlots.size ||
      [...beforeSlots.keys()].some((slot) => !afterSlots.has(slot))
    ) {
      // 한 객체를 여러 조각으로 나누거나 그 반대는 콘텐츠 연산까지 바꿔야 한다. 기준 결과를 유지한다.
      complete = false
      continue
    }

    for (const [slot, from] of beforeSlots) {
      const rawTarget = afterSlots.get(slot) as DirectImageSource
      if (from.key === rawTarget.key) continue
      if (rawTarget.mime !== 'image/jpeg') {
        // 투명 PNG는 색 스트림과 SMask를 함께 다시 만들어야 한다. 기준 이미지를 유지한다.
        complete = false
        continue
      }

      // Figma가 PDF export에서 하는 마지막 JPEG 변환을 iframe에서 미리 한다.
      const bytes = await figmaJpegOf(rawTarget.bytes)
      const size = imageDimensions(bytes)
      if (size === null || size.width !== rawTarget.width || size.height !== rawTarget.height) {
        throw new Error(`direct: replacement dimensions changed ${before.imageHash.slice(0, 8)}`)
      }
      const to: DirectImageSource = { ...rawTarget, bytes, mime: 'image/jpeg' }
      rememberOwnSize(to.width, to.height)

      const known = mappings.get(from.key)
      if (
        known !== undefined &&
        (known.to.width !== to.width ||
          known.to.height !== to.height ||
          !equalBytes(known.to.bytes, to.bytes))
      ) {
        throw new Error(
          `direct: one source maps to multiple targets ${before.imageHash.slice(0, 8)}`
        )
      }
      mappings.set(from.key, { from, to })
    }
  }

  return { mappings: [...mappings.values()], complete }
}

/**
 * Figma 표본에서 확인한 sRGB2014 ICC만 허용한다. 이중 체크섬은 호환성 식별용이며 보안 해시가 아니다.
 * SHA-256과 재현 절차는 docs/EXPORT-PERFORMANCE.md에 기록한다. 다른 RGB 프로필은 전체 export로 물린다.
 */
export function isKnownSrgbIcc(bytes: Uint8Array): boolean {
  if (bytes.length !== 3024) return false
  let fnv = 0x811c9dc5
  let djb = 5381
  for (const byte of bytes) {
    fnv = Math.imul(fnv ^ byte, 0x01000193) >>> 0
    djb = (Math.imul(djb, 33) ^ byte) >>> 0
  }
  return fnv === 0xcdfe93e4 && djb === 0xe5dcf158
}

function imageNumber(dict: PDFDict, key: string): number {
  const value = dict.lookup(name(key))
  if (!(value instanceof PDFNumber)) throw new Error(`direct: missing image ${key}`)
  return value.asNumber()
}

function isJpeg(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9
  )
}

function assertPatchableImage(image: PDFRawStream): void {
  if (imageNumber(image.dict, 'BitsPerComponent') !== 8) {
    throw new Error('direct: unsupported image depth')
  }
  if (
    image.dict.has(name('Decode')) ||
    image.dict.has(name('DecodeParms')) ||
    image.dict.has(name('Mask'))
  ) {
    throw new Error('direct: unsupported image decoding')
  }
  const filter = image.dict.lookup(name('Filter'))?.toString().replace(/\s/g, '')
  if (filter !== '/DCTDecode' && filter !== '[/DCTDecode]') {
    throw new Error('direct: source is not JPEG')
  }
  const width = imageNumber(image.dict, 'Width')
  const height = imageNumber(image.dict, 'Height')
  const sourceSize = imageDimensions(image.contents)
  if (
    !isJpeg(image.contents) ||
    sourceSize === null ||
    sourceSize.width !== width ||
    sourceSize.height !== height
  ) {
    throw new Error('direct: invalid source JPEG')
  }

  const colorSpace = image.dict.lookup(name('ColorSpace'))
  if (colorSpace?.toString() !== '/DeviceRGB') {
    if (!(colorSpace instanceof PDFArray) || colorSpace.lookup(0)?.toString() !== '/ICCBased') {
      throw new Error('direct: unsupported PDF color space')
    }
    const profile = colorSpace.lookup(1)
    if (!(profile instanceof PDFRawStream) || imageNumber(profile.dict, 'N') !== 3) {
      throw new Error('direct: unsupported PDF color profile')
    }
    if (!isKnownSrgbIcc(decodePDFRawStream(profile).decode())) {
      throw new Error('direct: unverified RGB color profile')
    }
  }

  const mask = image.dict.lookup(name('SMask'))
  if (!(mask instanceof PDFRawStream)) throw new Error('direct: missing opaque alpha mask')
  if (
    imageNumber(mask.dict, 'BitsPerComponent') !== 8 ||
    mask.dict.lookup(name('ColorSpace'))?.toString() !== '/DeviceGray' ||
    mask.dict.has(name('Decode')) ||
    mask.dict.has(name('Matte'))
  ) {
    throw new Error('direct: unsupported alpha mask')
  }
  const maskWidth = imageNumber(mask.dict, 'Width')
  const maskHeight = imageNumber(mask.dict, 'Height')
  if (maskWidth !== width || maskHeight !== height) {
    throw new Error('direct: alpha mask dimensions differ')
  }
  const alpha = decodePDFRawStream(mask).decode()
  if (alpha.length !== maskWidth * maskHeight) {
    throw new Error('direct: invalid alpha mask length')
  }
  for (const value of alpha) if (value !== 255) throw new Error('direct: non-opaque alpha mask')
}

type SignedMapping = DirectImageMapping & { signature: PixelSignature }

/**
 * 한 부분 PDF를 직접 교체한다. signatureReader 주입은 브라우저 비트맵 API 없는 단위 테스트용이다.
 */
export async function patchPdfPartDirect(
  bytes: Uint8Array,
  mappings: readonly DirectImageMapping[],
  signatureReader: SignatureReader = visualSignature
): Promise<DirectPatchResult> {
  if (mappings.length === 0) return { bytes, matched: 0, skipped: 0 }
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  const signed: SignedMapping[] = await Promise.all(
    mappings.map(async (mapping) => ({
      ...mapping,
      signature: await signatureReader(mapping.from.bytes)
    }))
  )
  const masks = new Set<string>()
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFStream)) continue
    const mask = object.dict.get(name('SMask'))
    if (mask instanceof PDFRef) masks.add(mask.toString())
  }

  const matched = new Set<string>()
  const nearest = new Map<string, number>()
  const dimensionMatches = new Map<string, number>()
  for (const [ref, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream) || masks.has(ref.toString())) continue
    if (object.dict.get(name('Subtype'))?.toString() !== '/Image') continue
    const width = imageNumber(object.dict, 'Width')
    const height = imageNumber(object.dict, 'Height')
    const possible = signed.filter(
      (mapping) => mapping.from.width === width && mapping.from.height === height
    )
    if (possible.length === 0) continue
    for (const mapping of possible) {
      dimensionMatches.set(mapping.from.key, (dimensionMatches.get(mapping.from.key) ?? 0) + 1)
    }

    const signature = await signatureReader(object.contents)
    const ranked = possible
      .map((mapping) => ({ mapping, distance: signatureDistance(signature, mapping.signature) }))
      .sort((a, b) => a.distance - b.distance)
    for (const candidate of ranked) {
      nearest.set(
        candidate.mapping.from.key,
        Math.min(nearest.get(candidate.mapping.from.key) ?? Infinity, candidate.distance)
      )
    }
    const best = ranked[0]
    if (best.distance > MAX_SIGNATURE_DISTANCE) continue

    const near = ranked.filter(
      (candidate) => candidate.distance - best.distance < MIN_SIGNATURE_MARGIN
    )
    if (
      near.some(
        (candidate) =>
          candidate.mapping.to.width !== best.mapping.to.width ||
          candidate.mapping.to.height !== best.mapping.to.height ||
          !equalBytes(candidate.mapping.to.bytes, best.mapping.to.bytes)
      )
    ) {
      throw new Error('direct: ambiguous image fingerprint')
    }

    assertPatchableImage(object)
    const replacementSize = imageDimensions(best.mapping.to.bytes)
    if (
      !isJpeg(best.mapping.to.bytes) ||
      replacementSize === null ||
      replacementSize.width !== best.mapping.to.width ||
      replacementSize.height !== best.mapping.to.height
    ) {
      throw new Error('direct: invalid replacement JPEG')
    }
    const dictionary = object.dict.clone(document.context)
    dictionary.set(name('Width'), PDFNumber.of(best.mapping.to.width))
    dictionary.set(name('Height'), PDFNumber.of(best.mapping.to.height))
    document.context.assign(ref, PDFRawStream.of(dictionary, best.mapping.to.bytes))
    matched.add(best.mapping.from.key)
  }

  const skipped = mappings.filter((mapping) => !matched.has(mapping.from.key))
  if (skipped.length > 0) {
    console.log(
      '[fit] direct PDF kept baseline images',
      skipped.map((mapping) => ({
        key: mapping.from.key,
        size: `${mapping.from.width}x${mapping.from.height}`,
        sameSize: dimensionMatches.get(mapping.from.key) ?? 0,
        nearest: nearest.get(mapping.from.key)
      }))
    )
  }
  return {
    bytes: matched.size === 0 ? bytes : await document.save({ useObjectStreams: true }),
    matched: matched.size,
    skipped: skipped.length
  }
}

export async function patchFitParts(
  parts: readonly PdfPart[],
  pages: readonly DirectFitPage[],
  baselineProfile: DirectFitProfile,
  profile: DirectFitProfile,
  signatureReader: SignatureReader = visualSignature
): Promise<{ parts: PdfPart[]; matched: number; skipped: number; complete: boolean }> {
  const pageByIndex = new Map(pages.map((page) => [page.index, page]))
  const out: PdfPart[] = []
  let matched = 0
  let skipped = 0
  let complete = true

  for (const part of parts) {
    const page = pageByIndex.get(part.index)
    if (page === undefined) throw new Error(`direct: missing page plan ${part.index}`)
    try {
      const plan = await mappingsForPage(page, baselineProfile, profile)
      const patched = await patchPdfPartDirect(part.bytes, plan.mappings, signatureReader)
      matched += patched.matched
      skipped += patched.skipped
      complete &&= plan.complete && patched.skipped === 0
      out.push({
        ...part,
        bytes: patched.bytes
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`direct: page ${part.index + 1}: ${reason.replace(/^direct:\s*/, '')}`)
    }
  }
  if (matched === 0) throw new Error('direct: no independently embedded image matched')
  return { parts: out, matched, skipped, complete }
}
