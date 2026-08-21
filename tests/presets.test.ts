import { describe, expect, it } from 'vitest'

import { applyPreset, PRESET_IDS, PRESETS, presetOf } from '../src/lib/presets'
import { DEFAULT_SETTINGS } from '../src/lib/types'

describe('presetOf', () => {
  it('기본 설정은 균형 프리셋이다 — 어긋나면 기본값이 바뀐 것', () => {
    expect(presetOf(DEFAULT_SETTINGS)).toBe('balanced')
  })

  it('프리셋을 얹으면 그 프리셋으로 판정된다', () => {
    for (const id of PRESET_IDS) {
      expect(presetOf(applyPreset(DEFAULT_SETTINGS, id))).toBe(id)
    }
  })

  it('하나라도 다르면 custom', () => {
    expect(presetOf({ ...DEFAULT_SETTINGS, quality: 0.55 })).toBe('custom')
    expect(presetOf({ ...DEFAULT_SETTINGS, maxEdge: 4096 })).toBe('custom')
  })
})

describe('applyPreset', () => {
  it('프리셋에 없는 항목은 건드리지 않는다', () => {
    const custom = { ...DEFAULT_SETTINGS, reencodeOpaquePng: false, embedText: false }
    const applied = applyPreset(custom, 'sharp')

    expect(applied.quality).toBe(PRESETS.sharp.quality)
    expect(applied.reencodeOpaquePng).toBe(false)
    expect(applied.embedText).toBe(false)
  })
})
