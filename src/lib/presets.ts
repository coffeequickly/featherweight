// 이미지 설정 프리셋. Figma·DOM 의존 금지.
//
// 품질 0.80·배율 1.5x·상한 FHD 는 만드는 사람의 언어다. 쓰는 사람에게는
// "선명하게 / 균형 / 최소 용량" 세 단어면 충분하고, 숫자는 고급 설정으로 접는다.

import { Settings } from './types'

export type PresetId = 'sharp' | 'balanced' | 'small'

type PresetValues = Pick<Settings, 'quality' | 'multiplier' | 'maxEdge' | 'minEdge'>

export const PRESETS: Record<PresetId, PresetValues> = {
  /**
   * 인쇄·확대를 생각하면 픽셀을 더 남긴다 — 그 일은 배율(2×)과 상한(3840)이 한다.
   *
   * 하한은 640 이다. 한때 여기만 1024 로 뒀다가 되돌렸다. 이유 셋:
   * 1024 가 실제로 손대는 것은 512pt 아래로 놓인 그림뿐인데 그것들은 대개 원본도 작아
   * 어차피 통과하고, 2× 는 인쇄 기준 144 DPI 라 하한을 올려 봐야 인쇄 등급이 안 된다
   * (그건 배율 3×·4× 가 할 일이다). 결정적으로 3.0 사용자의 저장값이 640 이라,
   * 프리셋만 1024 로 두면 업그레이드하는 순간 선명하게 타일이 꺼져 버린다.
   */
  sharp: { quality: 0.9, multiplier: 2, maxEdge: 3840, minEdge: 640 },
  /**
   * 기본값 — 화면 확인용 PDF 에 충분.
   *
   * 하한 640 은 세 프리셋이 함께 쓴다. 3.0 이 `MIN_TARGET_LONG_EDGE` 로 코드에 박아
   * 두던 바로 그 값이고, 달라진 것은 이제 화면에 보이고 만질 수 있다는 것뿐이다.
   * 1024 로 올려 봤다가 되돌렸다: 512pt 아래로 놓인 그림은 배율을 1× 로
   * 내리든 2× 로 올리든 전부 1024px 이 되어, 화면의 배율 바가 그 구간에서 통째로 죽었다.
   * 실측으로도 1× 에서 파일이 9.6% 커졌다. 1024 를 올린 근거였던 "640 에서 뭉갠다" 는
   * 밀도 부족(neededLongEdge)이 따로 고쳤으므로 여기서 두 번 셀 이유가 없다.
   * 확대 여유가 필요하면 최소 바를 직접 올리면 된다 — 이제 화면에 보인다.
   */
  balanced: { quality: 0.8, multiplier: 1.5, maxEdge: 1920, minEdge: 640 },
  /** 업로드 한도가 빡빡할 때 */
  small: { quality: 0.7, multiplier: 1, maxEdge: 1280, minEdge: 640 }
}

export const PRESET_IDS: PresetId[] = ['sharp', 'balanced', 'small']

/** 지금 설정이 어느 프리셋인가. 하나라도 다르면 'custom'. */
export function presetOf(settings: Settings): PresetId | 'custom' {
  for (const id of PRESET_IDS) {
    const preset = PRESETS[id]
    if (
      settings.quality === preset.quality &&
      settings.multiplier === preset.multiplier &&
      settings.maxEdge === preset.maxEdge &&
      // 하한도 본다. 예전에는 화면에 없는 값이라 뺐지만, 이제 최소 바로 직접 만지므로
      // 그걸 바꾸고도 "균형" 이라고 표시되면 거짓말이 된다
      settings.minEdge === preset.minEdge
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
