// 이미지 탭 — 얼마나 남길지, 어느 화질로, 그래서 어떤 그림이 어떻게 되는지.
//
// 맨 위는 프리셋 칩 줄이다. 예전에는 "균형 프리셋 설정입니다" 라고 읽어 주기만 하고
// 바꾸려면 시작 탭으로 돌아가야 했다 — 여기 슬라이더를 만지는 사람이 가장 먼저 하고 싶은
// 일이 출발점 고르기인데 그걸 못 했다. 시작 탭과 같은 프리셋을, 타일 대신 한 줄 칩으로 둔다.
//
// 그 아래는 결과가 말한다. 배율을 올리면 오른쪽 숫자가 전부 따라 움직이고, 손대지 않는
// 것은 "그대로" 로 남는다. 상한이 배율을 이기면 그 사실도 목록 위에 적는다 — 조용히 깎지 않는다.

import { Checkbox, Muted, RangeSlider, Text, VerticalSpace } from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'
import { Fragment, JSX } from 'preact'

import { OVERFLOW_NOTICE } from '../lib/clipRect'
import { t } from '../lib/i18n'
import { imageRoster } from '../lib/preflight'
import { NodesFocusHandler, Preflight, Settings } from '../lib/types'
import { Says } from './panelParts'
import { FitField, PresetRow } from './PresetBar'
import { SizeBounds } from './SizeBounds'
import { Section } from './Section'

/** 목록에 늘어놓을 줄 수. 나머지는 "외 N장" 으로 접는다 */
const ROWS_SHOWN = 6

type Props = {
  settings: Settings
  preflight: Preflight | null
  disabled: boolean
  onChange: (next: Settings) => void
  /** 잘라 넣기 줄을 누르면 옵션 탭으로 — 상태를 보여 주고 바꾸러 가는 길까지 */
  onGoOptions: () => void
}

/** 0~1 을 퍼센트로. 1% 아래도 0 이라고 적지 않는다 — 0% 는 "안 쓴다/안 자른다" 로 읽힌다 */
function percentOf(fraction: number): number {
  return Math.min(100, Math.max(1, Math.round(fraction * 100)))
}

/** 캔버스에서 그 레이어들을 보여 준다 — 결과 탭의 사유 행과 같은 통로다 */
function focusNodes(nodeIds: string[]): void {
  if (nodeIds.length > 0) emit<NodesFocusHandler>('nodes:focus', nodeIds)
}

