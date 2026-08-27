import { t } from '../lib/i18n'
import {
  Checkbox,
  Muted,
  RangeSlider,
  SegmentedControl,
  Text,
  TextboxNumeric,
  VerticalSpace
} from '@create-figma-plugin/ui'
import { Fragment, JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'

import { clampTargetMb, MAX_TARGET_MB, MIN_TARGET_MB } from '../lib/fitToSize'
import { applyPreset, IMAGE_MODE_IDS, imageModeOf, PresetId } from '../lib/presets'
import { Settings } from '../lib/types'
import { BalanceGlyph, CompressGlyph, SparkleGlyph, TargetGlyph } from './glyphs'

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

const MULTIPLIERS: Array<Settings['multiplier']> = [1, 1.5, 2]
const MAX_EDGES: Array<Settings['maxEdge']> = [1024, 1600, 2048, 4096]

/**
 * 이미지는 "화면에 보이는 크기 × 배율" 을 넘는 픽셀을 버린다.
 * 문서보다 큰 원본이 그대로 임베드되는 걸 막는 게 목적이다. (PRD FR-3)
 *
 * 목표 용량을 고르면 이 숫자들은 사라진다 — 화질을 정하는 대신 크기를 정하는 모드라
 * 둘을 같이 보여 주면 어느 쪽이 이기는지 알 수 없다. (docs/FIT-TO-SIZE.md)
 */
export function ImageSettings({ settings, disabled, onChange }: Props): JSX.Element {
  const mode = imageModeOf(settings)

  return (
    <Fragment>
      <div class="settingRow">
        <div class="settingLabel">
          <Text>
            <Muted>{t('images.preset')}</Muted>
          </Text>
        </div>
        <div class="settingControl">
          {/* "직접" 은 고를 수 있는 선택지가 아니라 상태다 —
              아래 숫자를 만졌을 때만 선택된 채로 나타난다 */}
          <SegmentedControl
            disabled={disabled}
            onValueChange={(value: string) => {
              if (value === 'custom') return
              if (value === 'fit') {
                onChange({ ...settings, fitToSize: true })
                return
              }
              onChange(applyPreset(settings, value as PresetId))
            }}
            options={[
              ...IMAGE_MODE_IDS.map((id) => {
                const Icon = MODE_GLYPHS[id]
                return {
                  value: id,
                  children: (
                    <span class="segItem">
                      <Icon />
                      {t(`presets.${id}` as const)}
                    </span>
                  )
                }
              }),
              ...(mode === 'custom'
                ? [
                    {
                      value: 'custom',
                      children: <span class="segItem">{t('presets.custom')}</span>
                    }
                  ]
                : [])
            ]}
            value={mode}
          />
        </div>
      </div>

      <VerticalSpace space="extraSmall" />
      <Text>
        <Muted>{mode === 'fit' ? t('images.fitHelp') : t('images.help')}</Muted>
      </Text>
      <VerticalSpace space="small" />

      {mode === 'fit' ? (
        <FitTarget disabled={disabled} settings={settings} onChange={onChange} />
      ) : (
        <ManualControls disabled={disabled} settings={settings} onChange={onChange} />
      )}
    </Fragment>
  )
}

/** 목표 용량 한 줄. 입력 중에는 화면 값을 그대로 두고, 확정될 때만 범위로 자른다. */
function FitTarget({ settings, disabled, onChange }: Props): JSX.Element {
  const [draft, setDraft] = useState(String(settings.fitTargetMb))

  // 설정이 밖에서 바뀌면(다른 문서를 열거나 저장값을 받으면) 입력칸도 따라간다
  useEffect(() => {
    setDraft(String(settings.fitTargetMb))
  }, [settings.fitTargetMb])

  const commit = (): void => {
    const next = clampTargetMb(Number(draft))
    setDraft(String(next))
    if (next !== settings.fitTargetMb) onChange({ ...settings, fitTargetMb: next })
  }

  return (
    <Fragment>
      <div class="settingRow">
        <div class="settingLabel">
          <Text>
            <Muted>{t('images.fitTarget')}</Muted>
          </Text>
        </div>
        <div class="settingControl targetInput">
          <TextboxNumeric
            disabled={disabled}
            maximum={MAX_TARGET_MB}
            minimum={MIN_TARGET_MB}
            onBlur={commit}
            onValueInput={setDraft}
            value={draft}
          />
        </div>
        <div class="settingValue">
          <Text>
            <Muted>MB</Muted>
          </Text>
        </div>
      </div>

      <VerticalSpace space="extraSmall" />
      <Text>
        <Muted>{t('images.fitSlower')}</Muted>
      </Text>
      <VerticalSpace space="extraSmall" />
    </Fragment>
  )
}

/** 화질을 직접 정하는 쪽 — 배율·상한·품질·재인코딩 */
function ManualControls({ settings, disabled, onChange }: Props): JSX.Element {
  return (
    <Fragment>
      <div class="settingRow">
        <div class="settingLabel">
          <Text>
            <Muted>{t('images.multiplier')}</Muted>
          </Text>
        </div>
        <div class="settingControl">
          <SegmentedControl
            disabled={disabled}
            onValueChange={(value: string) =>
              onChange({ ...settings, multiplier: Number(value) as Settings['multiplier'] })
            }
            options={MULTIPLIERS.map((value) => ({
              value: String(value),
              children: `${value}x`
            }))}
            value={String(settings.multiplier)}
          />
        </div>
      </div>

      <div class="settingRow">
        <div class="settingLabel">
          <Text>
            <Muted>{t('images.maxEdge')}</Muted>
          </Text>
        </div>
        <div class="settingControl">
          <SegmentedControl
            disabled={disabled}
            onValueChange={(value: string) =>
              onChange({ ...settings, maxEdge: Number(value) as Settings['maxEdge'] })
            }
            options={MAX_EDGES.map((value) => ({
              value: String(value),
              children: String(value)
            }))}
            value={String(settings.maxEdge)}
          />
        </div>
      </div>

      <div class="settingRow">
        <div class="settingLabel">
          <Text>
            <Muted>{t('images.quality')}</Muted>
          </Text>
        </div>
        <div class="settingControl">
          <RangeSlider
            disabled={disabled}
            increment={0.05}
            maximum={1}
            minimum={0.5}
            onNumericValueInput={(value: number) => onChange({ ...settings, quality: value })}
            value={String(settings.quality)}
          />
        </div>
        <div class="settingValue">
          <Text>
            <Muted>{settings.quality.toFixed(2)}</Muted>
          </Text>
        </div>
      </div>

      <VerticalSpace space="extraSmall" />
      <Checkbox
        disabled={disabled}
        onValueChange={(value: boolean) => onChange({ ...settings, reencodeOpaquePng: value })}
        value={settings.reencodeOpaquePng}
      >
        <Text>{t('images.reencode')}</Text>
      </Checkbox>
      <VerticalSpace space="extraSmall" />
    </Fragment>
  )
}
