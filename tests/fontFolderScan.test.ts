// 폴더 스캔의 고르기·이유·상한을 대역으로 본다. face 추출·fontkit·PDF 는 fontCollection.test 가 실물로 본다.
import { describe, expect, it, vi } from 'vitest'

type FakeFace = {
  family: string
  subfamily: string
  weight: number
  italic: boolean
  variable?: boolean
  /** 있으면 이 글자만 가진 폰트로 본다 */
  glyphs?: string
  version?: string
  numGlyphs?: number
  broken?: boolean
  embedding?: 'installable' | 'editable' | 'preview' | 'restricted' | 'bitmap-only'
  /** 글리프 표가 깨져 조회가 던진다 */
  glyphsThrow?: boolean
}

const { registry } = vi.hoisted(() => ({ registry: new Map<string, FakeFace[]>() }))

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)
const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

vi.mock('../src/ui/fontkitAdapter', () => {
  type FaceObject = {
    _face: FakeFace
    numGlyphs: number
    hasGlyphForCodePoint: (p: number) => boolean
  }
  const faceObject = (face: FakeFace): FaceObject => ({
    _face: face,
    numGlyphs: face.numGlyphs ?? 100,
    hasGlyphForCodePoint: (point: number) => {
      if (face.glyphsThrow === true) throw new Error('broken glyf')
      return face.glyphs === undefined || [...face.glyphs].some((c) => c.codePointAt(0) === point)
    }
  })
  const lookup = (bytes: Uint8Array): { faces: FakeFace[]; name: string; index: number } => {
    const [name, index] = decode(bytes).split('#')
    const faces = registry.get(name)
    if (faces === undefined) throw new Error('not a font')
    return { faces, name, index: index === undefined ? 0 : Number(index) }
  }
  return {
    collectionFaces: (bytes: Uint8Array) => {
      const { faces, name } = lookup(bytes)
      return name.endsWith('.ttc') ? faces.map(faceObject) : null
    },
    createProbe: (bytes: Uint8Array) => {
      const { faces, index } = lookup(bytes)
      const face = faces[index]
      if (face === undefined || face.broken) throw new Error('broken')
      return faceObject(face)
    },
    namesOf: (face: FaceObject) => ({
      family: face._face.family,
      subfamily: face._face.subfamily
    }),
    factsOf: (face: FaceObject) => {
      if (face._face.broken) throw new Error('broken')
      return {
        tables: ['glyf'],
        axes: face._face.variable === true ? ['wght'] : [],
        weightClass: face._face.weight,
        italic: face._face.italic,
        version: face._face.version,
        embedding: face._face.embedding
      }
    }
  }
})

vi.mock('../src/lib/fontCollection', () => ({
  extractFace: (bytes: Uint8Array, index: number) => encode(`${decode(bytes)}#${index}`)
}))

import { fontKey } from '../src/lib/fontInventory'
import { FontUsage } from '../src/lib/types'

const k = (family: string, style: string): string => fontKey({ family, style })
import { findFontFiles } from '../src/ui/fontFolder'

function fakeFile(name: string, faces: FakeFace[], unreadable = false): File {
  registry.set(name, faces)
  return {
    name,
    arrayBuffer: async () => {
      if (unreadable) throw new Error('cannot read')
      return encode(name).buffer
    }
  } as unknown as File
}

function usage(
  family: string,
  style: string,
  weight: number,
  italic = false,
  chars?: string
): FontUsage {
  return {
    family,
    style,
    weight,
    italic,
    nodeCount: 1,
    charCount: 10,
    nodeIds: ['1:1'],
    ...(chars === undefined ? {} : { codePoints: [...chars].map((c) => c.codePointAt(0) ?? 0) })
  }
}

const progress = (): void => undefined
const regular = (family: string, extra: Partial<FakeFace> = {}): FakeFace => ({
  family,
  subfamily: 'Regular',
  weight: 400,
  italic: false,
  ...extra
})

