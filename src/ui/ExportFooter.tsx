// 하단 고정 영역 — 내보내기 버튼·진행·오류·결과 리포트. 어느 탭에서든 보인다.

import { Banner, Button, IconWarning16, Muted, Text, VerticalSpace } from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'
import { Fragment, JSX } from 'preact'

import { formatBytes } from '../lib/fontStore'
import { formatReason, t } from '../lib/i18n'
import { NodesFocusHandler } from '../lib/types'
import { ExportReport, ExportState } from './useExport'
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

      {exporter.report === null ? null : <Report report={exporter.report} />}
    </Fragment>
  )
}

function progressPercent(progress: { current: number; total: number } | null): number {
  if (progress === null || progress.total === 0) return 0
  return Math.min(100, Math.round((progress.current / progress.total) * 100))
}

function Report({ report }: { report: ExportReport }): JSX.Element {
  // 같은 사유가 수십 번 반복된다 (폰트 하나가 없으면 그 폰트를 쓰는 노드마다 하나씩).
  // 그대로 늘어놓으면 읽을 수 없어서 묶어서 세고, 클릭하면 해당 노드를 캔버스에서 보여준다.
  const reasons = groupReasons([
    ...report.skipped.map((skip) => ({
      reason: t('report.skipped', { name: skip.name, reason: formatReason(skip.reason) }),
      id: skip.id
    })),
    ...report.fallbacks.map((item) => ({ reason: formatReason(item.reason), id: item.nodeId }))
  ])

  const total = reasons.reduce((sum, item) => sum + item.count, 0)

  return (
    <Fragment>
      <VerticalSpace space="small" />
      <div class="reportCard">
        <div class="reportLine">
          <Text>
            {report.cancelled ? t('report.cancelledPrefix') : ''}
            {t('report.summary', {
              file: report.fileName,
              pages: report.pageCount,
              size: formatBytes(report.byteLength),
              seconds: (report.elapsedMs / 1000).toFixed(1)
            })}
          </Text>
        </div>
        <VerticalSpace space="extraSmall" />
        <div class="reportLine">
          <Text>
            <Muted>
              {report.textDrawn > 0
                ? t('report.textDrawn', { count: report.textDrawn })
                : t('report.noText')}
              {report.imagesProcessed > 0
                ? t('report.images', {
                    count: report.imagesProcessed,
                    before: formatBytes(report.imageBytesBefore),
                    after: formatBytes(report.imageBytesAfter)
                  })
                : ''}
            </Muted>
          </Text>
        </div>

        {reasons.length === 0 ? null : (
          <Fragment>
            <VerticalSpace space="small" />
            <Text>
              <Muted>{t('report.outlines', { total, kinds: reasons.length })}</Muted>
            </Text>
            <VerticalSpace space="extraSmall" />
            <div class="reasonList">
              {reasons.map((item) => (
                <div
                  key={item.reason}
                  class="reasonItem clickable"
                  title={t('report.clickHint')}
                  onClick={() => emit<NodesFocusHandler>('nodes:focus', item.ids)}
                >
                  <Text>
                    <Muted>
                      {item.reason}
                      {item.count > 1 ? ` × ${item.count}` : ''}
                    </Muted>
                  </Text>
                </div>
              ))}
            </div>
          </Fragment>
        )}
      </div>
    </Fragment>
  )
}

/** 사유별로 묶고 많은 것부터. 노드 id 를 같이 들고 있어야 클릭해서 찾아갈 수 있다. */
function groupReasons(
  all: readonly Array<{ reason: string; id: string }>[number][]
): Array<{ reason: string; count: number; ids: string[] }> {
  const groups = new Map<string, string[]>()
  for (const { reason, id } of all) {
    const ids = groups.get(reason)
    if (ids === undefined) groups.set(reason, [id])
    else ids.push(id)
  }
  return [...groups.entries()]
    .map(([reason, ids]) => ({ reason, count: ids.length, ids }))
    .sort((a, b) => b.count - a.count)
}
