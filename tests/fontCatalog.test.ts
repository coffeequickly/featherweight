import { describe, expect, it } from 'vitest'

import { CATALOG, CATALOG_HOSTS, catalogEntry, outsideCatalog } from '../src/lib/fontCatalog'

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
})

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
