// 하단 고정 영역 — 내보내기 버튼·진행·오류·결과 리포트. 어느 탭에서든 보인다.

import { Banner, Button, IconWarning16, Muted, Text, VerticalSpace } from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'
import { Fragment, JSX } from 'preact'
import { useState } from 'preact/hooks'

import { formatBytes } from '../lib/fontStore'
import { formatReason, t } from '../lib/i18n'
import { NodesFocusHandler } from '../lib/types'
import { ExportReport, ExportState } from './useExport'
import { Notice } from './useMainState'

/** 이 아래면 그림으로 남은 글자의 무게를 굳이 말하지 않는다 */
const OUTLINE_COST_FLOOR = 100_000

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

/**
 * 제출 전에 "채용 시스템이 뭘 읽어 갈지" 를 보여준다.
 *
 * 아웃라인으로 남은 텍스트는 여기 없다 — 파서가 흘리거나 깨뜨리는 쪽이라 없는 셈
 * 치고 보여 주는 편이 정직하다. 사용자가 이름이나 연락처가 빠졌는지 눈으로 잡을 수 있다.
 */
function ParserPreview({ lines }: { lines: string[] }): JSX.Element {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <div class="reportLine">
        <span class="clickable pathChip" onClick={() => setOpen(true)}>
          <Text>
            <Muted>{t('report.preview')}</Muted>
          </Text>
        </span>
      </div>
    )
  }

  return (
    <div class="previewCard">
      <div class="rowBetween">
        <Text>{t('previewTitle')}</Text>
        <span class="clickable pathChip" onClick={() => setOpen(false)}>
          <Text>
            <Muted>{t('previewClose')}</Muted>
          </Text>
        </span>
      </div>
      <VerticalSpace space="extraSmall" />
      <Text>
        <Muted>{t('previewHelp', { lines: lines.length })}</Muted>
      </Text>
      <VerticalSpace space="extraSmall" />
      <div class="previewBody">
        {lines.map((line, index) => (
          <div key={index} class="previewLine">
            <Text>
              <Muted>{line}</Muted>
            </Text>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * 목표 용량 결과 한 줄. 못 맞췄을 때는 "왜 안 됐는지"보다 "그럼 얼마가 최선인지"가
 * 쓸모 있다 — 목표를 다시 잡을 근거가 되는 건 그 숫자다.
 */
function fitLine(fit: NonNullable<ExportReport['fit']>, actualBytes: number): string {
  const target = formatBytes(fit.targetBytes)
  if (fit.outcome === 'unreachable') {
    return t('report.fitUnreachable', {
      target,
      floor: formatBytes(Math.max(fit.predictedBytes, actualBytes))
    })
  }
  if (fit.outcome === 'already-small') return t('report.fitAlready', { target })
  return t('report.fitOk', { target })
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

  // "아웃라인 처리된 텍스트 N개" 는 텍스트만 세야 한다. 통째로 실패한 프레임까지
  // 합치면 프레임을 텍스트로 세는 셈이 된다 — 목록에는 둘 다 보여주되 수는 나눈다.
  const outlinedTexts = report.fallbacks.length

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
              {report.images.count > 0
                ? t('report.images', {
                    count: report.images.count,
                    size: formatBytes(report.images.bytes)
                  })
                : ''}
              {report.imagesProcessed > 0
                ? t('report.imagesShrunk', { count: report.imagesProcessed })
                : ''}
            </Muted>
          </Text>
        </div>

        {report.extractable.length === 0 ? null : (
          <Fragment>
            <VerticalSpace space="extraSmall" />
            <ParserPreview lines={report.extractable} />
          </Fragment>
        )}

        {/* 전부 임베드했는데 Type 3 가 남았다면 글리프를 못 지운 것이다 (유령 텍스트) */}
        {report.fallbacks.length === 0 && report.outlines.fonts > 0 ? (
          <Fragment>
            <VerticalSpace space="extraSmall" />
            <div class="reportLine reportWarn">
              <Text>
                <Muted>{t('report.leak')}</Muted>
              </Text>
            </div>
          </Fragment>
        ) : null}

        {report.fit === null ? null : (
          <Fragment>
            <VerticalSpace space="extraSmall" />
            <div
              class={report.fit.outcome === 'unreachable' ? 'reportLine reportWarn' : 'reportLine'}
            >
              <Text>
                <Muted>{fitLine(report.fit, report.byteLength)}</Muted>
              </Text>
            </div>
          </Fragment>
        )}

        {reasons.length === 0 ? null : (
          <Fragment>
            <VerticalSpace space="small" />
            {/* 실패한 프레임만 있고 아웃라인 텍스트가 없으면 이 줄은 할 말이 없다 */}
            <Text>
              <Muted>
                {outlinedTexts === 0
                  ? ''
                  : t('report.outlines', { total: outlinedTexts, kinds: reasons.length })}
                {/* 10KB 짜리 잔재까지 바이트를 대면 잡음이다 — 아까울 때만 말한다 */}
                {outlinedTexts > 0 && report.outlines.vectorBytes >= OUTLINE_COST_FLOOR
                  ? t('report.outlineCost', { size: formatBytes(report.outlines.vectorBytes) })
                  : ''}
              </Muted>
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
