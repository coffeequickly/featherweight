// 목표 용량 탐색용 원본 이미지 캐시. (docs/FIT-TO-SIZE.md)
//
// 후보 프로필을 여러 개 재보려면 같은 원본을 여러 번 인코딩해야 한다. 그때마다 메인에서
// 바이트를 다시 받으면(structured clone) 그게 병목이 되므로, 기준 export 때 받은 원본을
// 해시로 들고 있는다. Figma 왕복 없이 캔버스 인코딩만 반복하면 되니 탐색이 싸진다.
//
// 큰 이미지 여러 장을 들고 있으면 iframe 메모리가 위험하다. 총량 상한을 두고 넘으면
// 오래 안 쓴 것부터 버린다. export 가 끝나면 즉시 비운다.

import { Encoded, ProbeTally, tallyProbe } from '../lib/imageProbe'
import { KEEP_BYTES_FLOOR } from '../lib/imageTarget'
import { CropRect, ImageProbeItem } from '../lib/types'
import { cloneBitmap, decodeImage, encodePiece, isPng, resizeDecoded } from './resize'

/** 캐시 총량 상한. 넘으면 오래된 것부터 버린다. */
const MAX_CACHE_BYTES = 200 * 1024 * 1024

const originals = new Map<string, Uint8Array>()
let cachedBytes = 0

export function rememberOriginal(imageHash: string, bytes: Uint8Array): void {
  if (originals.has(imageHash)) return
  // 혼자서 상한을 넘는 원본은 들고 있어 봐야 다른 것을 다 밀어낸다 — 재보지 않고 원본 크기로 센다
  if (bytes.length > MAX_CACHE_BYTES) return

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

/** 조각 캐시 키 — 같은 원본·같은 사각형·같은 목표면 같은 조각 (품질·PNG 설정은 호출마다 하나) */
const pieceKeyOf = (crop: CropRect, targetLongEdge: number): string =>
  `${crop.x0},${crop.y0},${crop.w},${crop.h}|${targetLongEdge}`

/**
 * 주어진 설정으로 인코딩했을 때의 이미지 바이트 합계를 잰다. 실제 교체는 하지 않는다.
 *
 * 항목은 쪽마다 하나다. 같은 원본을 여러 쪽이 같은 목표·같은 창으로 쓰면 인코딩은 한 번이고
 * 합계에는 쪽마다 더해진다 — PDF 에는 쪽마다 한 벌씩 실린다. 창·목표가 다르면 따로 인코딩한다.
 * 원본은 한 번만 디코드해 W₀ 와 조각을 전부 만든다(resize.ts encodePiece).
 *
 * 채택(W₀ 인가 조각인가)은 export 와 같은 규칙으로 tallyProbe 가 정한다. 캐시에 없는 이미지는
 * 재볼 수 없으므로 원본 크기로 세고 failed 로 알린다 — 예측이 실제보다 크게 나오는 쪽이라,
 * 결과가 목표를 넘기는 것보다는 안전하다. 조각 인코딩이 빠지면 W₀ 로 센다(export 의 복구와 같다).
 */
export async function probeImageBytes(
  items: readonly ProbeItem[],
  quality: number,
  reencodeOpaquePng: boolean
): Promise<ProbeTally> {
  // 1) 원본마다 무엇을 만들어야 하는지 모은다
  type Want = { targets: Set<number>; pieces: Map<string, { crop: CropRect; target: number }> }
  const wants = new Map<string, Want>()
  for (const item of items) {
    if (item.skip || item.originalBytes <= KEEP_BYTES_FLOOR) continue
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

  // 2) 원본마다 한 번 디코드해 전부 인코딩한다. 실패는 항목 단위로 null — 집계가 알아서 물러선다
  const wholes = new Map<string, Encoded | 'original' | null>()
  const pieces = new Map<string, Encoded | null>()
  for (const [imageHash, want] of wants) {
    const original = originals.get(imageHash)
    if (original === undefined) continue // 캐시에 없다 — lookup 이 null 을 주고 failed 로 센다

    let decoded: ImageBitmap
    try {
      decoded = await decodeImage(original)
    } catch {
      continue
    }
    const sourcePng = isPng(original)
    // 마지막 W₀ 인코딩이 원본 비트맵을 가져가 닫는다 — 그러면 finally 가 다시 닫지 않는다
    let consumed = false
    try {
      for (const [key, job] of want.pieces) {
        try {
          const out = await encodePiece(
            decoded,
            job.crop,
            job.target,
            sourcePng,
            reencodeOpaquePng,
            quality
          )
          pieces.set(`${imageHash}|${key}`, { bytes: out.bytes.length, mime: out.mime })
        } catch {
          pieces.set(`${imageHash}|${key}`, null)
        }
      }
      // W₀ — 마지막 목표는 원본 비트맵을 그대로 쓴다(인코딩이 닫는다), 그 앞은 복사본으로
      const targets = [...want.targets]
      for (let at = 0; at < targets.length; at += 1) {
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
          if (!result.ok) wholes.set(key, null)
          else if (!result.changed) wholes.set(key, 'original')
          else wholes.set(key, { bytes: result.bytes.length, mime: result.mime })
        } catch {
          wholes.set(key, null)
        }
      }
    } finally {
      if (!consumed) decoded.close()
    }
  }

  // 3) export 와 같은 규칙으로 더한다
  return tallyProbe(items, {
    whole: (imageHash, targetLongEdge) => wholes.get(`${imageHash}|${targetLongEdge}`) ?? null,
    piece: (imageHash, crop, targetLongEdge) =>
      pieces.get(`${imageHash}|${pieceKeyOf(crop, targetLongEdge)}`) ?? null
  })
}
