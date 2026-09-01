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
import { edgeScale, FHD_LONG_EDGE } from '../lib/imageTarget'
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
const MAX_EDGES: Array<Settings['maxEdge']> = [1024, 1600, 1920, 2048, 4096]
/** 이 크기 이하는 어떤 문서에서도 손대지 않는다. 로고·아이콘을 지키는 절대 하한. */
const MIN_EDGES: Array<Settings['minEdge']> = [640, 1024, 1600]

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
      <div class="section">
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

        <div class="sectionSays">
          <Text>
            <Muted>
              {mode === 'fit'
                ? t('images.fitHelp')
                : t('images.presetSays', {
                    name: t(`presets.${mode}` as const),
                    detail: t(PRESET_DETAIL[mode])
                  })}
            </Muted>
          </Text>
        </div>
      </div>

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

/**
 * 고른 상한이 FHD 대비 어디쯤인지 보여준다.
 *
 * "2048" 만으로는 큰지 작은지 모른다. 다들 아는 크기(FHD 가로폭 1920)를 눈금에
 * 세워 두면 한 번에 읽힌다 — 막대가 표시를 넘으면 FHD 보다 큰 것이다.
 */
function EdgeScale({ maxEdge }: { maxEdge: Settings['maxEdge'] }): JSX.Element {
  const widest = MAX_EDGES[MAX_EDGES.length - 1]
  const scale = edgeScale(maxEdge, widest)
  const label =
    Math.abs(scale.ratio - 1) < 0.01
      ? t('images.edgeSame')
      : scale.ratio < 1
        ? t('images.edgeUnder', { percent: Math.round(scale.ratio * 100) })
        : t('images.edgeOver', { times: Number(scale.ratio.toFixed(1)) })

  // 둘 중 큰 쪽이 그림을 꽉 채우고, 작은 쪽은 그 비율만큼 줄어든다
  const mine = scale.ratio >= 1 ? 1 : scale.ratio
  const fhd = scale.ratio >= 1 ? 1 / scale.ratio : 1

  return (
    <div class="edgeScaleRow">
      <div class="edgeBox" title={`FHD ${FHD_LONG_EDGE}px · ${maxEdge}px`}>
        <div class="edgeBoxMine" style={{ width: `${mine * 100}%`, height: `${mine * 100}%` }} />
        <div class="edgeBoxFhd" style={{ width: `${fhd * 100}%`, height: `${fhd * 100}%` }} />
      </div>
      <Text>
        <Muted>{label}</Muted>
      </Text>
    </div>
  )
}

/** 프리셋 이름 옆에 붙일 한 줄 설명 */
const PRESET_DETAIL = {
  sharp: 'presets.detailSharp',
  balanced: 'presets.detailBalanced',
  small: 'presets.detailSmall',
  fit: 'presets.detailFit',
  custom: 'presets.detailCustom'
} as const

function Section({ title, children }: { title: string; children: JSX.Element[] }): JSX.Element {
  return (
    <div class="section">
      <div class="sectionTitle">
        <Text>{title}</Text>
      </div>
      {children}
    </div>
  )
}

/** 그 섹션의 지금 값이 무슨 뜻인지 한 줄로 */
function Says({ text }: { text: string }): JSX.Element {
  return (
    <div class="sectionSays">
      <Text>
        <Muted>{text}</Muted>
      </Text>
    </div>
  )
}

/** 화질을 직접 정하는 쪽 — 크기·예외·화질 세 덩어리로 나눈다 */
function ManualControls({ settings, disabled, onChange }: Props): JSX.Element {
  return (
    <Fragment>
      <Section title={t('images.sectionSize')}>
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
          <div class="settingLabel" />
          <div class="settingControl">
            <EdgeScale maxEdge={settings.maxEdge} />
          </div>
        </div>

        <Says
          text={t('images.sizeSays', {
            multiplier: settings.multiplier,
            maxEdge: settings.maxEdge
          })}
        />
      </Section>

      <Section title={t('images.sectionKeep')}>
        <div class="settingRow">
          <div class="settingLabel">
            <Text>
              <Muted>{t('images.minEdge')}</Muted>
            </Text>
          </div>
          <div class="settingControl">
            <SegmentedControl
              disabled={disabled}
              onValueChange={(value: string) =>
                onChange({ ...settings, minEdge: Number(value) as Settings['minEdge'] })
              }
              options={MIN_EDGES.map((value) => ({
                value: String(value),
                children: String(value)
              }))}
              value={String(settings.minEdge)}
            />
          </div>
        </div>
        <Says text={t('images.keepSays', { minEdge: settings.minEdge })} />
      </Section>

      <Section title={t('images.sectionQuality')}>
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

        <Says text={t('images.qualitySays', { quality: settings.quality })} />
      </Section>
    </Fragment>
  )
}
