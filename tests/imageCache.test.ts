// 목표 용량 예측 — 원본은 한 번 디코드, 같은 결과는 한 번 인코딩, 채택은 export 와 같은 규칙.

import { beforeEach, describe, expect, it, vi } from 'vitest'

// 인코딩은 Canvas 가 필요하다 — 결과 크기만 흉내 낸다
const mocks = vi.hoisted(() => ({
  decodeImage: vi.fn(),
  cloneBitmap: vi.fn(),
  resizeDecoded: vi.fn(),
  encodePiece: vi.fn(),
  isPng: vi.fn(() => false)
}))
vi.mock('../src/ui/resize', () => mocks)

import { CROP_RULES } from '../src/lib/imageCrop'
import { CropRect, ImageProbeItem } from '../src/lib/types'
import { forgetOriginals, probeImageBytes, rememberOriginal } from '../src/ui/imageCache'

const rect: CropRect = { x0: 1349, y0: 1849, w: 302, h: 302 }
const item = (
  imageHash: string,
  originalBytes: number,
  extra: Partial<ImageProbeItem> = {}
): ImageProbeItem => ({
  imageHash,
  targetLongEdge: 1000,
  skip: false,
  originalBytes,
  ...extra
})
const encoded = (length: number, mime: 'image/jpeg' | 'image/png' = 'image/jpeg') => ({
  ok: true as const,
  bytes: new Uint8Array(length),
  mime,
  width: 1,
  height: 1,
  changed: true
})
const bitmap = () => ({ width: 4000, height: 3000, close: vi.fn() })

beforeEach(() => {
  forgetOriginals()
  for (const fn of Object.values(mocks)) fn.mockReset()
  mocks.decodeImage.mockImplementation(async () => bitmap())
  mocks.cloneBitmap.mockImplementation(async () => bitmap())
  mocks.isPng.mockReturnValue(false)
})

