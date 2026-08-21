import { t } from '../lib/i18n'
import {
  Checkbox,
  Muted,
  RangeSlider,
  SegmentedControl,
  Text,
  VerticalSpace
} from '@create-figma-plugin/ui'
import { Fragment, JSX } from 'preact'

import { applyPreset, PRESET_IDS, presetOf, PresetId } from '../lib/presets'
import { Settings } from '../lib/types'

type Props = {
  settings: Settings
  disabled: boolean
  onChange: (next: Settings) => void
}

const MULTIPLIERS: Array<Settings['multiplier']> = [1, 1.5, 2]
const MAX_EDGES: Array<Settings['maxEdge']> = [1024, 1600, 2048, 4096]

/**
 * 이미지는 "화면에 보이는 크기 × 배율" 을 넘는 픽셀을 버린다.
 * 문서보다 큰 원본이 그대로 임베드되는 걸 막는 게 목적이다. (PRD FR-3)
 */
export function ImageSettings({ settings, disabled, onChange }: Props): JSX.Element {
  const preset = presetOf(settings)

  // 보통은 프리셋 세 개면 충분하다 — 숫자를 만지면 자동으로 "직접" 이 된다.
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
              onChange(applyPreset(settings, value as PresetId))
            }}
            options={[
              ...PRESET_IDS.map((id) => ({
                value: id,
                children: t(`presets.${id}` as const)
              })),
              ...(preset === 'custom' ? [{ value: 'custom', children: t('presets.custom') }] : [])
            ]}
            value={preset}
          />
        </div>
      </div>

      <VerticalSpace space="extraSmall" />
      <Text>
        <Muted>{t('images.help')}</Muted>
      </Text>
      <VerticalSpace space="small" />

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
