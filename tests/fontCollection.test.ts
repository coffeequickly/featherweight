import { existsSync, readFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

import {
  collectionFaceCount,
  extractFace,
  fileChecksum,
  isFontCollection
} from '../src/lib/fontCollection'
import { screenFontFile } from '../src/lib/fontFile'
import {
  collectionFaces,
  createProbe,
  factsOf,
  namesOf,
  pdfLibFontkit
} from '../src/ui/fontkitAdapter'

const u32 = (bytes: Uint8Array, at: number, value: number): void => {
  bytes[at] = (value >>> 24) & 0xff
  bytes[at + 1] = (value >>> 16) & 0xff
  bytes[at + 2] = (value >>> 8) & 0xff
  bytes[at + 3] = value & 0xff
}
const u16 = (bytes: Uint8Array, at: number, value: number): void => {
  bytes[at] = (value >>> 8) & 0xff
  bytes[at + 1] = value & 0xff
}
const readU32 = (bytes: Uint8Array, at: number): number =>
  ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0
const tagAt = (bytes: Uint8Array, at: number): string =>
  String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3])

/**
 * 합성 컬렉션: face A 는 head·hhea·zzzz, face B 는 head·zzzz 를 쓴다(테이블 공유).
 * zzzz 는 길이 5 라 4바이트 정렬을 시험한다. 디렉터리 위치: A 20, B 80. 테이블: 124, 180, 216.
 */
function buildCollection(): { bytes: Uint8Array; tables: Record<string, Uint8Array> } {
  const head = new Uint8Array(54).map((_, i) => (i * 7 + 3) & 0xff)
  const hhea = new Uint8Array(36).map((_, i) => (i * 13 + 1) & 0xff)
  const zzzz = new Uint8Array([9, 8, 7, 6, 5])
  const bytes = new Uint8Array(224)
  bytes.set([0x74, 0x74, 0x63, 0x66], 0) // 'ttcf'
  u16(bytes, 4, 1)
  u16(bytes, 6, 0)
  u32(bytes, 8, 2)
  u32(bytes, 12, 20)
  u32(bytes, 16, 80)
  const dir = (at: number, entries: Array<[string, number, number]>): void => {
    u32(bytes, at, 0x00010000)
    u16(bytes, at + 4, entries.length)
    entries.forEach(([tag, offset, length], i) => {
      const e = at + 12 + i * 16
      bytes.set(
        [...tag].map((c) => c.charCodeAt(0)),
        e
      )
      u32(bytes, e + 4, 0x12345678)
      u32(bytes, e + 8, offset)
      u32(bytes, e + 12, length)
    })
  }
  dir(20, [
    ['head', 124, 54],
    ['hhea', 180, 36],
    ['zzzz', 216, 5]
  ])
  dir(80, [
    ['head', 124, 54],
    ['zzzz', 216, 5]
  ])
  bytes.set(head, 124)
  bytes.set(hhea, 180)
  bytes.set(zzzz, 216)
  return { bytes, tables: { head, hhea, zzzz } }
}

describe('fontCollection', () => {
  it('컬렉션 판별과 face 수', () => {
    const { bytes } = buildCollection()
    expect(isFontCollection(bytes)).toBe(true)
    expect(collectionFaceCount(bytes)).toBe(2)
    const single = new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(isFontCollection(single)).toBe(false)
    expect(collectionFaceCount(single)).toBe(0)
  })

  it('face 하나를 단일 SFNT 로 — 디렉터리·테이블 바이트·4바이트 정렬·체크섬', () => {
    const { bytes, tables } = buildCollection()
    const out = extractFace(bytes, 0)

    expect(out.length).toBe(12 + 3 * 16 + 56 + 36 + 8)
    expect(readU32(out, 0)).toBe(0x00010000)
    expect((out[4] << 8) | out[5]).toBe(3)
    expect([tagAt(out, 12), tagAt(out, 28), tagAt(out, 44)]).toEqual(['head', 'hhea', 'zzzz'])
    expect([readU32(out, 12 + 8), readU32(out, 28 + 8), readU32(out, 44 + 8)]).toEqual([
      60, 116, 152
    ])
    expect(out.subarray(116, 116 + 36)).toEqual(tables.hhea)
    expect(out.subarray(152, 152 + 5)).toEqual(tables.zzzz)
    // head 는 checksumAdjustment(8..12) 만 다르고 나머지는 그대로
    expect(out.subarray(60, 68)).toEqual(tables.head.subarray(0, 8))
    expect(out.subarray(72, 60 + 54)).toEqual(tables.head.subarray(12))
    expect(fileChecksum(out)).toBe(0xb1b0afba)
  })

  it('테이블을 공유하는 둘째 face 도 제 디렉터리대로 나온다', () => {
    const { bytes, tables } = buildCollection()
    const out = extractFace(bytes, 1)
    expect((out[4] << 8) | out[5]).toBe(2)
    expect([tagAt(out, 12), tagAt(out, 28)]).toEqual(['head', 'zzzz'])
    expect(out.subarray(readU32(out, 28 + 8), readU32(out, 28 + 8) + 5)).toEqual(tables.zzzz)
    expect(fileChecksum(out)).toBe(0xb1b0afba)
  })

  it('없는 face 는 던진다', () => {
    const { bytes } = buildCollection()
    expect(() => extractFace(bytes, 2)).toThrow(RangeError)
    expect(() => extractFace(bytes, -1)).toThrow(RangeError)
  })
})

