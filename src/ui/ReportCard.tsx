// 내보내기 결과 카드 — 메인 화면의 체크리스트 아래에 온다.
//
// "내보내기 전에" 가 예고라면 이 카드는 결과다. 같은 화면에서 위아래로 이어져야
// 예고가 맞았는지 바로 견줄 수 있다. 푸터에 두면 버튼 밑에서 창을 밀어 올렸다.

import { IconClose16, Muted, Text, VerticalSpace } from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'
import { Fragment, JSX } from 'preact'

import { formatBytes } from '../lib/fontStore'
import { formatReason, t } from '../lib/i18n'
import { groupReasons } from '../lib/preflight'
import { NodesFocusHandler } from '../lib/types'
import { ExportReport } from './useExport'

/** 이 아래면 그림으로 남은 글자의 무게를 굳이 말하지 않는다 */
const OUTLINE_COST_FLOOR = 100_000

type Props = {
  report: ExportReport
  onClose: () => void
  /** "파서가 읽을 내용 확인" → 텍스트 확인 화면 */
  onOpenPreview: () => void
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

export function ReportCard({ report, onClose, onOpenPreview }: Props): JSX.Element {
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
    <div class="reportCard">
      <div class="rowBetween">
        <div class="reportLine ellipsis">
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
        <span class="clickable pathChip" title={t('app.closeReport')} onClick={onClose}>
          <IconClose16 />
        </span>
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
          <div class="reportLine">
            <span class="clickable pathChip" onClick={onOpenPreview}>
              <Text>
                <Muted>{t('report.preview')}</Muted>
              </Text>
            </span>
          </div>
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
  )
}
