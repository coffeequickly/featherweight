// 이 설정이면 내 그림이 어떻게 되는가 — 대표 셋을 진짜 가로세로 비로.
//
// 점선이 지금 크기, 칠한 사각형이 내보낼 크기다. 점선에 꽉 차 있으면 손대지 않는 그림이라,
// "걸리는지 아닌지" 가 숫자가 아니라 모양으로 읽힌다. 셋은 같은 자를 쓰므로 서로의 크기
// 차이도 그대로 보인다.
//
// 55 장을 다 그리지 않는다. 400px 폭에 실제 비로 열 개를 넣으면 하나당 30px 남짓이라
// 비율이 안 읽힌다. 셋만 뽑되 **뽑는 기준은 원본 크기뿐이다 — 설정을 보지 않는다.**
//
// 이게 중요하다. 설정에 따라 뽑으면 바를 끌 때마다 보이는 그림이 갈아치워져서, 눈앞의
// 변화가 내 조정 때문인지 다른 사진으로 바뀐 건지 알 수 없다. 라인업을 고정해야 파란
// 상자가 자라고 줄어드는 것이 보인다.
//
// 앞서 두 번 틀렸다. 가장 큰 것·중간·작은 것을 뽑았더니 뒤 둘이 점만 했고, 많이 줄어드는
// 순으로 뽑았더니 셋이 전부 같은 그림(2400 → 640px)이었다. 지금은 서로 다른 원본 크기를
// 큰 쪽부터 고르게 훑어 뽑고, 같은 크기가 여럿이면 ×N 으로 묶는다.
//
// 여기까지 다섯 번 돌았다. 이미지마다 세로 막대(축·범례가 없어 벽처럼 보였다), 픽셀 비율
// 막대("18% 남김" 이 화질이 18% 가 된다고 읽혔다), 해상도 상자만(설정만 보이고 이미지가
// 없었다), 원본→목표 기울기 선(전혀 안 읽혔다). 공통된 실패 원인은 하나다 —
// **추상화한 만큼 설명이 필요해졌다.** 실제 비의 사각형은 설명이 필요 없다.

import { JSX } from 'preact'

import { t } from '../lib/i18n'
import { ImageRow } from '../lib/preflight'

/** 사각형이 앉는 자리의 높이(px). 칸 폭(400px 안에서 넷이면 85px)을 넘으면 안 된다 */
const STAGE = 80
/**
 * 상자 아래 글자 두 줄이 먹는 높이 — `.repStage + *` 의 margin 8 + 이름 14 + 간격 1 + 크기 14.
 * 크기를 읽는 동안에도 같은 높이를 잡아 둬야, 값이 들어올 때 아래가 통째로 밀리지 않는다.
 */
const CAPTION = 37
/** 몇 칸을 그릴지. 셋은 적고, 다섯이면 상자가 60px 아래로 내려가 비율이 안 읽힌다 */
const SHOWN = 4

type Props = {
  rows: ImageRow[]
  onFocus: (nodeIds: string[]) => void
}

export function SizeDiagram({ rows, onFocus }: Props): JSX.Element | null {
  if (rows.length === 0) return null

  // 원본 크기는 비동기로 들어온다. 그동안 아무것도 안 그리면 값이 도착하는 순간 상자가
  // 튀어나와 아래가 다 밀린다 — 자리만 같은 높이로 잡아 두고 읽는 중이라고 말한다
  const sized = rows.filter((row) => row.original !== null)
  if (sized.length === 0) {
    return (
      <div class="repsWait" style={`height: ${STAGE + CAPTION}px`}>
        {t('images.listUnsized')}
      </div>
    )
  }

  const finalOf = (row: ImageRow): number => {
    const original = row.original as number
    return row.kept ? original : Math.min(original, row.target)
  }

  // 같은 원본 크기는 한 번만.
  //
  // 대표를 배열의 첫 줄로 뽑으면 안 된다. rows 는 `kept` 로 먼저 정렬되는데 그건 설정을
  // 타므로, 상한을 올리면 같은 묶음의 대표가 다른 그림으로 갈아치워졌다(실기 제보).
  // imageHash 로 정하면 설정에도, 원본 크기가 도착하는 순서에도 흔들리지 않는다.
  const groups = new Map<number, { row: ImageRow; count: number }>()
  for (const row of sized) {
    const key = row.original as number
    const found = groups.get(key)
    if (found === undefined) groups.set(key, { row, count: 1 })
    else {
      found.count += 1
      if (row.imageHash < found.row.imageHash) found.row = row
    }
  }
  // 같은 크기끼리의 순서도 해시로 못 박는다 — Map 의 삽입 순서는 곧 rows 의 순서다
  const bySize = [...groups.values()].sort(
    (a, b) =>
      (b.row.original as number) - (a.row.original as number) ||
      (a.row.imageHash < b.row.imageHash ? -1 : 1)
  )

  // 큰 쪽부터 고르게 훑는다 — 큰 것 하나, 중간 하나, 작은 것 하나
  const at = (ratio: number): number =>
    Math.min(bySize.length - 1, Math.floor(bySize.length * ratio))
  const picks: Array<{ row: ImageRow; count: number }> = []
  for (const index of [0, at(1 / 4), at(2 / 4), at(3 / 4)]) {
    const group = bySize[index]
    if (group !== undefined && !picks.includes(group) && picks.length < SHOWN) picks.push(group)
  }
  // 서로 다른 크기가 넷보다 적으면 남은 것으로 채운다
  for (const group of bySize) {
    if (!picks.includes(group) && picks.length < SHOWN) picks.push(group)
  }
  if (picks.length === 0) return null

  const top = Math.max(...picks.map((g) => g.row.original as number))
  const unit = STAGE / Math.max(1, top)

  return (
    <div class="reps">
      {picks.map(({ row, count }) => {
        const original = row.original as number
        const final = finalOf(row)
        return (
          <button
            key={row.imageHash}
            type="button"
            class="rep"
            title={t('images.listFind')}
            onClick={() => onFocus(row.nodeIds)}
          >
            <span class="repStage" style={`height: ${STAGE}px`}>
              <span
                class="repBox repNow"
                style={`width: ${original * unit}px; height: ${original * row.aspect * unit}px`}
              />
              <span
                class={`repBox repNext${row.kept ? ' repKept' : ''}`}
                style={`width: ${final * unit}px; height: ${final * row.aspect * unit}px`}
              />
            </span>
            {/* 개수를 이름 줄에 붙여 한 줄을 줄인다 — 여기 글자는 상자를 거드는 것이지
                읽히려고 있는 것이 아니다.
                Text 로 감싸지 않는다: 제 상자를 9px 줄이고 내용을 4px 내려서(text.module.css)
                10px 두 줄이 서로 겹쳐 찍혔다. 크기·색을 어차피 여기서 정하므로 벗기는 게 맞다 */}
            <span class="repName">{count > 1 ? `${row.name} ×${count}` : row.name}</span>
            <span class={`repNum${row.kept ? ' repNumKept' : ''}`}>
              {row.kept
                ? t('images.repKept', { original })
                : t('images.repCut', { original, target: final })}
            </span>
          </button>
        )
      })}
    </div>
  )
}
