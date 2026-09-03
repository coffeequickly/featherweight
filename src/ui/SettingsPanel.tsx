// 고급 설정 화면 — 프리셋이 정하지 않는 것, 프리셋의 숫자를 직접 고치는 것.
//
// 프리셋(선명하게·균형·최소 용량·목표 용량)은 메인 화면에 산다. 여기서 숫자를 만지면
// 메인의 프리셋은 "직접" 상태가 된다. 라벨 앞의 아이콘은 메인의 값 칩과 같다 —
// 칩에서 본 그림을 여기서 다시 만나야 칩만 보고도 무슨 값인지 읽힌다.
//
// 맨 위는 그림이다. 배율과 상한은 따로 보면 뜻이 없고, 장표 위에서 만나야 읽힌다.
// 고르는 부품은 전부 ChoiceRow — 메인의 타일과 같은 문법이라 화면이 바뀌어도
// "고른다" 는 동작이 같은 모양으로 보인다.

import { Checkbox, Muted, RangeSlider, Text, VerticalSpace } from '@create-figma-plugin/ui'
import { ComponentChildren, Fragment, JSX } from 'preact'

import { t } from '../lib/i18n'
import { edgeTag, MAX_EDGES, MIN_EDGES, MULTIPLIERS } from '../lib/settingsOptions'
import { EditorKind, Settings } from '../lib/types'
import { ChoiceRow } from './ChoiceRow'
import { EdgeGlyph, ImageGlyph, ScaleGlyph } from './glyphs'
import { SizeDiagram } from './SizeDiagram'

type Props = {
  settings: Settings
  disabled: boolean
  onChange: (next: Settings) => void
  /** 선택한 프레임 중 가장 긴 변(pt)과 그 프레임의 짧은 변. 그림이 실제 장표로 그려지는 근거. 0 이면 보기용. */
  frameLongEdge: number
  frameShortEdge: number
  /** 메인에서 헤더를 뺐으니 버전은 여기 맨 아래에 */
  version: string
  editor: EditorKind
}

/**
 * 이미지는 "화면에 보이는 크기 × 배율" 을 넘는 픽셀을 버린다.
 * 문서보다 큰 원본이 그대로 임베드되는 걸 막는 게 목적이다. (PRD FR-3)
 *
 * 목표 용량 모드에서는 크기·압축 섹션이 사라진다 — 사다리(fitToSize.ts)가 그 값을
 * 정하므로 여기 숫자는 아무 효과가 없다. 효과 없는 컨트롤을 보여 주면 거짓말이다.
 */
export function SettingsPanel({
  settings,
  disabled,
  onChange,
  frameLongEdge,
  frameShortEdge,
  version,
  editor
}: Props): JSX.Element {
  return (
    <Fragment>
      {settings.fitToSize ? (
        <div class="section">
          <Text>
            <Muted>{t('settings.fitNote')}</Muted>
          </Text>
        </div>
      ) : (
        <Section title={t('images.sectionSize')}>
          <SizeDiagram
            frameLongEdge={frameLongEdge}
            frameShortEdge={frameShortEdge}
            multiplier={settings.multiplier}
            maxEdge={settings.maxEdge}
            editor={editor}
          />
          <VerticalSpace space="small" />

          <Field label={t('images.multiplier')} glyph={<ScaleGlyph />}>
            <ChoiceRow
              label={t('images.multiplier')}
              disabled={disabled}
              options={MULTIPLIERS.map((value) => ({ value, label: `${value}×` }))}
              value={settings.multiplier}
              onChange={(multiplier) => onChange({ ...settings, multiplier })}
            />
          </Field>

          <Field label={t('images.maxEdge')} glyph={<EdgeGlyph />}>
            <ChoiceRow
              label={t('images.maxEdge')}
              disabled={disabled}
              options={MAX_EDGES.map((value) => ({
                value,
                label: edgeTag(value),
                tag: `${value}px`
              }))}
              value={settings.maxEdge}
              onChange={(maxEdge) => onChange({ ...settings, maxEdge })}
            />
          </Field>
        </Section>
      )}

      <Section title={t('images.sectionKeep')}>
        <Field label={t('images.minEdge')}>
          <ChoiceRow
            label={t('images.minEdge')}
            disabled={disabled}
            options={MIN_EDGES.map((value) => ({ value, label: `${value}px` }))}
            value={settings.minEdge}
            onChange={(minEdge) => onChange({ ...settings, minEdge })}
          />
        </Field>
        <Says text={t('images.keepSays', { minEdge: settings.minEdge })} />
      </Section>

      {settings.fitToSize ? null : (
        <Section title={t('images.sectionQuality')}>
          <Field label={t('images.quality')} glyph={<ImageGlyph />}>
            <div class="sliderRow">
              <div class="sliderTrack">
                <RangeSlider
                  disabled={disabled}
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
          </Field>
          <Says text={t('images.qualitySays', { quality: settings.quality })} />
          <VerticalSpace space="small" />
          <Checkbox
            disabled={disabled}
            onValueChange={(value: boolean) => onChange({ ...settings, reencodeOpaquePng: value })}
            value={settings.reencodeOpaquePng}
          >
            <Text>{t('images.reencode')}</Text>
          </Checkbox>
        </Section>
      )}

      <Section title={t('settings.sectionText')}>
        {/* 진짜 폰트로 넣는 건 기본 기능이다 — 여기 옵션은 그 반대를 켜는 쪽이다 */}
        <Checkbox
          disabled={disabled}
          onValueChange={(value: boolean) => onChange({ ...settings, embedText: !value })}
          value={!settings.embedText}
        >
          <Text>{t('settings.outlineAll')}</Text>
        </Checkbox>
        <Says text={t('settings.outlineAllSays')} />
        <VerticalSpace space="small" />
        {/* 아웃라인으로 내보내면 링크를 얹을 글자가 없다 */}
        <Checkbox
          disabled={disabled || !settings.embedText}
          onValueChange={(value: boolean) => onChange({ ...settings, keepLinks: value })}
          value={settings.keepLinks}
        >
          <Text>{t('settings.keepLinks')}</Text>
        </Checkbox>
        <Says text={t('settings.keepLinksSays')} />
      </Section>

      <div class="aboutLine">
        <Text>
          <Muted>Featherweight v{version}</Muted>
        </Text>
      </div>
    </Fragment>
  )
}

function Section({ title, children }: { title: string; children: ComponentChildren }): JSX.Element {
  return (
    <div class="section">
      <div class="sectionTitle">
        <Text>{title}</Text>
      </div>
      {children}
    </div>
  )
}

/** 라벨 위, 컨트롤 아래. 라벨 앞 아이콘은 메인 화면의 값 칩과 같은 것이다. */
function Field({
  label,
  glyph,
  children
}: {
  label: string
  glyph?: JSX.Element
  children: ComponentChildren
}): JSX.Element {
  return (
    <div class="field">
      <div class="fieldLabel">
        <Text>
          <Muted>
            <span class="labelGlyph">
              {glyph}
              {label}
            </span>
          </Muted>
        </Text>
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