describe('probeImageBytes — 쪽마다 센다, 인코딩은 한 번', () => {
  it('같은 원본·같은 목표를 31쪽이 쓰면 디코드·인코딩은 한 번, 바이트는 31벌', async () => {
    rememberOriginal('bg', new Uint8Array(200_000))
    mocks.resizeDecoded.mockResolvedValue(encoded(50_000))
    const items = Array.from({ length: 31 }, () => item('bg', 200_000))

    const result = await probeImageBytes(items, 0.8, true)

    expect(result).toEqual({
      totalBytes: 50_000 * 31,
      jpegBytes: 50_000 * 31,
      failed: 0,
      cropped: 0,
      recovered: 0
    })
    expect(mocks.decodeImage).toHaveBeenCalledTimes(1)
    expect(mocks.resizeDecoded).toHaveBeenCalledTimes(1)
  })

  it('건너뛰는 이미지와 캐시에 없는 이미지는 원본 크기', async () => {
    rememberOriginal('logo', new Uint8Array(300_000))
    const result = await probeImageBytes(
      [
        item('logo', 300_000, { skip: true }),
        item('logo', 300_000, { skip: true }),
        item('gone', 400_000)
      ],
      0.8,
      true
    )
    expect(result).toMatchObject({ totalBytes: 300_000 * 2 + 400_000, jpegBytes: 0, failed: 1 })
    expect(mocks.decodeImage).not.toHaveBeenCalled()
  })

  it('줄였는데 커지면 원본으로 센다 — 실제 export 의 keepsOriginal 과 같은 규칙, 조각도 안 본다', async () => {
    rememberOriginal('jpg', new Uint8Array(150_000))
    mocks.resizeDecoded.mockResolvedValue({ ...encoded(150_000), changed: false })
    mocks.encodePiece.mockResolvedValue(encoded(1_000))
    const result = await probeImageBytes(
      [item('jpg', 150_000, { pieces: [{ targetLongEdge: 640, crop: rect }], densityGain: 2 })],
      0.8,
      true
    )
    expect(result).toMatchObject({ totalBytes: 150_000, jpegBytes: 0, cropped: 0 })
  })

  it('PNG 로 남긴 출력은 JPEG 몫에 넣지 않는다', async () => {
    rememberOriginal('png', new Uint8Array(500_000))
    mocks.resizeDecoded.mockResolvedValue(encoded(120_000, 'image/png'))
    const result = await probeImageBytes([item('png', 500_000)], 0.8, true)
    expect(result).toMatchObject({ totalBytes: 120_000, jpegBytes: 0 })
  })

  it('같은 원본을 쪽마다 다르게 쓰면 쪽마다 따로 — 조각 쪽은 조각, 전체 쪽은 W₀. 조각은 원본 디코드 한 번에', async () => {
    rememberOriginal('photo', new Uint8Array(3_000_000))
    mocks.resizeDecoded.mockResolvedValue(encoded(500_000))
    mocks.encodePiece.mockResolvedValue(encoded(200_000))
    const result = await probeImageBytes(
      [
        item('photo', 3_000_000, {
          targetLongEdge: 1920,
          pieces: [{ targetLongEdge: 640, crop: rect }],
          densityGain: 1
        }),
        item('photo', 3_000_000, { targetLongEdge: 1920 }),
        item('photo', 3_000_000, {
          targetLongEdge: 1920,
          pieces: [{ targetLongEdge: 640, crop: rect }],
          densityGain: 1
        })
      ],
      0.8,
      true
    )
    expect(result).toEqual({
      totalBytes: 200_000 + 500_000 + 200_000,
      jpegBytes: 900_000,
      failed: 0,
      cropped: 2,
      recovered: 0
    })
    expect(mocks.decodeImage).toHaveBeenCalledTimes(1)
    expect(mocks.encodePiece).toHaveBeenCalledTimes(1) // 같은 조각은 한 번
    expect(mocks.resizeDecoded).toHaveBeenCalledTimes(1)
  })

  it('조각 합이 최소 절감에 못 미치면 W₀ 로 센다 — export 와 같은 chooseCrop', async () => {
    rememberOriginal('photo', new Uint8Array(3_000_000))
    mocks.resizeDecoded.mockResolvedValue(encoded(500_000))
    mocks.encodePiece.mockResolvedValue(
      encoded(Math.ceil(500_000 * (1 - CROP_RULES.minSavingSameDensity)) + 1)
    )
    const result = await probeImageBytes(
      [item('photo', 3_000_000, { pieces: [{ targetLongEdge: 640, crop: rect }], densityGain: 1 })],
      0.8,
      true
    )
    expect(result).toMatchObject({ totalBytes: 500_000, cropped: 0 })
  })

  it('조각 인코딩이 실패하면 W₀ 로 센다 — export 의 복구와 같은 규칙, recovered 로', async () => {
    rememberOriginal('photo', new Uint8Array(3_000_000))
    mocks.resizeDecoded.mockResolvedValue(encoded(500_000))
    mocks.encodePiece.mockRejectedValue(new Error('canvas'))
    const result = await probeImageBytes(
      [item('photo', 3_000_000, { pieces: [{ targetLongEdge: 640, crop: rect }], densityGain: 1 })],
      0.8,
      true
    )
    expect(result).toEqual({
      totalBytes: 500_000,
      jpegBytes: 500_000,
      failed: 0,
      cropped: 0,
      recovered: 1
    })
  })

  it('목표가 둘이면 앞은 복사본, 마지막은 원본 비트맵을 그대로 쓴다', async () => {
    rememberOriginal('photo', new Uint8Array(3_000_000))
    mocks.resizeDecoded.mockResolvedValue(encoded(500_000))
    await probeImageBytes(
      [
        item('photo', 3_000_000, { targetLongEdge: 1920 }),
        item('photo', 3_000_000, { targetLongEdge: 1280 })
      ],
      0.8,
      true
    )
    expect(mocks.cloneBitmap).toHaveBeenCalledTimes(1)
    expect(mocks.resizeDecoded).toHaveBeenCalledTimes(2)
  })
})
