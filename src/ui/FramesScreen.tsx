// 순서·제외 화면 — 정렬, 끌어서 순서 바꾸기, 빼기와 되살리기.

import { Button, IconArrow16, Muted, Text, VerticalSpace } from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'
import { Fragment, JSX } from 'preact'

import { t } from '../lib/i18n'
import { FrameFocusHandler, SortMode } from '../lib/types'
import { FrameList } from './FrameList'
import { FrameOrder } from './useFrameOrder'

type Props = {
  order: FrameOrder
  disabled: boolean
}

export function FramesScreen({ order, disabled }: Props): JSX.Element {
  return (
    <Fragment>
      {/* 기준 하나와 방향 하나. 넷 × 뒤집기를 여덟 칸으로 늘어놓으면 고를 수 없다.
          손으로 옮기면 기준이 "직접" 이 되고 되돌리기가 나타난다 — 상태에 이름이 없으면
          왜 정렬 버튼이 안 먹는지 알 수 없다 */}
      <div class="sortBar">
        <span class="sortLabel">
          <Text>
            <Muted>{t('app.sortLabel')}</Muted>
          </Text>
        </span>
        <select
          class="sortSelect"
          disabled={disabled || order.reordered}
          value={order.sortMode}
          onChange={(event) =>
            order.sort((event.currentTarget as HTMLSelectElement).value as SortMode)
          }
        >
          <option value="position">{t('app.sortPosition')}</option>
          <option value="name">{t('app.sortName')}</option>
          <option value="layer">{t('app.sortLayer')}</option>
        </select>
        {order.reordered ? (
          <span class="sortManual">
            <Text>{t('app.sortManual')}</Text>
          </span>
        ) : null}
        <button
          type="button"
          aria-label={t('app.sortFlip')}
          title={t('app.sortFlip')}
          class={`sortFlip${order.reversed ? ' sortFlipOn' : ''}`}
          disabled={disabled || order.reordered}
          onClick={order.flip}
        >
          <IconArrow16 />
        </button>
        <span class="sortPush" />
        {order.reordered ? (
          <button type="button" class="linkButton" disabled={disabled} onClick={order.resetManual}>
            {t('app.sortReset')}
          </button>
        ) : (
          <Text>
            <Muted>{t('app.pageCount', { count: order.visible.length })}</Muted>
          </Text>
        )}
      </div>

      <FrameList
        items={order.visible}
        disabled={disabled}
        onMove={order.move}
        onReorder={order.reorder}
        onFocus={(id) => emit<FrameFocusHandler>('frame:focus', id)}
        onExclude={order.exclude}
      />

      {order.excluded.length === 0 ? null : (
        <Fragment>
          <VerticalSpace space="small" />
          <div class="rowBetween excludedHead">
            <Text>
              <Muted>{t('app.excludedTitle', { count: order.excluded.length })}</Muted>
            </Text>
            {order.excluded.length < 2 ? null : (
              <Button disabled={disabled} onClick={order.restoreAll} secondary>
                {t('app.restoreAll')}
              </Button>
            )}
          </div>
          {order.excluded.map((item) => (
            <div key={item.id} class="rowBetween excludedRow">
              <div class="ellipsis">
                <Text>
                  <Muted>{item.name}</Muted>
                </Text>
              </div>
              <Button disabled={disabled} onClick={() => order.restore(item.id)} secondary>
                {t('app.restore')}
              </Button>
            </div>
          ))}
        </Fragment>
      )}
    </Fragment>
  )
}
