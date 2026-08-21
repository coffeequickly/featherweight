// 최소 ZIP 작성기. 외부 `zip` 명령에 기대지 않으려고 직접 만든다.
//
// macOS·리눅스에는 `zip` 이 있지만 윈도우에는 없다(PowerShell 의 Compress-Archive 는 인자
// 규칙이 다르다). Node 의 zlib 만으로 만들면 어디서든 똑같이 돈다.
//
// 지원하는 것: deflate 압축, 디렉터리 엔트리, UTF-8 파일명. 그 이상은 필요 없다.

import { deflateRawSync } from 'node:zlib'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

const SIGNATURE = {
  local: 0x04034b50,
  central: 0x02014b50,
  end: 0x06054b50
}

// ZIP 은 MS-DOS 시각을 쓴다 (1980 기준, 2초 단위). 1980 이전은 표현할 수 없다.
const DOS_EPOCH = new Date(1980, 0, 1)

function dosTime(input) {
  const date = input.getTime() < DOS_EPOCH.getTime() ? DOS_EPOCH : input
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, day }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let value = i
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[i] = value >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** 디렉터리를 통째로 걸어 (zip 안 경로, 내용) 목록을 만든다. */
async function walk(dir, base, prefix) {
  const entries = []
  for (const name of (await readdir(dir)).sort()) {
    const full = join(dir, name)
    const info = await stat(full)
    const zipPath = `${prefix}${relative(base, full).split(sep).join('/')}`
    if (info.isDirectory()) {
      entries.push({ path: `${zipPath}/`, body: Buffer.alloc(0), mtime: info.mtime })
      entries.push(...(await walk(full, base, prefix)))
    } else {
      entries.push({ path: zipPath, body: await readFile(full), mtime: info.mtime })
    }
  }
  return entries
}

/**
 * `sourceDir` 을 통째로 압축한다. zip 안에서는 `rootName/` 아래에 들어간다.
 */
export async function zipDirectory(sourceDir, zipPath, rootName) {
  const entries = [
    { path: `${rootName}/`, body: Buffer.alloc(0), mtime: new Date(0) },
    ...(await walk(sourceDir, sourceDir, `${rootName}/`))
  ]

  const locals = []
  const centrals = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.path, 'utf8')
    const isDirectory = entry.path.endsWith('/')
    const compressed = isDirectory ? Buffer.alloc(0) : deflateRawSync(entry.body)
    const crc = isDirectory ? 0 : crc32(entry.body)
    const { time, day } = dosTime(entry.mtime)
    const method = isDirectory ? 0 : 8

    const local = Buffer.alloc(30)
    local.writeUInt32LE(SIGNATURE.local, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0x0800, 6) // UTF-8 파일명
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(day, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(entry.body.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, nameBytes, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(SIGNATURE.central, 0)
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(20, 6) // version needed
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(day, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(entry.body.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt16LE(0, 30) // extra
    central.writeUInt16LE(0, 32) // comment
    central.writeUInt16LE(0, 34) // disk
    central.writeUInt16LE(0, 36) // internal attrs
    central.writeUInt32LE(isDirectory ? 0x41ed0010 : 0x81a40000, 38) // unix 권한 + 디렉터리 플래그
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBytes)

    offset += local.length + nameBytes.length + compressed.length
  }

  const centralBuffer = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(SIGNATURE.end, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuffer.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  await writeFile(zipPath, Buffer.concat([...locals, centralBuffer, end]))
}
