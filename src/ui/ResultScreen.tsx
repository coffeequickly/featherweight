// 결과 탭 — 내보낸 뒤 무엇이 나갔는가.
//
// 예전에는 시작 화면의 체크리스트 아래에 카드로 붙었다. 고치고 다시 내보내는 왕복마다
// 스크롤을 오르내려야 했고, 결과가 예고 아래에 있어 무엇이 사실인지 헷갈렸다.
//
// 맨 위가 판정이다 — 파일 이름·크기, 그리고 목표 용량을 맞췄는지. 못 맞췄으면 최선값을
// 말한다. 목표를 다시 잡을 근거가 되는 건 그 숫자다.
//
// 그 아래 세 그룹이 같은 문법으로 선다: 왼쪽에 이름, 오른쪽에 한 줄 요약, 아래에 상세.
// 임베딩한 텍스트는 몇 줄을 그 자리에서 보여 준다 — 이 제품을 쓰는 이유가 여기서 확인된다.

import {
  IconCheck16,
  IconCheckLarge24,
  IconChevronRight16,
  IconWarning16,
  Muted,
  Text,
  VerticalSpace
} from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'
import { Fragment, JSX } from 'preact'

import { formatBytes } from '../lib/fontStore'
import { formatReason, t } from '../lib/i18n'
import { groupReasons, unifyMissingGlyphs } from '../lib/preflight'
import { NodesFocusHandler } from '../lib/types'
import { Fold } from './Fold'
import { useThumbUrl } from './FrameList'
import { Section } from './Section'
import { ExportReport } from './useExport'

/** 이 아래면 그림으로 남은 글자의 무게를 굳이 말하지 않는다 */
const OUTLINE_COST_FLOOR = 100_000
/** 결과 탭에서 그 자리에 보여 주는 줄 수. 나머지는 하위 페이지가 받는다 */
const PREVIEW_LINES = 5

type Props = {
  report: ExportReport | null
  /** 내보낸 문서의 첫 장 — 내보낼 때 붙잡아 둔 것이라 선택이 바뀌어도 그대로다 */
  firstPage?: Uint8Array
  /** 마지막 내보내기가 실패했으면 그 사유 — 토스트는 사라지므로 여기 남는다 */
  error: string | null
  onOpenPreview: () => void
}

