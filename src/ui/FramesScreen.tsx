// 순서·제외 화면 — 정렬, 끌어서 순서 바꾸기, 빼기와 되살리기.

import { Button, Muted, Text, VerticalSpace } from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'
import { Fragment, JSX } from 'preact'

import { t } from '../lib/i18n'
import { FrameFocusHandler, SortMode } from '../lib/types'
import { ChoiceRow } from './ChoiceRow'
import { FrameList } from './FrameList'
import { FrameOrder } from './useFrameOrder'

type Props = {
  order: FrameOrder
  disabled: boolean
}

export function FramesScreen({ order, disabled }: Props): JSX.Element {
  return (
    <Fragment>
      <VerticalSpace space="small" />
      <div class="rowEnd">
        <ChoiceRow<SortMode>
          compact
          disabled={disabled}
          options={[
            { value: 'position', label: t('app.sortPosition') },
            { value: 'name', label: t('app.sortName') }
          ]}
          value={order.sortMode}
          onChange={order.sort}
        />
      </div>
      <VerticalSpace space="small" />

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
          <div class="rowBetween">
            <Text>
              <Muted>{t('app.excluded', { count: order.excluded.length })}</Muted>
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
