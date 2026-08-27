import { describe, expect, it } from 'vitest'

import { applyPreset, imageModeOf, PRESET_IDS, PRESETS, presetOf } from '../src/lib/presets'
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

describe('imageModeOf', () => {
  it('목표 용량을 켜면 프리셋 숫자와 무관하게 fit 이다', () => {
    expect(imageModeOf({ ...DEFAULT_SETTINGS, fitToSize: true })).toBe('fit')
    expect(imageModeOf({ ...DEFAULT_SETTINGS, fitToSize: true, quality: 0.55 })).toBe('fit')
  })

  it('꺼져 있으면 평소대로 프리셋을 따른다', () => {
    expect(imageModeOf(DEFAULT_SETTINGS)).toBe('balanced')
    expect(imageModeOf({ ...DEFAULT_SETTINGS, quality: 0.55 })).toBe('custom')
  })

  it('프리셋을 고르면 목표 용량 모드에서 빠져나온다 — 둘이 동시에 켜지면 안 된다', () => {
    const fit = { ...DEFAULT_SETTINGS, fitToSize: true }
    expect(applyPreset(fit, 'sharp').fitToSize).toBe(false)
    expect(imageModeOf(applyPreset(fit, 'sharp'))).toBe('sharp')
  })
})
