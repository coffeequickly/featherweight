// 해상도를 세 개의 바로 — 상한·하한은 px, 배율은 배수.
//
// "1.5×" 는 만드는 사람의 단위다. 쓰는 사람이 아는 것은 "이 사진이 몇 px 로 들어가나" 이고,
// 그래서 상·하한은 px 로 말한다.
//
// 앞서 상한(maxEdge)을 화면에서 빼고 위 바에 배율을 태웠다가 실기에서 깨졌다. 균형 프리셋의
// 상한 1920 이 1920pt 프레임에서 모든 배율을 먹어, 바를 전 구간 끌어도 결과가 안 움직였다
// ("바를 조정해도 기준이 몇인지 안 나온다"). 라벨을 어떻게 붙여도 숨은 상한이 있는 한
// 바 하나는 거짓말을 한다 — 그래서 상한을 도로 꺼내 제 바를 줬다.
//
// 지금은 셋이 서로 겹치지 않는다.
//   최대 = 한 장이 넘을 수 없는 px. 이걸 내리면 큰 사진부터 깎인다.
//   최소 = 아무리 작게 놓여도 이 밑으로는 안 줄인다. 로고·아이콘·작은 스크린샷을 지킨다.
//   배율 = 놓인 크기의 몇 배로 담을까. 확대·인쇄에서 선명함을 정한다.
// 셋 다 제 값이 그대로 보이므로 어떤 바도 다른 바의 값을 조용히 덮어쓰지 않는다.

import { Muted, RangeSlider, Text } from '@create-figma-plugin/ui'
import { Fragment, JSX } from 'preact'

import { t } from '../lib/i18n'
import { Fold } from './Fold'
import { SizeDiagram } from './SizeDiagram'
import { ImageRow } from '../lib/preflight'
import { MAX_EDGES, MIN_EDGES, MULTIPLIERS } from '../lib/settingsOptions'
import { Settings } from '../lib/types'

type Props = {
  settings: Settings
  /** 프레임 긴 변(pt) — 설명 문구가 기준을 밝히는 데 쓴다 */
  frameLongEdge: number
  /** 프레임 크기가 여러 가지인가 — 기준을 밝혀야 그림이 거짓말이 안 된다 */
  mixedFrames: boolean
  rows: ImageRow[]
  disabled: boolean
  onChange: (next: Settings) => void
  onFocus: (nodeIds: string[]) => void
  onGoOptions: () => void
}