export function ResultScreen({ report, firstPage, error, onOpenPreview }: Props): JSX.Element {
  const thumbUrl = useThumbUrl(firstPage)
  if (report === null) {
    return (
      <div class="emptyCard">
        <Text>{error === null ? t('result.notYet') : t('result.failed')}</Text>
        <VerticalSpace space="extraSmall" />
        <Text>
          <Muted>{error ?? t('result.notYetHint')}</Muted>
        </Text>
      </div>
    )
  }

  const fit = report.fit
  const missedTarget =
    fit !== null && (fit.outcome === 'unreachable' || report.byteLength > fit.targetBytes)
  const outlined = report.fallbacks.length
  const embedded = report.textDrawn
  const total = embedded + outlined

  // 같은 사유가 노드마다 하나씩 나온다 — 묶어서 세고, 누르면 캔버스에서 그 레이어를 보여준다.
  // 이미지 경고는 여기 섞지 않는다 — 텍스트가 아웃라인이 된 사유와 도메인이 다르다.
  const reasons = groupReasons([
    ...report.skipped.map((skip) => ({
      reason: t('report.skipped', { name: skip.name, reason: formatReason(skip.reason) }),
      id: skip.id
    })),
    ...unifyMissingGlyphs(report.fallbacks).map((item) => ({
      reason: formatReason(item.reason),
      id: item.nodeId
    }))
  ])
  const imageReasons = groupReasons(
    report.imageWarnings.map((item) => ({ reason: formatReason(item.reason), id: item.nodeId }))
  )
  const imagesKept = Math.max(0, report.images.count - report.imagesProcessed)
  const imageShare =
    report.byteLength > 0 ? Math.round((report.images.bytes / report.byteLength) * 100) : 0

  return (
    <Fragment>
      <div class="fileCard">
        <div class="fileCardTop">
          {/* 썸네일이 있으면 그것이 판정을 겸한다 — 초록 테두리가 "제대로 나갔다" 를 말한다.
              아직 안 그렸거나 실패한 문서면 아이콘으로 물러선다 */}
          {thumbUrl === null ? (
            <div class={`fileCardIcon${missedTarget ? ' fileCardIconWarn' : ''}`}>
              {missedTarget ? <IconWarning16 /> : <IconCheckLarge24 />}
            </div>
          ) : (
            <div class="fileThumb">
              <img class="fileThumbImg" src={thumbUrl} alt={t('result.firstPage')} />
            </div>
          )}
          <div class="fileCardBody">
            <div class="fileCardName ellipsis">
              <Text>{report.fileName}</Text>
            </div>
            <div class="fileCardMeta">
              <Text>
                <Muted>
                  {t('result.meta', {
                    size: formatBytes(report.byteLength),
                    pages: report.pageCount,
                    seconds: (report.elapsedMs / 1000).toFixed(1)
                  })}
                </Muted>
              </Text>
            </div>
          </div>
        </div>
        {fit === null ? null : (
          <div class={`fileCardFit${missedTarget ? ' fileCardFitWarn' : ''}`}>
            <Text>{fitLine(fit, report.byteLength)}</Text>
            {/* 고른 설정은 여기에만 남는다 — PDF 로는 못 읽는다(Figma 가 다시 인코딩) */}
            {fit.profile === undefined ? null : (
              <Text>
                <Muted>
                  {t('report.fitProfile', {
                    scale: fit.profile.multiplier,
                    max: fit.profile.maxEdge,
                    min: fit.profile.minEdge,
                    quality: Math.round(fit.profile.quality * 100),
                    png: fit.profile.reencodeOpaquePng ? 'no' : 'yes',
                    count: fit.candidates ?? 0,
                    predicted: fit.predictedBytes.toLocaleString(),
                    actual: report.byteLength.toLocaleString(),
                    error: errorPercent(fit.predictedBytes, report.byteLength)
                  })}
                </Muted>
              </Text>
            )}
            {/* 후보별 예측 — 탈락한 후보의 예측이 맞았는지는 그 설정으로 실제 내보내 견줘야 안다 */}
            {fit.probes === undefined || fit.probes.length === 0 ? null : (
              <Text>
                <Muted>
                  {t('report.fitCandidates', {
                    list: fit.probes
                      .map(
                        (probe) =>
                          `${probe.multiplier}×${probe.maxEdge}·${Math.round(probe.quality * 100)}% ${probe.predicted.toLocaleString()}${probe.predicted <= fit.targetBytes ? '✓' : ''}`
                      )
                      .join(' · ')
                  })}
                </Muted>
              </Text>
            )}
          </div>
        )}
      </div>

      {/* 총 개수가 두 갈래로 갈리고, 각 갈래 아래에 그 갈래의 사정이 들여쓰기로 붙는다.
          사유 셋은 "아웃라인" 의 자식이지 형제가 아니다 — 개수 합이 곧 그 위 숫자다 */}
      <Fold
        title={t('result.sectionText')}
        defaultOpen={outlined > 0}
        summary={
          outlined === 0 ? (
            <Muted>{t('result.textFoldOk', { count: total })}</Muted>
          ) : (
            <span class="foldWarn">{t('result.textFoldWarn', { total, count: outlined })}</span>
          )
        }
      >
        {embedded === 0 ? null : (
          <div class="outcome">
            <div class="outcomeHead">
              <span class="outcomeIcon outcomeOk">
                <IconCheck16 />
              </span>
              <Text>{t('result.embedded', { count: embedded })}</Text>
            </div>
            {report.substitutions.length === 0 ? null : (
              <div class="outcomeChildren">
                {report.substitutions.map((item) => (
                  <div key={item.family} class="outcomeNote">
                    <Text>
                      <Muted>
                        {t('report.substituted', {
                          count: item.chars.length,
                          chars: item.chars.map(charName).join(', '),
                          family: item.family
                        })}
                      </Muted>
                    </Text>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {outlined === 0 && reasons.length === 0 ? null : (
          <div class="outcome">
            <div class="outcomeHead">
              <span class="outcomeIcon outcomeWarn">
                <IconWarning16 />
              </span>
              <Text>{t('result.outlined', { count: outlined })}</Text>
              {report.outlines.vectorBytes >= OUTLINE_COST_FLOOR ? (
                <span class="outcomeCost">
                  <Text>
                    <Muted>{formatBytes(report.outlines.vectorBytes)}</Muted>
                  </Text>
                </span>
              ) : null}
            </div>
            <div class="outcomeChildren">
              {reasons.map((item) => (
                <button
                  key={item.reason}
                  type="button"
                  class="reasonRow"
                  title={t('report.clickHint')}
                  onClick={() => emit<NodesFocusHandler>('nodes:focus', item.ids)}
                >
                  <span class="reasonWhy">
                    <Text>{item.reason}</Text>
                  </span>
                  <span class="reasonCount">
                    <Text>
                      <Muted>{t('result.countUnit', { count: item.count })}</Muted>
                    </Text>
                  </span>
                  <span class="reasonGo">
                    <IconChevronRight16 />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 텍스트 임베드를 켜고 전부 임베드했는데 Type 3 가 남았다면 글리프를 못 지운 것이다 */}
        {report.textEmbedded && outlined === 0 && report.outlines.fonts > 0 ? (
          <div class="resultLine resultWarn">
            <Text>{t('report.leak')}</Text>
          </div>
        ) : null}
      </Fold>

      <Fold
        title={t('result.sectionImages')}
        defaultOpen={imageReasons.length > 0}
        summary={
          imageReasons.length > 0 ? (
            <span class="foldWarn">
              {t('result.imagesWarned', { count: report.imageWarnings.length })}
            </span>
          ) : (
            <Muted>
              {report.images.count === 0
                ? t('result.imagesNone')
                : t('result.imagesAside', {
                    count: report.imagesProcessed,
                    total: report.images.count
                  })}
            </Muted>
          )
        }
      >
        {report.images.count === 0 ? null : (
          <Fragment>
            {report.imagesProcessed === 0 ? null : (
              <div class="outcome">
                <div class="outcomeHead">
                  <span class="outcomeIcon outcomeOk">
                    <IconCheck16 />
                  </span>
                  <Text>{t('result.imagesShrunk', { count: report.imagesProcessed })}</Text>
                </div>
                <div class="outcomeChildren">
                  {report.imagesCropped === 0 ? null : (
                    <div class="outcomeNote">
                      <Text>
                        <Muted>{t('result.imagesCropped', { count: report.imagesCropped })}</Muted>
                      </Text>
                    </div>
                  )}
                  {report.imagesRecovered === 0 ? null : (
                    <div class="outcomeNote">
                      <Text>
                        <Muted>
                          {t('result.imagesRecovered', { count: report.imagesRecovered })}
                        </Muted>
                      </Text>
                    </div>
                  )}
                  <div class="outcomeNote">
                    <Text>
                      <Muted>
                        {t('result.imageShare', {
                          size: formatBytes(report.images.bytes),
                          percent: imageShare
                        })}
                      </Muted>
                    </Text>
                  </div>
                </div>
              </div>
            )}

            {imagesKept === 0 ? null : (
              <div class="outcome">
                <div class="outcomeHead">
                  <span class="outcomeIcon outcomeOk">
                    <IconCheck16 />
                  </span>
                  <Text>{t('result.imagesKept', { count: imagesKept })}</Text>
                </div>
              </div>
            )}

            {imageReasons.length === 0 ? null : (
              <div class="outcome">
                <div class="outcomeHead">
                  <span class="outcomeIcon outcomeWarn">
                    <IconWarning16 />
                  </span>
                  <Text>{t('result.imagesWarned', { count: report.imageWarnings.length })}</Text>
                </div>
                <div class="outcomeChildren">
                  {imageReasons.map((item) => (
                    <button
                      key={item.reason}
                      type="button"
                      class="reasonRow"
                      title={t('report.clickHint')}
                      onClick={() => emit<NodesFocusHandler>('nodes:focus', item.ids)}
                    >
                      <span class="reasonWhy">
                        <Text>{item.reason}</Text>
                      </span>
                      <span class="reasonCount">
                        <Text>
                          <Muted>{t('result.countUnit', { count: item.count })}</Muted>
                        </Text>
                      </span>
                      <span class="reasonGo">
                        <IconChevronRight16 />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Fragment>
        )}
      </Fold>

      {report.extractable.length === 0 ? null : (
        <Section
          title={t('result.sectionExtracted')}
          aside={
            <button type="button" class="linkButton" onClick={onOpenPreview}>
              {t('result.seeAll')}
            </button>
          }
        >
          <div class="resultPreview">
            {report.extractable.slice(0, PREVIEW_LINES).map((line, index) => (
              <div key={index} class="ellipsis">
                <Text>{line}</Text>
              </div>
            ))}
            {report.extractable.length <= PREVIEW_LINES ? null : (
              <div class="resultPreviewMore">
                <Text>
                  <Muted>…</Muted>
                </Text>
              </div>
            )}
          </div>
        </Section>
      )}
    </Fragment>
  )
}

/**
 * 목표 용량 결과 한 줄. 못 맞췄을 때는 "왜 안 됐는지" 보다 "그럼 얼마가 최선인지" 가
 * 쓸모 있다 — 목표를 다시 잡을 근거가 되는 건 그 숫자다.
 */
/** 예측 대비 실제의 오차(%) — 부호 붙여서. 예측이 크면 음수(필요 이상으로 압축한 쪽) */
function errorPercent(predicted: number, actual: number): string {
  if (predicted <= 0) return '—'
  const percent = ((actual - predicted) / predicted) * 100
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}`
}

function fitLine(fit: NonNullable<ExportReport['fit']>, actualBytes: number): string {
  const target = formatBytes(fit.targetBytes)
  if (fit.outcome === 'unreachable') {
    return t('report.fitUnreachable', {
      target,
      floor: formatBytes(Math.max(fit.predictedBytes, actualBytes))
    })
  }
  // 예측은 예측이다 — 실제 파일이 목표를 넘겼으면 맞췄다고 말하지 않는다
  if (actualBytes > fit.targetBytes) {
    return t('report.fitOver', { target, actual: formatBytes(actualBytes) })
  }
  if (fit.outcome === 'already-small') return t('report.fitAlready', { target })
  return t('report.fitOk', { target })
}

/** 눈에 안 보이는 글자는 이름으로 — "얇은 공백" 이 " " 보다 낫다 */
function charName(char: string): string {
  const code = char.codePointAt(0) ?? 0
  if (code === 0x2009) return t('char.thinSpace')
  if (code === 0x202f) return t('char.narrowNbsp')
  if (code === 0x00a0) return t('char.nbsp')
  return char
}
