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
import { Settings } from '../lib/types'
import {
  BalanceGlyph,
  CompressGlyph,
  ImageGlyph,
  ResetGlyph,
  SparkleGlyph,
  TargetGlyph
} from './glyphs'

type Props = {
  settings: Settings
  disabled: boolean
  onChange: (next: Settings) => void
  /** 값 줄 오른쪽 끝 — 숫자를 직접 만지러 가는 곳 */
  onOpenImages: () => void
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

/**
 * 같은 프리셋을 이미지 탭 맨 위에 작게. 타일이 아니라 한 줄짜리 칩이다 —
 * 여기서는 프리셋이 주인공이 아니라 아래 슬라이더들의 출발점이라서, 자리를 크게 먹으면 안 된다.
 *
 * "직접" 은 고를 수 있는 칸이 아니라 상태다. 그래서 다섯 번째 칩으로 붙되 누를 수 없다 —
 * 아무 칩도 안 켜져 있으면 왜 그런지 알 수 없고, 켜진 것이 늘 하나여야 읽힌다.
 */
export function PresetRow({
  settings,
  disabled,
  onChange
}: {
  settings: Settings
  disabled: boolean
  onChange: (next: Settings) => void
}): JSX.Element {
  const mode = imageModeOf(settings)

  return (
    <div class="presetRow" role="radiogroup">
      {IMAGE_MODE_IDS.map((id) => {
        const Icon = MODE_GLYPHS[id]
        const selected = mode === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            class={`presetChip${selected ? ' presetChipOn' : ''}`}
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
            <Icon size={12} />
            <span class="presetChipName">{t(`presets.${id}` as const)}</span>
          </button>
        )
      })}
      {mode === 'custom' ? (
        <span class="presetChip presetChipOn presetChipState" title={t('presets.customTip')}>
          <ResetGlyph size={12} />
          <span class="presetChipName">{t('presets.custom')}</span>
        </span>
      ) : null}
    </div>
  )
}

export function PresetBar({ settings, disabled, onChange, onOpenImages }: Props): JSX.Element {
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

      {/* 값은 테두리를 두르지 않는다 — 눌리지 않는 것이 버튼처럼 보이면 안 된다.
          진짜 눌리는 것(스테퍼·되돌리기·이미지 탭)만 테두리나 링크 색을 갖는다. */}
      <div class="valueRow">
        {mode === 'fit' ? (
          <Fragment>
            <FitField settings={settings} disabled={disabled} onChange={onChange} />
            <span class="valueItem" title={t('chip.autoTip')}>
              <ImageGlyph />
              {t('chip.auto')}
            </span>
          </Fragment>
        ) : (
          <Fragment>
            {/* "직접" 은 고를 수 있는 칸이 아니라 상태다 — 이름이 없으면
                왜 아무 타일도 안 켜졌는지 알 수 없다 */}
            {mode === 'custom' ? (
              <span class="stateName">
                <Text>{t('presets.custom')}</Text>
              </span>
            ) : null}
            <ValueItem label={t('images.multiplier')} value={`${settings.multiplier}×`} />
            <ValueItem
              label={t('images.quality')}
              value={`${Math.round(settings.quality * 100)}%`}
            />
            {mode === 'custom' ? (
              <button
                type="button"
                class="linkButton"
                disabled={disabled}
                title={t('presets.resetTip')}
                onClick={() => onChange(applyPreset(settings, 'balanced'))}
              >
                {t('presets.reset')}
              </button>
            ) : null}
          </Fragment>
        )}
        <span class="valuePush" />
        <button type="button" class="linkButton" onClick={onOpenImages}>
          {t('tab.images')}
        </button>
      </div>
    </div>
  )
}

/** 라벨 + 값. 테두리도 배경도 없다 — 이것은 값이지 버튼이 아니다. */
function ValueItem({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <span class="valueItem">
      <span class="valueKey">
        <Text>
          <Muted>{label}</Muted>
        </Text>
      </span>
      <Text>{value}</Text>
    </span>
  )
}

/** 1MB 씩 오르내린다. 1 아래에서는 0.5 로 — 하한이 0.5 라 그 사이가 비면 안 된다 */
export function stepTarget(value: number, direction: -1 | 1): number {
  if (direction === 1) return clampTargetMb(Math.floor(value) + 1)
  return clampTargetMb(value <= 1 ? MIN_TARGET_MB : Math.ceil(value) - 1)
}

type FitFieldProps = {
  settings: Settings
  disabled: boolean
  onChange: (next: Settings) => void
}

/**
 * 목표 용량 입력. 입력 중에는 아무것도 막지 않는다 — 라이브러리 숫자 입력은 하한 아래
 * 글자를 안 받아서 "0.8" 을 칠 수 없었다. 확정(blur·Enter)할 때만 범위로 자르고,
 * 비워 두면 원래 값으로 돌아간다 — 빈칸이 조용히 0.5 가 되면 안 된다.
 */
export function FitField({ settings, disabled, onChange }: FitFieldProps): JSX.Element {
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
