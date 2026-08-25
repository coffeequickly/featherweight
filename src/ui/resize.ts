// 이미지 다운스케일·재인코딩. Canvas 가 있는 UI 스레드에서만 된다. (PRD C3, §7.6)

import { t } from '../lib/i18n'
import { keepsOriginal, scaledSize } from '../lib/imageTarget'

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

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47]

/** 알파 검사 표본 간격 (px). 전부 훑으면 큰 이미지에서 느리다. */
const ALPHA_SAMPLE_STEP = 16

export function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
}

export async function resizeImage(request: ResizeRequest): Promise<ResizeResult> {
  const { bytes, targetLongEdge, quality, reencodeOpaquePng } = request

  try {
    const sourcePng = isPng(bytes)
    let bitmap = await createImageBitmap(new Blob([bytes as BlobPart]))
    // close() 뒤에는 width/height 가 0 이 된다. 원본 크기를 먼저 붙잡아 둔다.
    const originalWidth = bitmap.width
    const originalHeight = bitmap.height

    const size = scaledSize(bitmap.width, bitmap.height, targetLongEdge)
    const mustResize = size.width !== bitmap.width || size.height !== bitmap.height

    if (!mustResize && !(sourcePng && reencodeOpaquePng)) {
      bitmap.close()
      return {
        ok: true,
        bytes,
        mime: sourcePng ? 'image/png' : 'image/jpeg',
        width: size.width,
        height: size.height,
        changed: false
      }
    }

    if (mustResize) bitmap = await stepDown(bitmap, size.width, size.height)

    const canvas = new OffscreenCanvas(size.width, size.height)
    const context = canvas.getContext('2d')
    if (context === null) return { ok: false, reason: t('resize.noContext') }
    context.drawImage(bitmap, 0, 0, size.width, size.height)
    bitmap.close()

    // 투명이 있는 PNG 를 JPEG 로 바꾸면 배경이 검게 탄다. 알파가 있으면 PNG 를 유지한다.
    const keepPng = sourcePng && (!reencodeOpaquePng || hasAlpha(context, size.width, size.height))

    // 인코딩은 한 형식만 만든다. 예전에 "PNG 가 더 작으면 PNG" 를 넣었다가
    // 이미지가 통째로 사라지는 사고가 났다 — 절감 이득보다 위험이 크다. (v1.0.1)
    const mime: 'image/png' | 'image/jpeg' = keepPng ? 'image/png' : 'image/jpeg'
    const blob = await canvas.convertToBlob(keepPng ? { type: mime } : { type: mime, quality })
    const out = new Uint8Array(await blob.arrayBuffer())

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
  }
}

/**
 * 2배를 넘겨 한 번에 줄이면 계단현상이 생긴다. 절반씩 내려간다.
 * (createImageBitmap 의 resizeQuality:'high' 도 극단적인 축소에서는 뭉갠다)
 */
async function stepDown(source: ImageBitmap, width: number, height: number): Promise<ImageBitmap> {
  let current = source

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
}

function hasAlpha(
  context: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number
): boolean {
  const { data } = context.getImageData(0, 0, width, height)

  for (let y = 0; y < height; y += ALPHA_SAMPLE_STEP) {
    for (let x = 0; x < width; x += ALPHA_SAMPLE_STEP) {
      if (data[(y * width + x) * 4 + 3] < 255) return true
    }
  }

  // 가장자리는 투명한 경우가 많아 표본에서 놓치기 쉽다 — 마지막 행·열은 따로 본다
  for (let x = 0; x < width; x += ALPHA_SAMPLE_STEP) {
    if (data[((height - 1) * width + x) * 4 + 3] < 255) return true
  }
  for (let y = 0; y < height; y += ALPHA_SAMPLE_STEP) {
    if (data[(y * width + width - 1) * 4 + 3] < 255) return true
  }

  return false
}