describe('findFontFiles — 쓸 수 있는 후보만 고른다', () => {
  it('같은 이름의 가변 파일이 앞에 있어도 static 파일을 고른다', async () => {
    const files = [
      fakeFile('Montserrat-VariableFont_wght.ttf', [regular('Montserrat', { variable: true })]),
      fakeFile('Montserrat-Regular.ttf', [regular('Montserrat')])
    ]
    const result = await findFontFiles(files, [usage('Montserrat', 'Regular', 400)], progress)
    expect(result.found.get(k('Montserrat', 'Regular'))?.fileName).toBe('Montserrat-Regular.ttf')
    expect(result.reasons.size).toBe(0)
    expect(result.unreadable).toBe(0)
  })

  it('가변 파일뿐이면 variable-only', async () => {
    const files = [
      fakeFile('Montserrat-VariableFont_wght.ttf', [regular('Montserrat', { variable: true })])
    ]
    const result = await findFontFiles(files, [usage('Montserrat', 'Regular', 400)], progress)
    expect(result.found.size).toBe(0)
    expect(result.reasons.get(k('Montserrat', 'Regular'))).toBe('variable-only')
  })

  it('서체는 있는데 굵기가 없으면 style-missing, 서체가 없으면 family-missing', async () => {
    const files = [fakeFile('Montserrat-Regular.ttf', [regular('Montserrat')])]
    const result = await findFontFiles(
      files,
      [usage('Montserrat', 'Bold', 700), usage('Nexa', 'Heavy', 900)],
      progress
    )
    expect(result.reasons.get(k('Montserrat', 'Bold'))).toBe('style-missing')
    expect(result.reasons.get(k('Nexa', 'Heavy'))).toBe('family-missing')
  })

  it('읽지 못한 파일이 있으면 못 찾은 폰트는 "검사 미완료" 지 "없음" 이 아니다', async () => {
    const files = [
      fakeFile('broken.ttf', [], true),
      fakeFile('Montserrat-Regular.ttf', [regular('Montserrat')])
    ]
    const result = await findFontFiles(
      files,
      [usage('Montserrat', 'Regular', 400), usage('Nexa', 'Heavy', 900)],
      progress
    )
    expect(result.found.has(k('Montserrat', 'Regular'))).toBe(true)
    expect(result.unreadable).toBe(1)
    expect(result.reasons.get(k('Nexa', 'Heavy'))).toBe('unchecked')
  })

  it('폰트로 파싱되지 않는 파일도 세고 계속한다', async () => {
    // 이름이 맞는 파일은 전부 읽으므로(더 나은 판이 있을 수 있다) 깨진 파일도 세어진다
    const files = [
      fakeFile('Montserrat-Broken.otf', [regular('Montserrat', { broken: true })]),
      fakeFile('Montserrat-Regular.ttf', [regular('Montserrat')])
    ]
    const result = await findFontFiles(files, [usage('Montserrat', 'Regular', 400)], progress)
    expect(result.found.has(k('Montserrat', 'Regular'))).toBe(true)
    expect(result.unreadable).toBe(1)
  })
})

describe('findFontFiles — 컬렉션과 후보가 여럿일 때', () => {
  it('TTC 에서는 맞는 face 만 뽑고 파일명에 face 를 적는다', async () => {
    const files = [
      fakeFile('HelveticaNeue.ttc', [
        regular('Helvetica Neue'),
        { family: 'Helvetica Neue', subfamily: 'Bold', weight: 700, italic: false },
        { family: 'Helvetica Neue', subfamily: 'Italic', weight: 400, italic: true }
      ])
    ]
    const result = await findFontFiles(files, [usage('Helvetica Neue', 'Bold', 700)], progress)
    const found = result.found.get(k('Helvetica Neue', 'Bold'))
    expect(found?.fileName).toBe('HelveticaNeue.ttc (Bold)')
    expect(decode(found?.bytes ?? new Uint8Array())).toBe('HelveticaNeue.ttc#1') // 그 face 만 뽑았다
  })

  it('문서의 글자를 덮는 파일을 고르고, 후보가 여럿이면 alternatives 로 알린다', async () => {
    const files = [
      fakeFile('NotoSans-Regular.ttf', [regular('Noto Sans', { glyphs: 'abc', version: '2.0' })]),
      fakeFile('NotoSansFull-Regular.ttf', [
        regular('Noto Sans', { glyphs: 'abc한', version: '1.0' })
      ])
    ]
    const result = await findFontFiles(
      files,
      [usage('Noto Sans', 'Regular', 400, false, 'a한')],
      progress
    )
    const found = result.found.get(k('Noto Sans', 'Regular'))
    expect(found?.fileName).toBe('NotoSansFull-Regular.ttf')
    expect(found?.missingGlyphs).toBe(0)
    expect(found?.alternatives).toBe(1)
  })

  it('둘 다 글자를 덮으면 새 판을 고른다 — 파일 순서와 무관하게', async () => {
    const older = fakeFile('Inter-Regular.ttf', [regular('Inter', { version: '3.019' })])
    const newer = fakeFile('Inter-Regular-4.ttf', [regular('Inter', { version: '4.001' })])
    for (const order of [
      [older, newer],
      [newer, older]
    ]) {
      const result = await findFontFiles(order, [usage('Inter', 'Regular', 400)], progress)
      expect(result.found.get(k('Inter', 'Regular'))?.fileName).toBe('Inter-Regular-4.ttf')
    }
  })
})

