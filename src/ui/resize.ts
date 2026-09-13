// 이미지 다운스케일·재인코딩. Canvas 가 있는 UI 스레드에서만 된다. (PRD C3, §7.6)

import { FIGMA_JPEG_QUALITY } from '../lib/fitToSize'
import { t } from '../lib/i18n'
import { keepsOriginal, scaledSize } from '../lib/imageTarget'
import { CropRect } from '../lib/types'

export type ResizeRequest = {
  bytes: Uint8Array
  targetLongEdge: number
  quality: number
  reencodeOpaquePng: boolean
}

export type ResizeResult =
  | {
      ok: true
      bytes: Uint8Array
      mime: 'image/jpeg' | 'image/png'
      width: number
      height: number
      changed: boolean
    }
  | { ok: false; reason: string }

export type ResizeManyRequest = {
  bytes: Uint8Array
  quality: number
  reencodeOpaquePng: boolean
  jobs: Array<{ targetLongEdge: number; crop: CropRect }>
}

export type ResizeManyResult =
  | {
      ok: true
      results: Array<{
        bytes: Uint8Array
        mime: 'image/jpeg' | 'image/png'
        width: number
        height: number
      }>
    }
  | { ok: false; reason: string }

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47]

export function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
}

export async function resizeImage(request: ResizeRequest): Promise<ResizeResult> {
  const { bytes, targetLongEdge, quality, reencodeOpaquePng } = request
  let decoded: ImageBitmap | undefined
  try {
    decoded = await decodeImage(bytes)
    return await resizeDecoded(decoded, bytes, targetLongEdge, quality, reencodeOpaquePng)
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * 원본 바이트를 비트맵으로. 실패는 throw — 부르는 쪽이 원본으로 물러선다.
 * EXIF 방향은 적용한 채로 — Figma 가 보여 주는 방향이고, 조각 사각형도 그 좌표계(imageHeader)다
 */
export function decodeImage(bytes: Uint8Array): Promise<ImageBitmap> {
  return createImageBitmap(new Blob([bytes as BlobPart]), { imageOrientation: 'from-image' })
}

/** 같은 원본을 여러 번 줄일 때 — 인코딩은 비트맵을 닫으므로 한 벌 복사해 준다 */
export function cloneBitmap(decoded: ImageBitmap): Promise<ImageBitmap> {
  return createImageBitmap(decoded)
}

/**
 * 디코드된 원본을 줄여 인코딩한다. 비트맵은 여기서 닫힌다(어느 경로로 나가든).
 * 원본 바이트는 "그대로 둔다" 로 물러설 때 돌려주려고 받는다.
 */
export async function resizeDecoded(
  decoded: ImageBitmap,
  bytes: Uint8Array,
  targetLongEdge: number,
  quality: number,
  reencodeOpaquePng: boolean
): Promise<ResizeResult> {
  let bitmap: ImageBitmap | undefined = decoded
  try {
    const sourcePng = isPng(bytes)
    // close() 뒤에는 width/height 가 0 이 된다. 원본 크기를 먼저 붙잡아 둔다.
    const originalWidth = bitmap.width
    const originalHeight = bitmap.height

    const size = scaledSize(bitmap.width, bitmap.height, targetLongEdge)
    const mustResize = size.width !== bitmap.width || size.height !== bitmap.height

    if (!mustResize && !(sourcePng && reencodeOpaquePng)) {
      return {
        ok: true,
        bytes,
        mime: sourcePng ? 'image/png' : 'image/jpeg',
        width: size.width,
        height: size.height,
        changed: false
      }
    }

    const encoded = await encodeBitmap(bitmap, size, sourcePng, reencodeOpaquePng, quality)
    bitmap = undefined // encodeBitmap 이 닫았다
    const { mime } = encoded
    const out = encoded.bytes

    // 줄였는데 오히려 커지는 경우가 있다 (이미 잘 압축된 JPEG 등)
    if (keepsOriginal(bytes.length, out.length)) {
      return {
        ok: true,
        bytes,
        mime: sourcePng ? 'image/png' : 'image/jpeg',
        width: originalWidth,
        height: originalHeight,
        changed: false
      }
    }

    return { ok: true, bytes: out, mime, width: size.width, height: size.height, changed: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  } finally {
    // 어느 경로로 나가든 디코딩한 픽셀은 놓아준다 — 닫은 비트맵을 다시 닫는 것은 무해하다
    bitmap?.close()
  }
}

/**
 * 디코드된 원본에서 창을 잘라 줄이고 인코딩한다 — 조각. 원본 비트맵은 닫지 않는다(부르는 쪽 것).
 * 조각은 원본으로 물러설 수 없으니(창만 있는 그림이 결과다) 언제나 인코딩한 것을 돌려준다.
 * 실패는 throw.
 *
 * 메모리(가장 큰 순간): 디코드된 원본(w×h×4B, 4096² 이면 64MB) + 잘린 조각 비트맵(창 크기) +
 * 절반씩 줄이는 중간 비트맵 하나 + 출력 canvas. 조각은 하나씩 만들고 닫으므로 창 크기만큼만 더 든다.
 */
export async function encodePiece(
  decoded: ImageBitmap,
  crop: CropRect,
  targetLongEdge: number,
  sourcePng: boolean,
  reencodeOpaquePng: boolean,
  quality: number
): Promise<{ bytes: Uint8Array; mime: 'image/jpeg' | 'image/png'; width: number; height: number }> {
  // 자르기는 디코드된 비트맵에서 — 잘린 만큼만 새로 올라온다
  const piece = await createImageBitmap(decoded, crop.x0, crop.y0, crop.w, crop.h)
  const size = scaledSize(piece.width, piece.height, targetLongEdge)
  const encoded = await encodeBitmap(piece, size, sourcePng, reencodeOpaquePng, quality)
  return { bytes: encoded.bytes, mime: encoded.mime, width: size.width, height: size.height }
}

/**
 * 비트맵 하나를 size 로 줄여 인코딩한다. 비트맵은 여기서 닫는다.
 * 투명이 있는 PNG 를 JPEG 로 바꾸면 배경이 검게 탄다 — 알파가 있으면 PNG 를 유지한다.
 * 인코딩은 한 형식만 만든다. 예전에 "PNG 가 더 작으면 PNG" 를 넣었다가 이미지가 통째로
 * 사라지는 사고가 났다 — 절감 이득보다 위험이 크다. (v1.0.1)
 */
async function encodeBitmap(
  source: ImageBitmap,
  size: { width: number; height: number },
  sourcePng: boolean,
  reencodeOpaquePng: boolean,
  quality: number
): Promise<{ bytes: Uint8Array; mime: 'image/jpeg' | 'image/png' }> {
  let bitmap = source
  const mustResize = size.width !== bitmap.width || size.height !== bitmap.height
  if (mustResize) bitmap = await stepDown(bitmap, size.width, size.height)

  const canvas = new OffscreenCanvas(size.width, size.height)
  // 알파를 확인할 때만 getImageData 로 픽셀을 되읽는다. 그 canvas 는 CPU 쪽에 두는 편이
  // 낫다 — GPU 텍스처에서 되읽으면 장마다 동기 전송이 걸린다(Chrome 이 콘솔로 경고한다).
  const willReadFrequently = sourcePng && reencodeOpaquePng
  const context = canvas.getContext('2d', { willReadFrequently })
  if (context === null) {
    bitmap.close()
    throw new Error(t('resize.noContext'))
  }
  context.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()

  const keepPng =
    sourcePng &&
    (!reencodeOpaquePng || hasAlphaPixels(context.getImageData(0, 0, size.width, size.height).data))
  const mime: 'image/png' | 'image/jpeg' = keepPng ? 'image/png' : 'image/jpeg'
  const blob = await canvas.convertToBlob(keepPng ? { type: mime } : { type: mime, quality })
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime }
}

/**
 * 한 원본에서 조각 여럿. 원본은 한 번만 디코드하고 job 마다 그 비트맵에서 잘라 줄이고 인코딩한다 —
 * 조각마다 다시 디코드하면 12MP JPEG 하나에 조각 넷이 600ms, 한 번이면 170ms 였다(2026-09-10).
 */
export async function resizeMany(request: ResizeManyRequest): Promise<ResizeManyResult> {
  const { bytes, quality, reencodeOpaquePng, jobs } = request
  let decoded: ImageBitmap | undefined
  try {
    const sourcePng = isPng(bytes)
    decoded = await decodeImage(bytes)
    const results: Array<{
      bytes: Uint8Array
      mime: 'image/jpeg' | 'image/png'
      width: number
      height: number
    }> = []
    for (const job of jobs) {
      results.push(
        await encodePiece(
          decoded,
          job.crop,
          job.targetLongEdge,
          sourcePng,
          reencodeOpaquePng,
          quality
        )
      )
    }
    return { ok: true, results }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  } finally {
    decoded?.close()
  }
}

/**
 * 2배를 넘겨 한 번에 줄이면 계단현상이 생긴다. 절반씩 내려간다.
 * (createImageBitmap 의 resizeQuality:'high' 도 극단적인 축소에서는 뭉갠다)
 * 도중에 실패하면 들고 있던 중간 비트맵을 놓아주고 던진다.
 */
async function stepDown(source: ImageBitmap, width: number, height: number): Promise<ImageBitmap> {
  let current = source

  try {
    while (current.width > width * 2 && current.height > height * 2) {
      const half = await createImageBitmap(current, {
        resizeWidth: Math.max(width, Math.round(current.width / 2)),
        resizeHeight: Math.max(height, Math.round(current.height / 2)),
        resizeQuality: 'high'
      })
      current.close()
      current = half
    }

    if (current.width === width && current.height === height) return current

    const final = await createImageBitmap(current, {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: 'high'
    })
    current.close()
    return final
  } catch (error) {
    current.close()
    throw error
  }
}

/**
 * RGBA 픽셀에 255 미만 알파가 하나라도 있는가. 전부 훑는다 — 16px 간격 표본은 (1,1) 한 점만
 * 투명한 로고나 가장자리의 반투명 테두리를 놓쳐 JPEG 로 바꾸다 배경이 검게 탔다.
 * getImageData 가 이미 전체를 복사하므로 추가 비용은 4바이트마다 비교 한 번뿐이다.
 */
export function hasAlphaPixels(data: Uint8ClampedArray | Uint8Array): boolean {
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 255) return true
  }
  return false
}

