// 메인 화면 맨 위 — 프리셋 네 칸과, 눌렀을 때 실제로 바뀌는 값 세 개.
//
// 묻는 것은 "용도" 가 아니라 "얼마나 줄일지" 다. 선명하게 / 균형 / 최소 용량은 결과에
// 대한 선호라서 사용자에게 없는 결정을 강요하지 않는다. 목표 용량은 네 번째 칸이다 —
// 화질 대신 크기를 정하면 화질은 플러그인이 찾는다.
//
// 세그먼트가 아니라 타일이다 — 세그먼트는 "보기 전환" 으로 읽히지 "하나를 고른다" 로
// 읽히지 않았다. 타일에는 아이콘이 크게 들어가고 한 줄 설명이 붙는다.
//
// 타일 아래는 어떤 상태에서도 한 줄이다. 목표 용량의 입력칸도, 직접 상태의 되돌리기도
// 그 줄 안에 든다 — 타일을 바꿀 때마다 아래 체크리스트가 출렁이면 안 된다.

import { Muted, Text } from '@create-figma-plugin/ui'
import { Fragment, JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'

import { clampTargetMb, MAX_TARGET_MB, MIN_TARGET_MB } from '../lib/fitToSize'
import { t } from '../lib/i18n'
import { applyPreset, IMAGE_MODE_IDS, imageModeOf } from '../lib/presets'
import { edgeTag } from '../lib/settingsOptions'
import { Settings } from '../lib/types'
import {
  BalanceGlyph,
  CompressGlyph,
  EdgeGlyph,
  ImageGlyph,
  ResetGlyph,
  ScaleGlyph,
  SparkleGlyph,
  TargetGlyph
} from './glyphs'

type Props = {
  settings: Settings
  disabled: boolean
  onChange: (next: Settings) => void
}

/** 프리셋마다 픽토그램 하나. 왼쪽이 화질, 오른쪽으로 갈수록 용량 쪽이다. */
const MODE_GLYPHS = {
  sharp: SparkleGlyph,
  balanced: BalanceGlyph,
  small: CompressGlyph,
  fit: TargetGlyph
} as const

/** 타일 아래 한 줄 — 무엇에 맞춘 값인지 */
const MODE_TAG = {
  sharp: 'presets.tagSharp',
  balanced: 'presets.tagBalanced',
  small: 'presets.tagSmall',
  fit: 'presets.tagFit'
} as const

/** 타일의 툴팁 — 긴 설명은 마우스를 올렸을 때 */
const MODE_DETAIL = {
  sharp: 'presets.detailSharp',
  balanced: 'presets.detailBalanced',
  small: 'presets.detailSmall',
  fit: 'presets.detailFit'
} as const

export function PresetBar({ settings, disabled, onChange }: Props): JSX.Element {
  const mode = imageModeOf(settings)

  return (
    <div class="presetBar">
      {/* "직접" 은 고를 수 있는 타일이 아니라 상태다 — 어느 타일도 켜지지 않고 아래 줄의 되돌리기 칩이 말한다 */}
      <div class="presetGrid" role="radiogroup">
        {IMAGE_MODE_IDS.map((id) => {
          const Icon = MODE_GLYPHS[id]
          const selected = mode === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              class={`presetTile${selected ? ' presetTileOn' : ''}`}
              disabled={disabled}
              title={t(MODE_DETAIL[id])}
              onClick={() => {
                if (id === 'fit') {
                  onChange({ ...settings, fitToSize: true })
                  return
                }
                onChange(applyPreset(settings, id))
              }}
            >
              <Icon size={16} />
              <span class="presetTileName">{t(`presets.${id}` as const)}</span>
              <span class="presetTileTag">{t(MODE_TAG[id])}</span>
            </button>
          )
        })}
      </div>

      <div class="chips">
        {mode === 'fit' ? (
          <Fragment>
            <FitField settings={settings} disabled={disabled} onChange={onChange} />
            <span class="chip chipAuto" title={t('chip.autoTip')}>
              <ImageGlyph />
              {t('chip.auto')}
            </span>
          </Fragment>
        ) : (
          <ValueChips settings={settings} />
        )}
        {mode === 'custom' ? (
          <span
            class={`chip chipLink${disabled ? ' chipDisabled' : ''}`}
            title={t('presets.resetTip')}
            onClick={disabled ? undefined : () => onChange(applyPreset(settings, 'balanced'))}
          >
            <ResetGlyph />
            {t('presets.reset')}
          </span>
        ) : null}
      </div>
    </div>
  )
}

