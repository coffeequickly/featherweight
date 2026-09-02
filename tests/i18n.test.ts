import { afterEach, describe, expect, it } from 'vitest'

import {
  currentLocale,
  detectLocale,
  formatNumber,
  MESSAGE_KEYS,
  setLocale,
  t
} from '../src/lib/i18n'

afterEach(() => setLocale('en'))

describe('detectLocale', () => {
  it('한국어 태그만 ko, 나머지는 en', () => {
    expect(detectLocale('ko')).toBe('ko')
    expect(detectLocale('ko-KR')).toBe('ko')
    expect(detectLocale('KO-kr')).toBe('ko')
    expect(detectLocale('en-US')).toBe('en')
    expect(detectLocale('ja')).toBe('en')
    expect(detectLocale('')).toBe('en')
  })
})

describe('t', () => {
  it('언어를 바꾸면 같은 키가 다른 문장을 준다', () => {
    expect(currentLocale()).toBe('en')
    expect(t('app.export', { count: 3 })).toBe('Export PDF (3 pages)')
    setLocale('ko')
    expect(t('app.export', { count: 3 })).toBe('PDF 내보내기 (3쪽)')
  })

  it('{name} 자리를 채운다', () => {
    setLocale('ko')
    expect(t('app.excluded', { count: 3 })).toBe('제외됨 3개')
    expect(t('report.skipped', { name: 'Cover', reason: 'x' })).toBe('건너뜀 — Cover: x')
  })

  it('영어 단복수를 처리한다', () => {
    expect(t('report.textDrawn', { count: 1 })).toBe('1 text node in real fonts')
    expect(t('report.textDrawn', { count: 4 })).toBe('4 text nodes in real fonts')
  })

  it('없는 파라미터는 자리 표시를 그대로 둔다 — 조용히 빈칸이 되지 않는다', () => {
    setLocale('ko')
    expect(t('app.excluded')).toBe('제외됨 {count}개')
  })

  it('font.loadFailed 의 사유 접미사 — 있으면 괄호, 없으면 생략', () => {
    expect(t('font.loadFailed', { family: 'A', style: 'Bold', why: '' })).toBe(
      'could not load A Bold'
    )
    expect(t('font.loadFailed', { family: 'A', style: 'Bold', why: 'HTTP 404' })).toBe(
      'could not load A Bold (HTTP 404)'
    )
  })
})

describe('progress.pageImages', () => {
  it('여러 장이면 몇 번째인지 보여준다', () => {
    setLocale('ko')
    expect(t('progress.pageImages', { page: 3, pages: 11, current: 2, total: 5 })).toBe(
      '3/11쪽 · 이미지 최적화 2/5'
    )
  })

  it('한 장뿐이면 "1/1" 을 붙이지 않는다', () => {
    setLocale('ko')
    expect(t('progress.pageImages', { page: 3, pages: 11, current: 1, total: 1 })).toBe(
      '3/11쪽 · 이미지 최적화'
    )
    setLocale('en')
    expect(t('progress.pageImages', { page: 3, pages: 11, current: 1, total: 1 })).toBe(
      'Page 3/11 · optimizing image'
    )
  })
})

describe('formatNumber', () => {
  it('OS 로캘이 아니라 현재 사전 언어를 따른다', () => {
    setLocale('en')
    expect(formatNumber(18901)).toBe('18,901')
    setLocale('ko')
    expect(formatNumber(18901)).toBe('18,901')
  })
})

describe('사전 무결성', () => {
  const PARAMS = {
    count: 2,
    missing: 1,
    total: 3,
    done: 1,
    kinds: 2,
    pages: 2,
    page: 1,
    seconds: '1.0',
    size: '1MB',
    before: '2MB',
    after: '1MB',
    width: 100,
    height: 50,
    images: 1,
    texts: 2,
    multiplier: 1.5,
    maxEdge: 2048,
    quality: '0.80',
    file: 'a.ttf',
    chars: '10',
    name: 'Cover',
    reason: 'x',
    family: 'F',
    style: 'S',
    styles: 'S1, S2',
    error: 'e',
    label: 'L',
    reqId: 'r1',
    hash: 'h',
    detail: 'detail',
    target: '5.0MB',
    lines: 42,
    fileStyle: '400',
    first: 'Nexa Heavy',
    minEdge: 640,
    frame: 1920,
    rest: 2,
    percent: 53,
    times: 2.1,
    slotStyle: 'Bold',
    floor: '7.2MB',
    sample: '가',
    type: 'SLICE',
    why: 'w',
    message: 'm',
    names: 'Nexa Heavy',
    current: 2,
    shrink: 1,
    fhd: 'same as FHD',
    found: 1,
    more: 1,
    auto: 2,
    version: '2.0.0',
    wanted: 2880,
    effective: 1920,
    unit: 'frame',
    units: 'frames',
    Unit: 'Frame'
  }

  it('모든 키가 양 언어에서 비지 않은 문장을 준다', () => {
    for (const locale of ['en', 'ko'] as const) {
      setLocale(locale)
      for (const key of MESSAGE_KEYS) {
        const message = t(key, PARAMS)
        expect(message.length, `${locale}:${key}`).toBeGreaterThan(0)
        expect(message, `${locale}:${key} 에 안 채워진 자리가 있다`).not.toMatch(/\{\w+\}/)
      }
    }
  })

  it('윈도우 안내에 mac 전용 단축키가 섞이지 않는다', () => {
    for (const locale of ['en', 'ko'] as const) {
      setLocale(locale)
      expect(t('fonts.pathHelpWin')).not.toContain('⌘')
      expect(t('fonts.pathCopiedWin')).not.toContain('⌘')
      expect(t('fonts.pathHelpMac')).toContain('⌘')
    }
  })

  it('영어 문장에 한글이 남아 있지 않다', () => {
    setLocale('en')
    for (const key of MESSAGE_KEYS) {
      // sample 파라미터는 글자 자체가 값이므로 제외하고 검사한다
      const message = t(key, { ...PARAMS, sample: 'x' })
      expect(message, `en:${key}`).not.toMatch(/[가-힣]/)
    }
  })
})
