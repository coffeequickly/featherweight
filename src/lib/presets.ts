// 이미지 설정 프리셋. Figma·DOM 의존 금지.
//
// 품질 0.80·배율 1.5x·상한 2048 은 만드는 사람의 언어다. 쓰는 사람에게는
// "선명하게 / 균형 / 최소 용량" 세 단어면 충분하고, 숫자는 고급 설정으로 접는다.

import { Settings } from './types'

export type PresetId = 'sharp' | 'balanced' | 'small'

type PresetValues = Pick<Settings, 'quality' | 'multiplier' | 'maxEdge'>

export const PRESETS: Record<PresetId, PresetValues> = {
  /** 인쇄·확대를 생각하면 픽셀을 더 남긴다 */
  sharp: { quality: 0.9, multiplier: 2, maxEdge: 4096 },
  /** 기본값 — 화면 확인용 PDF 에 충분 */
  balanced: { quality: 0.8, multiplier: 1.5, maxEdge: 2048 },
  /** 업로드 한도가 빡빡할 때 */
  small: { quality: 0.7, multiplier: 1, maxEdge: 1600 }
}

export const PRESET_IDS: PresetId[] = ['sharp', 'balanced', 'small']

/** 지금 설정이 어느 프리셋인가. 하나라도 다르면 'custom'. */
export function presetOf(settings: Settings): PresetId | 'custom' {
  for (const id of PRESET_IDS) {
    const preset = PRESETS[id]
    if (
      settings.quality === preset.quality &&
      settings.multiplier === preset.multiplier &&
      settings.maxEdge === preset.maxEdge
    ) {
      return id
    }
  }
  return 'custom'
}

/** 프리셋 값을 얹는다. 프리셋에 없는 항목(reencodeOpaquePng 등)은 그대로 둔다. */
export function applyPreset(settings: Settings, id: PresetId): Settings {
  return { ...settings, ...PRESETS[id], fitToSize: false }
}

/**
 * 화면에 보여줄 이미지 모드. 목표 용량은 프리셋과 나란히 고르는 네 번째 선택지다 —
 * 화질을 직접 정하는 대신 크기를 정하면 화질은 플러그인이 고른다.
 */
export type ImageModeId = PresetId | 'fit' | 'custom'

export const IMAGE_MODE_IDS: Array<PresetId | 'fit'> = [...PRESET_IDS, 'fit']

export function imageModeOf(settings: Settings): ImageModeId {
  return settings.fitToSize ? 'fit' : presetOf(settings)
}
