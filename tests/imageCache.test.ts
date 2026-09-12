// 목표 용량 예측 — 원본은 한 번 디코드, 같은 결과는 한 번 인코딩, 채택은 export 와 같은 규칙.

import { beforeEach, describe, expect, it, vi } from 'vitest'

// 인코딩은 Canvas 가 필요하다 — 결과 크기만 흉내 낸다
const mocks = vi.hoisted(() => ({
  resizeImage: vi.fn(),
  resizeMany: vi.fn(),
  decodeImage: vi.fn(),
  cloneBitmap: vi.fn(),
  resizeDecoded: vi.fn(),
  encodePiece: vi.fn(),
  // Figma 크기 어림은 캔버스가 필요하다. 입력 길이와 다른 값을 줘야 "우리 바이트" 와
  // "Figma 가 다시 인코딩한 크기" 가 뒤바뀐 것을 테스트가 잡는다 — 절반으로 둔다
  figmaSizeOf: vi.fn(async (bytes: Uint8Array) => Math.round(bytes.length / 2)),
  isPng: vi.fn(() => false)
}))
vi.mock('../src/ui/resize', () => mocks)

import { CROP_RULES } from '../src/lib/imageCrop'
import { CropRect, ImageProbeItem } from '../src/lib/types'
import {
  forgetOriginals,
  imageCacheGeneration,
  imageCacheStats,
  resizeImageCached,
  resizeManyCached,
  ownImageSizes,
  probeImageBytes,
  rememberOriginal,
  rememberOwnSize
} from '../src/ui/imageCache'

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

describe('ownImageSizes — PDF 안에서 우리 이미지를 알아보는 치수', () => {
  it('원본을 캐시에 넣을 때 그 치수를 적고, 줄인 출력의 치수도 받는다', () => {
    // 1×1 GIF — imageHeader 가 읽는 가장 짧은 헤더
    rememberOriginal(
      'gif',
      new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 2, 0, 0, 0, 0])
    )
    rememberOwnSize(1280, 960)

    expect([...ownImageSizes()]).toEqual(['1x2', '1280x960'])
  })

  it('실행이 끝나면 비운다 — 다음 문서의 이미지와 섞이면 안 된다', () => {
    rememberOwnSize(640, 480)
    forgetOriginals()
    expect([...ownImageSizes()]).toEqual([])
  })
})