export function SizeBounds({
  settings,
  frameLongEdge,
  mixedFrames,
  rows,
  disabled,
  onChange,
  onFocus,
  onGoOptions
}: Props): JSX.Element {
  const frame = Math.max(1, Math.round(frameLongEdge))

  // 서로를 넘어가지 못하게 사다리 자체를 잘라 준다. 넘으려 하면 미는(상대 값을 같이 바꾸는)
  // 방법도 있지만, 두 바는 트랙이 따로라 안 만진 쪽이 조용히 바뀌는 꼴이 된다 — 그건
  // 이 화면에서 계속 걷어내 온 바로 그 문제다. 여기서는 그냥 안 움직이는 쪽이 맞다.
  // 사다리가 겹치는 구간(1280~2048)에서만 잘리므로 빈 배열이 될 일은 없지만, 값이 사라진
  // 바는 그리는 것 자체가 불가능하니 만약을 대비해 원래 사다리로 물러선다.
  const maxRungs = MAX_EDGES.filter((edge) => edge >= settings.minEdge)
  const minRungs = MIN_EDGES.filter((edge) => edge <= settings.maxEdge)

  return (
    <Fragment>
      {/* 그림이 먼저다 — 바는 그 그림을 움직이는 손잡이라 아래에 둔다.
          그릴 그림이 없으면 상자도 없다 — 격자만 있는 빈 상자는 죽은 가구다.
          단 "크기를 아직 못 읽었다" 는 다른 경우라 SizeDiagram 이 제 높이를 잡아 준다 */}
      {rows.length === 0 ? null : (
        <div class="repsBox">
          <SizeDiagram rows={rows} onFocus={onFocus} />
        </div>
      )}

      {/* 바 셋은 접어 둔다. 대개는 프리셋을 고르고 그림만 보고 지나가고, 숫자를 직접 정하는
          것은 가끔이다 — 접힌 머리글이 세 값을 그대로 말하므로 펼치지 않고도 확인은 된다 */}
      <Fold
        title={t('images.advanced')}
        summary={
          <Muted>
            {t('images.boundSummary', {
              max: settings.maxEdge,
              min: settings.minEdge,
              scale: settings.multiplier
            })}
          </Muted>
        }
      >
        <BoundSlider
          label={t('images.boundLargest')}
          value={settings.maxEdge}
          options={maxRungs.length === 0 ? MAX_EDGES : maxRungs}
          format={(edge) => `${edge}px`}
          disabled={disabled}
          onPick={(maxEdge) => onChange({ ...settings, maxEdge })}
        />
        <BoundSlider
          label={t('images.boundSmallest')}
          value={settings.minEdge}
          options={minRungs.length === 0 ? MIN_EDGES : minRungs}
          format={(edge) => `${edge}px`}
          disabled={disabled}
          onPick={(minEdge) => onChange({ ...settings, minEdge })}
        />
        <BoundSlider
          label={t('images.boundScale')}
          value={settings.multiplier}
          options={MULTIPLIERS}
          format={(m) => `${m}×`}
          disabled={disabled}
          onPick={(multiplier) => onChange({ ...settings, multiplier })}
        />
      </Fold>

      {/* 이미지가 없으면 할 말이 없다 — "이미지 0장이 이미 이 범위 안에 있습니다" 는
          답이 아니라 빈칸을 채운 문장이다. 목록 쪽이 이미 없다고 말한다 */}
      {rows.length === 0 ? null : (
        <Cut
          rows={rows}
          frame={frame}
          mixedFrames={mixedFrames}
          settings={settings}
          onGoOptions={onGoOptions}
        />
      )}
    </Fragment>
  )
}

/**
 * 눈금이 정해진 값들만 밟는 바. RangeSlider 는 연속이라 인덱스를 태운다.
 *
 * 양끝에 사다리의 처음과 끝을 적는다 — 값 하나만 있으면 지금이 구간의 어디인지,
 * 더 갈 데가 있는지 알 수 없다("바를 조정해도 기준이 몇인지 안 나온다").
 *
 * `options` 는 지금 밟을 수 있는 칸만 담는다. 트랙·손잡이·양끝 글자가 모두 여기서
 * 나오므로 셋이 어긋날 수 없다 — 못 가는 자리를 눈금에 적어 두고 손잡이만 안 가는,
 * 그런 거짓말이 생기지 않는다.
 */
function BoundSlider<T extends number>({
  label,
  value,
  options,
  format,
  disabled,
  onPick
}: {
  label: string
  value: T
  options: ReadonlyArray<T>
  format: (value: T) => string
  disabled: boolean
  onPick: (value: T) => void
}): JSX.Element {
  const index = Math.max(0, options.indexOf(value))
  const first = options[0]
  const last = options[options.length - 1]

  return (
    <div class="boundRow">
      <div class="boundLabel">
        <Text>
          <Muted>{label}</Muted>
        </Text>
      </div>
      <div class="boundTrack">
        <RangeSlider
          disabled={disabled}
          increment={1}
          maximum={options.length - 1}
          minimum={0}
          onNumericValueInput={(next: number) => {
            const picked = options[Math.round(next)]
            if (picked !== undefined && picked !== value) onPick(picked)
          }}
          value={String(index)}
        />
        {/* Text 로 감싸지 않는다 — 제 상자를 9px 줄여서 바 위로 올라타 겹친다 */}
        <div class="boundScale">
          <span>{format(first)}</span>
          <span>{format(last)}</span>
        </div>
      </div>
      <div class="boundValue">
        <Text>{format(value)}</Text>
      </div>
    </div>
  )
}

