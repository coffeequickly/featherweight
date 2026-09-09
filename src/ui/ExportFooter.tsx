// 하단 고정 영역 — 내보내기 버튼·진행·오류·알림. 어느 탭에서든 보인다.
//
// 톱니는 없앴다. 고급 설정이 이미지·옵션 탭으로 갈라져 탭 바에 자리를 얻었으므로,
// 같은 곳으로 가는 문이 둘일 이유가 없다.
// 결과는 여기 없다 — 결과 탭이 받는다.

import { Banner, Button, IconWarning16, Muted, Text, VerticalSpace } from '@create-figma-plugin/ui'
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
}

export function ExportFooter({ exporter, notice, pageCount, onExport }: Props): JSX.Element {
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
