// 하단 고정 영역 — 톱니(고급 설정)·내보내기 버튼·진행·오류·알림. 어느 화면에서든 보인다.
// 결과 카드는 여기 없다 — 메인 화면의 체크리스트 아래(ReportCard)에 온다.

import {
  Banner,
  Button,
  IconButton,
  IconSettings24,
  IconWarning16,
  Muted,
  Text,
  VerticalSpace
} from '@create-figma-plugin/ui'
import { Fragment, JSX } from 'preact'

import { t } from '../lib/i18n'
import { ExportState } from './useExport'
import { Notice } from './useMainState'

type Props = {
  exporter: ExportState
  notice: Notice
  /** 내보낼 페이지 수 — 버튼 라벨과 활성화 여부에 쓴다 */
  pageCount: number
  onExport: () => void
  /** 버튼 옆 톱니 — 압축 플러그인들이 설정을 두는 자리다 */
  onOpenSettings: () => void
}

export function ExportFooter({
  exporter,
  notice,
  pageCount,
  onExport,
  onOpenSettings
}: Props): JSX.Element {
  return (
    <Fragment>
      {notice === null ? null : (
        <Fragment>
          <Banner icon={<IconWarning16 />} variant={notice.error ? 'warning' : undefined}>
            {notice.message}
          </Banner>
          <VerticalSpace space="extraSmall" />
        </Fragment>
      )}

      <div class="footerRow">
        {/* 내보내는 동안은 설정을 바꿀 수 없다 — 비활성 톱니를 눌러 보게 두지 않는다 */}
        {exporter.busy ? null : (
          <div class="footerGear">
            <IconButton onClick={onOpenSettings} title={t('screen.settings')}>
              <IconSettings24 />
            </IconButton>
          </div>
        )}
        <div class="footerMain">
          {exporter.busy ? (
            <Fragment>
              <div class="rowBetween">
                <Text>
                  <Muted>
                    {exporter.progress === null ? t('app.preparing') : exporter.progress.label}
                  </Muted>
                </Text>
                <Button danger onClick={exporter.cancel} secondary>
                  {t('app.cancel')}
                </Button>
              </div>
              <VerticalSpace space="extraSmall" />
              <div class="progressBar">
                <div class="progressFill" style={`width: ${progressPercent(exporter.progress)}%`} />
              </div>
            </Fragment>
          ) : (
            <Button disabled={pageCount === 0} fullWidth onClick={onExport}>
              {t('app.export', { count: pageCount })}
            </Button>
          )}
        </div>
      </div>

      {exporter.error === null || exporter.busy ? null : (
        <Fragment>
          <VerticalSpace space="small" />
          <Banner icon={<IconWarning16 />} variant="warning">
            {exporter.error}
          </Banner>
          <VerticalSpace space="extraSmall" />
          <div class="rowBetween">
            <Text>
              <Muted>{t('app.errorGuide')}</Muted>
            </Text>
            <Button onClick={exporter.retry} secondary>
              {t('app.retry')}
            </Button>
          </div>
        </Fragment>
      )}
    </Fragment>
  )
}

function progressPercent(progress: { current: number; total: number } | null): number {
  if (progress === null || progress.total === 0) return 0
  return Math.min(100, Math.round((progress.current / progress.total) * 100))
}