describe('fontCollection — 깨진 입력은 거절한다', () => {
  it('잘린 헤더: face 수만큼의 오프셋이 파일 안에 없다', () => {
    const { bytes } = buildCollection()
    expect(collectionFaceCount(bytes.subarray(0, 14))).toBe(0)
    expect(() => extractFace(bytes.subarray(0, 14), 0)).toThrow(RangeError)
  })

  it('face 헤더가 파일 밖을 가리킨다', () => {
    const { bytes } = buildCollection()
    u32(bytes, 12, 5000)
    expect(() => extractFace(bytes, 0)).toThrow(/outside the file/)
  })

  it('테이블이 파일 밖을 가리킨다 — 잘린 파일, 그리고 1000번째 바이트를 가리키는 디렉터리', () => {
    const { bytes } = buildCollection()
    const short = bytes.subarray(0, 124) // 디렉터리까지만 남기고 테이블은 잘라 낸다
    expect(() => extractFace(short, 0)).toThrow(/outside the file/)
    const whole = buildCollection().bytes
    u32(whole, 20 + 12 + 8, 1000) // head 의 offset 을 1000 으로
    expect(() => extractFace(whole, 0)).toThrow(/outside the file/)
  })

  it('길이가 비정상인 테이블은 거대한 출력을 만들지 않고 거절한다', () => {
    const { bytes } = buildCollection()
    u32(bytes, 20 + 12 + 12, 0x7fffff00) // head 의 length
    expect(() => extractFace(bytes, 0)).toThrow(RangeError)
  })

  it('테이블 수가 0 이거나 터무니없으면 거절한다', () => {
    const zero = buildCollection().bytes
    u16(zero, 20 + 4, 0)
    expect(() => extractFace(zero, 0)).toThrow(/tables/)
    const many = buildCollection().bytes
    u16(many, 20 + 4, 60000)
    expect(() => extractFace(many, 0)).toThrow(RangeError)
  })

  it('태그가 ASCII 가 아니면 거절한다', () => {
    const { bytes } = buildCollection()
    bytes[20 + 12] = 0xff
    expect(() => extractFace(bytes, 0)).toThrow(/tag/)
  })

  it('face 수가 터무니없는 헤더는 컬렉션으로 세지 않는다', () => {
    const { bytes } = buildCollection()
    u32(bytes, 8, 100000)
    expect(collectionFaceCount(bytes)).toBe(0)
  })
})

// 아래는 macOS 기본 서체가 있는 컴퓨터에서만 돈다 — CI(Linux)에서는 건너뛴다.
// 대역이 아니라 실물로 face 추출 → fontkit 파싱 → 서브셋 임베드 → 저장 → 재열기를 본다.
const HELVETICA = '/System/Library/Fonts/Helvetica.ttc'
const GOTHIC = '/System/Library/Fonts/AppleSDGothicNeo.ttc'

describe.skipIf(!existsSync(HELVETICA))('macOS Helvetica.ttc (로컬 실물)', () => {
  const bytes = existsSync(HELVETICA) ? new Uint8Array(readFileSync(HELVETICA)) : new Uint8Array()

  it('face 를 뽑으면 fontkit 이 단일 폰트로 읽고 이름표·글리프 수가 그대로다', () => {
    const faces = collectionFaces(bytes)
    expect(faces).not.toBeNull()
    const index = (faces ?? []).findIndex((face) => namesOf(face).subfamily === 'Bold')
    expect(index).toBeGreaterThanOrEqual(0)
    const single = extractFace(bytes, index)
    const probe = createProbe(single)
    expect(namesOf(probe)).toEqual({ family: 'Helvetica', subfamily: 'Bold' })
    expect(probe.numGlyphs).toBe((faces ?? [])[index].numGlyphs)
    expect(screenFontFile(factsOf(probe)).ok).toBe(true)
    expect(fileChecksum(single)).toBe(0xb1b0afba)
  })

  it('이름이 Italic·Oblique 인 face 는 전부 기울임으로 읽는다 — Helvetica 는 Oblique 라 부른다', () => {
    const faces = collectionFaces(bytes) ?? []
    expect(faces.length).toBeGreaterThan(0)
    for (const face of faces) {
      const names = namesOf(face)
      expect([names.subfamily, factsOf(face).italic]).toEqual([
        names.subfamily,
        /italic|oblique/i.test(names.subfamily)
      ])
    }
  })

  it('뽑은 face 로 서브셋 임베드 → 저장 → 다시 열린다', async () => {
    const single = extractFace(bytes, 0)
    const document = await PDFDocument.create()
    document.registerFontkit(pdfLibFontkit())
    const font = await document.embedFont(single, { subset: true })
    const page = document.addPage([400, 100])
    page.drawText('Helvetica from a .ttc: 1st, 2nd', { x: 20, y: 40, size: 24, font })
    const out = await document.save()
    expect(out.length).toBeLessThan(200_000)
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1)
  })
})

