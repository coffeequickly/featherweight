import { describe, expect, it } from 'vitest'

import { pdfFileName, sanitizeFileName, suggestFileName } from '../src/lib/fileName'
import { isTimeoutError, withTimeout } from '../src/lib/withTimeout'

describe('sanitizeFileName', () => {
  it('한글·공백은 그대로 둔다', () => {
    expect(sanitizeFileName('김철수 이력서 2026')).toBe('김철수 이력서 2026')
  })

  it('경로·예약 문자를 걷어낸다', () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j')
  })

  it('제어문자를 지운다', () => {
    expect(sanitizeFileName('\u0000이력\u001f서')).toBe('이력서')
  })

  it('앞뒤 점과 공백을 다듬는다', () => {
    expect(sanitizeFileName('\u0000이력\u001f서')).toBe('이력서')
  })

  it('전부 걸러지면 기본값', () => {
    expect(sanitizeFileName('///')).toBe('Featherweight')
    expect(sanitizeFileName('   ')).toBe('Featherweight')
  })

  it('너무 길면 자른다', () => {
    expect(sanitizeFileName('가'.repeat(300)).length).toBe(120)
  })
})

describe('pdfFileName', () => {
  it('확장자를 붙인다', () => {
    expect(pdfFileName('포트폴리오')).toBe('포트폴리오.pdf')
    expect(pdfFileName('a/b')).toBe('a b.pdf')
  })
})

describe('withTimeout', () => {
  it('제 시간에 끝나면 값을 그대로 준다', async () => {
    await expect(withTimeout(Promise.resolve(42), 100, 'x')).resolves.toBe(42)
  })

  it('늦으면 timeout 에러', async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 200))
    await expect(withTimeout(slow, 20, '표지')).rejects.toThrow('표지')
  })

  it('timeout 에러는 구분할 수 있다', async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 200))
    const error = await withTimeout(slow, 20, 'x').catch((e: unknown) => e)
    expect(isTimeoutError(error)).toBe(true)
    expect(isTimeoutError(new Error('그냥 에러'))).toBe(false)
  })

  it('원래 에러는 그대로 통과시킨다', async () => {
    await expect(withTimeout(Promise.reject(new Error('원본')), 100, 'x')).rejects.toThrow('원본')
  })
})

describe('suggestFileName', () => {
  const NOW = new Date('2026-08-21T13:39:11')

  it('프레임 1개면 그 프레임 이름 + 타임스탬프', () => {
    expect(suggestFileName(['이력서_국문'], 'Playground', NOW)).toBe('이력서_국문_20260821133911')
  })

  it('여러 개면 문서 이름 + 타임스탬프 — 반복 내보내기가 덮어쓰지 않는다', () => {
    expect(suggestFileName(['01 Cover', '02 About'], 'Portfolio', NOW)).toBe(
      'Portfolio_20260821133911'
    )
  })

  it('선택이 없어도 문서 이름 + 타임스탬프', () => {
    expect(suggestFileName([], 'Portfolio', NOW)).toBe('Portfolio_20260821133911')
  })

  it('프레임 이름도 파일명 규칙으로 정리된다', () => {
    expect(suggestFileName(['A/B: draft?'], 'doc', NOW)).toBe('A B draft_20260821133911')
  })

  it('한 자리 월·일·시·분·초는 0 을 채운다', () => {
    expect(suggestFileName(['x'], 'doc', new Date('2026-01-05T09:07:03'))).toBe('x_20260105090703')
  })
})
