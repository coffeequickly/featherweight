// 탭 여섯이 작업 순서다 — 시작에서 상태를 보고, 가운데 넷에서 고치고, 결과로 끝난다.
//
// 라벨만 쓰고 아이콘을 두지 않는다. 회색 아이콘 여섯이 켜져 있으면 문제 있는 하나가 묻히고,
// 문제를 아이콘 교체로 알리면 하필 그 탭만 정체를 잃는다. 문제는 글자색과 점이 맡는다.
// 점은 absolute 라 폭을 먹지 않아, 켜고 꺼도 탭 자리가 1px 도 움직이지 않는다.
//
// 폭은 여섯 균등이다. 라벨 길이나 언어와 무관하게 자리가 고정이라 위치로 기억된다.

import { JSX } from 'preact'

import { MessageKey, t } from '../lib/i18n'

export type TabId = 'start' | 'order' | 'fonts' | 'images' | 'options' | 'result'

/** 화면에 놓이는 순서 — 왼쪽에서 오른쪽이 곧 작업 순서다 */
export const TAB_IDS: readonly TabId[] = ['start', 'order', 'fonts', 'images', 'options', 'result']

const LABELS: Record<TabId, MessageKey> = {
  start: 'tab.start',
  order: 'tab.order',
  fonts: 'tab.fonts',
  images: 'tab.images',
  options: 'tab.options',
  result: 'tab.result'
}

type Props = {
  active: TabId
  /** 확인이 필요한 탭 — 글자가 경고색이 되고 점이 붙는다 */
  problems: readonly TabId[]
  /** 지금 열 수 없는 탭. 사라지지 않고 자리를 지킨다 — 없어지면 나머지가 밀린다 */
  disabled: readonly TabId[]
  onSelect: (tab: TabId) => void
}

export function TabBar({ active, problems, disabled, onSelect }: Props): JSX.Element {
  return (
    <div class="tabBar" role="tablist">
      {TAB_IDS.map((id) => {
        const label = t(LABELS[id])
        const warn = problems.includes(id)
        const off = disabled.includes(id)
        const classes = [
          'tabItem',
          id === active ? 'tabItemOn' : '',
          warn ? 'tabItemWarn' : ''
        ].filter((name) => name !== '')

        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={id === active}
            // 색과 점만으로는 전달되지 않는다 — 읽어 주는 이름에 사실을 넣는다
            aria-label={warn ? t('tab.needsAttention', { label }) : undefined}
            class={classes.join(' ')}
            disabled={off}
            onClick={() => onSelect(id)}
          >
            <span class="tabLabel">
              {label}
              {warn ? <i class="tabDot" /> : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}
