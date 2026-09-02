import { describe, expect, it } from 'vitest'

import { imageDimensions } from '../src/lib/imageHeader'

function bytes(...parts: Array<number[] | string>): Uint8Array {
  const out: number[] = []
  for (const part of parts) {
    if (typeof part === 'string') for (const ch of part) out.push(ch.charCodeAt(0))
    else out.push(...part)
  }
  return Uint8Array.from(out)
}
const be16 = (n: number): number[] => [(n >> 8) & 0xff, n & 0xff]
const be32 = (n: number): number[] => [
  (n >>> 24) & 0xff,
  (n >> 16) & 0xff,
  (n >> 8) & 0xff,
  n & 0xff
]
const le16 = (n: number): number[] => [n & 0xff, (n >> 8) & 0xff]
const le24 = (n: number): number[] => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff]
const le32 = (n: number): number[] => [...le24(n), (n >>> 24) & 0xff]

describe('imageDimensions', () => {
  it('PNG — IHDR 의 너비·높이', () => {
    const png = bytes(
      [0x89],
      'PNG',
      [0x0d, 0x0a, 0x1a, 0x0a],
      be32(13),
      'IHDR',
      be32(4032),
      be32(3024),
      [8, 6, 0, 0, 0]
    )
    expect(imageDimensions(png)).toEqual({ width: 4032, height: 3024 })
  })

  it('JPEG — APP·DQT 를 건너뛰고 SOF0 에서 읽는다', () => {
    const app0 = [
      0xff,
      0xe0,
      ...be16(16),
      ...'JFIF'.split('').map((c) => c.charCodeAt(0)),
      0,
      1,
      1,
      0,
      0,
      1,
      0,
      1,
      0,
      0
    ]
    const dqt = [0xff, 0xdb, ...be16(4), 0, 0]
    const sof0 = [
      0xff,
      0xc0,
      ...be16(17),
      8,
      ...be16(1080),
      ...be16(1920),
      3,
      1,
      0x22,
      0,
      2,
      0x11,
      1,
      3,
      0x11,
      1
    ]
    const jpg = bytes([0xff, 0xd8], app0, dqt, sof0, [0xff, 0xda])
    expect(imageDimensions(jpg)).toEqual({ width: 1920, height: 1080 })
  })

  it('JPEG — 프로그레시브(SOF2)·채움 바이트도 읽는다', () => {
    const sof2 = [0xff, 0xff, 0xff, 0xc2, ...be16(11), 8, ...be16(600), ...be16(800), 1, 1, 0x11, 0]
    expect(imageDimensions(bytes([0xff, 0xd8], sof2))).toEqual({ width: 800, height: 600 })
  })

  it('JPEG — 스캔이 시작될 때까지 SOF 가 없으면 모른다', () => {
    expect(imageDimensions(bytes([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBeNull()
  })

  it('GIF', () => {
    expect(imageDimensions(bytes('GIF89a', le16(320), le16(240), [0, 0, 0]))).toEqual({
      width: 320,
      height: 240
    })
  })

  it('WebP — VP8 (손실)', () => {
    const vp8 = bytes(
      'RIFF',
      le32(100),
      'WEBP',
      'VP8 ',
      le32(90),
      [0, 0, 0, 0x9d, 0x01, 0x2a],
      le16(1280),
      le16(720)
    )
    expect(imageDimensions(vp8)).toEqual({ width: 1280, height: 720 })
  })

  it('WebP — VP8L (무손실) 은 14비트 두 개가 1 빠진 채로 들어 있다', () => {
    const w = 1024 - 1
    const h = 768 - 1
    const packed = [
      w & 0xff,
      ((w >> 8) & 0x3f) | ((h & 0x03) << 6),
      (h >> 2) & 0xff,
      (h >> 10) & 0x0f
    ]
    const vp8l = bytes('RIFF', le32(100), 'WEBP', 'VP8L', le32(90), [0x2f], packed, [0, 0, 0, 0, 0])
    expect(imageDimensions(vp8l)).toEqual({ width: 1024, height: 768 })
  })

  it('WebP — VP8X (확장) 은 캔버스 크기 - 1 을 24비트로', () => {
    const vp8x = bytes(
      'RIFF',
      le32(100),
      'WEBP',
      'VP8X',
      le32(10),
      [0, 0, 0, 0],
      le24(2559),
      le24(1439),
      [0, 0, 0, 0]
    )
    expect(imageDimensions(vp8x)).toEqual({ width: 2560, height: 1440 })
  })

  it('BMP — 높이가 음수여도 절댓값', () => {
    const bmp = bytes(
      'BM',
      le32(0),
      le32(0),
      le32(54),
      le32(40),
      le32(64),
      le32(-48 >>> 0),
      [0, 0, 0, 0]
    )
    expect(imageDimensions(bmp)).toEqual({ width: 64, height: 48 })
  })

  it('모르는 형식·빈 바이트는 null', () => {
    expect(imageDimensions(new Uint8Array(0))).toBeNull()
    expect(imageDimensions(bytes('hello world, not an image at all'))).toBeNull()
    expect(
      imageDimensions(
        bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a], be32(13), 'IHDR', be32(0), be32(10))
      )
    ).toBeNull()
  })
})