const NEUE = '/System/Library/Fonts/HelveticaNeue.ttc'

describe.skipIf(!existsSync(NEUE))(
  'macOS HelveticaNeue.ttc — italic 비트가 꺼진 Medium Italic (로컬 실물)',
  () => {
    it('Medium Italic 은 기울임, Medium 은 정자', () => {
      const faces = collectionFaces(new Uint8Array(readFileSync(NEUE))) ?? []
      const by = (sub: string): boolean | undefined => {
        const face = faces.find((candidate) => namesOf(candidate).subfamily === sub)
        expect(face).toBeDefined()
        return face === undefined ? undefined : factsOf(face).italic
      }
      expect(by('Medium Italic')).toBe(true)
      expect(by('Thin Italic')).toBe(true)
      expect(by('Medium')).toBe(false)
      expect(by('Bold')).toBe(false)
    })
  }
)

// 임베드 플래그 실측(2026-09-08): Helvetica Neue Installable, Apple SD Gothic Neo Editable, DIN Alternate Preview,
// Futura Medium 은 Restricted+Preview 비트가 같이 켜져 있다 — 규격대로 덜 제한적인 Preview 로 읽어 통과시킨다
const FUTURA = '/System/Library/Fonts/Supplemental/Futura.ttc'
const DIN = '/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf'

describe.skipIf(
  !existsSync(NEUE) || !existsSync(GOTHIC) || !existsSync(FUTURA) || !existsSync(DIN)
)('macOS 임베드 플래그 실물', () => {
  const faceOf = (path: string, family: string, sub: string): ReturnType<typeof factsOf> => {
    const faces = collectionFaces(new Uint8Array(readFileSync(path))) ?? []
    const face = faces.find(
      (candidate) => namesOf(candidate).family === family && namesOf(candidate).subfamily === sub
    )
    expect(face).toBeDefined()
    return factsOf(face as NonNullable<typeof face>)
  }

  it('Installable·Editable·Preview 는 통과한다', () => {
    expect(faceOf(NEUE, 'Helvetica Neue', 'Regular').embedding).toBe('installable')
    expect(faceOf(GOTHIC, 'Apple SD Gothic Neo', 'Regular').embedding).toBe('editable')
    const futura = faceOf(FUTURA, 'Futura', 'Medium')
    expect(futura.embedding).toBe('preview')
    expect(screenFontFile(futura).ok).toBe(true)
    const din = factsOf(createProbe(new Uint8Array(readFileSync(DIN))))
    expect(din.embedding).toBe('preview')
    expect(screenFontFile(din).ok).toBe(true)
  })
})

describe.skipIf(!existsSync(GOTHIC))('macOS AppleSDGothicNeo.ttc — CFF 컬렉션 (로컬 실물)', () => {
  it('Regular face 를 뽑아 한글을 서브셋 임베드한다', async () => {
    const bytes = new Uint8Array(readFileSync(GOTHIC))
    const faces = collectionFaces(bytes) ?? []
    const index = faces.findIndex((face) => {
      const names = namesOf(face)
      return names.family === 'Apple SD Gothic Neo' && names.subfamily === 'Regular'
    })
    expect(index).toBeGreaterThanOrEqual(0)
    const single = extractFace(bytes, index)
    const probe = createProbe(single)
    expect(screenFontFile(factsOf(probe)).ok).toBe(true)
    expect(probe.hasGlyphForCodePoint('한'.codePointAt(0) ?? 0)).toBe(true)

    const document = await PDFDocument.create()
    document.registerFontkit(pdfLibFontkit())
    const font = await document.embedFont(single, { subset: true })
    const page = document.addPage([400, 100])
    page.drawText('애플 산돌고딕 네오 한글 1st', { x: 20, y: 40, size: 24, font })
    const out = await document.save()
    expect(out.length).toBeLessThan(400_000)
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1)
  }, 30_000)
})