describe('probeImageBytes — 쪽마다 센다, 인코딩은 한 번', () => {
  it('같은 원본·같은 목표를 31쪽이 쓰면 디코드·인코딩은 한 번, 바이트는 31벌', async () => {
    rememberOriginal('bg', new Uint8Array(200_000))
    mocks.resizeDecoded.mockResolvedValue(encoded(50_000))
    const items = Array.from({ length: 31 }, () => item('bg', 200_000))

    const result = await probeImageBytes(items, 0.8, true)

    expect(result).toEqual({
      totalBytes: 25_000 * 31, // 50,000 을 Figma 가 다시 인코딩한 크기
      failed: 0,
      cropped: 0,
      recovered: 0
    })
    expect(mocks.decodeImage).toHaveBeenCalledTimes(1)
    expect(mocks.resizeDecoded).toHaveBeenCalledTimes(1)
  })

  it('줄이지 않고 그대로 가는 이미지는 Figma 가 다시 인코딩한 크기, 캐시에 없으면 원본 크기', async () => {
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
    // 그대로 가는 'logo' 는 재인코딩 크기(150,000)로 두 쪽, 캐시에 없는 'gone' 만 원본 크기
    expect(result).toMatchObject({ totalBytes: 150_000 * 2 + 400_000, failed: 1 })
    // 인코딩은 없지만 원본이 PDF 에서 차지할 크기는 재야 한다
    expect(mocks.decodeImage).not.toHaveBeenCalled()
    expect(mocks.figmaSizeOf).toHaveBeenCalledTimes(1)
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
    // 원본을 그대로 두기로 했으니 원본 파일 크기(150,000)가 아니라 그 재인코딩 크기로 센다
    expect(result).toMatchObject({ totalBytes: 75_000, cropped: 0 })
  })

  it('PNG 로 남긴 출력도 같은 규칙으로 더한다', async () => {
    rememberOriginal('png', new Uint8Array(500_000))
    mocks.resizeDecoded.mockResolvedValue(encoded(120_000, 'image/png'))
    const result = await probeImageBytes([item('png', 500_000)], 0.8, true)
    expect(result).toMatchObject({ totalBytes: 60_000 })
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
      totalBytes: 100_000 + 250_000 + 100_000,
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
    expect(result).toMatchObject({ totalBytes: 250_000, cropped: 0 })
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
      totalBytes: 250_000,
      failed: 0,
      cropped: 0,
      recovered: 1
    })
  })

  it('정하기는 우리 바이트로, 더하기는 Figma 크기로 — 조각 채택 여부가 재인코딩 크기에 휘둘리지 않는다', async () => {
    rememberOriginal('photo', new Uint8Array(3_000_000))
    // 우리 바이트로는 조각 합(400,000)이 W₀(500,000)보다 20% 작아 채택된다
    mocks.resizeDecoded.mockResolvedValue(encoded(500_000))
    mocks.encodePiece.mockResolvedValue(encoded(400_000))
    const result = await probeImageBytes(
      [item('photo', 3_000_000, { pieces: [{ targetLongEdge: 640, crop: rect }], densityGain: 1 })],
      0.8,
      true
    )
    expect(result).toMatchObject({ totalBytes: 200_000, cropped: 1 })
  })

  it('원본이 PDF 에서 차지할 크기는 실행 내내 한 번만 잰다', async () => {
    rememberOriginal('logo', new Uint8Array(300_000))
    const items = [item('logo', 300_000, { skip: true })]

    await probeImageBytes(items, 0.8, true)
    expect(mocks.figmaSizeOf).toHaveBeenCalledTimes(1)
    await probeImageBytes(items, 0.66, true)
    expect(mocks.figmaSizeOf).toHaveBeenCalledTimes(1)

    forgetOriginals()
    rememberOriginal('logo', new Uint8Array(300_000))
    await probeImageBytes(items, 0.8, true)
    expect(mocks.figmaSizeOf).toHaveBeenCalledTimes(2)
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

describe('candidate bytes reused by final export', () => {
  const request = () => ({
    imageHash: 'photo',
    bytes: new Uint8Array(300_000),
    targetLongEdge: 1000,
    quality: 0.8,
    reencodeOpaquePng: true
  })
  async function prime() {
    const req = request()
    rememberOriginal(req.imageHash, req.bytes)
    const whole = encoded(50_000)
    whole.bytes[0] = 123
    const piece = encoded(10_000, 'image/png')
    piece.bytes[0] = 45
    mocks.resizeDecoded.mockResolvedValue(whole)
    mocks.encodePiece.mockResolvedValue(piece)
    await probeImageBytes(
      [
        item('photo', req.bytes.length, {
          pieces: [{ crop: rect, targetLongEdge: 640 }],
          densityGain: 2
        })
      ],
      req.quality,
      req.reencodeOpaquePng
    )
    return { req, whole, piece }
  }
  it('returns identical full-image bytes and metadata without another encode', async () => {
    const { req, whole } = await prime()
    expect(await resizeImageCached(req)).toEqual(whole)
    expect(mocks.resizeImage).not.toHaveBeenCalled()
    expect(imageCacheStats().reuseHits).toBe(1)
  })
  it('reuses PNG crops, encodes only missing crops once and preserves request order', async () => {
    const { req, piece } = await prime()
    const fresh = encoded(20_000)
    mocks.resizeMany.mockResolvedValue({ ok: true, results: [fresh] })
    const other = { ...rect, x0: 1300 }
    const result = await resizeManyCached({
      ...req,
      jobs: [
        { crop: other, targetLongEdge: 640 },
        { crop: rect, targetLongEdge: 640 }
      ]
    })
    expect(result).toEqual({ ok: true, results: [fresh, piece] })
    expect(mocks.resizeMany).toHaveBeenCalledExactlyOnceWith({
      ...req,
      jobs: [{ crop: other, targetLongEdge: 640 }]
    })
  })
  it('separates image identity, dimensions, JPEG quality, PNG option and crop geometry', async () => {
    const { req } = await prime()
    mocks.resizeImage.mockResolvedValue(encoded(7))
    for (const changed of [
      { imageHash: 'other' },
      { imageHash: undefined },
      { targetLongEdge: 999 },
      { quality: 0.81 },
      { reencodeOpaquePng: false }
    ]) {
      expect(await resizeImageCached({ ...req, ...changed })).toEqual(encoded(7))
    }
    mocks.resizeMany.mockResolvedValue({ ok: true, results: [encoded(8)] })
    for (const crop of [
      { ...rect, x0: rect.x0 + 1 },
      { ...rect, y0: rect.y0 + 1 },
      { ...rect, w: rect.w + 1 },
      { ...rect, h: rect.h + 1 }
    ]) {
      await resizeManyCached({ ...req, jobs: [{ crop, targetLongEdge: 640 }] })
    }
    expect(mocks.resizeImage).toHaveBeenCalledTimes(5)
    expect(mocks.resizeMany).toHaveBeenCalledTimes(4)
  })
  it('cache miss and failed crop retain the original failure/fallback contract', async () => {
    const { req } = await prime()
    forgetOriginals()
    mocks.resizeImage.mockResolvedValue({ ok: false, reason: 'decode failed' })
    mocks.resizeMany.mockResolvedValue({ ok: false, reason: 'crop failed' })
    expect(await resizeImageCached(req)).toEqual({ ok: false, reason: 'decode failed' })
    expect(await resizeManyCached({ ...req, jobs: [{ crop: rect, targetLongEdge: 640 }] })).toEqual(
      { ok: false, reason: 'crop failed' }
    )
    expect(imageCacheStats()).toEqual({ originalBytes: 0, encodedBytes: 0, reuseHits: 0 })
  })
  it('does not retain unchanged originals a second time', async () => {
    rememberOriginal('photo', request().bytes)
    mocks.resizeDecoded.mockResolvedValue({ ...encoded(300_000), changed: false })
    await probeImageBytes([item('photo', 300_000)], 0.8, true)
    expect(imageCacheStats().encodedBytes).toBe(0)
  })
  it('late completion after cancellation cannot refill caches or add dimensions', async () => {
    const req = request()
    rememberOriginal(req.imageHash, req.bytes)
    const oldGeneration = imageCacheGeneration()
    let finish!: (value: ReturnType<typeof encoded>) => void
    mocks.resizeDecoded.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const probing = probeImageBytes([item('photo', req.bytes.length)], 0.8, true)
    const rejected = expect(probing).rejects.toThrow('cancelled')
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    forgetOriginals()
    finish(encoded(50_000))
    await rejected
    rememberOwnSize(100, 100, oldGeneration)
    expect(imageCacheStats()).toEqual({ originalBytes: 0, encodedBytes: 0, reuseHits: 0 })
    expect([...ownImageSizes()]).toEqual([])
  })
  it('a cancelled queued image never starts decoding', async () => {
    const req = request()
    let finish!: (value: ReturnType<typeof encoded>) => void
    mocks.resizeImage.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const active = resizeImageCached(req)
    const queued = resizeImageCached({ ...req, imageHash: 'other' })
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    forgetOriginals()
    expect(await queued).toMatchObject({ ok: false })
    finish(encoded(4))
    expect(await active).toMatchObject({ ok: false })
    expect(mocks.resizeImage).toHaveBeenCalledTimes(1)
  })
})

describe('probe memory admission and shared retention', () => {
  it('allows four small originals concurrently without changing page tallies', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    mocks.resizeDecoded.mockImplementation(async () => {
      await gate
      return encoded(50_000)
    })
    const items = Array.from({ length: 5 }, (_, i) => {
      const original = new Uint8Array(200_000)
      // GIF header dimensions suffice for admission; the decoder is mocked here.
      original.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0xf4, 1, 0xf4, 1, 0, 0, 0])
      rememberOriginal(String(i), original)
      return item(String(i), original.length)
    })
    const result = probeImageBytes(items, 0.8, true)
    await vi.waitFor(() => expect(mocks.resizeDecoded).toHaveBeenCalledTimes(4))
    release()
    expect(await result).toMatchObject({ totalBytes: 125_000, failed: 0 })
    expect(mocks.resizeDecoded).toHaveBeenCalledTimes(5)
  })
  it('gives originals priority and keeps original plus encoded cache within 200 MiB', async () => {
    rememberOriginal('photo', new Uint8Array(300_000))
    mocks.resizeDecoded.mockResolvedValue(encoded(50_000))
    await probeImageBytes([item('photo', 300_000)], 0.8, true)
    expect(imageCacheStats().encodedBytes).toBe(50_000)
    const limit = 200 * 1024 * 1024
    rememberOriginal('large', new Uint8Array(limit))
    expect(imageCacheStats()).toMatchObject({ originalBytes: limit, encodedBytes: 0 })
    mocks.resizeImage.mockResolvedValue(encoded(3))
    expect(
      await resizeImageCached({
        imageHash: 'photo',
        bytes: new Uint8Array(300_000),
        targetLongEdge: 1000,
        quality: 0.8,
        reencodeOpaquePng: true
      })
    ).toEqual(encoded(3))
    forgetOriginals()
  })
})
