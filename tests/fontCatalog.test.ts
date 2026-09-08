import { describe, expect, it } from 'vitest'

import {
  CATALOG,
  CATALOG_HOSTS,
  catalogEntry,
  looseCatalogKey,
  outsideCatalog
} from '../src/lib/fontCatalog'

describe('catalogEntry', () => {
  it('Figma 가 부르는 variable 이름으로도 찾는다', () => {
    const entry = catalogEntry({ family: 'Pretendard Variable', style: 'SemiBold' })
    expect(entry).toBeDefined()
    expect(entry?.weight).toBe(600)
  })

  it('static 을 설치한 경우의 이름으로도 찾는다', () => {
    expect(catalogEntry({ family: 'Pretendard', style: 'Black' })?.weight).toBe(900)
  })

  it('모르는 서체는 없다', () => {
    expect(catalogEntry({ family: 'Nexa', style: 'Heavy' })).toBeUndefined()
  })

  it('모르는 굵기도 없다', () => {
    expect(catalogEntry({ family: 'Pretendard', style: 'UltraCondensed' })).toBeUndefined()
  })

  it('확장 카탈로그의 서체를 찾는다', () => {
    expect(catalogEntry({ family: 'Nanum Gothic', style: 'ExtraBold' })?.weight).toBe(800)
    expect(catalogEntry({ family: 'Gothic A1', style: 'SemiBold' })?.weight).toBe(600)
    expect(catalogEntry({ family: 'IBM Plex Sans KR', style: 'Bold' })?.weight).toBe(700)
    expect(catalogEntry({ family: 'Spoqa Han Sans Neo', style: 'Medium' })?.weight).toBe(500)
    expect(catalogEntry({ family: 'Do Hyeon', style: 'Regular' })).toBeDefined()
  })

  it('파일 내부 이름표·한글 이름 별칭으로도 찾는다', () => {
    const spaced = catalogEntry({ family: 'Nanum Gothic', style: 'Bold' })
    expect(catalogEntry({ family: 'NanumGothic', style: 'Bold' })?.url).toBe(spaced?.url)
    expect(catalogEntry({ family: '나눔고딕', style: 'Bold' })?.url).toBe(spaced?.url)
    expect(catalogEntry({ family: 'Nanum Pen', style: 'Regular' })).toBeDefined()
  })

  it('Pretendard JP 는 JP 파일을 받는다 — KR 파일로 대체하지 않는다', () => {
    const entry = catalogEntry({ family: 'Pretendard JP', style: 'Regular' })
    expect(entry?.url).toContain('PretendardJP-Regular.ttf')
  })

  it('IBM Plex Sans KR 은 Bold 초과 굵기가 없다', () => {
    expect(catalogEntry({ family: 'IBM Plex Sans KR', style: 'ExtraBold' })).toBeUndefined()
  })

  it('이름 표기가 달라도 찾는다 — 공백·대소문자·Variable 접미·Regular Italic', () => {
    const semibold = catalogEntry({ family: 'Open Sans', style: 'SemiBold' })
    expect(semibold).toBeDefined()
    expect(catalogEntry({ family: 'Open Sans', style: 'Semi Bold' })?.url).toBe(semibold?.url)
    expect(catalogEntry({ family: 'open sans', style: 'semi-bold' })?.url).toBe(semibold?.url)
    expect(catalogEntry({ family: 'Roboto', style: 'Regular Italic' })?.url).toBe(
      catalogEntry({ family: 'Roboto', style: 'Italic' })?.url
    )
    expect(catalogEntry({ family: 'Noto Sans KR Variable', style: 'Bold' })?.url).toBe(
      catalogEntry({ family: 'Noto Sans KR', style: 'Bold' })?.url
    )
    // 확인되지 않은 별칭은 두지 않는다 — Book/Normal 은 Regular 가 아닐 수 있다
    expect(catalogEntry({ family: 'Lato', style: 'Normal' })).toBeUndefined()
    expect(catalogEntry({ family: 'Lato', style: 'Book' })).toBeUndefined()
    // 느슨해도 다른 서체를 대신 주지는 않는다
    expect(catalogEntry({ family: 'Open Sans', style: 'Heavy' })).toBeUndefined()
  })

  it('Inter 는 Figma 가 내장한 3.19 를 원저작자 태그에서 받는다', () => {
    const regular = catalogEntry({ family: 'Inter', style: 'Regular' })
    expect(regular?.url).toBe(
      'https://cdn.jsdelivr.net/gh/rsms/inter@v3.19/docs/font-files/Inter-Regular.otf'
    )
    expect(regular?.source).toBe('inter')
    expect(catalogEntry({ family: 'Inter', style: 'Italic' })?.url).toContain('Inter-Italic.otf')
  })

  it('Inter 스타일은 Figma 표기("Semi Bold")와 파일 표기("SemiBold") 둘 다 같은 파일로', () => {
    const spaced = catalogEntry({ family: 'Inter', style: 'Semi Bold' })
    expect(spaced?.weight).toBe(600)
    expect(spaced?.url).toContain('Inter-SemiBold.otf')
    expect(catalogEntry({ family: 'Inter', style: 'SemiBold' })?.url).toBe(spaced?.url)
    const italic = catalogEntry({ family: 'Inter', style: 'Extra Light Italic' })
    expect(italic?.weight).toBe(200)
    expect(italic?.italic).toBe(true)
    expect(fileNameOf(italic?.url)).toBe('Inter-ExtraLightItalic.otf')
    expect(catalogEntry({ family: 'Inter', style: 'Bold Italic' })?.url).toContain(
      'Inter-BoldItalic.otf'
    )
  })
})

function fileNameOf(url: string | undefined): string {
  return url?.split('/').pop() ?? ''
}

describe('CATALOG', () => {
  it('주소가 전부 allowedDomains 안에 있다 — manifest 와 어긋나면 런타임에 막힌다', () => {
    for (const entry of CATALOG) {
      expect(CATALOG_HOSTS.some((host) => entry.url.startsWith(host))).toBe(true)
    }
  })

  it('https 로만 받는다', () => {
    expect(CATALOG.every((entry) => entry.url.startsWith('https://'))).toBe(true)
  })

  it('family+style 이 겹치지 않는다', () => {
    const keys = CATALOG.map((entry) => `${entry.family} ${entry.style}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('느슨한 키가 같은 항목은 같은 파일이다 — 표기만 다른 별칭끼리만 겹친다', () => {
    const byKey = new Map<string, Set<string>>()
    for (const entry of CATALOG) {
      const key = looseCatalogKey(entry.family, entry.style)
      const urls = byKey.get(key) ?? new Set<string>()
      urls.add(entry.url)
      byKey.set(key, urls)
    }
    for (const [key, urls] of byKey) expect(urls.size, key).toBe(1)
  })

  it('라이선스를 밝힌다', () => {
    expect(CATALOG.every((entry) => entry.license.includes('Open Font License'))).toBe(true)
  })
})

describe('outsideCatalog', () => {
  it('못 구하는 것만, 중복 없이 돌려준다', () => {
    const out = outsideCatalog([
      { family: 'Pretendard Variable', style: 'Regular' },
      { family: 'Nexa', style: 'Heavy' },
      { family: 'Nexa', style: 'Heavy' }
    ])
    expect(out).toEqual([{ family: 'Nexa', style: 'Heavy' }])
  })
})
