// 이미지 파일 머리만 읽어 픽셀 크기를 안다. Figma·DOM 의존 금지.
//
// Figma 의 getSizeAsync 는 크기를 알려 주려고 사진을 통째로 디코드한다 — 큰 사진 한 장에
// 100ms 쯤, 그것도 편집기와 같은 스레드에서. 파일 머리 몇십 바이트면 같은 답이 나온다.
// 방향(EXIF) 은 안 본다 — 긴 변만 쓰므로 가로세로가 바뀌어도 답이 같다.

export type PixelSize = { width: number; height: number }

/** 모르는 형식이거나 머리가 깨졌으면 null — 그때는 Figma 에 묻는 수밖에 없다 */
export function imageDimensions(bytes: Uint8Array): PixelSize | null {
  return png(bytes) ?? jpeg(bytes) ?? gif(bytes) ?? webp(bytes) ?? bmp(bytes)
}

function png(b: Uint8Array): PixelSize | null {
  if (b.length < 24 || b[0] !== 0x89 || !ascii(b, 1, 'PNG') || !ascii(b, 12, 'IHDR')) return null
  return valid(u32be(b, 16), u32be(b, 20))
}

/** 크기가 든 SOF 세그먼트들 — 베이스라인·프로그레시브·무손실·산술 부호 전부 */
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
])

function jpeg(b: Uint8Array): PixelSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let pos = 2
  while (pos + 3 < b.length) {
    if (b[pos] !== 0xff) return null
    const marker = b[pos + 1]
    if (marker === 0xff) {
      pos += 1 // 채움 바이트
      continue
    }
    // 길이 없는 마커들
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2
      continue
    }
    // 스캔 데이터가 시작됐는데 아직 크기를 못 봤으면 없는 것이다
    if (marker === 0xd9 || marker === 0xda) return null
    if (SOF_MARKERS.has(marker)) {
      if (pos + 8 >= b.length) return null
      // FF Cx · 길이(2) · 정밀도(1) · 높이(2) · 너비(2)
      return valid(u16be(b, pos + 7), u16be(b, pos + 5))
    }
    const length = u16be(b, pos + 2)
    if (length < 2) return null
    pos += 2 + length
  }
  return null
}

function gif(b: Uint8Array): PixelSize | null {
  if (b.length < 10 || !ascii(b, 0, 'GIF8')) return null
  return valid(u16le(b, 6), u16le(b, 8))
}

function webp(b: Uint8Array): PixelSize | null {
  if (b.length < 30 || !ascii(b, 0, 'RIFF') || !ascii(b, 8, 'WEBP')) return null
  if (ascii(b, 12, 'VP8 ')) return valid(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff)
  if (ascii(b, 12, 'VP8L')) {
    const [b0, b1, b2, b3] = [b[21], b[22], b[23], b[24]]
    return valid(1 + (((b1 & 0x3f) << 8) | b0), 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | (b1 >> 6)))
  }
  if (ascii(b, 12, 'VP8X')) return valid(1 + u24le(b, 24), 1 + u24le(b, 27))
  return null
}

function bmp(b: Uint8Array): PixelSize | null {
  if (b.length < 26 || !ascii(b, 0, 'BM')) return null
  // 높이는 음수(위에서 아래로 저장)일 수 있다
  return valid(u32le(b, 18) | 0, Math.abs(u32le(b, 22) | 0))
}

function valid(width: number, height: number): PixelSize | null {
  return width > 0 && height > 0 ? { width, height } : null
}

function ascii(b: Uint8Array, offset: number, text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (b[offset + index] !== text.charCodeAt(index)) return false
  }
  return true
}

function u16be(b: Uint8Array, at: number): number {
  return (b[at] << 8) | b[at + 1]
}
function u32be(b: Uint8Array, at: number): number {
  return ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
}
function u16le(b: Uint8Array, at: number): number {
  return b[at] | (b[at + 1] << 8)
}
function u24le(b: Uint8Array, at: number): number {
  return b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)
}
function u32le(b: Uint8Array, at: number): number {
  return (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0
}
