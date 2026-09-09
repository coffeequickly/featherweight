// 시작 탭 — 어떻게 뽑을지(프리셋), 지금 무엇이 문제인지, 그리고 무엇을 뽑는지.
//
// 결과는 여기 없다. 결과 탭이 받는다 — 체크리스트 아래에 붙여 두면 고치고 다시
// 내보내는 왕복마다 스크롤을 오르내려야 했다.

import { Muted, Text, VerticalSpace } from '@create-figma-plugin/ui'
import { Fragment, JSX } from 'preact'

import { t } from '../lib/i18n'
import { EditorKind, FontUsage, FrameItem, Preflight, Settings, StoredFont } from '../lib/types'
import { PageStrip } from './PageStrip'
import { PresetBar } from './PresetBar'
import { StatusList } from './StatusList'
import { unitWords } from './units'
import { FrameOrder } from './useFrameOrder'

/** 시작 탭에서 갈 수 있는 곳 — 탭 셋과 하위 페이지 하나 */
export type StartTarget = 'frames' | 'fonts' | 'options' | 'outline' | 'images'

type Props = {
  items: FrameItem[]
  order: FrameOrder
  preflight: Preflight | null
  fonts: FontUsage[]
  storedFonts: StoredFont[]
  settings: Settings
  editor: EditorKind
  disabled: boolean
  onChangeSettings: (next: Settings) => void
  onOpen: (target: StartTarget) => void
}

export function MainScreen({
  items,
  order,
  preflight,
  fonts,
  storedFonts,
  settings,
  editor,
  disabled,
  onChangeSettings,
  onOpen
}: Props): JSX.Element {
  return (
    <Fragment>
      <VerticalSpace space="medium" />
      <PresetBar
        settings={settings}
        disabled={disabled}
        onChange={onChangeSettings}
        onOpenImages={() => onOpen('images')}
      />
      <VerticalSpace space="large" />

      {items.length === 0 ? (
        <Fragment>
          <div class="emptyCard">
            {editor === 'slides' ? (
              <Text>{t('frames.emptySlides')}</Text>
            ) : (
              <Fragment>
                <Text>{t('frames.empty')}</Text>
                <VerticalSpace space="extraSmall" />
                <Text>
                  <Muted>{t('frames.emptyHint')}</Muted>
                </Text>
              </Fragment>
            )}
          </div>
          {/* 아무것도 선택하지 않았을 때만 — 프레임을 고르면 상태가 대신 말한다 */}
          <VerticalSpace space="small" />
          <Text>
            <Muted>{t('app.promise', unitWords(editor))}</Muted>
          </Text>
        </Fragment>
      ) : (
        <Fragment>
          <StatusList
            items={order.visible}
            preflight={preflight}
            fonts={fonts}
            storedFonts={storedFonts}
            settings={settings}
            editor={editor}
            onGo={onOpen}
          />
          <PageStrip items={order.visible} onGo={() => onOpen('frames')} />
        </Fragment>
      )}
    </Fragment>
  )
}
