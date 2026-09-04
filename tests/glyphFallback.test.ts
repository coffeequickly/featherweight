import { describe, expect, it } from 'vitest'

import { fallbackFontsFor, splitByCoverage } from '../src/lib/glyphFallback'

describe('glyphFallback', () => {
  it('빠진 글자만 대체 폰트 덩어리로, 순서는 그대로', () => {
    const missing = new Set([0x2014, 0x2013])
    expect(splitByCoverage('2023 — 2024 (–)', missing)).toEqual([
      { text: '2023 ', fallback: false },
      { text: '—', fallback: true },
      { text: ' 2024 (', fallback: false },
      { text: '–', fallback: true },
      { text: ')', fallback: false }
    ])
  })

  it('빠진 글자가 없으면 덩어리 하나', () => {
    expect(splitByCoverage('그대로', new Set())).toEqual([{ text: '그대로', fallback: false }])
  })

  it('대체 순서는 Inter → Pretendard → Pretendard JP, 굵기는 있으면 같은 것 아니면 Regular', () => {
    expect(fallbackFontsFor('Bold').map((ref) => ref.family)).toEqual([
      'Inter',
      'Pretendard Variable',
      'Pretendard JP'
    ])
    expect(fallbackFontsFor('Bold')[0]).toEqual({ family: 'Inter', style: 'Bold' })
    expect(fallbackFontsFor('Heavy')[0]).toEqual({ family: 'Inter', style: 'Regular' })
  })
})
