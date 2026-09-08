// 재검토에서 재현된 두 결함의 회귀 테스트 — 매칭 등급이 판보다 먼저이고, 깨진 face 는 "없음" 이 아니다.
import { describe, expect, it, vi } from 'vitest'

type FakeFace = {
  family: string
  subfamily: string
  weight: number
  italic: boolean
  version?: string
  broken?: boolean
}

const { registry } = vi.hoisted(() => ({ registry: new Map<string, FakeFace[]>() }))

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)
const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

vi.mock('../src/ui/fontkitAdapter', () => {
  type FaceObject = { _face: FakeFace; numGlyphs: number; hasGlyphForCodePoint: () => boolean }
  const faceObject = (face: FakeFace): FaceObject => ({
    _face: face,
    numGlyphs: 100,
    hasGlyphForCodePoint: () => true
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
    namesOf: (face: FaceObject) => {
      if (face._face.broken) throw new Error('broken name table')
      return { family: face._face.family, subfamily: face._face.subfamily }
    },
    factsOf: (face: FaceObject) => ({
      tables: ['glyf'],
      axes: [],
      weightClass: face._face.weight,
      italic: face._face.italic,
      version: face._face.version
    })
  }
})

vi.mock('../src/lib/fontCollection', () => ({
  extractFace: (bytes: Uint8Array, index: number) => encode(`${decode(bytes)}#${index}`)
}))

import { fontKey } from '../src/lib/fontInventory'
import { FontUsage } from '../src/lib/types'
import { findFontFiles } from '../src/ui/fontFolder'

const k = (family: string, style: string): string => fontKey({ family, style })

function fakeFile(name: string, faces: FakeFace[], size = 1000): File {
  registry.set(name, faces)
  return { name, size, arrayBuffer: async () => encode(name).buffer } as unknown as File
}

const usage = (family: string, style: string, weight: number, size?: number): FontUsage => ({
  family,
  style,
  weight,
  italic: false,
  nodeCount: 1,
  charCount: 10,
  nodeIds: ['1:1'],
  ...(size === undefined ? {} : { size })
})

const progress = (): void => undefined

describe('findFontFiles — 매칭 등급이 판보다 먼저다', () => {
  it('굵기만 같은 다른 이름(Book)의 새 판이 이름이 정확한 Regular 의 옛 판을 이기지 않는다', async () => {
    const regular = fakeFile('Example-Regular.ttf', [
      { family: 'Example', subfamily: 'Regular', weight: 400, italic: false, version: '1.0' }
    ])
    const book = fakeFile('Example-Book.ttf', [
      { family: 'Example', subfamily: 'Book', weight: 400, italic: false, version: '2.0' }
    ])
    for (const order of [
      [regular, book],
      [book, regular]
    ]) {
      const result = await findFontFiles(order, [usage('Example', 'Regular', 400)], progress)
      const found = result.found.get(k('Example', 'Regular'))
      expect(found?.fileName).toBe('Example-Regular.ttf')
      expect(found?.tier).toBe(0)
      expect(found?.alternatives).toBe(0) // 굵기만 같은 Book 은 정확한 이름의 대안이 아니다
    }
  })

  it('정확한 이름이 없을 때만 굵기가 같은 다른 스타일을 쓴다', async () => {
    const files = [
      fakeFile('Example-Book.ttf', [
        { family: 'Example', subfamily: 'Book', weight: 400, italic: false }
      ])
    ]
    const result = await findFontFiles(files, [usage('Example', 'Regular', 400)], progress)
    const found = result.found.get(k('Example', 'Regular'))
    expect(found?.fileName).toBe('Example-Book.ttf')
    expect(found?.tier).toBe(2)
  })

  it('같은 등급·같은 점수면 먼저 읽은 파일을 둔다', async () => {
    const a = fakeFile('Example-A.ttf', [
      { family: 'Example', subfamily: 'Regular', weight: 400, italic: false, version: '1.0' }
    ])
    const b = fakeFile('Example-B.ttf', [
      { family: 'Example', subfamily: 'Regular', weight: 400, italic: false, version: '1.0' }
    ])
    expect(
      (await findFontFiles([a, b], [usage('Example', 'Regular', 400)], progress)).found.get(
        k('Example', 'Regular')
      )?.fileName
    ).toBe('Example-A.ttf')
    expect(
      (await findFontFiles([b, a], [usage('Example', 'Regular', 400)], progress)).found.get(
        k('Example', 'Regular')
      )?.fileName
    ).toBe('Example-B.ttf')
  })
})

describe('findFontFiles — 컬렉션 안의 깨진 face', () => {
  it('찾던 서체의 face 가 깨졌으면 "없음" 이 아니라 검사 미완료다', async () => {
    const files = [
      fakeFile('Mixed.ttc', [
        { family: 'Other', subfamily: 'Regular', weight: 400, italic: false },
        { family: 'Wanted', subfamily: 'Regular', weight: 400, italic: false, broken: true }
      ])
    ]
    const result = await findFontFiles(files, [usage('Wanted', 'Regular', 400)], progress)
    expect(result.found.size).toBe(0)
    expect(result.unreadable).toBe(0)
    expect(result.brokenFaces).toBe(1)
    expect(result.reasons.get(k('Wanted', 'Regular'))).toBe('unchecked')
  })

  it('정상 face 는 그대로 찾는다 — 깨진 face 가 같이 있어도', async () => {
    const files = [
      fakeFile('Mixed.ttc', [
        { family: 'Wanted', subfamily: 'Regular', weight: 400, italic: false },
        { family: 'Other', subfamily: 'Regular', weight: 400, italic: false, broken: true }
      ])
    ]
    const result = await findFontFiles(files, [usage('Wanted', 'Regular', 400)], progress)
    expect(result.found.get(k('Wanted', 'Regular'))?.fileName).toBe('Mixed.ttc (Regular)')
    expect(result.brokenFaces).toBe(1)
  })
})

describe('findFontFiles — 이름이 안 맞는 큰 파일은 읽지 않는다', () => {
  it('상한보다 큰 파일은 안 읽은 것으로 세고, 이름이 맞는 큰 파일은 읽는다', async () => {
    const files = [
      fakeFile(
        'AppleColorEmoji.ttc',
        [{ family: 'Apple Color Emoji', subfamily: 'Regular', weight: 400, italic: false }],
        183_000_000
      ),
      fakeFile(
        'HelveticaNeue.ttc',
        [{ family: 'Helvetica Neue', subfamily: 'Bold', weight: 700, italic: false }],
        60_000_000
      )
    ]
    const result = await findFontFiles(
      files,
      [usage('Helvetica Neue', 'Bold', 700), usage('Nexa', 'Heavy', 900)],
      progress,
      { restFileBytesCap: 32_000_000 }
    )
    expect(result.found.get(k('Helvetica Neue', 'Bold'))?.fileName).toBe('HelveticaNeue.ttc (Bold)')
    expect(result.unread).toBe(1)
    expect(result.reasons.get(k('Nexa', 'Heavy'))).toBe('unchecked')
  })
})

// Google Fonts 의 static 폴더 — 이름표는 실제 다운로드에서 읽은 값 (tests/fontFolderTier.test.ts 참고)
describe('findFontFiles — 광학 크기(opsz) static 인스턴스', () => {
  const inter = (): File[] => [
    fakeFile('Inter_18pt-SemiBold.ttf', [
      { family: 'Inter 18pt', subfamily: 'SemiBold', weight: 600, italic: false }
    ]),
    fakeFile('Inter_24pt-SemiBold.ttf', [
      { family: 'Inter 24pt', subfamily: 'SemiBold', weight: 600, italic: false }
    ]),
    fakeFile('Inter_28pt-SemiBold.ttf', [
      { family: 'Inter 28pt', subfamily: 'SemiBold', weight: 600, italic: false }
    ])
  ]

  it('접미 없는 파일이 없는 계열(Inter·Merriweather)도 찾는다 — 문서 글자 크기에 가까운 인스턴스로', async () => {
    const small = await findFontFiles(inter(), [usage('Inter', 'SemiBold', 600, 14)], progress)
    expect(small.found.get(k('Inter', 'SemiBold'))?.fileName).toBe('Inter_18pt-SemiBold.ttf')
    expect(small.found.get(k('Inter', 'SemiBold'))?.tier).toBe(1)

    const large = await findFontFiles(inter(), [usage('Inter', 'SemiBold', 600, 40)], progress)
    expect(large.found.get(k('Inter', 'SemiBold'))?.fileName).toBe('Inter_28pt-SemiBold.ttf')

    // 크기를 모르면 본문 크기(14) 에 가까운 것
    const unknown = await findFontFiles(inter(), [usage('Inter', 'SemiBold', 600)], progress)
    expect(unknown.found.get(k('Inter', 'SemiBold'))?.fileName).toBe('Inter_18pt-SemiBold.ttf')
  })

  it('파일 순서와 무관하게 가까운 크기를 고른다', async () => {
    const reversed = inter().reverse()
    const result = await findFontFiles(reversed, [usage('Inter', 'SemiBold', 600, 22)], progress)
    expect(result.found.get(k('Inter', 'SemiBold'))?.fileName).toBe('Inter_24pt-SemiBold.ttf')
  })

  it('광학 크기 인스턴스만 있는데 굵기가 없으면 "굵기 없음" 이지 "서체 없음" 이 아니다', async () => {
    const result = await findFontFiles(inter(), [usage('Inter', 'Black', 900)], progress)
    expect(result.reasons.get(k('Inter', 'Black'))).toBe('style-missing')
  })
})

describe('findFontFiles — 폭 계열 static (Condensed)', () => {
  const openSans = (): File[] => [
    fakeFile('OpenSans-Bold.ttf', [
      { family: 'Open Sans', subfamily: 'Bold', weight: 700, italic: false }
    ]),
    fakeFile('OpenSans_Condensed-Bold.ttf', [
      { family: 'Open Sans Condensed', subfamily: 'Bold', weight: 700, italic: false }
    ])
  ]

  it('"Condensed Bold" 는 Condensed 파일을, "Bold" 는 보통 폭 파일을 고른다', async () => {
    const result = await findFontFiles(
      openSans(),
      [usage('Open Sans', 'Condensed Bold', 700), usage('Open Sans', 'Bold', 700)],
      progress
    )
    expect(result.found.get(k('Open Sans', 'Condensed Bold'))?.fileName).toBe(
      'OpenSans_Condensed-Bold.ttf'
    )
    expect(result.found.get(k('Open Sans', 'Bold'))?.fileName).toBe('OpenSans-Bold.ttf')
  })

  it('Condensed 파일이 없으면 보통 폭 Bold 를 대신 넣지 않는다', async () => {
    const result = await findFontFiles(
      [openSans()[0]],
      [usage('Open Sans', 'Condensed Bold', 700)],
      progress
    )
    expect(result.found.size).toBe(0)
    expect(result.reasons.get(k('Open Sans', 'Condensed Bold'))).toBe('style-missing')
  })
})