export function ImagesPanel({
  settings,
  preflight,
  disabled,
  onChange,
  onGoOptions
}: Props): JSX.Element {
  const fit = settings.fitToSize
  const rows = preflight === null ? [] : imageRoster(preflight, settings)
  // 프레임 밖으로 넘쳐 잘리는 것들 — 안 보이는 픽셀을 싣고 있다는 사실은 목록 아래서 한 번 더 말한다
  const clipped = rows.filter((row) => !row.kept && row.visible < OVERFLOW_NOTICE)
  const shrink = rows.filter((row) => !row.kept).length
  // 그림의 기준 — 크기가 섞였으면 가장 큰 프레임을 쓰고 그 사실을 밝힌다
  const frames = preflight?.frames ?? []
  const biggest = frames.reduce<(typeof frames)[number] | null>(
    (best, frame) => (best === null || frame.longEdge > best.longEdge ? frame : best),
    null
  )
  const frameLongEdge = biggest?.longEdge ?? 0
  const mixedFrames = new Set(frames.map((frame) => Math.round(frame.longEdge))).size > 1

  return (
    <Fragment>
      <PresetRow settings={settings} disabled={disabled} onChange={onChange} />
      {/* 목표 용량을 여기서 고를 수 있으면 MB 도 여기서 정할 수 있어야 한다 —
          숫자를 정하러 시작 탭까지 되돌아가게 두면 고르고 나서 갈 데가 없다 */}
      {fit ? (
        <Fragment>
          <div class="fitRow">
            <FitField settings={settings} disabled={disabled} onChange={onChange} />
          </div>
          <Says text={t('images.fitLocked')} />
        </Fragment>
      ) : null}

      <Section title={t('images.sectionResolution')}>
        <SizeBounds
          settings={settings}
          frameLongEdge={frameLongEdge}
          mixedFrames={mixedFrames}
          rows={rows}
          disabled={disabled || fit}
          onChange={onChange}
          onFocus={focusNodes}
          onGoOptions={onGoOptions}
        />
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
              {/* 열 이름 — 숫자만 두면 무슨 비인지 모른다("42%만 씀" 이 뭔 소리냐는 제보, 2026-09-11).
                  이름 칸은 비워 둔다 — 섹션 제목이 이미 "이미지" 다.
                  정렬은 Text 의 align 으로 — 컴포넌트가 왼쪽 정렬을 제 클래스로 박아서 CSS 가 안 먹는다 */}
              <div class="imageHead" aria-hidden="true">
                <span class="imageName" />
                <span class="imageUsed">
                  <Text align="right">
                    <Muted>{t('images.headUsed')}</Muted>
                  </Text>
                </span>
                <span class="imageFrom">
                  <Text align="right">
                    <Muted>{t('images.headFrom')}</Muted>
                  </Text>
                </span>
                <span class="imageTo">
                  <Text align="right">
                    <Muted>{t('images.headTo')}</Muted>
                  </Text>
                </span>
                <span class="imageCut">
                  <Text align="right">
                    <Muted>{t('images.headCut')}</Muted>
                  </Text>
                </span>
              </div>
              {rows.slice(0, ROWS_SHOWN).map((row) => {
                // 일부만 보이는데 통째로 가는 줄 — 프레임 밖으로 넘쳤거나(개선 계획 37), 통째로 쓰는
                // 자리가 있거나, 잘라 넣기가 꺼졌거나. 그 낭비가 눈에 걸려야 한다
                const whole =
                  !row.kept && row.crop === null && row.used !== null && row.used < OVERFLOW_NOTICE
                return (
                  /* 그리드의 칸이라 행 래퍼를 두지 않는다 — 래퍼가 있으면 칸이 아니라 한 덩어리가 된다 */
                  /* 줄 전체가 캔버스로 가는 문이다 — 목록에서 본 것을 바로 찾을 수 있어야 한다 */
                  <button
                    key={row.imageHash}
                    type="button"
                    class="imageRow"
                    title={t('images.listFind')}
                    onClick={() => focusNodes(row.nodeIds)}
                  >
                    <span class="imageName ellipsis">
                      <Text>{row.name}</Text>
                    </span>
                    <span class="imageUsed">
                      <Text align="right" numeric>
                        {row.used === null ? '' : `${percentOf(row.used)}%`}
                      </Text>
                    </span>
                    <span class="imageFrom">
                      <Text align="right" numeric>
                        <Muted>
                          {row.original === null ? t('images.listUnsized') : `${row.original}px`}
                        </Muted>
                      </Text>
                    </span>
                    {/* 잘라 넣는 줄은 조각의 크기 — 통째의 크기를 적으면 실리지 않는 것을 말하는 셈이다 */}
                    <span class={`imageTo${row.kept ? ' imageKept' : ''}`}>
                      <Text align="right" numeric>
                        {row.kept ? (
                          <Muted>{t('images.listKept')}</Muted>
                        ) : (
                          `${row.crop === null ? row.target : row.crop.target}px`
                        )}
                      </Text>
                    </span>
                    <span class={`imageCut${whole ? ' imageWhole' : ''}`}>
                      <Text align="right" numeric>
                        {row.crop !== null
                          ? t('images.listCut', { percent: percentOf(row.crop.cut) })
                          : whole
                            ? t('images.listWhole')
                            : ''}
                      </Text>
                    </span>
                  </button>
                )
              })}
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