describe('findFontFiles — 상한', () => {
  it('파일 수 상한을 넘으면 안 읽은 수를 세고, 못 찾은 폰트는 검사 미완료다', async () => {
    const files = ['a.ttf', 'b.ttf', 'c.ttf', 'd.ttf'].map((name) =>
      fakeFile(name, [regular('Other')])
    )
    const result = await findFontFiles(files, [usage('Nexa', 'Heavy', 900)], progress, {
      fileCap: 2
    })
    expect(result.unread).toBe(2)
    expect(result.reasons.get(k('Nexa', 'Heavy'))).toBe('unchecked')
  })

  it('고른 바이트 합이 상한을 넘으면 멈추고 알린다', async () => {
    const files = [fakeFile('Montserrat-Regular.ttf', [regular('Montserrat')])]
    const result = await findFontFiles(files, [usage('Montserrat', 'Regular', 400)], progress, {
      retainedBytesCap: 4
    })
    expect(result.memoryCapped).toBe(true)
    expect(result.found.size).toBe(0)
    expect(result.reasons.get(k('Montserrat', 'Regular'))).toBe('unchecked')
  })
})

describe('findFontFiles — 임베드를 금지한 파일', () => {
  it('금지 파일뿐이면 restricted 로 말하고, 허용 파일이 있으면 그것을 고른다', async () => {
    const restricted = fakeFile('Corp-Regular.ttf', [regular('Corp', { embedding: 'restricted' })])
    const only = await findFontFiles([restricted], [usage('Corp', 'Regular', 400)], progress)
    expect(only.found.size).toBe(0)
    expect(only.reasons.get(k('Corp', 'Regular'))).toBe('restricted')

    const allowed = fakeFile('Corp-Regular-Web.ttf', [regular('Corp', { embedding: 'preview' })])
    const both = await findFontFiles(
      [restricted, allowed],
      [usage('Corp', 'Regular', 400)],
      progress
    )
    expect(both.found.get(k('Corp', 'Regular'))?.fileName).toBe('Corp-Regular-Web.ttf')
  })
})

describe('findFontFiles — 글리프 조회가 던지는 파일', () => {
  it('그 후보만 빼고 계속 읽는다 — 다음 파일에서 찾는다', async () => {
    const files = [
      fakeFile('Nexa-Heavy-Broken.ttf', [
        { family: 'Nexa', subfamily: 'Heavy', weight: 900, italic: false, glyphsThrow: true }
      ]),
      fakeFile('Nexa-Heavy.ttf', [
        { family: 'Nexa', subfamily: 'Heavy', weight: 900, italic: false }
      ])
    ]
    const result = await findFontFiles(files, [usage('Nexa', 'Heavy', 900, false, 'ab')], progress)
    expect(result.found.get(k('Nexa', 'Heavy'))?.fileName).toBe('Nexa-Heavy.ttf')
    expect(result.brokenFaces).toBe(1)
    expect(result.error).toBeUndefined()
  })

  it('깨진 것뿐이면 "없음" 이 아니라 검사 미완료다', async () => {
    const files = [
      fakeFile('Nexa-Heavy-Broken.ttf', [
        { family: 'Nexa', subfamily: 'Heavy', weight: 900, italic: false, glyphsThrow: true }
      ])
    ]
    const result = await findFontFiles(files, [usage('Nexa', 'Heavy', 900, false, 'ab')], progress)
    expect(result.found.size).toBe(0)
    expect(result.reasons.get(k('Nexa', 'Heavy'))).toBe('unchecked')
  })
})