/**
 * 이 설정이 무엇을 하는지 — 줄어드는 장수, 선명도, 잘라 넣기 상태, 상한 경고. 한 덩어리로
 * 같은 간격에 둔다(따로 흩어 두니 문단마다 빈 줄이 낀 것처럼 보였다는 제보, 2026-09-11).
 * 예전에는 확대율·DPI·기준 프레임·절감률을 각각 한 줄씩 늘어놓아 벽이 됐다 — 읽히는 것은
 * 결국 "몇 장이 얼마나 줄어드나" 다.
 *
 * 픽셀이지 바이트가 아니다. 바이트는 그림 내용에 따라 갈려서 내보내기 전에는 못 말한다.
 */
function Cut({
  rows,
  frame,
  mixedFrames,
  settings,
  onGoOptions
}: {
  rows: ImageRow[]
  frame: number
  mixedFrames: boolean
  settings: Settings
  onGoOptions: () => void
}): JSX.Element {
  const { multiplier, cropToVisible } = settings
  const sized = rows.filter((row) => row.original !== null)
  let before = 0
  let after = 0
  for (const row of sized) {
    const original = row.original as number
    // 크기를 알면 진짜 픽셀 수(잘라 넣는 것은 조각)로, 모르면 긴 변의 제곱으로 어림한다
    const source = row.pixels ?? original * original
    const stored = row.storedPixels ?? (row.kept ? source : Math.min(original, row.target) ** 2)
    before += source
    after += stored
  }
  const shrink = sized.filter((row) => !row.kept).length
  // 잘라 넣기 상태와 해당 장수 — 켜져 있으면 조각 계획이 선 것, 꺼져 있으면 켰을 때 해당될 것
  const partial = cropToVisible
    ? sized.filter((row) => row.crop !== null).length
    : sized.filter((row) => !row.kept && row.partial).length
  const cropLine =
    partial === 0
      ? t(cropToVisible ? 'images.cropOnNone' : 'images.cropOffNone')
      : t(cropToVisible ? 'images.cropOn' : 'images.cropOff', { count: partial })
  // 상한이 배율을 이겼다 — 고른 값이 그대로 안 나간다는 사실은 조용히 두면 안 된다
  const capped = sized.filter((row) => row.capped).length
  const percent = before === 0 ? 0 : Math.max(0, Math.round((1 - after / before) * 100))

  return (
    <div class="chartLegend">
      <p class="chartCut">
        <Text>
          {/* 크기를 읽는 중에는 셈할 것이 없다 — 문단 수는 그대로 둬서 값이 들어와도 안 밀린다 */}
          {sized.length === 0
            ? t('images.cutMeasuring', { total: rows.length })
            : shrink === 0
              ? t('images.cutNone', { total: sized.length })
              : t('images.cutSays', { total: sized.length, shrink, percent })}
        </Text>
      </p>
      <p class="chartWhy">
        <Text>
          <Muted>
            {t('images.zoomSays', { multiplier })}
            {mixedFrames ? ` ${t('images.mixedFrames', { size: frame })}` : ''}
          </Muted>
        </Text>
      </p>
      {/* 잘라 넣기 켜짐/꺼짐 — 줄 전체가 옵션 탭으로 가는 버튼이다. 상태만 보여 주고 바꾸러
          갈 길을 안 주면 옵션 탭을 뒤지게 된다. 크기를 읽는 중에는 장수를 못 세니 안 보인다 */}
      {sized.length === 0 ? null : (
        <p class="chartWhy">
          <button type="button" class="linkLine" onClick={onGoOptions}>
            <Text>
              <Muted>{cropLine}</Muted> <span class="linkWord">{t('images.cropGo')}</span>
            </Text>
          </button>
        </p>
      )}
      {capped === 0 ? null : (
        <p class="chartWhy chartWarn">
          <Text>{t('images.cappedSays', { count: capped, maxEdge: settings.maxEdge })}</Text>
        </p>
      )}
    </div>
  )
}
