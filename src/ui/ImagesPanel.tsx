// 이미지 탭 — 얼마나 남길지, 어느 화질로, 그래서 어떤 그림이 어떻게 되는지.
//
// 컨트롤은 셋뿐이다. 상한(maxEdge)과 하한(minEdge)은 화면에서 뺐다 —
// 상한은 고른 배율을 조용히 덮어썼고, 하한은 코드의 안전장치(MIN_TARGET_LONG_EDGE ·
// KEEP_BYTES_FLOOR)가 이미 하던 일이다. 값 자체는 프리셋과 저장값이 그대로 들고 있다.
//
// 그 대신 아래 목록이 결과를 말한다. 배율을 올리면 오른쪽 숫자가 전부 따라 움직이고,
// 손대지 않는 것은 "그대로" 로 남는다 — 하한 옵션이 필요했던 걱정이 여기서 풀린다.
// 상한이 배율을 이기면 그 사실도 목록 위에 적는다. 조용히 깎지 않는다.

import { Checkbox, Muted, RangeSlider, Text, VerticalSpace } from '@create-figma-plugin/ui'
import { Fragment, JSX } from 'preact'

import { OVERFLOW_NOTICE } from '../lib/clipRect'
import { t } from '../lib/i18n'
import { imageRoster } from '../lib/preflight'
import { presetOf, PRESETS } from '../lib/presets'
import { MULTIPLIERS } from '../lib/settingsOptions'
import { Preflight, Settings } from '../lib/types'
import { ChoiceRow } from './ChoiceRow'
import { BalanceGlyph, CompressGlyph, ResetGlyph, SparkleGlyph } from './glyphs'
import { Says } from './panelParts'
import { Section } from './Section'

/** 시작 탭의 타일과 같은 그림 — 어느 프리셋인지 글자보다 먼저 읽힌다 */
const PRESET_GLYPHS = {
  sharp: SparkleGlyph,
  balanced: BalanceGlyph,
  small: CompressGlyph
} as const

/** 목록에 늘어놓을 줄 수. 나머지는 "외 N장" 으로 접는다 */
const ROWS_SHOWN = 6

type Props = {
  settings: Settings
  preflight: Preflight | null
  disabled: boolean
  onChange: (next: Settings) => void
}

