// 목표 용량 탐색용 원본 이미지 캐시. (docs/FIT-TO-SIZE.md)
//
// 후보 프로필을 여러 개 재보려면 같은 원본을 여러 번 인코딩해야 한다. 그때마다 메인에서
// 바이트를 다시 받으면(structured clone) 그게 병목이 되므로, 기준 export 때 받은 원본을
// 해시로 들고 있는다. Figma 왕복 없이 캔버스 인코딩만 반복하면 되니 탐색이 싸진다.
//
// 큰 이미지 여러 장을 들고 있으면 iframe 메모리가 위험하다. 총량 상한을 두고 넘으면
// 오래 안 쓴 것부터 버린다. export 가 끝나면 즉시 비운다.

import { KEEP_BYTES_FLOOR, keepsOriginal } from '../lib/imageTarget'
import { ImageProbeItem } from '../lib/types'
import { resizeImage } from './resize'

/** 캐시 총량 상한. 넘으면 오래된 것부터 버린다. */
const MAX_CACHE_BYTES = 200 * 1024 * 1024

const originals = new Map<string, Uint8Array>()
let cachedBytes = 0

export function rememberOriginal(imageHash: string, bytes: Uint8Array): void {
  if (originals.has(imageHash)) return

  originals.set(imageHash, bytes)
  cachedBytes += bytes.length

  // Map 은 삽입 순서를 지키므로 앞쪽이 가장 오래된 것이다
  while (cachedBytes > MAX_CACHE_BYTES && originals.size > 1) {
    const oldest = originals.keys().next()
    if (oldest.done === true) break
    const dropped = originals.get(oldest.value)
    originals.delete(oldest.value)
    cachedBytes -= dropped === undefined ? 0 : dropped.length
  }
}

export function forgetOriginals(): void {
  originals.clear()
  cachedBytes = 0
}

export type ProbeItem = ImageProbeItem

/**
 * 주어진 설정으로 인코딩했을 때의 이미지 바이트 합계를 잰다. 실제 교체는 하지 않는다.
 *
 * 캐시에 없는 이미지는 재볼 수 없으므로 원본 크기로 세고 failed 로 알린다 — 예측이
 * 실제보다 크게 나오는 쪽이라, 결과가 목표를 넘기는 것보다는 안전하다.
 * 원본이 더 작으면 원본 바이트를 센다(keepsOriginal 과 같은 규칙이라 실제와 어긋나지 않는다).
 */
export async function probeImageBytes(
  items: readonly ProbeItem[],
  quality: number,
  reencodeOpaquePng: boolean
): Promise<{ totalBytes: number; jpegBytes: number; failed: number }> {
  let totalBytes = 0
  let jpegBytes = 0
  let failed = 0

  for (const item of items) {
    // 메인이 안 건드릴 이미지(프레임 예산 이하)와 이미 가벼운 파일은 원본 그대로 나간다
    if (item.skip || item.originalBytes <= KEEP_BYTES_FLOOR) {
      totalBytes += item.originalBytes
      continue
    }

    const original = originals.get(item.imageHash)
    if (original === undefined) {
      totalBytes += item.originalBytes
      failed += 1
      continue
    }

    const result = await resizeImage({
      bytes: original,
      targetLongEdge: item.targetLongEdge,
      quality,
      reencodeOpaquePng
    })

    if (!result.ok) {
      // 인코딩이 안 되면 실제 export 에서도 원본이 남는다 — 원본 크기로 센다
      totalBytes += original.length
      failed += 1
      continue
    }

    if (keepsOriginal(original.length, result.bytes.length)) {
      totalBytes += original.length
    } else {
      totalBytes += result.bytes.length
      if (result.mime === 'image/jpeg') jpegBytes += result.bytes.length
    }
  }

  return { totalBytes, jpegBytes, failed }
}