/**
 * 눌렀을 때 실제로 바뀌는 숫자 세 개. 문장 대신 아이콘 + 값이다 — 뜻은 툴팁과,
 * 고급 설정에서 같은 아이콘이 라벨 옆에 붙어 있는 것으로 이어진다.
 */
function ValueChips({ settings }: { settings: Settings }): JSX.Element {
  return (
    <Fragment>
      <span class="chip" title={t('chip.scaleTip', { multiplier: settings.multiplier })}>
        <ScaleGlyph />
        {settings.multiplier}×
      </span>
      <span
        class="chip"
        title={t('chip.edgeTip', { maxEdge: settings.maxEdge, fhd: edgeTag(settings.maxEdge) })}
      >
        <EdgeGlyph />
        {settings.maxEdge}px
      </span>
      <span class="chip" title={t('images.qualitySays', { quality: settings.quality })}>
        <ImageGlyph />
        {Math.round(settings.quality * 100)}%
      </span>
    </Fragment>
  )
}

/** 1MB 씩 오르내린다. 1 아래에서는 0.5 로 — 하한이 0.5 라 그 사이가 비면 안 된다 */
export function stepTarget(value: number, direction: -1 | 1): number {
  if (direction === 1) return clampTargetMb(Math.floor(value) + 1)
  return clampTargetMb(value <= 1 ? MIN_TARGET_MB : Math.ceil(value) - 1)
}

/**
 * 목표 용량 입력. 입력 중에는 아무것도 막지 않는다 — 라이브러리 숫자 입력은 하한 아래
 * 글자를 안 받아서 "0.8" 을 칠 수 없었다. 확정(blur·Enter)할 때만 범위로 자르고,
 * 비워 두면 원래 값으로 돌아간다 — 빈칸이 조용히 0.5 가 되면 안 된다.
 */
function FitField({ settings, disabled, onChange }: Props): JSX.Element {
  const [draft, setDraft] = useState(String(settings.fitTargetMb))

  // 설정이 밖에서 바뀌면(스테퍼·다른 문서·저장값) 입력칸도 따라간다
  useEffect(() => {
    setDraft(String(settings.fitTargetMb))
  }, [settings.fitTargetMb])

  const apply = (next: number): void => {
    setDraft(String(next))
    if (next !== settings.fitTargetMb) onChange({ ...settings, fitTargetMb: next })
  }

  const commit = (): void => {
    const typed = Number(draft.trim())
    if (draft.trim() === '' || !Number.isFinite(typed)) {
      setDraft(String(settings.fitTargetMb))
      return
    }
    apply(clampTargetMb(typed))
  }

  return (
    <span class="fitField" title={t('images.fitHelp')}>
      <Text>
        <Muted>{t('fit.label')}</Muted>
      </Text>
      <span class="stepper">
        <button
          type="button"
          class="stepBtn"
          disabled={disabled || settings.fitTargetMb <= MIN_TARGET_MB}
          onClick={() => apply(stepTarget(settings.fitTargetMb, -1))}
          aria-label="−1 MB"
        >
          −
        </button>
        <input
          class="stepInput"
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={draft}
          onInput={(event) => setDraft((event.currentTarget as HTMLInputElement).value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') (event.currentTarget as HTMLInputElement).blur()
          }}
        />
        <button
          type="button"
          class="stepBtn"
          disabled={disabled || settings.fitTargetMb >= MAX_TARGET_MB}
          onClick={() => apply(stepTarget(settings.fitTargetMb, 1))}
          aria-label="+1 MB"
        >
          +
        </button>
      </span>
      <Text>
        <Muted>{t('fit.under')}</Muted>
      </Text>
    </span>
  )
}