export function ImagesPanel({ settings, preflight, disabled, onChange }: Props): JSX.Element {
  const fit = settings.fitToSize
  const rows = preflight === null ? [] : imageRoster(preflight, settings)
  // 프레임 밖으로 넘쳐 잘리는 것들 — 안 보이는 픽셀을 싣고 있다는 사실은 목록 아래서 한 번 더 말한다
  const clipped = rows.filter((row) => !row.kept && row.visible < OVERFLOW_NOTICE)
  const shrink = rows.filter((row) => !row.kept).length
  const capped = rows.filter((row) => row.capped).length

  return (
    <Fragment>
      <div class="panelState">
        {fit ? (
          <Text>
            <Muted>{t('images.fitLocked')}</Muted>
          </Text>
        ) : (
          <PresetLine settings={settings} disabled={disabled} onChange={onChange} />
        )}
      </div>

      <Section title={t('images.sectionResolution')}>
        <ChoiceRow
          label={t('images.sectionResolution')}
          disabled={disabled || fit}
          options={MULTIPLIERS.map((value) => ({ value, label: `${value}×` }))}
          value={settings.multiplier}
          onChange={(multiplier) => onChange({ ...settings, multiplier })}
        />
        <Says text={t('images.zoomSays', { multiplier: settings.multiplier })} />
        {rows.length === 0 ? null : (
          <Says text={t('images.largestSays', { target: rows[0].target })} />
        )}
        {capped === 0 ? null : (
          <div class="saysWarn">
            <Text>{t('images.cappedSays', { count: capped, maxEdge: settings.maxEdge })}</Text>
          </div>
        )}
      </Section>

      <Section title={t('images.sectionQuality')}>
        <div class="sliderRow">
          <div class="sliderTrack">
            <RangeSlider
              disabled={disabled || fit}
              increment={0.05}
              maximum={1}
              minimum={0.5}
              onNumericValueInput={(value: number) => onChange({ ...settings, quality: value })}
              value={String(settings.quality)}
            />
          </div>
          <div class="sliderValue">
            <Text>{Math.round(settings.quality * 100)}%</Text>
          </div>
        </div>
        <Says text={t('images.qualitySays', { quality: settings.quality })} />
        <VerticalSpace space="small" />
        <Checkbox
          disabled={disabled || fit}
          onValueChange={(value: boolean) => onChange({ ...settings, reencodeOpaquePng: value })}
          value={settings.reencodeOpaquePng}
        >
          <Text>{t('images.reencode')}</Text>
        </Checkbox>
        <Says text={t('images.reencodeSays')} />
      </Section>

      <Section
        title={t('images.sectionList')}
        aside={
          rows.length === 0 ? undefined : (
            <Muted>{t('images.listCount', { total: rows.length, shrink })}</Muted>
          )
        }
      >
        {rows.length === 0 ? (
          <Text>
            <Muted>{t('images.listNone')}</Muted>
          </Text>
        ) : (
          <Fragment>
            <div class="imageList">
              {rows.slice(0, ROWS_SHOWN).map((row) => (
                <div key={row.imageHash} class="imageRow">
                  <div class="imageName ellipsis">
                    <Text>{row.name}</Text>
                  </div>
                  <div class="imageFrom">
                    <Text>
                      <Muted>
                        {row.original === null ? t('images.listUnsized') : `${row.original}px`}
                      </Muted>
                    </Text>
                  </div>
                  <div class={`imageTo${row.kept ? ' imageKept' : ''}`}>
                    <Text>
                      {row.kept ? <Muted>{t('images.listKept')}</Muted> : `→ ${row.target}px`}
                    </Text>
                  </div>
                  {/* 프레임 밖으로 넘쳐 잘리는 그림 — 안 보이는 픽셀도 파일에 실린다 */}
                  {row.visible < OVERFLOW_NOTICE ? (
                    <span class="imageClipped">
                      {t('images.listClipped', { percent: Math.round(row.visible * 100) })}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
            {rows.length <= ROWS_SHOWN ? null : (
              <Says text={t('images.listMore', { count: rows.length - ROWS_SHOWN })} />
            )}
            {clipped.length === 0 ? null : (
              <Says
                text={t('images.clippedSays', {
                  count: clipped.length,
                  percent: Math.round(Math.min(...clipped.map((row) => row.visible)) * 100)
                })}
              />
            )}
          </Fragment>
        )}
      </Section>
    </Fragment>
  )
}

/**
 * 지금 값이 프리셋 그대로인지, 직접 만진 것인지. 직접 설정에 이름을 주지 않으면
 * 시작 탭의 타일이 왜 아무것도 안 켜졌는지 알 수 없다.
 */
function PresetLine({
  settings,
  disabled,
  onChange
}: {
  settings: Settings
  disabled: boolean
  onChange: (next: Settings) => void
}): JSX.Element {
  const id = presetOf(settings)
  if (id !== 'custom') {
    const Glyph = PRESET_GLYPHS[id]
    return (
      <Fragment>
        <span class="stateGlyph">
          <Glyph />
        </span>
        <Text>
          <Muted>{t('presets.fromPreset', { label: t(`presets.${id}`) })}</Muted>
        </Text>
      </Fragment>
    )
  }

  return (
    <Fragment>
      <span class="stateGlyph">
        <ResetGlyph />
      </span>
      <Text>
        <span class="stateName">{t('presets.custom')}</span>
      </Text>
      <span class="statePush" />
      <button
        type="button"
        class="linkButton"
        disabled={disabled}
        title={t('presets.resetTip')}
        onClick={() => onChange({ ...settings, ...PRESETS.balanced })}
      >
        {t('presets.reset')}
      </button>
    </Fragment>
  )
}
