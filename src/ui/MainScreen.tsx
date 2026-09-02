// 메인 한 화면 — 프리셋 · 체크리스트 · (내보낸 뒤) 결과 카드. 고급 설정은 푸터의 톱니로 간다.

import { Muted, Text, VerticalSpace } from '@create-figma-plugin/ui'
import { Fragment, JSX } from 'preact'

import { t } from '../lib/i18n'
import { FontUsage, FrameItem, Preflight, Settings, StoredFont } from '../lib/types'
import { PreFlight, SubScreen } from './PreFlight'
import { PresetBar } from './PresetBar'
import { ReportCard } from './ReportCard'
import { ExportReport } from './useExport'
import { FrameOrder } from './useFrameOrder'

type Props = {
  items: FrameItem[]
  order: FrameOrder
  preflight: Preflight | null
  fonts: FontUsage[]
  storedFonts: StoredFont[]
  settings: Settings
  disabled: boolean
  report: ExportReport | null
  onChangeSettings: (next: Settings) => void
  onOpen: (screen: SubScreen | 'preview') => void
  onDismissReport: () => void
}

export function MainScreen({
  items,
  order,
  preflight,
  fonts,
  storedFonts,
  settings,
  disabled,
  report,
  onChangeSettings,
  onOpen,
  onDismissReport
}: Props): JSX.Element {
  return (
    <Fragment>
      <VerticalSpace space="medium" />
      <PresetBar settings={settings} disabled={disabled} onChange={onChangeSettings} />
      <VerticalSpace space="large" />

      <Text>
        <Muted>{t('preflight.title')}</Muted>
      </Text>
      <VerticalSpace space="extraSmall" />

      {items.length === 0 ? (
        <Fragment>
          <div class="emptyCard">
            <Text>{t('frames.empty')}</Text>
            <VerticalSpace space="extraSmall" />
            <Text>
              <Muted>{t('frames.emptyHint')}</Muted>
            </Text>
          </div>
          {/* 아무것도 선택하지 않았을 때만 — 프레임을 고르면 체크리스트가 대신 말한다 */}
          <VerticalSpace space="small" />
          <Text>
            <Muted>{t('app.promise')}</Muted>
          </Text>
        </Fragment>
      ) : (
        <PreFlight
          items={items}
          visibleCount={order.visible.length}
          excludedCount={order.excluded.length}
          reordered={order.reordered}
          preflight={preflight}
          fonts={fonts}
          storedFonts={storedFonts}
          settings={settings}
          onOpen={onOpen}
          onEnableText={() => onChangeSettings({ ...settings, embedText: true })}
        />
      )}

      {report === null ? null : (
        <Fragment>
          <VerticalSpace space="medium" />
          <ReportCard
            report={report}
            onClose={onDismissReport}
            onOpenPreview={() => onOpen('preview')}
          />
        </Fragment>
      )}
    </Fragment>
  )
}
