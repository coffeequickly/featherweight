// TTC/OTC 컬렉션에서 face 하나를 단일 SFNT 파일로 뽑는다. Figma·DOM 의존 금지.
//
// macOS 기본 서체(Helvetica·Helvetica Neue·Avenir·Apple SD Gothic Neo…)는 한 파일에 여러 face 를
// 담은 컬렉션이다. fontkit 은 읽지만 pdf-lib 임베드와 저장은 face 하나짜리 바이트를 원한다.
// 컬렉션 안의 face 는 테이블 디렉터리만 다르고 테이블 바이트는 파일 안에서 공유하므로,
// 그 face 의 디렉터리가 가리키는 테이블만 새 파일로 복사하면 된다. head 의 checksumAdjustment 는
// 파일 전체에 대한 값이라 다시 계산한다.
//
// 입력은 사용자 폴더의 임의 파일이다 — 헤더·face 위치·디렉터리·테이블 범위가 전부 파일 안에
// 있는지 확인하고, 아니면 RangeError 로 거절한다. 잘린 파일의 offset 을 믿고 읽으면 빈 바이트가
// 조용히 폰트가 되고, 엉뚱한 length 를 믿으면 거대한 배열을 잡는다.

const TTCF = 0x74746366 // 'ttcf'
const CHECKSUM_MAGIC = 0xb1b0afba
/** 컬렉션이 담을 수 있다고 보는 face 수 — 그 이상은 파일이 이상한 것이다 */
const MAX_FACES = 256
/** SFNT 테이블 수 상한 — 실제 폰트는 수십 개다 */
const MAX_TABLES = 512

function readU16(bytes: Uint8Array, at: number): number {
  return (bytes[at] << 8) | bytes[at + 1]
}

function readU32(bytes: Uint8Array, at: number): number {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0
}

function writeU16(bytes: Uint8Array, at: number, value: number): void {
  bytes[at] = (value >>> 8) & 0xff
  bytes[at + 1] = value & 0xff
}

function writeU32(bytes: Uint8Array, at: number, value: number): void {
  bytes[at] = (value >>> 24) & 0xff
  bytes[at + 1] = (value >>> 16) & 0xff
  bytes[at + 2] = (value >>> 8) & 0xff
  bytes[at + 3] = value & 0xff
}

function pad4(length: number): number {
  return (length + 3) & ~3
}

/** 테이블 체크섬 규칙 — 4바이트 빅엔디언 합, 넘치는 건 버린다. 길이는 4의 배수여야 한다 */
function checksum(bytes: Uint8Array): number {
  let sum = 0
  for (let at = 0; at + 4 <= bytes.length; at += 4) sum = (sum + readU32(bytes, at)) >>> 0
  return sum
}

function reject(message: string): never {
  throw new RangeError(`font collection: ${message}`)
}

export function isFontCollection(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && readU32(bytes, 0) === TTCF
}

/** face 수. 컬렉션이 아니거나 헤더가 잘렸으면 0 */
export function collectionFaceCount(bytes: Uint8Array): number {
  if (!isFontCollection(bytes)) return 0
  const count = readU32(bytes, 8)
  if (count === 0 || count > MAX_FACES) return 0
  if (12 + count * 4 > bytes.length) return 0
  return count
}

type TableEntry = { tag: Uint8Array; checksum: number; offset: number; length: number }

/**
 * index 번째 face 를 단일 SFNT 로. 테이블 순서는 디렉터리 순서(태그순)를 그대로 따르고,
 * 각 테이블은 4바이트 경계에 맞춘다. 범위가 파일 밖이면 RangeError.
 */
export function extractFace(bytes: Uint8Array, index: number): Uint8Array {
  const count = collectionFaceCount(bytes)
  if (count === 0) reject('not a collection or the header is truncated')
  if (!Number.isInteger(index) || index < 0 || index >= count)
    reject(`no face ${index} (${count} faces)`)

  const base = readU32(bytes, 12 + index * 4)
  if (base + 12 > bytes.length) reject('face header lies outside the file')
  const sfntVersion = readU32(bytes, base)
  const numTables = readU16(bytes, base + 4)
  if (numTables === 0 || numTables > MAX_TABLES) reject(`face has ${numTables} tables`)
  const directoryStart = base + 12
  if (directoryStart + numTables * 16 > bytes.length)
    reject('table directory lies outside the file')

  const entries: TableEntry[] = []
  let size = 12 + numTables * 16
  for (let i = 0; i < numTables; i += 1) {
    const at = directoryStart + i * 16
    const entry: TableEntry = {
      tag: bytes.subarray(at, at + 4),
      checksum: readU32(bytes, at + 4),
      offset: readU32(bytes, at + 8),
      length: readU32(bytes, at + 12)
    }
    if (entry.offset + entry.length > bytes.length) {
      reject(`table ${tagOf(entry.tag)} lies outside the file`)
    }
    for (const byte of entry.tag) if (byte < 0x20 || byte > 0x7e) reject('table tag is not ASCII')
    entries.push(entry)
    size += pad4(entry.length)
  }
  // 테이블은 파일 안에서 오고 각각 3바이트까지 채워지므로, 이보다 크면 디렉터리가 이상한 것이다
  if (size > bytes.length + 12 + numTables * 20) reject('tables add up to more than the file')

  const out = new Uint8Array(size)
  const entrySelector = Math.floor(Math.log2(numTables))
  const searchRange = 2 ** entrySelector * 16
  writeU32(out, 0, sfntVersion)
  writeU16(out, 4, numTables)
  writeU16(out, 6, searchRange)
  writeU16(out, 8, entrySelector)
  writeU16(out, 10, numTables * 16 - searchRange)

  let cursor = 12 + numTables * 16
  let headAt = -1
  entries.forEach((entry, i) => {
    const dir = 12 + i * 16
    out.set(entry.tag, dir)
    writeU32(out, dir + 4, entry.checksum)
    writeU32(out, dir + 8, cursor)
    writeU32(out, dir + 12, entry.length)
    out.set(bytes.subarray(entry.offset, entry.offset + entry.length), cursor)
    if (tagOf(entry.tag) === 'head' && entry.length >= 12) headAt = cursor
    cursor += pad4(entry.length)
  })

  if (headAt >= 0) {
    writeU32(out, headAt + 8, 0)
    writeU32(out, headAt + 8, (CHECKSUM_MAGIC - checksum(out)) >>> 0)
  }
  return out
}

function tagOf(tag: Uint8Array): string {
  return String.fromCharCode(tag[0], tag[1], tag[2], tag[3])
}

/** 검증용 — head 를 갖춘 SFNT 는 파일 전체 체크섬이 마법수와 같아야 한다 */
export function fileChecksum(bytes: Uint8Array): number {
  if (bytes.length % 4 === 0) return checksum(bytes)
  const padded = new Uint8Array(pad4(bytes.length))
  padded.set(bytes)
  return checksum(padded)
}