/**
 * 이 이미지가 Figma 의 PDF 안에서 차지할 바이트의 어림 — Figma 가 하듯 다시 디코드해 품질 76 JPEG 로
 * 인코딩한 크기. 알파는 버린다(Figma 는 SMask 를 따로 얹지만 그 몫은 작다, 실측 257 B).
 * 실패하면 입력 크기를 그대로 돌려준다 — 예측이 커지는 쪽이라 목표를 넘기지는 않는다.
 */
async function figmaJpegBlobOf(bytes: Uint8Array): Promise<Blob> {
  let bitmap: ImageBitmap | undefined
  try {
    bitmap = await createImageBitmap(new Blob([bytes as BlobPart]), {
      imageOrientation: 'from-image'
    })
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')
    if (context === null) throw new Error(t('resize.noContext'))
    context.drawImage(bitmap, 0, 0)
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: FIGMA_JPEG_QUALITY })
  } finally {
    bitmap?.close()
  }
}

export async function figmaJpegOf(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await (await figmaJpegBlobOf(bytes)).arrayBuffer())
}

export async function figmaSizeOf(bytes: Uint8Array): Promise<number> {
  try {
    // 후보 크기만 잴 때는 큰 JPEG를 다시 Uint8Array로 복사하지 않는다.
    return (await figmaJpegBlobOf(bytes)).size
  } catch {
    return bytes.length
  }
}
