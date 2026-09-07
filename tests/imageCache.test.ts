import { beforeEach, describe, expect, it, vi } from 'vitest'

// 인코딩은 Canvas 가 필요하다 — 결과 크기만 흉내 낸다
const { resizeImage } = vi.hoisted(() => ({ resizeImage: vi.fn() }))
vi.mock('../src/ui/resize', () => ({ resizeImage }))

import { ImageProbeItem } from '../src/lib/types'
import { forgetOriginals, probeImageBytes, rememberOriginal } from '../src/ui/imageCache'

const item = (
  imageHash: string,
  originalBytes: number,
  uses: number,
  skip = false
): ImageProbeItem => ({ imageHash, targetLongEdge: 1000, skip, originalBytes, uses })

const encoded = (length: number, mime: 'image/jpeg' | 'image/png' = 'image/jpeg') => ({
  ok: true as const,
  bytes: new Uint8Array(length),
  mime,
  width: 1,
  height: 1,
  changed: true
})

beforeEach(() => {
  forgetOriginals()
  resizeImage.mockReset()
})

describe('probeImageBytes — 쪽 수만큼 센다', () => {
  it('인코딩은 한 번, 바이트는 쓰는 쪽 수만큼 — 31장에 깔린 배경은 31벌이 실린다', async () => {
    rememberOriginal('bg', new Uint8Array(200_000))
    resizeImage.mockResolvedValue(encoded(50_000))

    const result = await probeImageBytes([item('bg', 200_000, 31)], 0.8, true)

    expect(result).toEqual({ totalBytes: 50_000 * 31, jpegBytes: 50_000 * 31, failed: 0 })
    expect(resizeImage).toHaveBeenCalledTimes(1)
  })

  it('건너뛰는 이미지와 캐시에 없는 이미지는 원본 크기 × 쪽 수', async () => {
    rememberOriginal('logo', new Uint8Array(300_000))

    const result = await probeImageBytes(
      [item('logo', 300_000, 2, true), item('gone', 400_000, 3)],
      0.8,
      true
    )

    expect(result).toEqual({ totalBytes: 300_000 * 2 + 400_000 * 3, jpegBytes: 0, failed: 1 })
    expect(resizeImage).not.toHaveBeenCalled()
  })

  it('줄였는데 커지면 원본으로 센다 — 실제 export 의 keepsOriginal 과 같은 규칙', async () => {
    rememberOriginal('jpg', new Uint8Array(150_000))
    resizeImage.mockResolvedValue(encoded(160_000))

    const result = await probeImageBytes([item('jpg', 150_000, 2)], 0.8, true)

    expect(result).toEqual({ totalBytes: 300_000, jpegBytes: 0, failed: 0 })
  })

  it('PNG 로 남긴 출력은 JPEG 몫에 넣지 않는다', async () => {
    rememberOriginal('png', new Uint8Array(500_000))
    resizeImage.mockResolvedValue(encoded(120_000, 'image/png'))

    const result = await probeImageBytes([item('png', 500_000, 1)], 0.8, true)

    expect(result).toEqual({ totalBytes: 120_000, jpegBytes: 0, failed: 0 })
  })
})
