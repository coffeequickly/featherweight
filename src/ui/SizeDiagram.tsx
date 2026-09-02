// 모니터 해상도 비교표 — 4K 안에 QHD, 그 안에 FHD, HD 가 왼쪽 아래 모서리를 맞춰 겹친다.
//
// 상한 넷이 서로 얼마나 다른지는 이 그림이 제일 빨리 말한다. 고른 상한은 칠해서 "내 것"
// 이고, 장표 × 배율(남기고 싶은 픽셀)은 점선 상자로 그 위에 올린다. 점선이 칠한 상자
// 밖으로 나가면 그만큼은 안 남는다 — 배율을 올려도 소용없는 상태다. 그때 점선은 주황.

import { Muted, Text, VerticalSpace } from '@create-figma-plugin/ui'
import { JSX } from 'preact'

import { t } from '../lib/i18n'
import { edgeTag, MAX_EDGES } from '../lib/settingsOptions'
import { Settings } from '../lib/types'

type Props = {
  /** 선택한 프레임 중 가장 긴 변(pt)과 짧은 변. 긴 변이 0 이면 보기용 장표를 그린다. */
  frameLongEdge: number
  frameShortEdge: number
  multiplier: Settings['multiplier']
  maxEdge: Settings['maxEdge']
}

const WIDTH = 368
const HEIGHT = 168
const PAD_LEFT = 6
const PAD_TOP = 16
const PAD_BOTTOM = 6
/** 가장 큰 상자(보통 4K)의 폭 — 오른쪽에 라벨 자리를 남긴다 */
const CHART_WIDTH = 280
const ASPECT = 9 / 16

/** 선택이 없을 때 그려 보이는 장표 — FHD 슬라이드, 가장 흔한 경우 */
const SAMPLE_LONG = 1920
const SAMPLE_SHORT = 1080

export function SizeDiagram({
  frameLongEdge,
  frameShortEdge,
  multiplier,
  maxEdge
}: Props): JSX.Element {
  const sample = frameLongEdge <= 0
  const long = Math.round(sample ? SAMPLE_LONG : frameLongEdge)
  const short = Math.round(sample ? SAMPLE_SHORT : Math.max(1, frameShortEdge))
  const wanted = Math.ceil(long * multiplier)
  const effective = Math.min(wanted, maxEdge)
  const capped = wanted > maxEdge

  // 가장 큰 것(4K 또는 점선 상자)이 차트 폭에 들어오게
  const largest = Math.max(MAX_EDGES[MAX_EDGES.length - 1], wanted)
  const scale = CHART_WIDTH / largest
  const baseY = HEIGHT - PAD_BOTTOM
  // 왼쪽 아래 모서리를 맞춘다 — 그래야 오른쪽 위가 비어 라벨이 들어간다
  const box = (w: number, h: number): { x: number; y: number; w: number; h: number } => ({
    x: PAD_LEFT,
    y: baseY - h * scale,
    w: w * scale,
    h: h * scale
  })

  // 점선 상자 — 장표 비율 그대로, 긴 변이 wanted
  const landscape = long >= short || sample
  const wantedShort = Math.round((wanted * short) / long)
  const dashed = landscape ? box(wanted, wantedShort) : box(wantedShort, wanted)
  const accent = capped
    ? 'var(--figma-color-text-warning, #b86200)'
    : 'var(--figma-color-text-brand, #007be5)'

  return (
    <div class="sizeDiagram">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        aria-hidden="true"
        style="display:block; font-family: var(--font-family)"
      >
        {/* 큰 것부터 그려야 작은 것이 위에 온다 */}
        {[...MAX_EDGES].reverse().map((edge) => {
          const rect = box(edge, edge * ASPECT)
          const selected = edge === maxEdge
          return (
            <g key={edge}>
              <rect
                x={rect.x}
                y={rect.y}
                width={rect.w}
                height={rect.h}
                rx={2}
                style={
                  selected
                    ? 'fill: var(--figma-color-bg-brand-tertiary, #e5f4ff); stroke: var(--figma-color-text-brand, #007be5); stroke-width: 1.5'
                    : 'fill: none; stroke: var(--figma-color-border-strong, #2c2c2c); stroke-opacity: 0.35; stroke-width: 1'
                }
              />
              {/* 라벨은 각 상자의 오른쪽 위 — 작은 상자가 덮지 않는 자리 */}
              <text
                x={rect.x + rect.w - 5}
                y={rect.y + 12}
                font-size="10"
                font-weight={selected ? '600' : '400'}
                text-anchor="end"
                style={
                  selected
                    ? 'fill: var(--figma-color-text-brand, #007be5)'
                    : 'fill: var(--figma-color-text-secondary)'
                }
              >
                {edgeTag(edge)} {edge}
              </text>
            </g>
          )
        })}

        {/* 장표 × 배율 — 남기고 싶은 픽셀. 고른 상자 밖으로 나간 만큼은 안 남는다.
            라벨은 상자 안 오른쪽 아래 — 위쪽 모서리는 해상도 라벨 자리라 겹친다 */}
        <rect
          x={dashed.x}
          y={Math.max(PAD_TOP, dashed.y)}
          width={dashed.w}
          height={Math.min(dashed.h, baseY - PAD_TOP)}
          rx={2}
          stroke-width="1.5"
          stroke-dasharray="4 3"
          style={`fill: none; stroke: ${accent}`}
        />
        <text
          x={dashed.x + dashed.w - 5}
          y={baseY - 6}
          text-anchor="end"
          font-size="10"
          font-weight="600"
          style={`fill: ${accent}`}
        >
          {wanted}px
        </text>
      </svg>
      <VerticalSpace space="extraSmall" />
      <Text>
        <Muted>
          {sample ? t('diagram.frameSample', { frame: long }) : t('diagram.frame', { frame: long })}{' '}
          {t('diagram.wanted', { multiplier, wanted })}
        </Muted>
      </Text>
      <VerticalSpace space="extraSmall" />
      <Text>
        <Muted>
          {t('diagram.result', { effective })}
          {capped ? t('diagram.resultCapped') : ''}
        </Muted>
      </Text>
    </div>
  )
}
